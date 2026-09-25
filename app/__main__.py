"""Start the app: .venv/bin/python -m app  (or ./app.sh). Stop with Ctrl+C or Quit in the app."""
import argparse
import json
import sys
import threading
import urllib.request
import webbrowser
from pathlib import Path

from .config import ROOT, Config
from .server import make_server

LAUNCHER = """[Desktop Entry]
Type=Application
Name=Tafrigh
GenericName=Meeting transcription
Comment=Transcribe recordings with speaker labels, locally or with ElevenLabs / Speechmatics
Exec={exec}
Icon={root}/app/static/icon.svg
Terminal=false
Categories=AudioVideo;Office;
"""


def running_here(port):
    """True if this app already answers on the port."""
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/status", timeout=2) as r:
            return json.load(r).get("app") == "tafrigh"
    except (OSError, ValueError):
        return False


def main():
    if "--desktop" in sys.argv[1:]:  # ./app.sh --desktop: the desktop window (app/desktop.py)
        from .desktop import main as desktop
        return desktop([a for a in sys.argv[1:] if a != "--desktop"])
    ap = argparse.ArgumentParser(prog="app", description="Tafrigh: transcribe recordings with speaker labels.")
    ap.add_argument("--port", type=int, help="default: [server] port in app/config.toml")
    ap.add_argument("--no-browser", action="store_true", help="don't open a browser tab")
    ap.add_argument("--desktop", action="store_true", help="open the desktop window instead (see app/desktop.py)")
    ap.add_argument("--config", type=Path, help="another config file instead of app/config.toml")
    ap.add_argument("--install-launcher", action="store_true",
                    help="add Tafrigh to the desktop's application menu (~/.local/share/applications)")
    args = ap.parse_args()
    if args.install_launcher:
        dest = Path.home() / ".local" / "share" / "applications" / "tafrigh.desktop"
        dest.parent.mkdir(parents=True, exist_ok=True)
        command = f"sh -c 'cd \"{ROOT}\" && .venv/bin/python -m app.desktop'"  # the desktop window
        dest.write_text(LAUNCHER.format(root=ROOT, exec=command), encoding="utf-8")
        print(f"added {dest}; remove that file to undo")
        return
    cfg = Config(args.config) if args.config else Config()
    port = args.port or cfg.server["port"]
    url = f"http://127.0.0.1:{port}/"
    try:
        server, app = make_server(cfg, port=port)
    except OSError:
        if running_here(port):  # already running (e.g. started from the app menu): just open it
            print(f"Tafrigh is already running at {url}")
            if not args.no_browser:
                webbrowser.open(url)
            return
        sys.exit(f"port {port} is in use by another program; start with --port N")
    print(f"Tafrigh is running at {url}  (data: {cfg.storage}; stop with Ctrl+C)", flush=True)
    if cfg.server.get("open_browser", True) and not args.no_browser:
        threading.Timer(0.6, webbrowser.open, [url]).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        app.runner.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
