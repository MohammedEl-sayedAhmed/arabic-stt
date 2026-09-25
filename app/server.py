"""The local web server: the UI in app/static and a small JSON API (Python standard library only).

Safety: it listens on 127.0.0.1, answers only requests addressed to that host (no DNS rebinding),
and every request that changes something must carry the X-Tafrigh header, which other websites
open in the same browser cannot send (no cross-site requests).
"""
import json
import os
import re
import shutil
import statistics
import subprocess
import sys
import threading
import time
import urllib.parse
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from . import __version__, engines, report
from . import transcript as T
from .config import FROZEN, power_profile, set_power_profile
from .downloads import Downloads
from .jobs import ACTIVE, Runner, Store, probe_seconds

STATIC = Path(__file__).resolve().parent / "static"
ID = r"(\d{8}-\d{6}-[0-9a-f]{4})"
TYPES = {".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
         ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json"}
AUDIO_EXT = re.compile(r"^\.[A-Za-z0-9]{1,6}$")


class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


class App:
    """Shared state for all request threads."""

    def __init__(self, cfg):
        self.cfg = cfg
        self.store = Store(cfg.storage)
        self.runner = Runner(self.store, cfg, gpus=self.gpu_names)
        self.runner.recover()
        self.downloads = Downloads(cfg)
        self.server = None
        self.desktop = False    # set by the desktop app
        self.on_quit = None     # the desktop app closes its window instead of just stopping the server
        self.gpu = None         # what transcribe.py can use here; found in the background at start
        self.gpu_probing = False
        self.used = (0.0, None)  # (time, bytes) of the last count of the transcriptions' size
        self.probe_gpu()

    def probe_gpu(self):
        if self.gpu_probing:
            return
        self.gpu_probing = True

        def run():
            try:
                self.gpu = engines.gpu_info(self.cfg)
            finally:
                self.gpu_probing = False
        threading.Thread(target=run, daemon=True, name="tafrigh-gpu").start()

    def gpu_names(self):
        """The graphics cards the check found, for the job details; None until it has run (or if it failed)."""
        devices = (getattr(self, "gpu", None) or {}).get("devices")  # jobs may start before __init__ ends
        return [d.get("name") for d in devices if isinstance(d, dict)] if isinstance(devices, list) else None

    def cuda_ready(self):
        items = self.cfg.download_items()
        return bool((self.gpu or {}).get("cuda_libs")) or ("cuda" in items and self.downloads.status("cuda")["installed"])

    def runs_on(self, model):
        """Where a local model is expected to run: "gpu" or "cpu"."""
        gpu = self.gpu or {}
        if model["kind"] != "local" or self.cfg.setting("device") == "cpu":
            return "cpu"
        if model["engine"] in ("cohere", "gguf") and gpu.get("devices"):
            return "gpu"
        if model["engine"] == "whisper" and gpu.get("cuda_devices") and self.cuda_ready():
            return "gpu"
        return "cpu"

    def speed(self, model, jobs):
        """The processing time / audio length to expect: measured on this computer (the median of the last
        runs on the same kind of device and power profile), else the config's figure."""
        where, power = self.runs_on(model), power_profile()
        past = [j["rtf"] for j in jobs if j.get("model") == model["id"] and j.get("status") == "done" and j.get("rtf")
                and j.get("kind") == "local" and (j.get("audio_s") or 0) >= 60 and j.get("power") == power
                and device_class(j.get("device")) == where][:5]
        if past:
            return {"rtf": round(statistics.median(past), 3), "measured": True, "runs_on": where}
        rtf = model.get("rtf_gpu") if where == "gpu" and model.get("rtf_gpu") else model.get("rtf")
        return {"rtf": rtf, "measured": False, "runs_on": where}

    def model_info(self, model, jobs=None):
        ready, reason = self.cfg.availability(model)
        keys = ("id", "kind", "engine", "title", "tagline", "facts", "service", "key_url", "rtf", "prompt", "hub",
                "privacy", "prompt_hint", "speakers_hint")
        items = self.cfg.download_items()
        return {**{k: model.get(k) for k in keys}, "ready": ready, "reason": reason,
                "speed": self.speed(model, self.store.list() if jobs is None else jobs) if model["kind"] == "local" else None,
                "key_source": self.cfg.key_source(model) if model["kind"] == "hosted" else None,
                "download": self.downloads.status(model["id"]) if model["id"] in items else None}

    def used_bytes(self):
        """Disk space of all transcriptions (audio copies, transcripts, logs), counted at most every 30 s."""
        at, size = self.used
        if size is None or time.time() - at > 30:
            size = sum(f.stat().st_size for f in self.store.root.rglob("*") if f.is_file())
            self.used = (time.time(), size)
        return size

    def status(self):
        jobs = self.store.list()
        items = self.cfg.download_items()
        gpu = self.gpu or {}
        if gpu.get("cuda_devices") and not gpu.get("cuda_libs") and "cuda" in items \
                and self.downloads.status("cuda")["installed"]:
            self.probe_gpu()  # the NVIDIA libraries were just downloaded: check them again
        return {
            "app": "tafrigh", "version": __version__,
            "desktop": self.desktop, "frozen": FROZEN, "home": str(self.cfg.home),
            "models": [self.model_info(m, jobs) for m in self.cfg.models.values()],
            "voiceprints": self.downloads.status("voiceprints") if "voiceprints" in items else None,
            "cuda": self.downloads.status("cuda") if "cuda" in items else None,
            "gpu": self.gpu, "gpu_probing": self.gpu_probing,
            "defaults": self.cfg.defaults,
            "settings": self.cfg.settings(),
            "cpu_threads": os.cpu_count(),
            "speakers_ready": self.cfg.speakers_ready(),
            "power": power_profile(),
            "performance_while_running": bool(self.cfg.setting("performance_while_running")),
            "storage": {"dir": str(self.cfg.storage), "free_gb": round(shutil.disk_usage(self.cfg.storage).free / 1e9, 1),
                        "used_mb": round(self.used_bytes() / 1e6), "jobs": len(jobs)},
            "active": sum(1 for j in jobs if j["status"] in ACTIVE),
        }


def device_class(device):
    """"gpu" or "cpu" from a job's device, e.g. "vulkan: Intel(R) Iris(R) Xe Graphics" (older jobs have none)."""
    return "gpu" if (device or "").split(":")[0] in ("vulkan", "cuda", "metal", "rocm") else "cpu"


def summary(job):
    keys = ("id", "title", "created", "model", "model_title", "kind", "status", "stage", "done", "total",
            "audio_s", "seconds", "rtf", "elapsed", "source_name")
    return {k: job.get(k) for k in keys}


def slug(text):
    s = re.sub(r"[^\w\s-]", "", text or "", flags=re.UNICODE).strip()
    return re.sub(r"\s+", "-", s)[:80] or "transcript"


def parse_options(p, cfg, model):
    speakers = str(p.get("speakers", cfg.defaults.get("speakers", "auto"))).lower()
    if speakers not in ("none", "auto"):
        if not speakers.isdigit() or not 1 <= int(speakers) <= 20:
            raise ApiError(400, "speakers must be none, auto or 1-20")
        speakers = int(speakers)
    language = str(p.get("language", cfg.defaults.get("language", "ar")))
    if language not in ("ar", "en", "auto"):
        raise ApiError(400, "language must be ar, en or auto")
    prompt = str(p.get("prompt") or "")[:2000] if model.get("prompt") else ""
    return {"speakers": speakers, "language": language, "prompt": prompt}


class Handler(BaseHTTPRequestHandler):
    server_version = "Tafrigh"
    protocol_version = "HTTP/1.1"
    app: App  # set by make_server

    def log_message(self, fmt, *args):  # quiet; errors are returned to the UI instead
        pass

    # ---- plumbing ----------------------------------------------------------------------------
    def reply(self, status, body=b"", ctype="application/json; charset=utf-8", headers=None):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def json(self, obj, status=200):
        self.reply(status, json.dumps(obj, ensure_ascii=False).encode())

    def body_json(self, limit=5_000_000):
        n = int(self.headers.get("Content-Length") or 0)
        if n > limit:
            raise ApiError(413, "request too large")
        self._body_read = True
        try:
            return json.loads(self.rfile.read(n) or b"{}")
        except ValueError:
            raise ApiError(400, "invalid JSON")

    def guard(self, write):
        cfg = self.app.cfg
        port = self.server.server_address[1]
        if cfg.server["host"] in ("127.0.0.1", "localhost", "::1"):
            allowed = {f"127.0.0.1:{port}", f"localhost:{port}", f"[::1]:{port}"}
            if self.headers.get("Host") not in allowed:
                raise ApiError(403, "requests must be addressed to 127.0.0.1")
            origin = self.headers.get("Origin")
            if origin and origin.removeprefix("http://") not in allowed:
                raise ApiError(403, "cross-site request refused")
        if write and self.headers.get("X-Tafrigh") != "1":
            raise ApiError(403, "missing X-Tafrigh header")

    def dispatch(self, method):
        self._body_read = False  # one handler serves every request on a keep-alive connection
        path, _, query = self.path.partition("?")
        params = {k: v[-1] for k, v in urllib.parse.parse_qs(query).items()}
        try:
            self.guard(write=method not in ("GET", "HEAD"))
            for verb, pattern, fn in ROUTES:
                m = re.fullmatch(pattern, path)
                if m and verb == ("GET" if method == "HEAD" else method):
                    return fn(self, params, *m.groups())
            raise ApiError(404, "not found")
        except ApiError as e:
            self.drain()
            self.json({"error": str(e)}, e.status)
        except ConnectionError:  # the browser went away (e.g. seeking the player); Windows: ConnectionAbortedError
            self.close_connection = True
        except Exception as e:  # report instead of dropping the connection
            self.drain()
            self.json({"error": f"{type(e).__name__}: {e}"}, 500)
        finally:
            self.drain()  # a body the handler didn't need would be read as the next request

    def drain(self):
        """Read an unread request body so the connection stays usable."""
        n = int(self.headers.get("Content-Length") or 0)
        if n and not self._body_read:
            if n > 50_000_000:  # not worth reading a big upload we refused: close the connection instead
                self.close_connection = True
            else:
                try:
                    self.rfile.read(n)
                except OSError:
                    self.close_connection = True
        self._body_read = True

    def do_GET(self):
        self.dispatch("GET")

    def do_HEAD(self):
        self.dispatch("HEAD")

    def do_POST(self):
        self.dispatch("POST")

    def do_PATCH(self):
        self.dispatch("PATCH")

    def do_DELETE(self):
        self.dispatch("DELETE")

    # ---- static -----------------------------------------------------------------------------------
    def static(self, _params, name="index.html"):
        f = (STATIC / name).resolve()
        if STATIC not in f.parents or not f.is_file():
            raise ApiError(404, "not found")
        self.reply(200, f.read_bytes(), TYPES.get(f.suffix, "application/octet-stream"))

    def service_worker(self, params):
        self.static(params, "sw.js")

    # ---- API ----------------------------------------------------------------------------------------
    def status(self, _params):
        self.json(self.app.status())

    def list_jobs(self, _params):
        self.json({"jobs": [summary(j) for j in self.app.store.list()]})

    def create_job(self, params):
        cfg, runner = self.app.cfg, self.app.runner
        ctype = self.headers.get("Content-Type", "")
        is_json = ctype.startswith("application/json")
        p = self.body_json() if is_json else params
        model = cfg.models.get(p.get("model") or cfg.defaults["model"])
        if model is None:
            raise ApiError(400, "unknown model")
        ready, reason = cfg.availability(model)
        if not ready:
            raise ApiError(400, f"{model['title']} is not ready: {reason}")
        if model["kind"] == "hosted" and str(p.get("confirm_upload")).lower() not in ("1", "true"):
            raise ApiError(400, f"confirm that the recording may be uploaded to {model['service']}")
        options = parse_options(p, cfg, model)
        if is_json:  # a file already on this computer: read it in place, no copy
            source = Path(str(p.get("path") or "")).expanduser()
            if not source.is_file():
                raise ApiError(400, f"file not found: {source}")
            job = runner.new_job(title=p.get("title") or source.stem, source_name=source.name,
                                 model_id=model["id"], options=options, source_path=str(source.resolve()))
        else:
            name = Path(p.get("name") or "recording").name
            ext = Path(name).suffix if AUDIO_EXT.match(Path(name).suffix or "") else ".bin"
            n = int(self.headers.get("Content-Length") or 0)
            if n <= 0:
                raise ApiError(400, "empty upload")
            if n > cfg.max_upload:
                raise ApiError(413, f"file is larger than the {cfg.max_upload // 1024 ** 3} GB limit")
            cfg.storage.mkdir(parents=True, exist_ok=True)
            if shutil.disk_usage(cfg.storage).free < n * 1.2 + 1e9:
                raise ApiError(507, "not enough free disk space for this file")
            job = runner.new_job(title=p.get("title") or Path(name).stem, source_name=name,
                                 model_id=model["id"], options=options)
            dest = self.app.store.dir(job["id"]) / f"source{ext.lower()}"
            try:
                with open(dest, "wb") as f:
                    left = n
                    while left > 0:
                        chunk = self.rfile.read(min(1 << 20, left))
                        if not chunk:
                            raise ApiError(400, "upload interrupted")
                        f.write(chunk)
                        left -= len(chunk)
                self._body_read = True
            except BaseException:
                self.app.store.delete(job["id"])
                raise
        runner.submit(job["id"])
        self.json(summary(self.app.store.get(job["id"])), 201)

    def job(self, jid):
        job = self.app.store.get(jid)
        if job is None:
            raise ApiError(404, "no such transcription")
        return job

    def get_job(self, _params, jid):
        job = self.job(jid)
        folder = self.app.store.dir(jid)
        data = self.app.store.transcript(jid)
        out = {"job": job, "lines": data["lines"] if data else engines.partial_lines(folder),
               "edited": bool(data and data.get("edited")), "partial": data is None,
               "has_audio": (folder / "audio.flac").exists()}
        out["details"] = report.details(job, out["lines"], out["edited"])
        out["detail_groups"] = report.groups(out["details"])  # the same, as the lines the job page shows
        if job["status"] in ("failed", "interrupted", "cancelled"):
            log = folder / "log.txt"
            out["log"] = log.read_text(encoding="utf-8", errors="replace")[-4000:] if log.exists() else ""
        self.json(out)

    def lines_of(self, jid):
        data = self.app.store.transcript(jid)
        return data["lines"] if data else engines.partial_lines(self.app.store.dir(jid))

    def patch_job(self, _params, jid):
        job, store = self.job(jid), self.app.store
        p = self.body_json()
        if "title" in p:
            store.update(jid, title=str(p["title"]).strip()[:200] or job["title"])
        if "speaker_names" in p:
            names = {str(k): str(v).strip()[:60] for k, v in (p["speaker_names"] or {}).items()
                     if str(v).strip() and re.fullmatch(r"\d{1,3}", str(k))}
            store.update(jid, speaker_names=names)
        if "lines" in p or "merge" in p:
            if job["status"] in ACTIVE:
                raise ApiError(409, "wait until the transcription has finished")
            lines = self.lines_of(jid)
            if "lines" in p:
                lines = clean_lines(p["lines"])
            if "merge" in p:
                src, dst = str(p["merge"].get("from")), str(p["merge"].get("into"))
                if not (re.fullmatch(r"\d{1,3}", src) and re.fullmatch(r"\d{1,3}", dst)):
                    raise ApiError(400, "speaker ids are numbers")
                lines = [{**x, "speaker": dst if x["speaker"] == src else x["speaker"]} for x in lines]
                names = dict(store.get(jid).get("speaker_names") or {})
                names.pop(src, None)
                store.update(jid, speaker_names=names)
            store.save_transcript(jid, {"lines": lines, "edited": True, "model": job["model"]})
        self.get_job({}, jid)

    def delete_job(self, _params, jid):
        job = self.job(jid)
        if job["status"] in ACTIVE:
            self.app.runner.cancel(jid)
            for _ in range(60):  # let a running model stop before its folder goes
                if (self.app.store.get(jid) or {}).get("status") not in ACTIVE:
                    break
                threading.Event().wait(0.25)
        self.app.store.delete(jid)
        self.json({"deleted": jid})

    def cancel_job(self, _params, jid):
        self.job(jid)
        self.app.runner.cancel(jid)
        self.json(summary(self.app.store.get(jid)))

    def rerun_job(self, _params, jid):
        job = self.job(jid)
        if not (self.app.store.dir(jid) / "audio.flac").exists():
            raise ApiError(409, "this transcription has no prepared audio yet")
        p = self.body_json()
        model = self.app.cfg.models.get(p.get("model") or job["model"])
        if model is None:
            raise ApiError(400, "unknown model")
        ready, reason = self.app.cfg.availability(model)
        if not ready:
            raise ApiError(400, f"{model['title']} is not ready: {reason}")
        if model["kind"] == "hosted" and str(p.get("confirm_upload")).lower() not in ("1", "true"):
            raise ApiError(400, f"confirm that the recording may be uploaded to {model['service']}")
        options = parse_options({**(job.get("options") or {}), **p}, self.app.cfg, model)
        self.json(summary(self.app.runner.rerun(jid, model["id"], options)), 201)

    def audio(self, _params, jid):
        self.job(jid)
        f = self.app.store.dir(jid) / "audio.flac"
        if not f.exists():
            raise ApiError(404, "audio not ready")
        size = f.stat().st_size
        start, end, status = 0, size - 1, 200
        m = re.fullmatch(r"bytes=(\d*)-(\d*)", self.headers.get("Range", ""))
        if m and (m.group(1) or m.group(2)):
            if m.group(1):
                start = int(m.group(1))
                end = min(int(m.group(2)), size - 1) if m.group(2) else size - 1
            else:  # suffix range: the last N bytes
                start = max(0, size - int(m.group(2)))
            if start > end or start >= size:
                self.reply(416, headers={"Content-Range": f"bytes */{size}"})
                return
            status = 206
        self.send_response(status)
        self.send_header("Content-Type", "audio/flac")
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(end - start + 1))
        if status == 206:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.end_headers()
        if self.command == "HEAD":
            return
        with open(f, "rb") as fh:
            fh.seek(start)
            left = end - start + 1
            while left > 0:
                chunk = fh.read(min(1 << 16, left))
                if not chunk:
                    break
                self.wfile.write(chunk)
                left -= len(chunk)

    def export(self, params, jid, fmt):
        job = self.job(jid)
        if fmt not in T.EXPORTS:
            raise ApiError(404, "unknown format")
        fn, ctype = T.EXPORTS[fmt]
        data, lines = self.app.store.transcript(jid), self.lines_of(jid)
        details = None if params.get("details") == "0" else report.details(job, lines, bool(data and data.get("edited")))
        body = fn(job, lines, details).encode()
        name = f"{slug(job.get('title'))}.{fmt}"
        ascii_name = re.sub(r"[^A-Za-z0-9._-]", "", name)
        if not re.search(r"[A-Za-z0-9]", ascii_name.rsplit(".", 1)[0]):
            ascii_name = f"transcript.{fmt}"
        disposition = f'attachment; filename="{ascii_name}"; filename*=UTF-8\'\'{urllib.parse.quote(name)}'
        self.reply(200, body, ctype, {"Content-Disposition": disposition})

    def save_key(self, _params):
        p = self.body_json()
        model = self.app.cfg.models.get(p.get("model"))
        if model is None or model["kind"] != "hosted":
            raise ApiError(400, "not a hosted model")
        self.app.cfg.save_key(model["id"], str(p.get("key") or "").strip())
        self.json(self.app.model_info(model))

    def power(self, _params):
        profile = self.body_json().get("profile")
        if profile not in ("performance", "balanced", "power-saver"):
            raise ApiError(400, "unknown power profile")
        if not set_power_profile(profile):
            raise ApiError(500, "could not change the power profile (is powerprofilesctl available?)")
        self.json({"power": power_profile()})

    def probe(self, _params):
        path = Path(str(self.body_json().get("path") or "")).expanduser()
        if not path.is_file():
            raise ApiError(404, f"file not found: {path}")
        self.json({"path": str(path.resolve()), "name": path.name, "size": path.stat().st_size,
                   "seconds": probe_seconds(path)})

    def settings(self, _params):
        p = self.body_json()
        values = {k: p[k] for k in self.app.cfg.SETTINGS if k in p}
        try:
            self.app.cfg.save_settings(**values)
        except ValueError as e:
            raise ApiError(400, str(e))
        self.json(self.app.status())

    def open_folder(self, _params):
        """Show the data folder in the file manager (only that folder; the path isn't taken from the request)."""
        folder = str(self.app.cfg.storage)
        try:
            if os.name == "nt":
                os.startfile(folder)  # noqa: S606 — our own folder
            else:
                subprocess.Popen(["open" if sys.platform == "darwin" else "xdg-open", folder],
                                 stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except OSError as e:
            raise ApiError(500, f"could not open the folder: {e}")
        self.json({"opened": folder})

    def download(self, _params, item_id):
        items = self.app.cfg.download_items()
        if item_id not in items:
            raise ApiError(404, "nothing to download with that name")
        wanted = [item_id]
        if item_id in self.app.cfg.models and "voiceprints" in items:  # speaker labels need it too
            wanted.append("voiceprints")
        try:
            self.app.downloads.start(wanted)
        except OSError as e:
            raise ApiError(507, str(e))
        self.json(self.app.status())

    def cancel_download(self, _params, item_id):
        self.app.downloads.cancel(item_id)
        self.json(self.app.status())

    def remove_download(self, _params, item_id):
        if item_id not in self.app.cfg.download_items():
            raise ApiError(404, "nothing to remove with that name")
        if any(j["status"] in ACTIVE and (j["model"] == item_id or item_id in ("voiceprints", "cuda")) and j["kind"] == "local"
               for j in self.app.store.list()):
            raise ApiError(409, "a transcription is using it; wait until it has finished")
        try:
            self.app.downloads.remove(item_id)
        except RuntimeError as e:
            raise ApiError(409, str(e))
        self.json(self.app.status())

    def quit(self, _params):
        self.json({"bye": True})
        target = self.app.on_quit or self.app.server.shutdown
        threading.Thread(target=target, daemon=True).start()


def clean_lines(lines):
    out = []
    for x in lines or []:
        try:
            start, end = float(x["start"]), float(x["end"])
        except (KeyError, TypeError, ValueError):
            raise ApiError(400, "each line needs a numeric start and end")
        text = str(x.get("text") or "").strip()
        speaker = None if x.get("speaker") in (None, "") else str(x["speaker"])
        if speaker is not None and not re.fullmatch(r"\d{1,3}", speaker):
            raise ApiError(400, "speaker ids are numbers")
        if text:
            out.append({"start": start, "end": max(start, end), "text": text[:20000], "speaker": speaker})
    return out


ROUTES = [
    ("GET", r"/", Handler.static),
    ("GET", r"/static/([\w.-]+)", Handler.static),
    ("GET", r"/sw\.js", Handler.service_worker),
    ("GET", r"/api/status", Handler.status),
    ("GET", r"/api/jobs", Handler.list_jobs),
    ("POST", r"/api/jobs", Handler.create_job),
    ("GET", rf"/api/jobs/{ID}", Handler.get_job),
    ("PATCH", rf"/api/jobs/{ID}", Handler.patch_job),
    ("DELETE", rf"/api/jobs/{ID}", Handler.delete_job),
    ("POST", rf"/api/jobs/{ID}/cancel", Handler.cancel_job),
    ("POST", rf"/api/jobs/{ID}/rerun", Handler.rerun_job),
    ("GET", rf"/api/jobs/{ID}/audio", Handler.audio),
    ("GET", rf"/api/jobs/{ID}/export/(\w+)", Handler.export),
    ("POST", r"/api/keys", Handler.save_key),
    ("POST", r"/api/power", Handler.power),
    ("POST", r"/api/settings", Handler.settings),
    ("POST", r"/api/open-folder", Handler.open_folder),
    ("POST", r"/api/probe", Handler.probe),
    ("POST", r"/api/downloads/([\w-]+)", Handler.download),
    ("POST", r"/api/downloads/([\w-]+)/cancel", Handler.cancel_download),
    ("DELETE", r"/api/downloads/([\w-]+)", Handler.remove_download),
    ("POST", r"/api/quit", Handler.quit),
]


class Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def make_server(cfg, host=None, port=None):
    app = App(cfg)
    handler = type("BoundHandler", (Handler,), {"app": app})
    server = Server((host or cfg.server["host"], cfg.server["port"] if port is None else port), handler)
    app.server = server
    return server, app
