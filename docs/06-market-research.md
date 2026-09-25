# 6. Market research — hosted and open models (summary)

**Full cited report:** [research/market-research-report.md](research/market-research-report.md).
Raw material: [research/raw-sweeps.json](research/raw-sweeps.json) (142 candidates from 5 sweeps) and
[research/verification.json](research/verification.json) (58 claims re-checked against official
pages: 39 confirmed, 19 corrected; corrections were applied in the report).

## How it was done (2026-09-25)

An 8-agent research workflow, web only (no audio uploaded, no sign-ups, no API keys):

1. Five parallel sweeps, each blind to the others: general open models · Arabic-specialised models
   and fine-tunes · published accuracy evidence · hosted free tiers · diarization.
2. Two skeptical verifiers re-checked the load-bearing claims against official sources.
3. One synthesis step produced the ranked recommendation.

## Headline findings

- **ElevenLabs Scribe v2** is the only system with *independent* evidence on Egyptian
  Arabic–English: **13.1% WER on the Egyptian–English subset of Perle's benchmark** (arXiv
  2605.19069), against about 45.9% for the next-best (gpt-4o-transcribe, read from the paper's
  chart); averaged over all four language pairs, 13.2% vs 38.6%. The public set is ~30% tech/software
  talk. These numbers use the paper's own clips and normalization, so they are **not directly
  comparable** with this project's local scores. Diarization and word timestamps built in. Free
  allowance unclear (official pages say 4.5 h or ~30 min a month); $0.22/h after. Uses your audio
  for training unless you opt out (Profile → Data use).
- **Speechmatics** (`ar_en` bilingual pack): **$100 credit, no card** (~250 h), does not train on your
  data unless you opt in, deletes batch files after 7 days, diarization included. Accuracy numbers
  are vendor-only.
- **Gemini 3.5 Transcribe:** free, lists Egyptian (`ar-EG`), labels speakers — but the free tier uses
  your audio and allows human review; 30-minute cap per request with diarization.
- **AssemblyAI** (185 h free) and **Deepgram** ($200 free): free users can't opt out of training
  (AssemblyAI); Deepgram's code-switching does not include Arabic.
- **Not suitable:** AWS Transcribe (no Egyptian), Google Chirp 3 (no Arabic diarization, 59.7% on
  Perle), Soniox (no free credits any more).
- **Open models:** the independent *Open Universal Arabic ASR Leaderboard* ranks
  **Audar-ASR-V1-Turbo (23.17)** and **Cohere Transcribe Arabic (25.87)** far ahead of Whisper large-v3
  (36.86). Several Whisper fine-tunes target Egyptian code-switching; some were trained on ArzEn,
  which is why ArzEn is not a fair test for them.
- **Nothing public measures any system on 8 kHz Arabic phone calls** — your own test is the only
  evidence for that condition.

## Hosted options at a glance

| Service | Free to try | Egyptian | Code-switching | Speakers | Trains on your audio? |
|---|---|---|---|---|---|
| ElevenLabs Scribe v2 | 30 min–4.5 h/month | yes | best measured (13.1%) | yes | yes, unless opted out |
| Speechmatics | $100 credit, no card | Egypt named | `ar_en` pack | yes | no, unless opted in |
| Gemini 3.5 Transcribe | free tier | `ar-EG` | claimed | yes (≤8) | **yes on free tier** |
| AssemblyAI | up to 185 h | "ar" | claimed | yes | free users can't opt out |
| Deepgram Nova-3 | $200 | `ar-EG` | no Arabic code-switching | yes | per-request opt-out |
| Groq (hosted Whisper large-v3) | 8 h/day | as local Whisper | as local Whisper | no | no |

See the full report for prices, sources and caveats, and for the open-model table.

## Second, independent research pass

A separate single-agent pass ([research/hosted-apis-report.md](research/hosted-apis-report.md))
covered 19 hosted services. It agrees with the picks above and adds:

- **Conflicting evidence on ElevenLabs.** On GigaSpeechBench (arXiv 2606.28884; in-the-wild,
  one language per clip), Scribe v2 ranks near the bottom for Saudi Arabic (33.3 WER vs 16.8 for
  Google Chirp 3). Its lead is specifically on **code-switched** speech, which is your case, but it
  means a test on your own audio should decide.
- **ElevenLabs' free API tier** is listed as 4 h 30 min a month on the API pricing page.
- **New or cheaper options:**
  - **OpenAI `gpt-transcribe`**: $0.27/h, takes several language hints for code-switched audio,
    no training on your data, no free tier. Its Arabic quality is untested.
  - **Azure MAI-Transcribe-2**: preview, **$0.10/h** promo until 31 Dec 2026. Arabic
    code-switching unverified.
  - **Speechmatics Melia 1**: $0.129/h, so the $100 credit covers about 775 h.
- **Privacy-first paid option:** Soniox (≈$0.10/h) never trains on your audio and deletes files after
  30 days, but it no longer gives free credit.
- **File size:** an 80-minute 8 kHz WAV is ~77 MB, over the 25 MB upload caps at OpenAI, Groq's
  free tier and Cohere. Transcode to FLAC/Opus or split it first.
- **More open models to try:** `facebook/omniASR-LLM-1B` (Apache-2.0, 29.96 on the leaderboard)
  and `IbrahimAmin/code-switched-egyptian-arabic-whisper-small` (Egyptian–English, 0.24B).
