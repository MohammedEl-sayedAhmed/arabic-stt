# 1. Use case and the original question

## What the MVP must do

- **Input:** recorded tech meetings and phone calls. The test recordings in `audio-test/` are
  **8 kHz mono 16-bit WAV** — phone-call quality — between 2 and 80 minutes long.
- **Language:** mainly **Egyptian Arabic**, with English tech terms and whole English sentences mixed
  in (Arabic–English *code-switching*). Example (from the public Perle test set):
  `الـ task الجديدة دي محتاجة نعمل integrate مع payment gateway`.
- **Output:** a timestamped transcript that says **who is speaking** (`Speaker 1`, `Speaker 2`, …),
  telling speakers apart **by their voice**, not by time chunks.
- **Scope:** MVP and personal trials, not commercial use. Free to try.
- **Privacy rule:** the recordings are private meetings — **no audio is uploaded to any external
  service without explicit permission.** Everything in this project ran on the laptop.

## The recordings

The recordings and their transcripts are private and are **not** in the repository.

| File | Length | Notes |
|---|---|---|
| `record1_test_2min.wav` | 2:00 | the main test clip; 2 speakers; technical discussion |
| `record2.wav` | 16:00 | |
| `rec3.wav` | 25:42 | |
| `record1.wav` | 79:37 | byte-identical to `rec4-copy.wav` (same MD5) |

All four are 8 kHz. Speech above 4 kHz is simply not in these files, which makes every model's job
harder than on normal 16 kHz audio (measured in [results](03-results.md#phone-quality-8-khz)).

## The original question (from the handoff)

`R2T2-ARABIC-TRANSCRIPTION-HANDOFF.md` asked: *can R2T2 (NetEase Youdao's Confucius4-R2T2) do this
instead of ElevenLabs Scribe, since there is no ElevenLabs key?* The previous session had done desk
research only and reached a **preliminary "poor fit"** verdict (trained only on Chinese and English,
built for live streaming, no speaker labels, needs a GPU). It asked for a hands-on comparison of
R2T2 vs its base model Qwen3-ASR-1.7B vs Whisper large-v3 on Arabic–English code-switched audio.

This project answered that question with measurements, then went further: it looked for the best
free-to-try option overall and built a working proof of concept with speaker labels.
