# 1. Use case and the original question

## What the MVP must do

- **Input:** recorded tech meetings and phone calls, from 2 minutes to several hours long.
- **Language:** mainly **Egyptian Arabic**, with English tech terms and whole English sentences mixed
  in (Arabic–English *code-switching*). Example (from the public Perle test set):
  `الـ task الجديدة دي محتاجة نعمل integrate مع payment gateway`.
- **Output:** a timestamped transcript that says **who is speaking** (`Speaker 1`, `Speaker 2`, …),
  telling speakers apart **by their voice**, not by time chunks.
- **Scope:** MVP and personal trials, not commercial use. Free to try.
- **Privacy rule:** the recordings are private meetings — **no audio is uploaded to any external
  service without explicit permission.** Everything in this project ran on the laptop.

## The private audio used for testing

None of this audio, and nothing transcribed from it, is in the repository.

**Test calls** (`audio-test/`, 8 kHz mono 16-bit WAV — phone-call quality):

| Recording | Length | Notes |
|---|---|---|
| rec1 (the 2-minute test clip) | 2:00 | 2 speakers, technical discussion; used for every proof-of-concept run |
| rec2 | 16:00 | 2 speakers; used for the full-length runs |
| rec3 | 25:42 | |
| rec4 | 79:37 | (two byte-identical copies exist in the folder) |

At 8 kHz, speech above 4 kHz is simply not in the file, which makes every model's job harder than on
normal 16 kHz audio (measured in [results](03-results.md#phone-quality-and-telephone-codec)).

**Meetings with reference transcripts** (a separate, private dataset built for this evaluation, kept
outside the repository): 6 internal meetings from August–September 2026, 9 h 51 min in total, 2–9
participants, recorded by the meeting platform or a local recorder at 16 kHz. Each comes with the
ElevenLabs transcript made through your meeting-minutes app, verified to be verbatim (English kept in Latin script), with
speakers resolved to real people by hand. This allows scoring **both** transcription and speaker
labels on real meetings — see [results](03-results.md#your-meetings).

## The original question (from the handoff)

`R2T2-ARABIC-TRANSCRIPTION-HANDOFF.md` asked: *can R2T2 (NetEase Youdao's Confucius4-R2T2) do this
instead of ElevenLabs Scribe, since there is no ElevenLabs key?* The previous session had done desk
research only and reached a **preliminary "poor fit"** verdict (trained only on Chinese and English,
built for live streaming, no speaker labels, needs a GPU). It asked for a hands-on comparison of
R2T2 vs its base model Qwen3-ASR-1.7B vs Whisper large-v3 on Arabic–English code-switched audio.

This project answered that question with measurements, then went further: it looked for the best
free-to-try option overall and built a working proof of concept with speaker labels.
