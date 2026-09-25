# 3. Results

All numbers were measured on this laptop (Intel i5-1245U, CPU only, performance power mode),
2026-09-25. Full generated tables: [results-tables.md](results-tables.md); per-clip outputs:
`results/*.jsonl`.

## Method

**Test sets** (all public; downloaded, never uploaded):

| Set | What | Clips used | Why |
|---|---|---|---|
| **Perle** (`Perle-ai/ASR_Code_Switch`, Egyptian rows) | Egyptian Arabic–English sentences about tech, work and daily life, read/spoken naturally | 40 random (seed 42), 4.3 min | **closest to your meetings**; the main test |
| **ArzEn** (validation split) | Egyptian Arabic–English conversational interviews | 40 random mixed-language clips, 6.5 min | conversational Egyptian; **but several fine-tuned models were trained on ArzEn** (see caveats) |
| Mixat (test split) | Emirati Arabic–English | 60 prepared, not used for scoring | wrong dialect for your use case |
| **Your call** `record1_test_2min.wav` | real 8 kHz Egyptian tech call, 2 speakers | 1 clip, 2 min | the only fully clean test; no reference transcript, judged by reading |

**Phone-quality copies:** every clip was also resampled 16 kHz → 8 kHz → 16 kHz to match the
bandwidth of your recordings.

**Scoring** (`bench/score.py`), applied identically to reference and output: remove markup; strip
Arabic diacritics and tatweel; unify alef forms (أ إ آ → ا), ى → ي, ة → ه; Arabic-Indic digits → 0-9;
remove punctuation; separate Arabic and Latin letters glued together (`الdata` → `ال data`);
lowercase. Then:

- **WER / CER** — word / character error rate over the whole set (lower is better).
- **Arabic-word errors / English-word errors** — the WER split by the script of the reference word,
  so "mishears Arabic" and "writes English terms in Arabic letters" show up separately.
- **English kept in English** — share of the reference's English words that appear in the output in
  Latin script. Writing `database` as `داتابيس` counts as a miss.
- **Speed** — processing time ÷ audio length (0.35 = about 3x faster than real time).

Every clip gets 0.5 s of trailing silence (the R2T2 bug workaround) so all models see identical input.

## Main table — Perle (Egyptian tech/work), 16 kHz

| Model | WER | CER | Arabic-word errors | English-word errors | English kept | Speed |
|---|---|---|---|---|---|---|
| **Cohere Transcribe Arabic** (Q4, transcribe.cpp) | **15.7%** | 10.9% | **10.0%** | 28% | 72% | **0.35** |
| **whisper-medium code-switching fine-tune** (faster-whisper) | 17.6% | **6.6%** | 16.2% | **9%** | **91%** | 1.01 |
| Whisper large-v3 + style hint | 22.4% | 9.6% | 20.9% | 14% | 86% | 1.38 |
| Whisper large-v3 | 39.7% | 29.0% | 25.6% | 75% | 25% | 1.41 |
| Audar-ASR-V1-Turbo (Q4, llama.cpp) | 43.5% | 33.2% | 24.5% | 88% | 12% | 0.58 |
| **R2T2** (Q8, llama.cpp) | 47.1% | 30.1% | 34.5% | 75% | 25% | 0.76 |
| Qwen3-ASR-1.7B (Q8, llama.cpp) | 50.6% | 35.0% | 33.0% | 92% | 8% | 0.70 |

## Phone quality (8 kHz)

| Model | Perle 16 kHz → 8 kHz | ArzEn 16 kHz → 8 kHz |
|---|---|---|
| Cohere Transcribe Arabic | 15.7% → **17.0%** | — |
| whisper-medium code-switching | 17.6% → **20.4%** | — |
| Whisper large-v3 + hint | — | 33.7% → 38.0% |
| Qwen3-ASR-1.7B | — | 43.3% → 45.8% |

Losing everything above 4 kHz costs 1.3–4 WER points. No model collapsed.

## Your call (2 min, 8 kHz, 2 speakers)

No reference transcript exists, so these are read side by side (files in `results/poc/`, kept
local — the call's content is not in this repository):

| Model | Speed (incl. speaker labels) | Reading |
|---|---|---|
| **whisper-medium code-switching** | 1.4× | Most complete, and kept English tech terms in English best — including a tool name every other model missed. Misses: a few terms turned into similar English words, a few spelled in Arabic letters |
| **Cohere Transcribe Arabic** | **0.4×** | Fastest; got two acronyms right that others missed. Dropped one phrase, garbled one short turn, and on this hesitant speech added notes like `(تأتأة)` "stutter" — now stripped automatically |
| Whisper large-v3 + hint | 1.4× | Good; missed an acronym and spelled a tool name in Arabic letters; needed the gap-fill fix |
| R2T2 | 1.8× | Clearly worst: common tech words misheard as nonsense, dropped clauses, English almost always in Arabic letters |
| Qwen3-ASR-1.7B | 1.4× | Same kinds of errors as R2T2, slightly more complete |

## What the numbers say

1. **R2T2 is not a fit** — confirmed by measurement, not just its training data. It is the
   second-worst model on every test (47.1% on Perle), no better than its own base model on Arabic
   words, worse when left to auto-detect (60.1% on ArzEn), and it writes most English terms in
   Arabic letters. The prompt/context hint does not help it.
2. **The Arabic-specialised models win by a wide margin.** Cohere Transcribe Arabic makes the fewest
   Arabic errors (10%) and is 3x faster than real time on this CPU. The whisper-medium
   code-switching fine-tune keeps English terms in English best (91%) and was the most complete on
   your real call.
3. **Keeping English in Latin letters is the real differentiator.** The Qwen3-ASR family (R2T2,
   Qwen3-ASR, Audar) hears the English words but spells them in Arabic letters; Audar has good
   Arabic (24.5% errors) but keeps only 12% of English words.
4. **A one-sentence style hint fixes stock Whisper large-v3** (39.7% → 22.4% on Perle) — useful if
   only stock Whisper is available (e.g. hosted Whisper on Groq).

## Caveats

- **Training-data contamination.** Cohere scores an implausible 6.2% on ArzEn (conversational, full
  of hesitations) and whisper-medium 10.1%, while every stock model scores 33–60%: they were almost
  certainly trained on ArzEn. Perle was published in May 2026 and the Arabic models were released
  later, so it could be contaminated too. **Your own call is the only fully clean test**, and it
  agrees with the ranking (the two leaders are clearly better than the rest), but it is one
  2-minute clip.
- 40 clips per set gives rough numbers: differences under ~3 points are not meaningful.
- Speed figures are approximate; some runs overlapped with other work on the machine.
- Quantized models were used (Q4/Q8/int8); full-precision versions may be slightly better.
