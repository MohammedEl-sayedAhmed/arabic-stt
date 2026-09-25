# Arabic–English meeting transcription — findings (2026-09-24 → 25)

## In one paragraph

The goal: transcribe recorded 8 kHz phone calls in **Egyptian Arabic with English tech terms**,
with **Speaker 1 / Speaker 2** labels, free to try, keeping audio private. The handoff asked
whether **R2T2** could do it. Measured on this laptop: **no** — R2T2 is among the least accurate
models tested (47.1% WER on Egyptian tech speech) and writes English terms in Arabic letters. The
best local models are **Cohere Transcribe Arabic** (15.7% WER, 3x faster than real time) and a
**whisper-medium code-switching fine-tune** (17.6% WER, keeps 91% of English terms in English,
most complete on your real call). A working **proof of concept** transcribes a call fully offline
and labels speakers by voice:

```sh
.venv/bin/python transcribe.py audio-test/record1_test_2min.wav --speakers 2
```

The best hosted option is **ElevenLabs Scribe v2** (independent benchmark: 13.1% WER), with
**Speechmatics** ($100 free, privacy-friendly) as the alternative — both require uploading audio.

## Documents

| # | Document | What's in it |
|---|---|---|
| 1 | [Use case](01-use-case.md) | requirements, the recordings, the original question |
| 2 | [Trials, issues and fixes](02-trials-and-issues.md) | every experiment in order: what broke and how it was fixed |
| 3 | [Results](03-results.md) | method, all benchmark tables, reading of your call, caveats |
| 4 | [Speaker labels](04-speaker-labels.md) | how voice-based separation works, what failed first, limits |
| 5 | [Proof of concept](05-proof-of-concept.md) | how to run it, options, speed, files |
| 6 | [Market research](06-market-research.md) | hosted and open options, free tiers, privacy ([workflow report](research/market-research-report.md), [second pass on hosted APIs](research/hosted-apis-report.md)) |
| 7 | [Recommendation](07-recommendation.md) | what to use, next steps |
| 8 | [Environment changes](08-environment-changes.md) | what was installed/changed on this laptop and how to undo it |
| — | [Result tables](results-tables.md) | every configuration on every test set (generated) |

## Key numbers (Perle, Egyptian tech/work speech, 40 clips)

| Model | WER | English kept in English | Speed on this CPU |
|---|---|---|---|
| Cohere Transcribe Arabic | **15.7%** | 72% | **0.35× real time** |
| whisper-medium code-switching | 17.6% | **91%** | 1.0× |
| Whisper large-v3 + style hint | 22.4% | 86% | 1.4× |
| Whisper large-v3 | 39.7% | 25% | 1.4× |
| Audar-ASR-V1-Turbo | 43.5% | 12% | 0.6× |
| **R2T2** | 47.1% | 25% | 0.8× |
| Qwen3-ASR-1.7B | 50.6% | 8% | 0.7× |
