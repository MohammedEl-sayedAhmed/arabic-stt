# Project notes

These notes describe how Tafrigh came about: what was tested, what broke, what the numbers say and
what to use for which job. The work was done on 24 and 25 September 2026 on one laptop (Intel
i5-1245U, no GPU).

## Summary

The goal was to transcribe recorded meetings and calls in Egyptian Arabic with English tech terms,
label the speakers by voice (Speaker 1, Speaker 2 and so on), spend nothing to try it, and keep the
audio private. The first question was whether R2T2 could do this in place of ElevenLabs. It can't do
it well. It runs on a CPU, but it was among the least accurate models tested: a 47.1% word error
rate on Egyptian tech speech with the whole clip given to the model, against 15.7% for Cohere
Transcribe Arabic measured the same way. It did no better than the model it was fine-tuned from,
and it writes English terms in Arabic letters.

Two open models did much better. Cohere Transcribe Arabic had the lowest error rate on the public
Egyptian set (13.4%), made by far the fewest errors on Arabic words, and processed meetings in
about a quarter of their length. A Whisper medium fine-tune for Arabic–English code-switching scored
18.5%, kept about 90% of English terms in English and ran at about half real time. The gap between
their overall error rates is not statistically proven with this test set; the differences on Arabic
words and on English terms are clear.

On six real work meetings both models were far behind ElevenLabs. Their text differed from its
transcripts on 44–49% of the words, mostly through English terms that were dropped or written in
Arabic letters and phrases lost in fast exchanges. For minutes that people rely on, ElevenLabs is
the better choice; the local models suit private or offline drafts.

Speaker labels by voice worked well locally. With the TitaNet-small voiceprint model, 11–12% of
words went to the wrong person across the six meetings, and 8–9% across the five with two or three
people (2–11% on four of them, 17% on one where ElevenLabs' own labels were 27% off). ElevenLabs'
own labels were about 6% off overall. The number of speakers was estimated correctly in five of
the six meetings.

All of this runs offline from the command line:

```sh
.venv/bin/python transcribe.py path/to/call.wav --speakers 2      # or --speakers 0 to estimate
```

Tafrigh wraps the same pipeline in an app (`./app.sh`) that runs any of the five models, three
local and two hosted with your own key, shows progress, and lets you play back, search, correct and
export the transcript ([the app](09-app.md)). It also runs as a desktop app on Windows and Linux,
with the local models downloaded from inside the app ([desktop app](10-desktop.md)).

## Main results

| | Public Egyptian set (Perle, 16 kHz) | Real meetings, share of words that differ from ElevenLabs | English kept (Perle / meetings) | Speed, × real time (meetings / Perle clips) |
|---|---|---|---|---|
| Cohere Transcribe Arabic | 13.4% | 43.8% (with speaker labels) | 77% / 46% | 0.26 / 0.36 |
| whisper-medium code-switching (default) | 18.5% | 48.8% | 90% / 57% | 0.53 / 1.08 |
| Whisper large-v3 + style hint | 20.8% | not run | 88% / not run | not run / 2.15 |
| R2T2 | 47.1% (whole clip) | not run | 25% / not run | not run / 0.82 (whole clip) |

The Perle column is the word error rate (lower is better). The meeting column compares against the
ElevenLabs transcript, which is machine output itself. Speed is processing time divided by audio
length. The meeting figures come from 10-minute excerpts run through `transcribe.py` with speaker
labels, pauses included; the Perle clips are 4 to 12 seconds long, so the fixed cost per chunk
weighs more there.

## Contents

| Document | What's in it |
|---|---|
| [Use case](01-use-case.md) | what the transcripts are for, the test audio, the original question |
| [Trials and issues](02-trials-and-issues.md) | every experiment in order (37 of them, in two rounds): what broke and how it was fixed |
| [Results](03-results.md) | method, public benchmark, phone audio, real meetings, the test call, long recordings, caveats |
| [Speaker labels](04-speaker-labels.md) | how voices are told apart, the bugs found, five voiceprint models compared, forced alignment |
| [Command line](05-command-line.md) | setup, options, what happens inside, speed and memory |
| [Market research](06-market-research.md) | hosted and open options, free tiers, privacy terms ([full report](research/market-research-report.md), [second pass on hosted APIs](research/hosted-apis-report.md)) |
| [Recommendation](07-recommendation.md) | what to use when, and what to try next |
| [Disk space and cleanup](08-disk-and-cleanup.md) | what the project puts on disk and how to remove it |
| [The app](09-app.md) | using Tafrigh, the model settings in `app/config.toml`, API keys, privacy |
| [Desktop app](10-desktop.md) | Tafrigh on Windows and Linux: running, building, the installer, what has been verified |
| [Result tables](results-tables.md) | every configuration on every public test set, generated by `bench/score.py --tables` |

The [research](research/) folder keeps the raw material: the two market-research reports, their
source data, and the handoff note the project started from.
