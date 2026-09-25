# The app: Tafrigh (تفريغ)

Tafrigh is a local web app for everyday use of the models tested here. You drop in a recording and
pick a model, and you get a transcript with speaker labels that you can play back, search, correct
and export.

```sh
./app.sh                      # starts it and opens http://127.0.0.1:8765 in the browser
./app.sh --no-browser         # starts the server only
./app.sh --desktop            # opens it in a window of its own (see the desktop notes)
./app.sh --install-launcher   # optional: adds Tafrigh to the desktop's application menu
```

Stop it with Ctrl+C in the terminal or with *Settings → Quit Tafrigh*. Starting it again while it
runs just opens the page. It can also be built as a Windows or Linux desktop app
([desktop app](10-desktop.md)).

Local models that aren't on the computer yet can be downloaded from the app, from the model's card
or from *Settings → Models on this computer*. Downloads resume after a dropped connection and are
checked against a pinned checksum.

## What it does

It takes any recording, audio or video (mp3, m4a, wav, ogg, opus, flac, mp4, mkv, webm and more),
dragged in or chosen, or a path to a file already on the computer, which is read in place without a
copy. Each recording is converted once to 16 kHz mono FLAC (about 50 MB per hour), which all the
models and the player use. The uploaded original is then deleted unless `keep_original = true`.

There are five models, each shown with its measured strengths (see below). Local ones run through
`transcribe.py`. Hosted ones upload the recording only after you tick a confirmation box.
Speaker labels can be off, estimated, or set to the number of people.

While a local model works you see the stage, a progress bar with the time left, and the transcript
growing chunk by chunk. You can cancel at any time, and a cancelled hosted job is deleted on the
service too.

In the transcript, clicking a timestamp plays from there, and the line being played is highlighted
and followed. Search highlights the matches. You can rename speakers (Speaker 1 becomes a name),
merge two speakers that the model split, edit the text, change a line's speaker, and run the same
audio again with another model to compare (the runs share one audio file, so this takes no extra
space).

Exports are plain text, SRT and WebVTT subtitles, Markdown and JSON, with your names and edits
applied, or you can copy the text. Arabic lines are laid out right to left automatically. There are
light and dark themes, the layout works in a narrow window, and the page loads nothing from outside
(no CDN, web fonts or analytics).

Each transcription keeps a record of how it was made: the recording (name, format, codec, sample
rate, channels, bit rate, size, length), the model (its engine and file, or the service and API
model), the run (processor or graphics card, power mode, threads, times, speed, peak memory, app
version) and the computer (maker and model, operating system, processor, memory, graphics cards).
The *Details* panel shows the main lines, with the makers' logos next to the hardware and the
system, *More details* the rest, and *Copy details* copies all of it. The exports carry it too:
plain text starts with a short header, WebVTT with a `NOTE`, Markdown ends with a Details section
and JSON has a `details` object. SRT has no place for comments and stays as it was. Transcriptions
made before this was added show fewer details. In the text, subtitle and Markdown exports, a line
that is mostly Arabic starts with a right-to-left mark, so players and editors show it right to
left even when it begins with an English word.

## The models and their settings

All model settings live in [`app/config.toml`](../app/config.toml). Each `[[models]]` entry has an
`id`, a `kind` (`local` or `hosted`), the engine settings and the text the app shows.

| Model | Kind | Best for | Settings |
|---|---|---|---|
| whisper-medium code-switching (default) | local | keeping English terms in English (90% on the public set, 57% on the test meetings) | `whisper_model` folder; accepts a vocabulary hint |
| Cohere Transcribe Arabic | local | Arabic-heavy meetings; the fewest Arabic-word errors; the fastest (about 0.3× real time) | `cohere_model` GGUF path |
| Whisper large-v3 + hint | local | stock Whisper (slow on this laptop) | `whisper_model = "large-v3"`; gets the Egyptian style hint, and your terms are added to it |
| ElevenLabs Scribe | hosted | minutes people rely on; the best published result for Egyptian–English | `api_model = "scribe_v2"`, `tag_audio_events`, `delete_after`, API key |
| Speechmatics | hosted | its Arabic–English bilingual pack (`ar_en`); doesn't train on your audio | `language`, `api_model` (enhanced or standard), `speaker_sensitivity`, `base_url` region, `delete_after`, API key |

The other sections are `[server]` (host and port; keep it on 127.0.0.1), `[storage]` (the data
folder, whether to keep the original, the upload limit), `[defaults]` (model, speakers, language)
and `[local]` (Python, CPU threads, voiceprint model, `performance_while_running`). Personal
overrides go in `app_data/config.toml` with the same layout, so `app/config.toml` can stay as
shipped. A `[[models]]` entry there with the same `id` changes only the fields it lists, and
`disabled = true` hides a model.

### API keys

Enter them in *Settings*, where they are saved to `app_data/secrets.json` (file mode 600, ignored by
git), or set `ELEVENLABS_API_KEY` or `SPEECHMATICS_API_KEY` in the environment, which takes
precedence.

ElevenLabs ([keys](https://elevenlabs.io/app/settings/api-keys)) gives about 4.5 h a month free,
then charges $0.22/h. It may use your audio for training unless you opt out in your profile, under
*Terms and privacy*, then *Data use*. The app sends `diarize`, `num_speakers` (as a maximum),
`language_code` (unless the language is set to detect), and your vocabulary as `keyterms`, each term
up to 5 words; requests with key terms cost about 20% more. With `delete_after`, it deletes the
transcript from your ElevenLabs history once it has been fetched.

Speechmatics ([keys](https://portal.speechmatics.com/settings/api-keys)) gives $100 of free credit
(about 250 h with the enhanced model), then charges $0.40/h. It doesn't train on your audio unless
you opt in and keeps batch data for 7 days; the app deletes the job as soon as the transcript is
fetched. Batch jobs can't be told how many speakers there are, so `speaker_sensitivity` (0 to 1)
sets how readily it splits voices. The default host is the EU region (`eu1`); `us1` and `au1` also
work. Whether the free plan includes the `ar_en` pack isn't documented, and a 403 error would say
it doesn't.

The API details were taken from the official documentation on 25 September 2026. The hosted modes
were tested against a local stand-in for each API (request fields, parsing, cancel, delete), not
against the real services, because no keys were available and no audio was to be uploaded.

## Privacy

- The server listens on 127.0.0.1 only, answers only requests addressed to that host, and refuses
  changes that don't carry the app's own header, so other websites open in the same browser can't
  use it.
- With local models, nothing leaves the computer.
- With hosted models, the recording is uploaded only when you pick one and also tick "Upload this
  recording to …". The server checks this again, including for re-runs. Keys go only to their own
  service.
- Everything the app stores (audio, transcripts, logs, keys) is in `app_data/`, which git ignores.
  Deleting a transcription in the app removes its folder, and deleting `app_data/` removes
  everything.
- The details kept with each transcription name this computer's maker and model, operating system,
  processor, memory and graphics cards. They are only shown to you and written into your exports
  (all but SRT; add `?details=0` to an export's address to leave them out). Nothing sends them anywhere.

## Speed

The app estimates the time from each model's measured speed (`rtf` in the config) and multiplies it
by 3.5 in power-saver mode. On Linux the top bar shows the power profile, *Settings → Power mode*
switches it, and `performance_while_running = true` switches it automatically while local jobs run.
Local jobs run one at a time. Hosted jobs have their own queue and don't wait for a local one.

## Files

| Path | Role |
|---|---|
| `app.sh`, `app.cmd` | launchers for Linux and Windows |
| `app/config.toml` | settings and model definitions |
| `app/server.py` | web server and JSON API (Python standard library) |
| `app/jobs.py` | job folders; the prepare (PyAV conversion), queue and run steps; cancel; re-run |
| `app/engines.py` | local runs (`app/worker.py` running `transcribe.py --progress-file`), and the ElevenLabs and Speechmatics clients |
| `app/downloads.py` | model downloads, resumable and checked against the pinned size and SHA-256 |
| `app/desktop.py`, `app/selftest.py` | the desktop window and the installation check ([desktop app](10-desktop.md)) |
| `app/transcript.py` | lines from words, and the exports |
| `app/report.py` | the details of each transcription: what a job records, and how the page and the exports word it |
| `sysinfo.py` | this computer and a recording's format (PyAV), for the details and `transcribe.py`'s `.meta.json` |
| `app/static/` | the interface (HTML, CSS and JavaScript, no build step) |
| `tests/` | unit tests: helpers, the API parsers, the HTTP API against mock services, downloads, paths, the details, and the forced-alignment path. `RUN_MODEL_TESTS=1` also runs whisper-medium on a public clip |

Run the tests with `.venv/bin/python -m unittest discover -s tests -v`.

## API for scripts

Every change needs the header `X-Tafrigh: 1`.

| Call | What |
|---|---|
| `GET /api/status` | models (ready, or what's missing), defaults, power profile, free space |
| `POST /api/jobs?model=&speakers=&language=&prompt=&title=&name=&confirm_upload=` | the body is the file |
| `POST /api/jobs` with JSON `{"path": …, "model": …, …}` | a file on this computer, read in place |
| `GET /api/jobs`, `GET /api/jobs/<id>` | the list; one job with its lines (partial while it runs), its `details`, and the same as the labelled `detail_groups` the page shows |
| `PATCH /api/jobs/<id>` | `title`, `speaker_names`, `lines`, or `merge: {from, into}` |
| `POST /api/jobs/<id>/cancel`, `POST /api/jobs/<id>/rerun`, `DELETE /api/jobs/<id>` | |
| `GET /api/jobs/<id>/audio`, `GET /api/jobs/<id>/export/{txt,srt,vtt,md,json}` | `?details=0` leaves the details out of an export |

## Limits

- Local transcription runs on the CPU. An hour of audio takes roughly 20 minutes with Cohere and
  30–45 minutes with whisper-medium in performance mode, and several times longer in power-saver
  mode.
- Speaker labels on a meeting of two or three people put about 8–9% of words on the wrong person
  ([speaker labels](04-speaker-labels.md)). Use rename and merge to fix what matters.
- The transcripts are drafts. On the test meetings, the local models differ from ElevenLabs on
  44–49% of words ([results](03-results.md#real-meetings)).
- Stereo recordings are mixed down to mono, so a call recorded with one person per channel doesn't
  get labels from the channels.
