# stt-mvp — local Arabic–English meeting transcription

Transcribe a recorded call spoken in (Egyptian) Arabic with English tech terms, label who is
speaking by voice, and keep all audio on this machine.

**Findings, trials and recommendation: [docs/README.md](docs/README.md).**
**The app: `./app.sh` — see [docs/09-app.md](docs/09-app.md).**

## Setup (Linux, CPU only)

Prerequisites: Python 3.12, [uv](https://docs.astral.sh/uv/), `curl`, and `ffmpeg` for the benchmark scripts (the app doesn't need it).

```sh
uv venv .venv --python 3.12 && VIRTUAL_ENV=.venv uv pip install -r requirements.txt

# Default engine: whisper-medium Arabic-English code-switching fine-tune (0.8 GB) + the Whisper
# tokenizer it needs to run offline
.venv/bin/python bench/fetch_models.py \
  Seif-Eldeen-Sameh/whisper-medium-arabic-codeswitched-ct2:config.json \
  Seif-Eldeen-Sameh/whisper-medium-arabic-codeswitched-ct2:vocabulary.json \
  Seif-Eldeen-Sameh/whisper-medium-arabic-codeswitched-ct2:model.bin
curl -L -o models/whisper-medium-arabic-codeswitched-ct2/tokenizer.json \
  https://huggingface.co/openai/whisper-tiny/resolve/main/tokenizer.json

# Voiceprint model for speaker labels: NVIDIA TitaNet-small (40 MB)
mkdir -p models/diarization && curl -L -o models/diarization/nemo_en_titanet_small.onnx \
  https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/nemo_en_titanet_small.onnx

# Optional: Cohere Transcribe Arabic (1.6 GB), for --engine cohere
.venv/bin/python bench/fetch_models.py \
  handy-computer/cohere-transcribe-arabic-07-2026-gguf:cohere-transcribe-arabic-07-2026-Q4_K_M.gguf
```

Optional extras:

- **Stock Whisper large-v3** (`--whisper-model large-v3`) loads from the Hugging Face cache and is not
  downloaded automatically: `.venv/bin/hf download Systran/faster-whisper-large-v3` (3 GB).
- **Other voiceprint models**, needed only by `bench/compare_voiceprints.py` (it skips any that are
  missing): `wespeaker_en_voxceleb_resnet34_LM.onnx`, `wespeaker_en_voxceleb_resnet152_LM.onnx`,
  `nemo_en_titanet_large.onnx` and `3dspeaker_speech_campplus_sv_zh_en_16k-common_advanced.onnx`
  from the same release as TitaNet-small, into `models/diarization/`.
- **Qwen3-ASR-family models** (R2T2, Qwen3-ASR, Audar) need llama.cpp's server: unpack
  `llama-b11165-bin-ubuntu-x64.tar.gz` from the
  [llama.cpp releases](https://github.com/ggml-org/llama.cpp/releases/tag/b11165) into `tools/llama/`,
  then `.venv/bin/python bench/fetch_models.py` (no arguments) fetches R2T2 and Qwen3-ASR (4.7 GB);
  Audar: `audarai/Audar-ASR-V1-Turbo:Audar-ASR-V1-Turbo-Q4_K_M.gguf` and
  `audarai/Audar-ASR-V1-Turbo:mmproj-Audar-ASR-V1-Turbo.gguf`.

## Use the app

```sh
./app.sh              # opens Tafrigh at http://127.0.0.1:8765
./app.sh --desktop    # the same in its own window (desktop app)
```

Drop a recording (audio or video), pick a model — whisper-medium, Cohere or Whisper large-v3 on this
laptop, or ElevenLabs / Speechmatics with your API key (the recording is uploaded only after you
confirm) — and choose speaker labels. The transcript plays back with the audio, and can be searched,
corrected (rename or merge speakers, edit lines) and exported as text, subtitles, Markdown or JSON.
Models, port, threads and defaults are set in [`app/config.toml`](app/config.toml); everything the
app stores stays in the git-ignored `app_data/`. Local models can also be downloaded from inside the
app (*Settings → Models on this computer*). Details: [docs/09-app.md](docs/09-app.md).

**Desktop app (Windows and Linux):** `python desktop/build.py` builds `dist/Tafrigh/` (`Tafrigh.exe`
on Windows) and `iscc desktop/installer.iss` a Windows installer; on Windows from source, run
`app.cmd`. A GitHub Actions workflow builds and checks both platforms on request. Details:
[docs/10-desktop.md](docs/10-desktop.md).

## Transcribe a recording (command line)

```sh
.venv/bin/python transcribe.py path/to/call.wav --speakers 2
```

- `--speakers N` labels lines `Speaker 1`, `Speaker 2`, … by voice (give the real number of people;
  `0` estimates it). Leave it out for a plain timestamped transcript.
- Default engine: the whisper-medium code-switching fine-tune (keeps English terms in English best).
  `--engine cohere`: Cohere Transcribe Arabic (fewest errors on Arabic words, about 2x faster).
  `--whisper-model large-v3`: stock Whisper with an Egyptian style hint.
- `--prompt "..."` gives Whisper a style/vocabulary hint; `--voiceprint-model` picks another speaker
  model; `--out DIR` changes the output folder.
- Output: `<name>.<model>[.speakers].txt`, `.json`, `.meta.json` (speed, memory) and, with speaker
  labels on Whisper, `.words.json` (every word with its time and speaker) in `results/poc/`.
  Partial results are saved while it runs.

R2T2, Qwen3-ASR and Audar run through llama.cpp's server (127.0.0.1 only):

```sh
THREADS=8 bench/serve.sh audar 8081          # or r2t2, qwen3asr
.venv/bin/python transcribe.py call.wav --engine llama --port 8081 --speakers 2
```

## Benchmark

```sh
.venv/bin/python bench/prepare_data.py perle arzen            # public test sets -> data/ (pinned samples)
SET=perle sh bench/run_configs.sh cohere:wav16k:ar whisper:g711:ar large-v3:phone:ar
.venv/bin/python bench/score.py --tables docs/results-tables.md
.venv/bin/python bench/score.py --compare results/A.jsonl results/B.jsonl   # paired WER difference
```

As in `transcribe.py`, large-v3 gets the Egyptian style hint automatically; results already in
`results/` are skipped, so the command above only fills in what is missing.

Private meeting recordings with reference transcripts (layout in `bench/prepare_private_meetings.py`)
are cut into 10-minute excerpts, transcribed with `transcribe.py`, then scored. For each excerpt
`mK`, `N` is its `n_speakers` in `data/private-meetings/manifest.jsonl`:

```sh
.venv/bin/python bench/prepare_private_meetings.py /path/to/dataset          # -> data/private-meetings/
.venv/bin/python transcribe.py data/private-meetings/mK.wav --speakers N --out results/meetings/whisper
.venv/bin/python transcribe.py data/private-meetings/mK.wav --engine cohere --speakers N \
  --out results/meetings/cohere-titanet
.venv/bin/python transcribe.py data/private-meetings/mK.wav --engine cohere --out results/meetings/cohere-plain
.venv/bin/python bench/score_meetings.py        # scores every folder in results/meetings/ as one engine
.venv/bin/python bench/compare_voiceprints.py   # re-labels the whisper words with each voiceprint model
```

Their audio, transcripts and results stay in the git-ignored `data/` and `results/meetings/`.

## Layout

| Path | What |
|---|---|
| `app.sh`, `app.cmd`, `app/` | the app: web server, job runner, model clients and downloads, interface, desktop window, `config.toml` |
| `desktop/`, `.github/workflows/desktop.yml` | desktop build (PyInstaller), Windows installer (Inno Setup), CI build |
| `transcribe.py`, `speakers.py` | the proof of concept (the app runs local models through it) |
| `tests/` | app tests (`.venv/bin/python -m unittest discover -s tests`) |
| `docs/` | full write-up of findings, trials, results, research and recommendation |
| `bench/` | model download, data prep, benchmark runners, scoring, llama-server launcher |
| `bench/samples/` | the pinned clip lists of the public test sets |
| `models/`, `tools/`, `data/`, `app_data/` | downloaded models, llama.cpp binaries, test audio, the app's transcriptions and keys (git-ignored) |
| `results/` | per-clip outputs and scores on the public sets (`results/poc/`, `results/meetings/` are private) |

## Licence

The code and docs in this repository are under the [MIT licence](LICENSE). The models the app
downloads keep their own licences: the whisper-medium code-switching fine-tune and Whisper large-v3
(MIT; check the fine-tune's card for its training data), Cohere Transcribe Arabic and the Whisper
tokenizer (Apache-2.0), and NVIDIA TitaNet via sherpa-onnx (CC-BY-4.0). The desktop build bundles
third-party packages under their own licences, including the FFmpeg libraries that come with PyAV
(LGPL). The hosted services (ElevenLabs, Speechmatics) are used under their own terms.
