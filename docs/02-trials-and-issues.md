# 2. Trials, issues and fixes (chronological)

Every experiment, what went wrong, and what was done about it. Dates: 2026-09-24 → 2026-09-25.
Numbers are word error rates (WER, lower is better) unless stated; see [results](03-results.md) for
full tables and [method](03-results.md#method) for how they were measured.

## Setup

| # | Trial / step | Issue found | Fix / outcome |
|---|---|---|---|
| 1 | Review the handoff | Its verdict rested mostly on one reason (no Arabic in R2T2's training); "needs a GPU" was unverified | Plan: test on CPU with llama.cpp and measure |
| 2 | Check the laptop | **Disk 100% full (1.5 GB free)**; no NVIDIA GPU; ~4–8 GB RAM free | With your approval, cleared the npm download cache (`npm cache clean --force`) → 18 GB free |
| 3 | Download models (R2T2, Qwen3-ASR: 4.7 GB) | Network only ~1.2–1.7 MB/s; `curl` failed with *HTTP/2 stream CANCEL*; Hugging Face's `hf_xet` downloader stalled at 0 bytes | Wrote `bench/fetch_models.py`: parallel byte ranges over HTTP/1.1, resumes after drops, verifies SHA-256. All files verified |
| 4 | Test data | Started with Mixat (public code-switched set) — then the first transcript showed your meeting is **Egyptian**, while Mixat is **Emirati** | Switched the main benchmark to **ArzEn** (Egyptian Arabic–English), later added **Perle** (Egyptian tech/work sentences) found by the research |

## Proof of concept and models on your call

| # | Trial | Issue found | Fix / outcome |
|---|---|---|---|
| 5 | Whisper large-v3 on the 2-min clip (first PoC) | Works end to end, but **6.4× slower than real time**; English terms half in Latin, half spelled in Arabic letters | Kept as baseline |
| 6 | Run R2T2 on CPU with upstream llama.cpp (unverified in the handoff) | Launcher failed: this shell's bash startup file errors under `set -u` (`GH_TOKEN: unbound variable`) | Rewrote launchers as plain POSIX `sh`. **R2T2 runs on CPU — verified** |
| 7 | Speed tuning | Generation stuck at ~4.5 tokens/s at any thread count; laptop was in **power-saver** (CPU at 0.4–1.2 GHz) | 8 threads is best. With your approval, switched to the *performance* profile for the tests (to be restored) |
| 8 | R2T2 on your clip | 1.8× real time; clearly more errors than Whisper (misheard tech terms, dropped clauses) | — |
| 9 | Base Qwen3-ASR on your clip | 1.4× real time; slightly more complete than R2T2, same kinds of errors | — |

## Speaker labels

| # | Trial | Issue found | Fix / outcome |
|---|---|---|---|
| 10 | sherpa-onnx diarization (pyannote segmentation + WeSpeaker voiceprints, built-in clustering) | Auto mode found 4 "speakers" (two of them under 5 s). Forced to 2, it put **111 s under Speaker 1 and 14 s under Speaker 2** — both voices lumped together. Whisper then invented text for the tiny fragments (`بل عن تلك الزفافة`) | Rejected |
| 11 | Your feedback: separation must follow *tone and voice* | — | Rebuilt it (`speakers.py`): a WeSpeaker voiceprint every 0.75 s, grouped by **spectral clustering (NME-SC)**, then every word gets the voice active at its timestamp → **57 s / 44 s**, turns alternate like a real conversation. See [speaker labels](04-speaker-labels.md) |
| 12 | Word timestamps (needed for per-word speaker labels) | This decoding mode **dropped some English words** | Decode without timestamp tokens, align words afterwards → English words back |
| 13 | … same | Whisper then **invented `شكراً لكم`** ("thank you all") at the end: with word timestamps, faster-whisper decodes the trailing silence again | Stop after the first decoding window (chunks are < 30 s) → hallucination gone |

## Accuracy benchmark

| # | Trial | Issue found | Fix / outcome |
|---|---|---|---|
| 14 | ArzEn, 40 clips: R2T2, Qwen3-ASR (forced Arabic / auto-detect), Whisper | Surprise: **Whisper scored worse (47.4%) than Qwen (43.3%) and R2T2 (43.9%)** | Error analysis: Whisper sometimes **rewrites Egyptian into formal Arabic** (`ولكن بعد ذلك عندما دخلت…`), drops filler words, and spells English in Arabic letters |
| 15 | Style hint: one Egyptian sentence with English terms in Latin letters as Whisper's `initial_prompt` | — | **Whisper 47.4% → 33.7%**, English words kept in English 12% → 54%. Same hint as Qwen/R2T2 "context": no gain (43.3 → 43.9, 43.9 → 46.5) |
| 16 | Style hint on your call | Whisper **stopped early in one chunk — 12 s of speech missing** | Gap-fill: if words end > 2 s before the chunk's speech ends, transcribe the rest separately → complete transcript |
| 17 | Phone quality: every ArzEn clip resampled through 8 kHz | — | Whisper + hint 33.7% → **38.0%**; Qwen 43.3% → 45.8%. 8 kHz costs ~3–4 points |
| 18 | Research (8-agent workflow, 142 candidates, claims re-checked by 2 verifiers) | — | Top picks: ElevenLabs Scribe (hosted), Speechmatics (hosted), Audar-ASR / Cohere Transcribe Arabic (local). See [market research](06-market-research.md) |
| 19 | Perle (Egyptian tech/work), 40 clips | — | **Whisper + hint 22.4%**, Whisper 39.7%, R2T2 47.1%, Qwen 50.6% |
| 20 | New candidate: `whisper-medium-arabic-codeswitched` (0.8 GB) | Its ArzEn scores are suspiciously low — it may have been trained on ArzEn | Judged on Perle and your call only: **17.6%** on Perle, 91% of English kept, faster than large-v3 |
| 21 | Audar-ASR-V1-Turbo (leaderboard #1) on Perle | Good Arabic (24.5% errors) but **writes 88% of English words in Arabic letters** — same habit as its Qwen3-ASR base | 43.5% WER; not pursued further |
| 22 | Cohere Transcribe Arabic (leaderboard #2) via transcribe.cpp | — | **15.7% on Perle, 17.0% at phone quality, 3x faster than real time** — best WER |
| 23 | Contamination check | Cohere 6.2% and whisper-medium 10.1% on ArzEn vs 33–60% for every stock model: both were almost certainly trained on ArzEn | ArzEn dropped as evidence for them; Perle and your call used instead |
| 24 | Phone quality for the two leaders | — | Cohere 15.7% → 17.0%, whisper-medium 17.6% → 20.4% |
| 25 | Both leaders on your call with speaker labels | Cohere added notes like `(تأتأة)` "stutter" / `(غير مفهوم)` "unclear" on the hesitant phone speech (never on the benchmark clips), and dropped a phrase | Notes stripped automatically. whisper-medium gave the most complete transcript and kept English terms best → made it the default engine |

## Tooling issues (for whoever continues this work)

- `pkill -f <pattern>` also matched the shell running the command and killed it; use
  `pkill -x llama-server` or a `[p]attern` regex.
- Editing a shell script while it runs makes `sh` read garbage (`PROMPT: parameter not set`) —
  results were unaffected, but don't do it.
- Model names containing dots (`Qwen3-ASR-1.7B`) broke the result-file parser; fixed in `bench/score.py`.
- Fine-tuned Whisper folders without `tokenizer.json` make faster-whisper fetch a tokenizer from
  Hugging Face (a download only; no audio is sent).
