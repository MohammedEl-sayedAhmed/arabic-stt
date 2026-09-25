# stt-mvp — local Arabic–English meeting transcription

Transcribe a recorded call spoken in (Egyptian) Arabic with English tech terms, label who is
speaking by voice, and keep all audio on this machine.

**Findings, trials and recommendation: [docs/README.md](docs/README.md).**

## Setup (Linux, CPU only)

```sh
uv venv .venv --python 3.12 && VIRTUAL_ENV=.venv uv pip install -r requirements.txt
# models (resumable, SHA-256 checked); pick what you need
.venv/bin/python bench/fetch_models.py \
  Seif-Eldeen-Sameh/whisper-medium-arabic-codeswitched-ct2:config.json \
  Seif-Eldeen-Sameh/whisper-medium-arabic-codeswitched-ct2:vocabulary.json \
  Seif-Eldeen-Sameh/whisper-medium-arabic-codeswitched-ct2:model.bin \
  handy-computer/cohere-transcribe-arabic-07-2026-gguf:cohere-transcribe-arabic-07-2026-Q4_K_M.gguf
mkdir -p models/diarization && curl -L -o models/diarization/wespeaker_en_voxceleb_resnet34_LM.onnx \
  https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/wespeaker_en_voxceleb_resnet34_LM.onnx
```

`bench/fetch_models.py` with no arguments fetches R2T2 and Qwen3-ASR (4.7 GB); llama.cpp CPU
binaries for those go in `tools/llama/` (release b11165, `llama-b11165-bin-ubuntu-x64.tar.gz`).

## Transcribe a recording

```sh
.venv/bin/python transcribe.py audio-test/record1_test_2min.wav --speakers 2
```

- `--speakers N` labels lines `Speaker 1`, `Speaker 2`, … by voice (give the real number of people;
  `0` estimates it). Leave it out for a plain timestamped transcript.
- Default engine: the whisper-medium Arabic–English code-switching fine-tune (keeps English terms in
  English best). `--engine cohere` uses Cohere Transcribe Arabic: lowest error rate on the tests and
  3x faster than real time. `--whisper-model large-v3` uses stock Whisper with an Egyptian style hint.
- Output: `results/poc/<name>.<model>[.speakers].txt` and `.json`.

R2T2, Qwen3-ASR and Audar run through llama.cpp's server (127.0.0.1 only):

```sh
THREADS=8 bench/serve.sh r2t2 8081          # or qwen3asr, audar
.venv/bin/python transcribe.py meeting.wav --engine llama --port 8081 --speakers 2
```

## Benchmark

```sh
.venv/bin/python bench/prepare_data.py perle arzen meetings   # test sets -> data/
SET=perle bench/run_configs.sh cohere:wav16k:ar whisper:wav16k:ar r2t2:wav16k:ar
.venv/bin/python bench/score.py                               # WER / CER / English kept / speed
```

## Layout

| Path | What |
|---|---|
| `transcribe.py`, `speakers.py` | the proof of concept |
| `docs/` | full write-up of findings, trials, results, research and recommendation |
| `bench/` | model download, data prep, benchmark runners, scoring, llama-server launcher |
| `models/` | model files (see docs/08 for sizes; delete the ones you don't use) |
| `tools/llama/` | prebuilt llama.cpp CPU binaries (b11165) |
| `data/` | public test clips (Perle, ArzEn, Mixat) and chunks of the local recordings |
| `results/` | transcripts and scores |
