"""Settings: app/config.toml, optional overrides in <storage>/config.toml, and API keys."""
import json
import os
import shutil
import subprocess
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CONFIG = ROOT / "app" / "config.toml"


def merge(base, extra):
    """Overlay extra on base: tables merge key by key, [[models]] merge by id."""
    out = dict(base)
    for key, value in extra.items():
        if key == "models":
            models = {m["id"]: dict(m) for m in base.get("models", [])}
            for m in value:
                models[m["id"]] = {**models.get(m["id"], {}), **m}
            out["models"] = list(models.values())
        elif isinstance(value, dict) and isinstance(base.get(key), dict):
            out[key] = {**base[key], **value}
        else:
            out[key] = value
    return out


class Config:
    def __init__(self, path=DEFAULT_CONFIG, storage=None):
        data = tomllib.loads(Path(path).read_text())
        self.storage = Path(storage) if storage else ROOT / data["storage"]["dir"]
        override = self.storage / "config.toml"
        if override.exists():
            data = merge(data, tomllib.loads(override.read_text()))
        self.data = data
        self.server = data["server"]
        self.defaults = data["defaults"]
        self.local = data["local"]
        self.keep_original = data["storage"].get("keep_original", False)
        self.max_upload = int(data["storage"].get("max_upload_gb", 4) * 1024 ** 3)
        self.models = {m["id"]: m for m in data["models"] if not m.get("disabled")}
        self.secrets_path = self.storage / "secrets.json"

    def path(self, value):
        """A path from the config, relative to the project folder."""
        return Path(value) if Path(value).is_absolute() else ROOT / value

    # API keys: environment first, then the ones saved from the app.
    def secrets(self):
        try:
            return json.loads(self.secrets_path.read_text())
        except (OSError, ValueError):
            return {}

    def api_key(self, model):
        env = os.environ.get(model.get("key_env", ""), "").strip()
        return env or self.secrets().get(model["id"], "").strip()

    def key_source(self, model):
        if os.environ.get(model.get("key_env", ""), "").strip():
            return "environment"
        return "app" if self.secrets().get(model["id"], "").strip() else None

    def save_key(self, model_id, key):
        secrets = self.secrets()
        if key:
            secrets[model_id] = key
        else:
            secrets.pop(model_id, None)
        self.storage.mkdir(parents=True, exist_ok=True)
        tmp = self.secrets_path.with_suffix(".tmp")
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w") as f:
            json.dump(secrets, f)
        os.replace(tmp, self.secrets_path)

    def availability(self, model):
        """(ready, reason): whether the model can run now, and what is missing if not."""
        if model["kind"] == "hosted":
            return (True, None) if self.api_key(model) else (False, "needs an API key")
        if model["engine"] == "whisper":
            name = model["whisper_model"]
            if "/" in name or name.startswith("."):
                ok = (self.path(name) / "model.bin").exists()
            else:  # a faster-whisper name such as large-v3, loaded from the Hugging Face cache
                from huggingface_hub import try_to_load_from_cache
                ok = isinstance(try_to_load_from_cache(f"Systran/faster-whisper-{name}", "model.bin"), str)
            return (True, None) if ok else (False, "not downloaded")
        if model["engine"] == "cohere":
            return (True, None) if self.path(model["cohere_model"]).exists() else (False, "not downloaded")
        return False, f"unknown engine {model['engine']}"

    def speakers_ready(self):
        return self.path(self.local["voiceprint_model"]).exists()


def power_profile():
    """The current power profile (power-saver, balanced, performance), or None if unknown."""
    if not shutil.which("powerprofilesctl"):
        return None
    try:
        return subprocess.run(["powerprofilesctl", "get"], capture_output=True, text=True, timeout=5).stdout.strip() or None
    except (OSError, subprocess.SubprocessError):
        return None


def set_power_profile(profile):
    try:
        return subprocess.run(["powerprofilesctl", "set", profile], capture_output=True, timeout=10).returncode == 0
    except (OSError, subprocess.SubprocessError):
        return False
