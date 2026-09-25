# 8. What was installed or changed on this laptop

## Changes outside the project folder (all approved by you)

| Change | Why | How to undo |
|---|---|---|
| Cleared the npm download cache (`npm cache clean --force`, ~11 GB) | disk was 100% full | nothing to undo; npm re-downloads packages when needed |
| Power profile set to **performance** during tests | power-saver ran the CPU at 0.4–1.2 GHz | `powerprofilesctl set power-saver` (restored at the end of the session) |
| Claude memory notes in `~/.claude/projects/…stt-mvp/memory/` | remember this project's goal and constraints | delete that folder |

The Whisper large-v3 weights were already in `~/.cache/huggingface` before this work and were reused.

## Inside the project folder

| Path | Size | What |
|---|---|---|
| `.venv/` | ~0.5 GB | Python 3.12: faster-whisper, sherpa-onnx, transcribe-cpp, jiwer, soundfile, numpy, requests |
| `tools/llama/` | 41 MB | prebuilt llama.cpp CPU binaries (release b11165) |
| `models/*.gguf` | 4.7 GB | R2T2 and Qwen3-ASR-1.7B (Q8_0 + audio encoders) |
| `models/Audar-ASR-V1-Turbo/` | 1.9 GB | Audar Turbo Q4_K_M + BF16 audio encoder |
| `models/cohere-transcribe-arabic-07-2026-gguf/` | 1.6 GB | Cohere Transcribe Arabic Q4_K_M |
| `models/whisper-medium-arabic-codeswitched-ct2/` | 0.8 GB | code-switching Whisper fine-tune |
| `models/diarization/` | 33 MB | WeSpeaker voiceprint model (+ unused pyannote segmentation model) |
| `data/` | ~0.3 GB | public test clips (ArzEn, Perle, Mixat) and chunks of your recordings |
| `results/` | small | transcripts, per-clip outputs, `summary.json` |

To reclaim space, delete the models you don't choose (e.g. R2T2 and Qwen3-ASR: 4.7 GB).

## Privacy

- No audio was sent to any external service. Models ran locally; the llama.cpp server listened on
  `127.0.0.1` only.
- Network use was downloads only: models, the public test sets, and a Whisper tokenizer file.
- The research agents used public web pages only (no accounts, no keys, no uploads).
