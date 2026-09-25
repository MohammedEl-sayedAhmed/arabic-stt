# 10. The desktop app (Windows and Linux) — scaffold

Tafrigh (see [the app](09-app.md)) also runs as a desktop application: its own window, a Start-menu
/ app-menu entry, models downloaded from inside the app, and a Windows build and installer. It is
the same code — the local server and the web interface — shown in a native window, so every
feature works the same way in the browser and on the desktop.

This is a **scaffold**: it builds, installs and runs, the checks below pass, and the pieces a
product needs next are listed at the end.

## Run it

| | From source | Desktop build |
|---|---|---|
| Linux | `./app.sh --desktop` | `dist/Tafrigh/Tafrigh` |
| Windows | `app.cmd` (after the one-time setup below) | Start menu → Tafrigh (installer), or `Tafrigh.exe` |

Windows setup from source, once: install Python 3.12, then in the project folder
`py -3.12 -m venv .venv` and `.venv\Scripts\pip install -r requirements.txt -r requirements-desktop.txt`.

The window, in order of preference:

1. **Native window** (pywebview) using the system's web engine: Edge WebView2 on Windows (part of
   Windows 10 and 11), WebKit on macOS, GTK WebKit or Qt on Linux. Adds native *Open* and *Save*
   dialogs: a recording chosen with *choose a file* is read in place (not copied), and exports are
   saved where you pick.
2. **App-mode browser window**: Edge, Chrome, Chromium or Brave with `--app` (no tabs or address
   bar) and a profile of its own — used on Linux when GTK WebKit and Qt are missing, as on this
   laptop.
3. **A browser tab**, if none of the above exists.

Closing the window quits the app; so does *Settings → Quit*. `--browser` forces 2/3, `--no-window`
only runs the server, `--port N` picks the port (default 8765, or any free one).

## Where things are kept

| | Data folder (transcriptions, keys, downloaded models, `tafrigh.log`) |
|---|---|
| From source | the project folder, as before (`app_data/`, `models/`) |
| Windows build | `%LOCALAPPDATA%\Tafrigh` |
| Linux build | `~/.local/share/tafrigh` |
| macOS build | `~/Library/Application Support/Tafrigh` |

`TAFRIGH_HOME=<folder>` overrides it. Uninstalling keeps this folder.

## Models: downloaded in the app

A fresh installation has no local models. **Settings → Models on this computer** (or the button on a
model's card) downloads them:

| Model | Download | Source (pinned revision) |
|---|---|---|
| whisper-medium code-switching | 778 MB | Hugging Face `Seif-Eldeen-Sameh/whisper-medium-arabic-codeswitched-ct2` + the Whisper tokenizer |
| Cohere Transcribe Arabic | 1.6 GB | Hugging Face `handy-computer/cohere-transcribe-arabic-07-2026-gguf` |
| Whisper large-v3 | 3.1 GB | Hugging Face `Systran/faster-whisper-large-v3` (a copy already in the Hugging Face cache is used instead) |
| Voiceprint model (speaker labels) | 40 MB | sherpa-onnx release (TitaNet-small); fetched together with the first model |

Every file is pinned in `app/config.toml` by URL (a fixed revision), size and SHA-256. A download
resumes after a dropped connection (HTTP range requests) and only becomes the real file once the size
and checksum match. Files can be deleted again from the same screen. The hosted models (ElevenLabs,
Speechmatics) need no download, only an API key.

## Build it

```sh
pip install -r requirements.txt -r requirements-desktop.txt
python desktop/build.py              # dist/Tafrigh/ (Tafrigh.exe on Windows); --console to debug
dist/Tafrigh/Tafrigh --self-test     # Windows: add --report selftest.json (a windowed app has no console)
iscc desktop/installer.iss           # Windows only (Inno Setup 6): dist/Tafrigh-0.1.0-setup.exe
```

Build on the system you build for — PyInstaller does not cross-compile. The build is one folder
(about 470 MB on Linux: CTranslate2, onnxruntime, sherpa-onnx, the FFmpeg libraries, transcribe.cpp
with its CPU/Vulkan backends, numpy); models are not included. The same executable runs the model
worker (`Tafrigh --transcribe …`), so each transcription still gets its own process.

**Automated builds:** [`.github/workflows/desktop.yml`](../.github/workflows/desktop.yml) builds and
checks it on Windows and Linux: unit tests, a self-test from source, the build, a self-test of the
build; on Windows also the real-model test, a native-window test and the installer, which it uploads
(kept 7 days). It runs only when started by hand (*Actions → Desktop build → Run workflow*, or
`gh workflow run desktop.yml`) or for a version tag (`git tag v0.1.0 && git push --tags`), so it
doesn't use Actions minutes on every push.

## Self-test

`Tafrigh --self-test [--window] [--models] [--report file.json]` checks an installation without
touching your data: the model process starts and imports everything a local run needs; the interface
and API answer; a generated tone is uploaded, converted to 16 kHz FLAC and "transcribed" by a
stand-in for the ElevenLabs API on 127.0.0.1. With `--window`, a native window opens, loads the app
and closes. With `--models` (downloads about 820 MB into a temporary folder), whisper-medium and the
voiceprint model are fetched with the app's own downloader and a public 11-second speech sample (JFK,
from the openai/whisper repository) is transcribed with speaker labels — here: *"and so my fellow
americans, ask not what your country can do for you…"* in 16 s.

## What changed to make it cross-platform

- **No ffmpeg program needed**: recordings are converted with PyAV (the FFmpeg libraries that
  faster-whisper already ships) — about 7 s for 30 minutes of audio here.
- **Processes**: model runs start in their own process group on Linux, or with `CREATE_NO_WINDOW`
  on Windows, and are stopped the right way on each (so *Cancel* works on both).
- **Text files are UTF-8 everywhere** (Windows would otherwise use a code page and fail on Arabic),
  including the model process's output.
- **Windows file locking**: replacing a file that another thread is reading is retried; progress
  updates that collide are skipped.
- `transcribe.py` works without the Unix-only `resource` module (peak memory is then not recorded).

## Verified so far

On this Linux laptop:
- 20 unit tests: the app's API, the hosted-service parsers, downloads (resume, a server that ignores
  ranges, checksum mismatch, cancel), paths and the worker command.
- The desktop build: `--self-test` passes, and it transcribed the public demo clip with **Cohere (51 s)
  and whisper-medium (65 s)**, 7 speakers told apart by voice — the same results as from source.
- A real model download (the 40 MB voiceprint model) through the build, with checksum; every other
  pinned URL was checked (the small files downloaded and verified, the large ones by published size).

On Windows (GitHub Actions, `windows-latest`, 2026-09-25): all checks passed — the 20 unit tests,
the self-test from source and of the built `Tafrigh.exe`, the **real-model test** (whisper-medium and
the voiceprint model downloaded in 15 s; the speech sample transcribed in 13 s: *"and so my fellow
americans, ask not what your country can do for you…"*), the **native window** (it opened, loaded the
app and closed, through Edge WebView2), and the installer (`Tafrigh-0.1.0-setup.exe`, 77 MB). The
first Windows run found one real bug: reading a job's status file while another thread replaced it
failed on Windows (never on Linux); such reads are now retried. The whole run took about 4 minutes.

Not tested on Windows yet: the native open/save dialogs and a long local transcription by hand.

## Not done yet (for a product)

- **Code signing** — unsigned installers trigger Windows SmartScreen warnings ("Windows protected your
  PC" → More info → Run anyway).
- **Updates**: no auto-update; install a new version over the old one.
- **macOS**: pywebview and PyInstaller support it, but it isn't built or tested here.
- **Native window on Linux**: needs GTK WebKit (`gir1.2-webkit2-4.1`) or Qt; otherwise the app-mode
  browser window is used. Linux packages (AppImage/.deb) aren't made yet.
- **Older Windows** (before 10) may lack WebView2; the installer doesn't bundle its bootstrapper.
- **GPU**: CPU-only; a CUDA build of CTranslate2 would make local models much faster on NVIDIA GPUs.
- **Size**: about 470 MB unpacked; could shrink by dropping unused CPU variants of transcribe.cpp.
