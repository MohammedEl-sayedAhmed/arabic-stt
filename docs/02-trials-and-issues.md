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
| 5 | Whisper large-v3 on the 2-min clip (first PoC) | Works end to end, but **6.4× slower than real time** (in power-saver mode, see row 7); English terms half in Latin, half spelled in Arabic letters | Kept as baseline |
| 6 | Run R2T2 on CPU with upstream llama.cpp (unverified in the handoff) | Launcher failed: this shell's bash startup file errors under `set -u` (`GH_TOKEN: unbound variable`) | Rewrote launchers as plain POSIX `sh`. **R2T2 runs on CPU — verified** |
| 7 | Speed tuning | Generation stuck at ~4.5 tokens/s at any thread count; laptop was in **power-saver** (CPU at 0.4–1.2 GHz) | 8 threads is best. With your approval, switched to the *performance* profile for the tests (to be restored) |
| 8 | R2T2 on your clip | 1.8× real time (measured before the switch, in power-saver mode); clearly more errors than Whisper (misheard tech terms, dropped clauses) | — |
| 9 | Base Qwen3-ASR on your clip | 1.4× real time (power-saver mode); slightly more complete than R2T2, same kinds of errors | — |

## Speaker labels

| # | Trial | Issue found | Fix / outcome |
|---|---|---|---|
| 10 | sherpa-onnx diarization (pyannote segmentation + WeSpeaker voiceprints, built-in clustering) | Auto mode found 4 "speakers" (two of them under 5 s). Forced to 2, it put **111 s under Speaker 1 and 14 s under Speaker 2** — both voices lumped together. Whisper then invented text for the tiny fragments (a short phrase nobody said) | Rejected |
| 11 | Your feedback: separation must follow *tone and voice* | — | Rebuilt it (`speakers.py`): a WeSpeaker voiceprint every 0.75 s, grouped by **spectral clustering (NME-SC)**, then every word gets the voice active at its timestamp → **57 s / 44 s**, turns alternate like a real conversation. See [speaker labels](04-speaker-labels.md) |
| 12 | Word timestamps (needed for per-word speaker labels) | This decoding mode **dropped some English words** | Decode without timestamp tokens, align words afterwards → English words back |
| 13 | … same | Whisper then **invented `شكراً لكم`** ("thank you all") at the end: with word timestamps, faster-whisper decodes the trailing silence again | Stop after the first decoding window (chunks are < 30 s) → hallucination gone |

## Accuracy benchmark

| # | Trial | Issue found | Fix / outcome |
|---|---|---|---|
| 14 | ArzEn, 40 clips: R2T2, Qwen3-ASR (forced Arabic / auto-detect), Whisper | Surprise: **Whisper scored worse (47.4%) than Qwen (43.3%) and R2T2 (43.9%)** | Error analysis: Whisper sometimes **rewrites Egyptian into formal Arabic** (`ولكن بعد ذلك عندما دخلت…`), drops filler words, and spells English in Arabic letters |
| 15 | Style hint: one Egyptian sentence with English terms in Latin letters as Whisper's `initial_prompt` | — | **Whisper 47.4% → 33.7%**, English words kept in English 12% → 54%. Same hint as Qwen/R2T2 "context": no gain (43.3 → 43.9, 43.9 → 46.5) |
| 16 | Style hint on your call | Whisper **stopped early in one chunk — 12 s of speech missing** | Gap-fill: if words end > 2 s before the chunk's speech ends, transcribe the rest separately → complete transcript |
| 17 | Phone quality: every ArzEn clip resampled through 8 kHz | — | Whisper + hint 33.7% → **38.0%**; Qwen 43.3% → 45.8%. 8 kHz costs ~2.5–4.3 points |
| 18 | Research (8-agent workflow, 142 candidates, claims re-checked by 2 verifiers) | — | Top picks: ElevenLabs Scribe (hosted), Speechmatics (hosted), Audar-ASR / Cohere Transcribe Arabic (local). See [market research](06-market-research.md) |
| 19 | Perle (Egyptian tech/work), 40 clips | — | **Whisper + hint 22.4%**, Whisper 39.7%, R2T2 47.1%, Qwen 50.6% |
| 20 | New candidate: `whisper-medium-arabic-codeswitched` (0.8 GB) | Its ArzEn scores are suspiciously low — it may have been trained on ArzEn | Judged on Perle and your call only: **17.6%** on Perle, 91% of English kept, faster than large-v3 |
| 21 | Audar-ASR-V1-Turbo (leaderboard #1) on Perle | Good Arabic but keeps only **12% of English words in Latin script** (almost all the rest come out as Arabic-script words) — same habit as its Qwen3-ASR base | 43.5% WER; not pursued further |
| 22 | Cohere Transcribe Arabic (leaderboard #2) via transcribe.cpp | — | 15.7% on Perle (whole clip), about 3x faster than real time |
| 23 | Contamination check | Cohere 6.2%, whisper-medium 10.1% and Audar 18.9% on ArzEn — far better than on Perle, while stock large-v3 goes the other way; Audar even copies ArzEn's `[LAUGHTER]` tags | ArzEn dropped as evidence for these three; Perle and your recordings used instead |
| 24 | Phone quality for the two leaders | — | Cohere 15.7% → 17.0%, whisper-medium 17.6% → 20.4% (whole clip) |
| 25 | Both leaders on your call with speaker labels | Cohere added notes like `(تأتأة)` "stutter" / `(غير مفهوم)` "unclear" on the hesitant phone speech (never on the benchmark clips), and seemed to drop phrases — later traced to a bug in *our* speaker path (row 28) | Notes stripped automatically. whisper-medium gave the most complete transcript and kept English terms best → made it the default engine |

## Round 2: full-length runs, code review, fixes, real meetings

| # | Trial | Issue found | Fix / outcome |
|---|---|---|---|
| 26 | Full 16-minute call with speaker labels | whisper-medium: 1.80x real time, 2.9 GB peak (before the review fixes; about 0.5x after them, row 32). **Cohere crashed**: one turn made its decoder loop until the length cap (`OutputTruncated`), killing the whole job | Chunks that hit the cap are now split at their quietest point and retried; a looped tail is trimmed. Re-run: **0.37x real time, completes** |
| 27 | Disk down to 3.9 GB free (something outside this work used ~5 GB) | the dataset agent needed room for meeting videos | Deleted the R2T2 and Qwen3-ASR model files (benchmarks done; re-downloadable) |
| 28 | **Code review workflow**: 55 agents audited the code, the benchmark, the docs against the data, and privacy; every finding re-checked by a skeptic | **45 confirmed, 5 refuted.** Most important: with speaker labels, Cohere and llama engines never received **13–30% of the speech (up to ~46% on long calls)**; the "Arabic-word errors" metric charged English transliterations to Arabic; benchmark output on private meeting chunks, or audio in the repo root, would not have been git-ignored; a Whisper gap-fill edge case could recurse forever; nothing was saved until the end of a run | All fixed (commit "Fix issues found in the code review"). Speaker path rebuilt: every pause-delimited chunk is transcribed, cut at speaker changes |
| 29 | Critic: the benchmark scored a shortcut (whole clip), not the recommended pipeline; no confidence intervals; no telephone codec; no real speaker-label measurement | — | Benchmark now runs the `transcribe.py` pipeline; bootstrap CIs; G.711 telephone condition; results record their settings; samples pinned |
| 30 | Re-measured the three leaders on Perle (16 kHz, 8 kHz, G.711) and ArzEn | — | **Cohere 13.4% / 14.7% / 15.3%**, whisper-medium 18.5 / 17.4 / 18.2, large-v3 + hint 20.8 / 21.6 / 22.1. Cohere − whisper-medium: −5.1 points, 95% CI −10.9 to +0.8 — not proven with 648 words; the Arabic-word and English-kept gaps are |
| 31 | Your meetings: a dataset agent built a private set from `~/Desktop/mojaz-meetings/` and your ClickUp docs (read-only): 6 meetings, 9 h 51 min, verified verbatim ElevenLabs references with corrected speakers | the ClickUp MCP hit its daily limit (cached doc snapshots used); two Mojaz variants of one meeting turned out to be **translations** (English Arabized) | Kept outside the repo; translated variants quarantined; audio cut exactly as sent to Mojaz |
| 32 | Both leaders on 10-minute excerpts of each meeting, with speaker labels (WeSpeaker voiceprints) | They **disagree with ElevenLabs on 47–49% of the words** (spot checks, judged from the text: mostly local errors — dropped/misspelled English terms, dropped phrases); ElevenLabs writes hesitations and variant spellings | Added a lenient score (−2 points). whisper-medium keeps more English (57% vs 45%), Cohere is 2x faster |
| 33 | Speaker labels on the meetings: 25.7% of words to the wrong person with WeSpeaker voiceprints; ElevenLabs' raw labels 6.5% | — | Compared 5 voiceprint models on the same words: **TitaNet-small 11.7%** (speaker count estimated right in 5 of 6) → **new default** |
| 34 | Cohere without speaker labels on the meetings | its WER was 4 points better (43.1% vs 47.0%): the old voiceprints' false speaker changes cut the audio into fragments | Re-ran Cohere with TitaNet speaker labels: **43.8% WER, 10.9% wrong speaker** — labels now cost it under a point. It still keeps fewer English words in Latin script than whisper-medium (46% vs 57%) |
| 35 | Fresh like-for-like runs on your 2-minute call after the fixes | — | Cohere now 284 words with speaker labels (248 before the fix; 292 without labels); whisper-medium 310 either way; 0.3–0.6x real time |
| 36 | **Final audit workflow** before pushing (37 agents: the docs' numbers against the result files, privacy of everything git would push, a fresh-clone setup; every finding re-checked by a skeptic) | **33 confirmed, 1 refuted.** Mostly numbers that had drifted: the "2–11% wrong speaker on 2–3-person meetings" range left out a 2-person excerpt at 17%; the default engine's speed was quoted from before the fixes; pooled "English kept" was weighted by all words instead of English words (42% / 55% → 46% / 57%); one excerpt was wrongly called English-heavy. Also meeting quotes and a meeting date in the docs, `.gitignore` gaps (a benchmark run on a private set would not have been ignored), and a README benchmark command that ran large-v3 without its hint | All fixed: pooled meeting scores are exact totals; `results/` is an allowlist in `.gitignore`; `run_bench.py` writes private sets to the ignored `results/meetings/bench/` and gives large-v3 its hint as `transcribe.py` does; `compare_voiceprints.py` skips models that are not downloaded; docs corrected |

## Tooling issues (for whoever continues this work)

- `pkill -f <pattern>` also matched the shell running the command and killed it; use
  `pkill -x llama-server` or a `[p]attern` regex.
- Editing a shell script while it runs makes `sh` read garbage (`PROMPT: parameter not set`) —
  results were unaffected, but don't do it.
- Model names containing dots (`Qwen3-ASR-1.7B`) broke the result-file parser; fixed in `bench/score.py`.
- Fine-tuned Whisper folders without `tokenizer.json` make faster-whisper fetch a tokenizer from
  Hugging Face (a download only; no audio is sent). The setup now puts it in the model folder.
- In this sandbox some shell `for` loops, heredocs and `>>` appends silently did nothing; small
  Python scripts were used instead.
- A bad model name made the old `run_configs.sh` wait forever for a server that never started; the
  runner now checks the server is alive, times out, and validates names.
