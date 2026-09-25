# 3. Results

Measured on this laptop (Intel i5-1245U, CPU only, performance power mode unless noted),
2026-09-24/25. Full generated tables: [results-tables.md](results-tables.md); per-clip outputs:
`results/*.jsonl` (each with a `.meta.json` recording its settings).

## Method

**Test sets** (public; downloaded, never uploaded). The clips used are pinned in `bench/samples/`.

| Set | What | Clips | Why / caveat |
|---|---|---|---|
| **Perle** (`Perle-ai/ASR_Code_Switch`, Egyptian rows) | Egyptian Arabic–English sentences about tech, work and daily life | 40 random (seed 42), 4.3 min, 648 reference words | **closest to your meetings**; the main public test. Taken from the dataset's only split, *train*, and published May 2026 — models released later may have trained on it |
| **ArzEn** (validation split) | Egyptian Arabic–English conversational interviews | 40 random, 6.5 min (37 contain English words; 3 are Arabic-only apart from `[HES]`-type tags) | conversational Egyptian; **several Arabic fine-tunes were trained on it** (see caveats) |
| **Your meetings** | 10-minute excerpts of 6 real internal meetings, ElevenLabs references | 60 min | the in-domain test — see [below](#your-meetings) |
| **Your test call** | 2-min 8 kHz call, 2 speakers, no reference | 1 | judged by reading |

**Audio conditions** for every public clip: `wav16k` (original at 16 kHz), `phone` (resampled
through 8 kHz, like your test calls), `g711` (a telephone channel: 300–3400 Hz band-pass and G.711
μ-law coding at 8 kHz).

**Pipeline.** Unless marked *whole clip*, each clip went through exactly what `transcribe.py` does:
Silero VAD cuts it at pauses into chunks of at most 25 s, each chunk gets 0.5 s of trailing silence,
and Whisper decodes with word timestamps and gap-fill. The first round passed the whole clip to the
model instead (*whole clip* rows). R2T2 and Qwen3-ASR were only measured that way, before their
model files were deleted; Audar only that way too, because it was not pursued further (its files
are still in `models/`).

**Scoring** (`bench/score.py`), identical for reference and output: remove ArzEn's event tags,
brackets and joiners; strip Arabic diacritics and tatweel; unify alef forms (أ إ آ → ا), ى → ي, ة → ه;
Arabic-Indic digits → 0-9; remove punctuation; split Arabic from Latin letters glued together
(`الdata` → `ال data`); lowercase. Then:

- **WER / CER** — word / character error rate over the set (lower is better), WER with a **95%
  bootstrap confidence interval** over clips.
- **Arabic-word / English-word errors** — substitutions and deletions of reference words in each
  script, divided by the number of reference words in that script (insertions are not counted, so
  the two do not add up to the WER). An Arabic prefix written onto an English word (`الـdiscount`)
  counts with the English word — so spelling the term in Arabic letters is an English error.
- **English kept** — share of the reference's English words that appear in the output in Latin
  script. Writing `database` as `داتابيس` counts as a miss.
- **Speed** — processing time ÷ audio duration (0.36 ≈ 3x faster than real time; 2.0 = twice as long
  as the audio). Public clips: the 0.5 s of added silence is not counted. Meetings and calls
  (`transcribe.py`): the whole recording, pauses included — so these figures are lower than the
  same model's on short clips. Some runs shared the CPU with other work, which inflates their
  figure (noted).

## Main table — Perle (Egyptian tech/work), 16 kHz

| Model | WER (95% CI) | CER | Arabic-word errors | English-word errors | English kept | Speed |
|---|---|---|---|---|---|---|
| **Cohere Transcribe Arabic** (Q4, transcribe.cpp) | **13.4%** (9–18) | 8.2% | **5.1%** | 24% | 77% | **0.36** |
| **whisper-medium code-switching fine-tune** (default) | 18.5% (15–22) | **7.1%** | 17.8% | **11%** | **90%** | 1.08 |
| Whisper large-v3 + style hint | 20.8% (16–25) | 8.3% | 17.8% | 17% | 88% | 2.15 |
| Whisper large-v3 *(whole clip)* | 39.7% (34–45) | 29.0% | 15.2% | 76% | 25% | 1.52 |
| Audar-ASR-V1-Turbo *(whole clip)* | 43.5% (39–49) | 33.2% | 12.9% | 86% | 12% | 0.63 |
| **R2T2** *(whole clip)* | 47.1% (41–52) | 30.1% | 25.1% | 77% | 25% | 0.82 |
| Qwen3-ASR-1.7B *(whole clip)* | 50.6% (46–55) | 35.0% | 21.8% | 91% | 8% | 0.75 |

**Paired differences** (same 40 clips, bootstrap): Cohere − whisper-medium = −5.1 points (95% CI
−10.9 to +0.8); whisper-medium − large-v3+hint = −2.3 (−7.3 to +2.2). With 648 reference words
neither overall-WER gap is proven. What *is* clear on every condition: **Cohere makes about a third
as many errors on Arabic words**, and **whisper-medium keeps far more English terms in English**
(87–90% vs 72–77%).

## Phone quality and telephone codec

| Model | 16 kHz | through 8 kHz | G.711 telephone | English kept (G.711) |
|---|---|---|---|---|
| Cohere Transcribe Arabic | 13.4% | 14.7% | 15.3% | 72% |
| whisper-medium code-switching | 18.5% | 17.4% | 18.2% | 87% |
| Whisper large-v3 + hint | 20.8% | 21.6% | 22.1% | 87% |

Phone-band audio and μ-law coding cost these three models **at most ~2 WER points** (within the
noise). In the whole-clip round, 8 kHz cost 1.2–4.3 points (large-v3 + hint on ArzEn: 33.7% →
38.0%). Real calls add noise, packet loss and crosstalk that this simulation does not.

## Your meetings

The first 10 minutes of one recording from each of 6 internal meetings (60 min in total, 2–5 people
speaking in each excerpt), scored against the verbatim ElevenLabs transcript with speakers corrected
by hand (`bench/prepare_private_meetings.py`, `bench/score_meetings.py`; the audio, transcripts and
per-excerpt outputs stay in the git-ignored `data/` and `results/meetings/`). The reference is
machine output too, so **WER here means disagreement with ElevenLabs**. Because the transcripts have
no timestamps, the reference is cut where it aligns best with the excerpt. *Lenient* additionally
drops pure hesitation sounds (آآآ, مم) and unifies common Egyptian spellings (كده/كدا, ايوه/ايوا)
on both sides. Both engines ran with speaker labels and the true number of speakers. Cohere used
TitaNet-small voiceprints, the current default. whisper-medium was run with the first voiceprint
model, WeSpeaker ResNet34; its text does not depend on the speaker step, so its speaker numbers
below are TitaNet-small re-labellings of the same words (`bench/compare_voiceprints.py`).

| Excerpt | People | Cohere WER (lenient) | whisper-medium WER (lenient) | English kept C / W | Wrong speaker C / W | ElevenLabs' own labels |
|---|---|---|---|---|---|---|
| m1 | 2 | 42.8% (41.2%) | 52.6% (51.2%) | 60% / 57% | 3.1% / 4.6% | 0.0% |
| m2 | 3 | 46.0% (44.9%) | 52.3% (51.2%) | 42% / 43% | 5.0% / 7.8% | 0.0% |
| m3 | 3 | 34.0% (30.9%) | 34.4% (31.5%) | 63% / 75% | 11.2% / 10.4% | 0.3% |
| m4 | 3 | 48.7% (46.8%) | 49.0% (47.9%) | 45% / 56% | 1.7% / 2.6% | 0.5% |
| m5 | 2 | 49.8% (48.4%) | 49.3% (48.2%) | 21% / 54% | 17.1% / 16.5% | 27.2% |
| m6 | 5 | 43.3% (41.2%) | 62.0% (60.6%) | 3% / 35% | 37.6% / 38.4% | 12.0% |
| **pooled** | | **43.8%** (42.1%) | **48.8%** (47.3%) | **46% / 57%** | **10.9% / 11.7%** | **6.5%** |

Pooled values are totals over all excerpts (for English kept: English words kept in all excerpts ÷
English words in all excerpts). The excerpts differ in how much English they contain: from 24% of
the reference words (m3) down to 6% (m6, only 31 English words — so its 3% / 35% rests on 1 vs 11
words).

Other pooled numbers — CER: Cohere 29.9%, whisper-medium 29.4%; errors on Arabic words 38.3% /
45.4%; speed with speaker labels 0.15–0.32x (mean 0.26x) / 0.30–0.79x (mean 0.53x) real time; peak
memory 3.0 / 2.1–3.3 GB. The whisper-medium speed and memory come from its WeSpeaker run;
TitaNet-small's voiceprint step is faster, so with the default it is slightly quicker still.

Two variations on Cohere, pooled: **without speaker labels** 43.1% WER (so labelling now costs it
under a point), but English kept falls to 39%; with the **first voiceprint model** (WeSpeaker
ResNet34) 47.0% WER and 24.6% wrong speaker — its many false speaker changes cut the audio into
fragments.

What this shows:

- **Real meetings are far harder than the public benchmark.** The same two models that reach
  13–18% on Perle disagree with ElevenLabs on 44–49% of the words here: spontaneous speech,
  crosstalk, several people, fast English terms.
- **Cohere is ahead on text** (43.8% vs 48.8%; lower on 3 excerpts, level on 3), with fewer
  errors on Arabic words, and twice as fast. **whisper-medium keeps English in English better**
  (57% vs 46% pooled; on m3, the excerpt with the most English, 75% vs 63%; the largest gap on m5,
  54% vs 21%). On m1, the one excerpt with long English stretches, the two were level (Cohere 60%,
  whisper-medium 57%).
- **The disagreements look like local errors.** Judging from the text (I cannot listen to the audio),
  in three spot-checked stretches most differences were the local model dropping or misspelling
  short English words and phrases (written in Arabic letters or left out), dropping whole phrases in
  fast exchanges, or rewriting Egyptian greetings into formal Arabic. ElevenLabs' extra words are
  coherent and fit the context. A human-checked excerpt would settle how much of the gap is
  ElevenLabs' own error.
- **Speaker labels are good on most 2–3-person meetings**: 2–11% of words to the wrong person on
  four of the five, 17% on m5 (2 people, where ElevenLabs' raw labels are 27% off), 38% on the
  5-person one; pooled over the five 2–3-person excerpts 8.2% (Cohere) / 9.0% (whisper-medium) vs
  5.9% for ElevenLabs' raw labels. Over all six, ElevenLabs' raw labels differ from your corrections
  on 6.5% of words — a comparison that favours ElevenLabs, since the corrections started from its
  labels.

## Your test call (2 min, 8 kHz, 2 speakers)

No reference transcript exists, so these are read side by side (files in `results/poc/`, kept
local — the call's content is not in this repository).

After the fixes (`results/poc/after-fixes/`, TitaNet-small voiceprints):

| Model | Words (plain / with speaker labels) | Speed (plain / labels) |
|---|---|---|
| whisper-medium code-switching | 310 / 310 | 0.57× / 0.59× |
| Cohere Transcribe Arabic | 292 / 284 | 0.30× / 0.35× |

Both split the call 57 s / 44 s between the two speakers. First-round readings (before the fixes):

| Model | Setting | Speed | Reading |
|---|---|---|---|
| **whisper-medium code-switching** | with speaker labels | 1.4× | Most complete, and kept English tech terms in English best — including a tool name every other model missed. Misses: a few terms turned into similar English words, a few spelled in Arabic letters |
| **Cohere Transcribe Arabic** | with speaker labels | 0.4× | Got two acronyms right that others missed, but only 248 words: this run was hit by the speaker-path bug (fixed; now 284). On this hesitant speech it also added notes like `(تأتأة)` "stutter" — now stripped automatically |
| Whisper large-v3 + hint | with speaker labels | 1.4× | Good; missed an acronym and spelled a tool name in Arabic letters; needed the gap-fill fix |
| R2T2 | no speaker labels | 1.8× (power-saver mode) | Clearly worst: common tech words misheard as nonsense, dropped clauses, English almost always in Arabic letters |
| Qwen3-ASR-1.7B | no speaker labels | 1.4× (power-saver mode) | Same kinds of errors as R2T2, slightly more complete |

## Long recording (16-minute call, 2 speakers)

| Model | Speed | Peak memory | Notes |
|---|---|---|---|
| Cohere + speaker labels | **0.37× real time** (6 min) | 3.1 GB | after the fixes, with the first voiceprint model (WeSpeaker ResNet34). Before them it **crashed** on this file: one turn made the decoder loop until its length cap; such chunks are now split and retried |
| whisper-medium + speaker labels | 1.80× real time (29 min) | 2.9 GB | before the fixes; on the meeting excerpts after the fixes it ran at 0.30–0.79× (keeping only the first decoding window roughly halved its work) |

## What the numbers say

1. **R2T2 is not a fit** — confirmed by measurement, not just its training data. It is one of the
   two least accurate models on every test (47.1% on Perle; at its best ArzEn setting 43.9%, just
   behind its base model's 43.2%; clearly the worst on the call). It is no better than Qwen3-ASR on
   Arabic, much worse when left to auto-detect (60.1% on ArzEn), writes most English terms in Arabic
   letters, and the context hint does not help it.
2. **The Arabic-specialised models win by a wide margin.** Cohere Transcribe Arabic has the lowest
   WER (public set and your meetings), by far the fewest Arabic-word errors, and runs about 3–4x
   faster than real time on this CPU. The whisper-medium fine-tune keeps English terms in English
   best (90% on Perle, 57% on your meetings, vs Cohere's 77% / 46%).
3. **On real meetings both remain far from ElevenLabs** (44–49% of words differ), while their
   speaker labels come within a few points of ElevenLabs' on 2–3-person meetings (8–9% vs 6% of
   words to the wrong person, pooled).
4. **Keeping English in Latin letters separates the models.** The Qwen3-ASR family (R2T2, Qwen3-ASR,
   Audar) hears the English words but, on Perle, spells them in Arabic letters: Audar has good
   Arabic (12.9% errors) but keeps only 12% of English words in Latin script.
5. **A one-sentence style hint fixes stock Whisper large-v3**: 39.7% → 22.4% on Perle and 47.4% →
   33.7% on ArzEn (whole clip, without vs with the hint; `results/summary.json`, config
   `ar-prompt-clip`); with the current pipeline it scores 20.8% / 35.7%. Useful where only stock
   Whisper is available (e.g. hosted Whisper on Groq).

## Caveats

- **Training-data contamination.** On ArzEn, Cohere scores 6.7% (19 of 40 clips exactly right),
  whisper-medium 10.8% and Audar 18.9% — far better than on Perle (13.4%, 18.5%, 43.5%), while stock
  large-v3 + hint goes the other way (35.7% vs 20.8%). Audar even reproduces ArzEn's own
  `[LAUGHTER]` tag in every clip whose reference has one, and keeps 76% of English words on ArzEn vs
  12% on Perle. All three were almost certainly trained on ArzEn, so ArzEn is not evidence for them.
  Perle may be contaminated too (it is a *train* split); your meetings are not.
- **Small samples.** 40 clips per set; differences under ~5 points are mostly within the
  confidence intervals.
- **Speed** varies with other load on the laptop. Power-saver mode is several times slower:
  Whisper large-v3's first run on the call (no hint, no speaker labels) took 6.4× real time in
  power-saver mode, while later performance-mode runs with the hint and speaker labels (more work)
  took 1.4–2.4× — roughly 3–5x, from a single run with different settings.
- **Quantized models** were used (Q4/Q8/int8); full-precision versions may be slightly better.
- **ElevenLabs' published 13.1%** (Perle paper, Egyptian subset) uses different clips and
  normalization — it is not directly comparable with the local numbers here.
