# 5. Proof of concept — how to run it

Everything below runs offline on this laptop. Commands are run from the project folder; setup is in
the [README](../README.md#setup-linux-cpu-only). For everyday use there is also a local app with the
same models plus ElevenLabs and Speechmatics — see [the app](09-app.md); this page covers the
command line it builds on.

## Transcribe a call with speaker labels

```sh
.venv/bin/python transcribe.py path/to/call.wav --speakers 2
```

It prints the transcript and saves `<file>.<model>.speakers.txt`, `.json` (start, end, speaker, text
per line), `.meta.json` (settings, speed, peak memory) and, for Whisper, `.words.json` (every word
with its time and speaker) in `results/poc/`. Partial results are written after every chunk, so a
crash or kill hours into a long recording keeps what was done.

| Option | Meaning |
|---|---|
| `--speakers N` | label speakers by voice; give the real number of people. `0` = estimate. Omit for no labels |
| `--engine whisper` (default) | faster-whisper, int8 on CPU. Default model: the **whisper-medium Arabic–English code-switching fine-tune** |
| `--whisper-model large-v3` | stock Whisper large-v3 instead; it then gets the Egyptian style hint automatically |
| `--engine cohere` | Cohere Transcribe Arabic via transcribe.cpp (in process) — fewest errors on Arabic words, about 3x faster than real time, no word timestamps |
| `--engine llama --port 8081` | R2T2 / Qwen3-ASR / Audar via a local llama-server: `THREADS=8 bench/serve.sh audar 8081` first |
| `--prompt TEXT` | style/vocabulary hint for Whisper (`''` disables the large-v3 default). Adding your team's jargon is plausible but untested; the one measured hint helped stock large-v3 a lot and the fine-tune not at all |
| `--voiceprint-model FILE` | another speaker-embedding ONNX model for `--speakers` |
| `--language ar` | default; `en` is also accepted; `auto` lets Whisper and the llama-server models detect the language — Cohere cannot detect it, so `auto` means Arabic there |
| `--out DIR` | output folder |
| `--progress-file FILE` | keep a small JSON file updated with the current stage and chunk count (the app uses it) |

## What happens inside

```
recording ──► Silero VAD ──► chunks ≤ 25 s ──► speech model ──► words + timestamps ─┐
     │                                                                              ├─► "Speaker N: …" lines
     └──────► voiceprint every 0.75 s ──► spectral clustering ──► who speaks when ───┘
```

Safeguards added during testing:

- 0.5 s of silence is appended to every chunk (R2T2 drops the last words otherwise).
- Whisper keeps only its first decoding window, so it can't invent text over trailing silence
  (and does not spend time decoding it).
- If Whisper stops early inside a chunk (> 2 s of speech left), the rest is transcribed separately.
- If Cohere's decoder loops until its length cap, the chunk is split at its quietest point and retried.
- Cohere's notes such as `(تأتأة)` "stutter" are removed.

## Speed and memory on this laptop (performance power mode)

| Model | Measured | Processing time per minute of audio |
|---|---|---|
| Cohere Transcribe Arabic + speaker labels | six 10-min meeting excerpts: 0.15–0.32x real time (mean 0.26x); 16-min call 0.37x (first voiceprint model); 3.0–3.1 GB peak | **~0.3 min** |
| whisper-medium fine-tune + speaker labels | six 10-min meeting excerpts: 0.30–0.79x real time (mean 0.53x); 2-min call 0.57x plain / 0.59x with labels; 2.1–3.3 GB peak. (Before the review fixes the 16-min call ran at 1.80x.) | ~0.5–0.8 min |
| Whisper large-v3 + hint | Perle clips 1.4–2.2x (short clips, no speaker labels) | ~1.5–2 min |
| Qwen3-ASR / R2T2 / Audar (llama.cpp, no speaker labels) | Perle clips 0.6–0.8x; the 2-min call 1.4–1.8x in power-saver mode | ~0.6–0.8 min |

Meeting and call speeds count the whole recording, pauses included; on short clips the fixed cost
per chunk weighs more (whisper-medium: 1.08x on Perle). An 80-minute call therefore takes roughly
25 minutes with Cohere and 40–60 minutes with the default on this CPU, and several times longer in
power-saver mode (Whisper large-v3 ran at 6.4x real time in power-saver vs 1.4–2.4x in performance
mode, on runs with different settings). A GPU or a hosted service would make this minutes.

## Files

| Path | Role |
|---|---|
| `transcribe.py` | the CLI: engines, chunking, gap-fill, speaker attribution, checkpoints |
| `speakers.py` | voice-based speaker separation |
| `bench/serve.sh` | starts llama-server (127.0.0.1 only) for r2t2 / qwen3asr / audar |
| `bench/prepare_data.py`, `run_bench.py`, `run_configs.sh`, `score.py` | the public-set benchmark |
| `bench/prepare_private_meetings.py`, `score_meetings.py`, `eval_meetings.py`, `compare_voiceprints.py` | scoring on private meetings with reference transcripts (data and results stay git-ignored) |
| `bench/fetch_models.py` | resumable, checksum-verified model downloader |
