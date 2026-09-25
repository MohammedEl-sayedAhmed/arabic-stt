# 9. The app — Tafrigh (تفريغ)

A local web app for everyday use of the models tested here: drop a recording, pick a model, get a
transcript with speaker labels that you can play back, search, correct and export.

```sh
./app.sh                      # starts it and opens http://127.0.0.1:8765 in the browser
./app.sh --no-browser         # start only
./app.sh --install-launcher   # optional: add "Tafrigh" to the desktop's application menu
```

Stop it with Ctrl+C in the terminal or **Settings → Quit Tafrigh**. Starting it again while it runs
just opens the browser tab. `./app.sh --desktop` opens it in its own window instead, and it can be
built as a Windows / Linux desktop app — see [desktop app](10-desktop.md).

Local models that aren't on the computer yet can be downloaded from the app: the model's card, or
**Settings → Models on this computer** (resumable, checked against a pinned checksum).

## What it does

- **Any recording**: audio or video (mp3, m4a, wav, ogg, opus, flac, mp4, mkv, webm, …), dragged
  in or chosen — or a path to a file already on the laptop, which is read in place (no copy). Every
  recording is converted once to 16 kHz mono FLAC (about 50 MB per hour), which all models and the
  player use; the uploaded original is then deleted unless `keep_original = true`.
- **Five models**, each shown with its measured strengths (see below). Local ones run through
  `transcribe.py`; hosted ones upload the recording only after you tick a confirmation box.
- **Speaker labels**: none, auto-detect, or the number of people.
- **Live progress**: stage, a progress bar with time left, and the transcript appearing chunk by
  chunk for local models; cancel at any time (a hosted job is also deleted on the service).
- **Transcript view**: click a timestamp to play from there; the line being played is highlighted
  and followed; search with highlighted matches; rename speakers (Speaker 1 → a name); merge two
  speakers the model split; edit text and change a line's speaker; *Run again with* another model on
  the same audio (shares the audio file, no extra space) to compare.
- **Export**: text, SRT and WebVTT subtitles, Markdown, JSON — using your names and edits — or copy
  the text.
- Arabic lines are laid out right-to-left automatically; light and dark themes; works on a narrow
  window too. No external requests: no CDN, fonts or analytics.

## The models and their settings

All model settings live in [`app/config.toml`](../app/config.toml) — the "cfgs". Each `[[models]]`
entry has an `id`, `kind` (`local` or `hosted`), the engine settings, and the text the app shows.

| Model | Kind | Best for | Settings |
|---|---|---|---|
| **whisper-medium code-switching** (default) | local | keeping English terms in English (90% on the public set, 57% on your meetings) | `whisper_model` folder; accepts a vocabulary hint |
| **Cohere Transcribe Arabic** | local | Arabic-heavy meetings; fewest Arabic-word errors; fastest (~0.3× real time) | `cohere_model` GGUF path |
| **Whisper large-v3 + hint** | local | stock Whisper (slow here) | `whisper_model = "large-v3"`; gets the Egyptian style hint, your terms are added to it |
| **ElevenLabs Scribe** | hosted | minutes you rely on — what your meeting-minutes app uses | `api_model = "scribe_v2"`, `tag_audio_events`, `delete_after`, API key |
| **Speechmatics** | hosted | Arabic–English bilingual pack (`ar_en`), doesn't train on your audio | `language`, `api_model` (enhanced/standard), `speaker_sensitivity`, `base_url` region, `delete_after`, API key |

Other settings: `[server]` (host, port — keep it on 127.0.0.1), `[storage]` (data folder, keep the
original, upload limit), `[defaults]` (model, speakers, language), `[local]` (Python, CPU threads,
voiceprint model, `performance_while_running`). Personal overrides go in `app_data/config.toml`
with the same layout (a `[[models]]` entry with the same `id` changes only the fields it lists), so
`app/config.toml` can stay as shipped. Setting `disabled = true` on a model hides it.

### API keys

Enter them in **Settings** (saved to `app_data/secrets.json`, file mode 600, git-ignored), or set
`ELEVENLABS_API_KEY` / `SPEECHMATICS_API_KEY` in the environment (these take precedence).

- **ElevenLabs** ([keys](https://elevenlabs.io/app/settings/api-keys)): about 4.5 h a month free,
  then $0.22/h. It may use your audio for training unless you opt out in your profile (*Terms and
  privacy → Data use*). The app sends `diarize`, `num_speakers` (a maximum), `language_code` (unless
  auto-detect), and your vocabulary as `keyterms` (up to 5 words each; requests with key terms cost
  about 20% more). With `delete_after` it deletes the transcript from your ElevenLabs history once
  fetched.
- **Speechmatics** ([keys](https://portal.speechmatics.com/settings/api-keys)): $100 free credit
  (about 250 h with the enhanced model), then $0.40/h; does not train on your audio unless you opt
  in; keeps batch data 7 days, and the app deletes the job right after fetching the transcript.
  Batch jobs can't be told how many speakers there are — `speaker_sensitivity` (0–1) tunes how
  readily it splits voices. The default host is the EU region (`eu1`); `us1` and `au1` also work.
  Whether the free plan includes the `ar_en` pack is not documented — a 403 would say so.

API details were taken from the official documentation (2026-09-25). The hosted modes were tested
against a local stand-in of each API (request fields, parsing, cancel, delete) — not against the
real services, since no keys were available and no audio was to be uploaded.

## Privacy

- The server listens on **127.0.0.1 only**, answers only requests addressed to that host, and
  refuses changes that don't carry the app's own header — so other websites open in the same browser
  can't use it.
- Local models: nothing leaves the laptop.
- Hosted models: the recording is uploaded only when you pick one **and** tick "Upload this
  recording to …" (checked again by the server, for re-runs too). Keys go only to their own service.
- Everything the app stores — audio, transcripts, logs, keys — is in `app_data/`, which git ignores.
  Delete a transcription in the app to remove its folder; delete `app_data/` to remove everything.

## Speed on this laptop

The app estimates the time from each model's measured speed (`rtf` in the config) and multiplies it
by 3.5 in power-saver mode. The top bar shows the power profile; **Settings → Power mode** switches
it, and `performance_while_running = true` does it automatically while local jobs run. Local jobs
run one at a time; hosted jobs have their own queue and don't wait for a local one.

## Files

| Path | Role |
|---|---|
| `app.sh` | launcher |
| `app/config.toml` | settings and model definitions |
| `app/server.py` | web server and JSON API (Python standard library) |
| `app/jobs.py` | job folders, the prepare (PyAV conversion) → queue → run steps, cancel, re-run |
| `app/engines.py` | local runs (`app/worker.py` → `transcribe.py --progress-file`), the ElevenLabs and Speechmatics clients |
| `app/downloads.py` | model downloads: resumable, checked against the pinned size and SHA-256 |
| `app/desktop.py`, `app/selftest.py` | the desktop window and the installation check ([desktop app](10-desktop.md)) |
| `app/transcript.py` | lines from words, exports |
| `app/static/` | the interface (HTML/CSS/JS, no build step) |
| `tests/` | 20 tests: helpers, API parsers, the HTTP API with mock services, downloads, paths; `RUN_MODEL_TESTS=1` also runs whisper-medium on a public clip |

Run the tests with `.venv/bin/python -m unittest discover -s tests -v`.

## API (for scripts)

Every change needs the header `X-Tafrigh: 1`.

| Call | What |
|---|---|
| `GET /api/status` | models (ready or what's missing), defaults, power profile, free space |
| `POST /api/jobs?model=&speakers=&language=&prompt=&title=&name=&confirm_upload=` | body = the file |
| `POST /api/jobs` with JSON `{"path": …, "model": …, …}` | a file on this computer, read in place |
| `GET /api/jobs`, `GET /api/jobs/<id>` | list; one job with its lines (partial while running) |
| `PATCH /api/jobs/<id>` | `title`, `speaker_names`, `lines`, or `merge: {from, into}` |
| `POST /api/jobs/<id>/cancel`, `POST /api/jobs/<id>/rerun`, `DELETE /api/jobs/<id>` | |
| `GET /api/jobs/<id>/audio`, `GET /api/jobs/<id>/export/{txt,srt,vtt,md,json}` | |

## Limits

- Local transcription is CPU-bound: an hour of audio takes roughly 20 min with Cohere and 30–45 min
  with whisper-medium in performance mode, several times longer in power-saver mode.
- Speaker labels on a 2–3-person meeting put about 8–9% of words with the wrong person (see
  [speaker labels](04-speaker-labels.md)); use rename and merge to fix what matters.
- The transcripts are drafts: on your meetings the local models differ from ElevenLabs on 44–49% of
  words ([results](03-results.md#your-meetings)).
- Stereo recordings are mixed to mono, so a call recorded with one person per channel doesn't get
  channel-based speaker labels.
