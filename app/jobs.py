"""Transcription jobs: one folder each under <storage>/jobs, and the background runner.

A job folder holds job.json (settings and status), audio.flac (16 kHz mono, used for every model
and for playback), transcript.json once done, and the engine's own output and log. Jobs go
through prepare (convert the recording) → queued → running → done / failed / cancelled. Local and
hosted jobs have separate queues, so an upload doesn't wait for a long local run.
"""
import json
import os
import queue
import re
import shutil
import threading
import time
import uuid
from datetime import datetime
from pathlib import Path

import soundfile as sf

from . import engines
from .config import power_profile, replace_file, set_power_profile

ACTIVE = ("preparing", "queued", "running")
ID_RE = re.compile(r"^\d{8}-\d{6}-[0-9a-f]{4}$")


def now():
    return datetime.now().astimezone().isoformat(timespec="seconds")


def write_json(path, data):
    tmp = Path(path).with_name(f"{Path(path).name}.{uuid.uuid4().hex[:6]}.tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    replace_file(tmp, path)


class Store:
    def __init__(self, storage):
        self.root = Path(storage) / "jobs"
        self.root.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()

    def new_id(self):
        return datetime.now().strftime("%Y%m%d-%H%M%S-") + uuid.uuid4().hex[:4]

    def dir(self, jid):
        if not ID_RE.match(jid or ""):
            raise KeyError(jid)
        return self.root / jid

    def get(self, jid):
        try:
            return json.loads((self.dir(jid) / "job.json").read_text(encoding="utf-8"))
        except (KeyError, OSError, ValueError):
            return None

    def create(self, meta):
        with self.lock:
            (self.root / meta["id"]).mkdir(parents=True)
            write_json(self.root / meta["id"] / "job.json", meta)
        return meta

    def update(self, jid, **fields):
        with self.lock:
            meta = self.get(jid)
            if meta is None:
                return None
            meta.update(fields)
            write_json(self.dir(jid) / "job.json", meta)
            return meta

    def list(self):
        jobs = [self.get(p.name) for p in self.root.iterdir() if (p / "job.json").exists()]
        return sorted((j for j in jobs if j), key=lambda j: j["created"], reverse=True)

    def delete(self, jid):
        with self.lock:
            shutil.rmtree(self.dir(jid), ignore_errors=True)

    def transcript(self, jid):
        try:
            return json.loads((self.dir(jid) / "transcript.json").read_text(encoding="utf-8"))
        except (KeyError, OSError, ValueError):
            return None

    def save_transcript(self, jid, data):
        write_json(self.dir(jid) / "transcript.json", data)


def probe_seconds(path):
    """Duration of any audio or video file, in seconds; None if unknown."""
    import av
    try:
        with av.open(str(path)) as c:
            if c.duration:
                return c.duration / av.time_base
            s = next((s for s in c.streams if s.type == "audio"), None)
            return float(s.duration * s.time_base) if s is not None and s.duration and s.time_base else None
    except Exception:  # not a media file, or unreadable: the conversion reports the details
        return None


def convert(source, dest, on_progress, cancelled):
    """Decode any audio or video file to 16 kHz mono FLAC with PyAV (the FFmpeg libraries that
    faster-whisper already ships), so no separate ffmpeg install is needed on any platform."""
    import av
    tmp = dest.with_name(dest.stem + ".tmp.flac")
    try:
        with av.open(str(source)) as container:
            stream = next((s for s in container.streams if s.type == "audio"), None)
            if stream is None:
                raise engines.EngineError("the file has no audio track")
            resampler = av.AudioResampler(format="s16", layout="mono", rate=16000)
            last = 0.0
            with sf.SoundFile(str(tmp), "w", samplerate=16000, channels=1, subtype="PCM_16", format="FLAC") as out:
                for packet in container.demux(stream):  # the last packet flushes the decoder
                    if cancelled():
                        raise engines.Cancelled()
                    try:
                        frames = packet.decode()
                    except av.error.InvalidDataError:  # a damaged packet: skip it
                        continue
                    for frame in frames:
                        for f in resampler.resample(frame):
                            out.write(f.to_ndarray().reshape(-1))
                        if frame.time is not None and time.time() - last > 0.5:
                            last = time.time()
                            on_progress(frame.time)
                for f in resampler.resample(None):
                    out.write(f.to_ndarray().reshape(-1))
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise
    replace_file(tmp, dest)


class Runner:
    def __init__(self, store, cfg):
        self.store, self.cfg = store, cfg
        self.queues = {"prepare": queue.Queue(), "local": queue.Queue(), "hosted": queue.Queue()}
        self.cancelled = set()
        self.procs = {}  # job id -> running transcribe.py process
        self.saved_profile = None
        for name, fn in (("prepare", self.prepare), ("local", self.work), ("hosted", self.work)):
            threading.Thread(target=self.loop, args=(name, fn), daemon=True, name=f"tafrigh-{name}").start()

    # ---- queueing -----------------------------------------------------------------------------
    def submit(self, jid):
        self.store.update(jid, status="preparing", stage="waiting")
        self.queues["prepare"].put(jid)

    def recover(self):
        """After a restart: requeue jobs that were waiting; mark the ones that were running."""
        for job in reversed(self.store.list()):
            if job["status"] in ("preparing", "queued"):
                self.submit(job["id"])
            elif job["status"] == "running":
                self.store.update(job["id"], status="interrupted", stage=None,
                                  error="The app was closed while this was running.")

    def cancel(self, jid):
        self.cancelled.add(jid)
        job = self.store.get(jid)
        if job and job["status"] in ("preparing", "queued"):
            self.store.update(jid, status="cancelled", stage=None, finished=now())

    def shutdown(self):
        """Stop running local models (they run in their own process group)."""
        for jid, proc in list(self.procs.items()):
            self.cancelled.add(jid)
            engines.stop(proc)

    def loop(self, name, fn):
        while True:
            jid = self.queues[name].get()
            try:
                fn(jid, name)
            except Exception as e:  # never let one job kill the worker
                self.store.update(jid, status="failed", stage=None, error=f"{type(e).__name__}: {e}", finished=now())

    # ---- steps ----------------------------------------------------------------------------------
    def prepare(self, jid, _):
        """Convert the recording to 16 kHz mono FLAC (used by every model and for playback)."""
        job = self.store.get(jid)
        if not job or job["status"] == "cancelled" or jid in self.cancelled:
            return
        folder = self.store.dir(jid)
        audio = folder / "audio.flac"
        if not audio.exists():
            source = Path(job["source_path"]) if job.get("source_path") else next(folder.glob("source.*"), None)
            if not source or not source.exists():
                raise engines.EngineError("the recording is missing")
            total = probe_seconds(source)
            self.store.update(jid, status="preparing", stage="converting", done=0, total=total)
            try:
                convert(source, audio, lambda t: self.store.update(jid, done=t), lambda: jid in self.cancelled)
            except engines.Cancelled:
                return
            except engines.EngineError:
                raise
            except Exception as e:
                raise engines.EngineError(f"could not read the recording: {e}")
            if not job.get("source_path") and not self.cfg.keep_original:
                source.unlink(missing_ok=True)
        info = sf.info(str(audio))
        model = self.cfg.models.get(job["model"])
        if model is None:
            raise engines.EngineError(f"unknown model {job['model']}")
        self.store.update(jid, status="queued", stage=None, done=None, total=None, audio_s=round(info.duration, 2))
        self.queues[model["kind"]].put(jid)

    def work(self, jid, kind):
        job = self.store.get(jid)
        if not job or job["status"] != "queued" or jid in self.cancelled:
            return
        model = self.cfg.models[job["model"]]
        folder = self.store.dir(jid)
        self.store.update(jid, status="running", stage="starting", started=now(), done=None, total=None,
                          error=None, elapsed=None)
        t0 = time.time()
        last_write = [0.0]

        def on_progress(state):
            if time.time() - last_write[0] > 0.4 or state.get("stage") != "transcribing":
                last_write[0] = time.time()
                self.store.update(jid, stage=state.get("stage"), done=state.get("done"), total=state.get("total"),
                                  elapsed=round(time.time() - t0, 1))

        def cancelled():
            return jid in self.cancelled

        try:
            if kind == "local":
                self.performance(True)
                result = engines.run_local(self.cfg, model, folder, job, on_progress, cancelled,
                                           register=lambda p: self.procs.__setitem__(jid, p))
            else:
                result = engines.run_hosted(self.cfg, model, folder, job, on_progress, cancelled)
            took = time.time() - t0
            self.store.save_transcript(jid, {"lines": result["lines"], "edited": False, "model": job["model"]})
            self.store.update(jid, status="done", stage=None, done=None, total=None, finished=now(),
                              seconds=round(took, 1), rtf=round(took / max(1e-6, job.get("audio_s") or 1), 3),
                              **result.get("meta", {}))
        except engines.Cancelled:
            self.store.update(jid, status="cancelled", stage=None, finished=now())
        except Exception as e:
            self.store.update(jid, status="failed", stage=None, error=str(e) or type(e).__name__, finished=now())
        finally:
            self.procs.pop(jid, None)
            self.cancelled.discard(jid)
            if kind == "local" and self.queues["local"].empty():
                self.performance(False)

    def performance(self, on):
        """With performance_while_running: switch to the performance profile while local jobs run."""
        if not self.cfg.local.get("performance_while_running"):
            return
        if on and self.saved_profile is None:
            current = power_profile()
            if current and current != "performance" and set_power_profile("performance"):
                self.saved_profile = current
        elif not on and self.saved_profile:
            set_power_profile(self.saved_profile)
            self.saved_profile = None

    # ---- new jobs ---------------------------------------------------------------------------------
    def rerun(self, jid, model_id, options):
        """A new job on the same audio with another model or other options."""
        old = self.store.get(jid)
        new = self.new_job(title=old["title"], source_name=old.get("source_name"), model_id=model_id,
                           options=options, rerun_of=jid)
        src, dst = self.store.dir(jid) / "audio.flac", self.store.dir(new["id"]) / "audio.flac"
        try:
            os.link(src, dst)  # same file on disk, no extra space
        except OSError:
            shutil.copy2(src, dst)
        self.submit(new["id"])
        return self.store.get(new["id"])

    def new_job(self, title, source_name, model_id, options, **extra):
        model = self.cfg.models[model_id]
        meta = {"id": self.store.new_id(), "title": title, "source_name": source_name, "created": now(),
                "model": model_id, "model_title": model["title"], "kind": model["kind"], "options": options,
                "status": "preparing", "stage": "waiting", "speaker_names": {}, **extra}
        return self.store.create(meta)
