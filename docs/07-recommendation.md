# 7. Recommendation and next steps

## Answer to the handoff question

**Don't use R2T2 for this.** It runs on a CPU (that part of the handoff was too pessimistic), but it
is one of the two least accurate models tested on Egyptian Arabic–English (47.1% WER on Perle vs
15.7% for the best), it is no better than its base model, and it writes English terms in Arabic
letters. Its strength — low-latency live streaming — is irrelevant for recordings.

## What to use for the MVP

**Local, free, private (recommended to start):**

- **Default: whisper-medium code-switching fine-tune + voice-based speaker labels** — what
  `transcribe.py … --speakers N` now runs. Keeps 91% of English terms in English, most complete
  transcript of your real call, word-level speaker attribution, MIT licence, 0.8 GB.
  About 1–1.4x real time on this laptop (an 80-min call ≈ 1.5–2 h).
- **Fast option: Cohere Transcribe Arabic** (`--engine cohere`) — lowest WER on Perle (15.7%, 17.0%
  at phone quality), fewest Arabic errors, **3x faster than real time** (an 80-min call ≈ 30 min),
  Apache-2.0. Keeps fewer English terms in English (72%), no word timestamps (speakers are
  attributed per turn), and occasionally drops a phrase on hesitant speech.

**Hosted, if you accept uploading recordings (ask before any upload of private meetings):**

- **ElevenLabs Scribe v2** — the only system with independent evidence of top accuracy on Egyptian
  Arabic–English (13.1% on Perle's full benchmark vs 45.9% next-best), speaker labels built in.
  Free tier (between 30 min and 4.5 h a month — their pages disagree), then $0.22/h. **Turn off
  "use my data for training"** in Profile → Data use.
- **Speechmatics** (`ar_en`) — $100 free credit without a card, does not train on your audio by
  default, deletes files after 7 days. Accuracy on Egyptian unverified: test it on one call.

## Suggested next steps

1. **Check the speaker labels on your call** (`results/poc/*.speakers.txt`) — you know who said what;
   the voice model finds the two speakers alike (similarity 0.90).
2. **Run the default on a full recording**, e.g. `record2.wav` (16 min):
   `.venv/bin/python transcribe.py audio-test/record2.wav --speakers 2`.
3. **Correct one transcript by hand** (even 2 minutes) — it becomes a clean reference for scoring
   future models on *your* audio instead of public sets.
4. **Add your jargon** with `--prompt` (Whisper), e.g. tool and table names — cheap accuracy gain.
5. **Try TitaNet voiceprints** (telephone-trained) in `speakers.py` for better speaker separation.
6. **Optionally compare ElevenLabs** on one non-sensitive call to see the hosted ceiling.
7. **Reclaim disk:** delete R2T2 and Qwen3-ASR (4.7 GB) and Audar (1.9 GB) from `models/`.

## For a real product later

- CPU-only transcription is slow for long meetings; a small GPU or a hosted API turns hours into
  minutes.
- Licences: Cohere (Apache-2.0) and the whisper-medium fine-tune (MIT) allow commercial use; check
  the fine-tune's training-data licence (GPL noted on its card). Audar's licence is research and
  evaluation only; R2T2's is a custom NetEase licence under PRC law.
