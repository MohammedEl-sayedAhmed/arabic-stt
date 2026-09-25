"""Download local models from inside the app: resumable, verified, one item at a time.

Every file in the config has a pinned URL (a fixed Hugging Face revision or release), its size and
its SHA-256. A download goes to <file>.part, resumes with an HTTP Range request after a dropped
connection, and becomes the real file only once size and checksum match.
"""
import hashlib
import shutil
import threading
import time

import requests

from .config import replace_file


class Cancelled(Exception):
    pass


class Downloads:
    def __init__(self, cfg):
        self.cfg = cfg
        self.lock = threading.Lock()
        self.jobs = {}        # item id -> {"state", "done", "total", "error", "file"}
        self.cancelled = set()

    # ---- state -----------------------------------------------------------------------------------
    def installed(self, f):
        p = self.cfg.path(f["path"])
        return p.exists() and p.stat().st_size == f["size"]

    def status(self, item_id):
        files = self.cfg.download_items()[item_id]["files"]
        missing = [f for f in files if not self.installed(f)]
        job = dict(self.jobs.get(item_id) or {})
        partial = sum(self.part_size(f) for f in missing)
        return {"size": sum(f["size"] for f in files), "missing": sum(f["size"] for f in missing),
                "installed": not missing, "partial": partial, **job}

    def all_status(self):
        return {item_id: self.status(item_id) for item_id in self.cfg.download_items()}

    def part_size(self, f):
        part = self.part_path(f)
        return part.stat().st_size if part.exists() else 0

    def part_path(self, f):
        p = self.cfg.path(f["path"])
        return p.with_name(p.name + ".part")

    def busy(self, item_id):
        return (self.jobs.get(item_id) or {}).get("state") in ("downloading", "verifying")

    # ---- actions ---------------------------------------------------------------------------------
    def start(self, item_ids):
        """Download the given items (e.g. a model and the voiceprint model) one after another."""
        items = self.cfg.download_items()
        todo = [i for i in item_ids if i in items and not self.busy(i) and not self.status(i)["installed"]]
        need = sum(self.status(i)["missing"] - self.status(i)["partial"] for i in todo)
        root = self.cfg.home
        root.mkdir(parents=True, exist_ok=True)
        if need and shutil.disk_usage(root).free < need + 500e6:
            raise OSError(f"not enough free disk space: {need / 1e9:.1f} GB needed")
        for i in todo:
            self.cancelled.discard(i)
            self.jobs[i] = {"state": "queued", "done": self.status(i)["partial"], "total": self.status(i)["missing"],
                            "error": None}
        if todo:
            threading.Thread(target=self.run, args=(todo,), daemon=True, name="tafrigh-download").start()
        return todo

    def cancel(self, item_id):
        self.cancelled.add(item_id)
        job = self.jobs.get(item_id)
        if job and job["state"] == "queued":
            job["state"] = "cancelled"

    def remove(self, item_id):
        """Delete an item's files (and any partial download)."""
        if self.busy(item_id):
            raise RuntimeError("wait until the download has finished or cancel it")
        for f in self.cfg.download_items()[item_id]["files"]:
            for p in (self.cfg.path(f["path"]), self.part_path(f)):
                p.unlink(missing_ok=True)
        self.jobs.pop(item_id, None)

    # ---- work --------------------------------------------------------------------------------------
    def run(self, item_ids):
        for item_id in item_ids:
            job = self.jobs[item_id]
            if item_id in self.cancelled:
                job["state"] = "cancelled"
                continue
            job["state"] = "downloading"
            try:
                for f in self.cfg.download_items()[item_id]["files"]:
                    if not self.installed(f):
                        job["file"] = f["path"].rsplit("/", 1)[-1]
                        self.fetch(f, job, lambda: item_id in self.cancelled)
                job.update(state="done", file=None)
            except Cancelled:
                job.update(state="cancelled", file=None)
            except Exception as e:  # shown next to the model in the app
                job.update(state="error", error=str(e) or type(e).__name__, file=None)

    def fetch(self, f, job, cancelled):
        dest, part = self.cfg.path(f["path"]), self.part_path(f)
        dest.parent.mkdir(parents=True, exist_ok=True)
        failures = 0
        while True:
            have = part.stat().st_size if part.exists() else 0
            if have > f["size"]:  # not what we expected: start over
                part.unlink()
                have = 0
            if have == f["size"]:
                break
            try:
                headers = {"Accept-Encoding": "identity"}  # byte ranges must refer to the file itself
                if have:
                    headers["Range"] = f"bytes={have}-"
                with requests.get(f["url"], headers=headers, stream=True, timeout=(20, 60)) as r:
                    if have and r.status_code == 200:  # the server ignored the range: restart this file
                        job["done"] -= have
                        have = 0
                    elif r.status_code not in (200, 206):
                        if 400 <= r.status_code < 500 and r.status_code not in (408, 429):
                            raise RuntimeError(f"HTTP {r.status_code} for {f['url']}")
                        r.raise_for_status()
                    with open(part, "ab" if have else "wb") as out:
                        for chunk in r.iter_content(1 << 20):
                            if cancelled():
                                raise Cancelled()
                            out.write(chunk)
                            job["done"] += len(chunk)
                failures = 0
            except (requests.RequestException, ConnectionError, TimeoutError) as e:
                failures += 1
                if failures > 8:
                    raise RuntimeError(f"download kept failing: {e}")
                for _ in range(min(30, 2 ** failures) * 2):  # back off, but notice a cancel
                    if cancelled():
                        raise Cancelled()
                    time.sleep(0.5)
        job["state"] = "verifying"
        h = hashlib.sha256()
        with open(part, "rb") as fh:
            for block in iter(lambda: fh.read(1 << 22), b""):
                h.update(block)
                if cancelled():
                    raise Cancelled()
        if h.hexdigest() != f["sha256"]:
            part.unlink(missing_ok=True)
            raise RuntimeError(f"{dest.name}: checksum mismatch (the download was damaged; try again)")
        replace_file(part, dest)
        job["state"] = "downloading"
