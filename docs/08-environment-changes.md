# 8. What was installed or changed on this laptop

## Changes outside the project folder (all approved by you)

| Change | Why | How to undo |
|---|---|---|
| Cleared the npm download cache (`npm cache clean --force`) | disk was full: 1.5 GB free at the first check (7.3 GB just before the clean — something outside this work freed space in between); the clean freed ~11 GB → 18 GB free | nothing to undo; npm re-downloads packages when needed |
| Power profile set to **performance** during test runs | power-saver ran the CPU at 0.4–1.2 GHz | `powerprofilesctl set power-saver` (restored at the end of each test session) |
| gh CLI's active account switched to the personal one | your git-guard hook requires it to push from `playground/` | `gh auth switch` (with two accounts it switches to the other one) |
| Claude memory notes in `~/.claude/projects/…stt-mvp/memory/` | remember this project's goal, constraints and privacy rules | delete that folder |
| **New folder `~/Desktop/mojaz-meetings-dataset/`** (274 MB) | the private meetings evaluation set: audio chunks + ElevenLabs references, built read-only from `~/Desktop/mojaz-meetings/` and ClickUp | delete the folder; your originals were not touched |

The Whisper large-v3 weights were already in `~/.cache/huggingface` before this work and were reused.

## Inside the project folder (git-ignored except the code, docs and public-set results)

| Path | Size | What |
|---|---|---|
| `.venv/` | ~0.5 GB | Python 3.12: faster-whisper, sherpa-onnx, transcribe-cpp, jiwer, soundfile, numpy, requests |
| `tools/llama/` | 41 MB | prebuilt llama.cpp CPU binaries (release b11165) |
| `models/whisper-medium-arabic-codeswitched-ct2/` | 0.8 GB | the default engine (plus the Whisper tokenizer, so it runs offline) |
| `models/cohere-transcribe-arabic-07-2026-gguf/` | 1.6 GB | Cohere Transcribe Arabic Q4_K_M |
| `models/Audar-ASR-V1-Turbo/` | 1.9 GB | Audar Turbo Q4_K_M + BF16 audio encoder |
| `models/diarization/` | 0.3 GB | voiceprint models: TitaNet-small (the default, the only one `--speakers` needs); TitaNet-large, WeSpeaker ResNet34 (first default) and ResNet152, 3D-Speaker CAM++ (used only by `bench/compare_voiceprints.py`); an unused pyannote segmentation model |
| `data/` | ~0.4 GB | public test clips (Perle, ArzEn, Mixat) in three conditions, chunks of your test calls, and the 10-minute meeting excerpts |
| `results/poc/`, `results/meetings/` | small | transcripts of your calls and meetings (private) |

**Deleted during the work:** the R2T2 and Qwen3-ASR model files (4.7 GB), after their benchmarks were
complete, when free disk space fell to 3.9 GB. `bench/fetch_models.py` (no arguments) re-downloads
them. Audar (1.9 GB) can also go if you don't plan to use it.

## Privacy

- No audio was sent to any external service. Models ran locally; the llama.cpp server listened on
  `127.0.0.1` only.
- Network use was downloads only: models, the public test sets, meeting recordings from your own
  ClickUp docs (read-only), and a Whisper tokenizer file.
- The research agents used public web pages only (no accounts, no keys, no uploads).
- The repository excludes all audio, the meeting dataset, and every transcript of your calls and
  meetings; the docs contain only aggregate numbers for them.
