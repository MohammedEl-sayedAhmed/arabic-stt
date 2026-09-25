# 7. Recommendation and next steps

## Answer to the handoff question

**Don't use R2T2 for this.** It runs on a CPU (that part of the handoff was too pessimistic), but it
is one of the two least accurate models tested on Egyptian Arabic–English (47.1% WER on Perle,
whole clip, vs 15.7% for Cohere measured the same way and 13.4% with the current pipeline), it is
no better than its base model, and it writes English terms in Arabic letters. Its strength — low-latency live streaming — is irrelevant for recordings.

## The main finding: real meetings are much harder than the benchmarks

On clean, read, single-speaker sentences (Perle) the best local models reach 13–18% WER. On **your
real meetings** — spontaneous, overlapping, several people, recorded from video calls — the same
models **disagree with ElevenLabs on 44–49% of the words** (see
[results](03-results.md#your-meetings)): they drop English terms that ElevenLabs keeps, rewrite some
Egyptian phrases into formal Arabic, and mishear fast speech. Judging from the text of spot-checked
stretches, the differences are mostly the local models' errors. Their speaker labels, on the other
hand, are close to ElevenLabs': 11–12% of words to the wrong person (8–9% pooled on 2–3-person
meetings, 2–17% per meeting) against ~6% for ElevenLabs' own labels.

## What to use

**For meeting minutes you will rely on: keep using ElevenLabs** — which is what your meeting-minutes
app already does. Set its **output language to English** (or a transcribe-only profile) so English
stays in English; with output language Arabic, its translation stage Arabizes every English term
(verified on one full meeting from your dataset: 1 Latin-script word left out of 4,149). Hosted alternatives if you
need one outside that app: **ElevenLabs Scribe v2** directly (free tier, $0.22/h, turn off "use my data
for training"), or **Speechmatics** (`ar_en`, $100 free credit, does not train on your audio). A
second benchmark ranks Scribe near the bottom on *single-language* Saudi speech, so try any hosted
service on one non-sensitive call first; compress long WAVs to FLAC/Opus (several APIs cap uploads
at 25 MB).

**For offline, private or free drafts** (searchable notes, first drafts to correct, sensitive calls
that must not leave the laptop):

- **Cohere Transcribe Arabic** (`--engine cohere`) — the lowest WER on the public set *and* on your
  meetings (43.8% vs 48.8% against ElevenLabs), the fewest errors on Arabic words, and the fastest
  (~0.3x real time: an 80-min call in ~25 min); Apache-2.0. Weak spot: it keeps fewer English terms
  in Latin script (46% vs 57% on your meetings, 77% vs 90% on the public set) — the rest are
  written in Arabic letters, misheard or dropped.
- **whisper-medium code-switching fine-tune** (the default) — keeps English terms in English best
  (57% vs 46% on your meetings, 90% vs 77% on the public set), with word-level timestamps; MIT
  licence; ~0.5x real time.

Pick Cohere for Arabic-heavy meetings and speed, whisper-medium when English terms matter most —
and in both cases treat the output as a draft.

**Speaker labels:** the local voice clustering with TitaNet-small (the default) is good on most
2–3-person meetings — 2–11% of words to the wrong person on four of five, 17% on the fifth (a
2-person excerpt where ElevenLabs' own labels were 27% off) — and `--speakers 0` estimated the count
right in 5 of 6 meetings. Larger meetings remain weak (38% on a 5-person one). Upgrades worth
trying: pyannote `community-1` (needs a free Hugging Face token and PyTorch) or NVIDIA Sortformer.

## Suggested next steps

1. **Check the speaker labels on your call** (`results/poc/after-fixes/*.speakers.txt`).
2. **Hand-correct one 10-minute excerpt** (even one) — a human reference would say how much of the
   disagreement with ElevenLabs is ElevenLabs' own error; today that is only spot-checked.
3. **Hybrid idea, untested:** Cohere for Arabic plus whisper-medium for stretches that are mostly
   English (a language-ID step per chunk would pick the engine).
4. **Try pyannote community-1 or Sortformer** for speaker labels on larger meetings.
5. **Add your jargon** with `--prompt` for Whisper (plausible, untested).
6. **Reclaim disk:** delete Audar (1.9 GB), the voiceprint models other than
   `nemo_en_titanet_small.onnx` (~230 MB; only `bench/compare_voiceprints.py` uses them), and
   whichever of the two local engines you don't use.

## For a real product later

- CPU-only transcription is slow for long meetings; a small GPU or a hosted API turns hours into
  minutes.
- Licences: Cohere (Apache-2.0) and the whisper-medium fine-tune (MIT) allow commercial use; check
  the fine-tune's training-data licence (GPL noted on its card). Audar's licence is research and
  evaluation only; R2T2's is a custom NetEase licence under PRC law.
