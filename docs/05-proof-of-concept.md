# 5. Proof of concept — how to run it

Everything below runs offline on this laptop. Commands are run from the project folder.

## Transcribe a call with speaker labels

```sh
.venv/bin/python transcribe.py audio-test/record1_test_2min.wav --speakers 2
```

Prints the transcript and saves `results/poc/<file>.<model>.speakers.txt` and `.json`
(start, end, speaker, text per line).

| Option | Meaning |
|---|---|
| `--speakers N` | label speakers by voice; give the real number of people. `0` = estimate. Omit for no labels |
| `--engine whisper` (default) | Whisper through faster-whisper, int8 on CPU. Default model: the **whisper-medium Arabic–English code-switching fine-tune** (`models/whisper-medium-arabic-codeswitched-ct2`) |
| `--whisper-model large-v3` | stock Whisper large-v3 instead; it then gets the Egyptian style hint automatically |
| `--prompt TEXT` | style/vocabulary hint (Whisper's initial prompt). Add your team's jargon (tool, product and table names). `--prompt ''` disables the large-v3 default hint |
| `--engine llama --port 8081` | R2T2 / Qwen3-ASR / Audar via a local llama-server: `THREADS=8 bench/serve.sh audar 8081` first |
| `--engine cohere` | Cohere Transcribe Arabic via transcribe.cpp (in process) — fastest (3x faster than real time), lowest WER on Perle, no word timestamps |
| `--language ar` | default; `auto` lets the model detect |

## What happens inside

```
recording ──► Silero VAD ──► chunks ≤ 25 s ──► speech model ──► words + timestamps ─┐
     │                                                                              ├─► "Speaker N: …" lines
     └──────► voiceprint every 0.75 s ──► spectral clustering ──► who speaks when ───┘
```

Safeguards added during testing:

- 0.5 s of silence is appended to every chunk (R2T2 drops the last words otherwise).
- Word-timestamp decoding stops after the first window, so Whisper can't invent text over trailing
  silence.
- If Whisper stops early inside a chunk (> 2 s of speech left), the rest is transcribed separately.

## Speed on this laptop (performance power mode)

| Model | Processing time per minute of audio (with speaker labels) |
|---|---|
| Cohere Transcribe Arabic | **~0.4 min** |
| whisper-medium code-switching fine-tune (default) | ~1–1.4 min |
| Whisper large-v3 | ~1.4–2 min |
| Qwen3-ASR / R2T2 / Audar (llama.cpp) | ~0.6–0.8 min |

So an 80-minute call takes about 30 minutes with Cohere and 1.5–2 hours with the default on this
CPU, and roughly 3x longer in power-saver mode. A GPU or a hosted service would make this minutes.

Outputs from each model on the 2-minute test call are in `results/poc/` (`*.speakers.txt`; local only).

## Files

| Path | Role |
|---|---|
| `transcribe.py` | the CLI: engines, chunking, gap-fill, speaker attribution |
| `speakers.py` | voice-based speaker separation |
| `bench/serve.sh` | starts llama-server (127.0.0.1 only) for r2t2 / qwen3asr / audar |
| `bench/prepare_data.py`, `run_bench.py`, `run_configs.sh`, `run_all.sh`, `score.py` | the benchmark |
| `bench/fetch_models.py` | resumable, checksum-verified model downloader |
