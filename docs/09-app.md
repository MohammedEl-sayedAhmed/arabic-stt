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

## The models and their settings

All model settings live in [`app/config.toml`](../app/config.toml). Each `[[models]]` entry has an
`id`, a `kind` (`local` or `hosted`), the engine settings and the text the app shows.

| Model | Kind | Best for | Settings |
|---|---|---|---|
| whisper-medium code-switching (default) | local | keeping English terms in English (90% on the public set, 57% on the test meetings) | `whisper_model` folder; accepts a vocabulary hint |
| Cohere Transcribe Arabic | local | Arabic-heavy meetings; the fewest Arabic-word errors; the fastest (about 0.3× real time) | `cohere_model` GGUF path |
| Whisper large-v3 + hint | local | stock Whisper (slow on this laptop) | `whisper_model = "large-v3"`; gets the Egyptian style hint, and your terms are added to it |
| ElevenLabs Scribe | hosted | minutes people rely on; the best published result for Egyptian–English | `api_model = "scribe_v2"`, `tag_audio_events`, `delete_after`, API key |
| OpenAI | hosted | keeping no copy of the audio; `gpt-transcribe` is told to expect Arabic and English | `api_model`, `diarize_model` (for speaker labels), `carry_speakers`, upload settings, API key |
| Groq Whisper large-v3 | hosted | stock Whisper with the Egyptian hint; a free plan of 8 h of audio a day | `api_model` (large-v3 or turbo), upload settings, API key |
| Mistral Voxtral | hosted | Voxtral Mini Transcribe 2, with speaker labels | `api_model`, upload settings, API key |
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

### OpenAI, Groq and Mistral

The three have OpenAI-style `/audio/transcriptions` endpoints and share one client,
`app/hosted_openai.py`. Keys come from [OpenAI](https://platform.openai.com/api-keys),
[Groq](https://console.groq.com/keys) and [Mistral](https://console.mistral.ai/api-keys), or from
`OPENAI_API_KEY`, `GROQ_API_KEY` and `MISTRAL_API_KEY` in the environment.

The upload is the recording as Opus in WebM at 32 kbps (about 14 MB an hour instead of 50 MB for the
FLAC), encoded with PyAV, whose FFmpeg has the Opus and MP3 encoders; `upload_format` can also be
`ogg`, `mp3` or `flac`. A recording longer than one request may be (`max_part_mb`, `max_part_s`) is
cut at the quietest moment of the last two minutes before the limit, each part goes in its own
request, and its times get the part's start added. A part that comes out larger than planned is cut
in two again, and stretches that never get louder than -60 dBFS aren't sent. After a 429 with a
Retry-After of a minute or less, a server error or a dropped connection, a part is sent again, five
times in all; a used-up quota fails at once. Cancel works during an upload and between parts. Unlike
ElevenLabs and Speechmatics, none of the three leaves a stored job or transcript that the app could
delete afterwards.

- **OpenAI** uses `gpt-transcribe` ($0.27/h), which takes `languages[]` (the app sends `ar` and
  `en`) and your terms as `keywords[]`. It returns text without times, as do `gpt-4o-transcribe`
  ($0.36/h) and `gpt-4o-mini-transcribe` ($0.18/h), which get the terms as `prompt`; so these are sent
  one stretch of 10 to 25 s at a time (`piece_s`), and each stretch becomes a line. That is 150 to
  360 requests an hour of audio, one after another. With speaker labels on, the app uses
  `gpt-4o-transcribe-diarize` ($0.36/h, `response_format = diarized_json`, `chunking_strategy =
  auto`), which takes no prompt and can't be told the number of people. It gets parts of up to 10
  minutes, because a Tier 1 account (the first paid one) takes 10,000 tokens a minute for this model
  and gpt-4o-transcribe; the 4o models also stop at 2,000 output tokens, and a part whose reply
  reaches that limit is sent again in halves. Each later part is sent 3 to 8 s clips of up to four voices heard so far
  (`known_speaker_names[]` and `known_speaker_references[]` as data URLs), and a voice it recognises
  keeps its number; a fifth voice, or one it doesn't match, gets a new number, so merge those in the
  transcript. `whisper-1` ($0.36/h) returns segments with times and gets the Egyptian style hint as
  for Groq (not measured with it). With `diarize_model = ""`, labels come from the voiceprints on this
  computer instead.
  There is no free tier. OpenAI doesn't train on API data, and for transcriptions it keeps no
  abuse-monitoring logs and no application state.
- **Groq** runs `whisper-large-v3` ($0.111/h; `whisper-large-v3-turbo` costs $0.04/h but is weaker
  on Arabic) with `response_format = verbose_json`, segment timestamps and `language`. The `prompt` is
  the Egyptian style hint that took local large-v3 from 47% to 34% WER on ArzEn, followed by your
  terms, cut to about 200 characters because Whisper prompts are limited to 224 tokens; with the
  language set to English the hint is left out. Segments Whisper itself marks as silence
  (`no_speech_prob` over 0.6 with `avg_logprob` under -1) are dropped. The free plan allows 20
  requests a minute, 2 h of audio an hour, 8 h a day and 25 MB per file (100 MB on the developer
  plan), so parts stay under 24 MB. Groq has no speaker labels; they come from the voiceprints on this
  computer. It keeps no request data by default, but may log requests for up to 30 days to look into
  errors or abuse.
- **Mistral** runs `voxtral-mini-2602` (Voxtral Mini Transcribe 2, $0.18/h) with
  `timestamp_granularities = segment`, `diarize` when labels are on, and up to 100 terms as
  `context_bias`. Its docs say timestamps can't be combined with `language`, so the language is always
  detected, and that context bias is tuned for English. Phrases are sent with underscores for
  spaces, as in the docs' examples (whose replies keep the underscores), and get their spaces back in
  the text. Its limits page says 60 minutes per request and its transcription FAQ about 3 hours, so
  parts are kept to 58 minutes; each part has its own speaker numbers. Mistral may use API data to
  improve its models unless *Anonymous improvement data* is switched off (*Admin*, then *Privacy*).

**Speaker labels from voiceprints.** For a model without speaker labels (Groq, or OpenAI with
`diarize_model = ""`), when labels are on and the voiceprint model is downloaded, the app runs the
voice step of the local models (TitaNet-small voiceprints, spectral clustering) before uploading. It
runs in the model process (`app/worker.py --speaker-timeline`, which prints the timeline as JSON),
and each line gets the speaker of most voiceprint windows within it, so a line that spans a change
of speaker goes to whoever talks most in it. Run once with the real model on six public Perle clips
joined together, the step took 1.3 s and gave each clip its own speaker.

**Checked on 25 September 2026** in the official docs:
[OpenAI's speech-to-text guide](https://developers.openai.com/api/docs/guides/speech-to-text), the
model pages for
[gpt-transcribe](https://developers.openai.com/api/docs/models/gpt-transcribe),
[gpt-4o-transcribe](https://developers.openai.com/api/docs/models/gpt-4o-transcribe),
[gpt-4o-mini-transcribe](https://developers.openai.com/api/docs/models/gpt-4o-mini-transcribe),
[gpt-4o-transcribe-diarize](https://developers.openai.com/api/docs/models/gpt-4o-transcribe-diarize)
and [whisper-1](https://developers.openai.com/api/docs/models/whisper-1),
[pricing](https://developers.openai.com/api/docs/pricing),
[data use](https://developers.openai.com/api/docs/guides/your-data) and
[error codes](https://developers.openai.com/api/docs/guides/error-codes). The API reference pages
didn't load for the fetch tool (platform.openai.com answered 403, and the developers.openai.com page
showed only the examples), so the parameter rules and reply fields come from the
[request](https://github.com/openai/openai-python/blob/main/src/openai/types/audio/transcription_create_params.py)
and reply types in OpenAI's Python SDK, which are generated from its API spec. Groq's
[speech-to-text](https://console.groq.com/docs/speech-to-text),
[API reference](https://console.groq.com/docs/api-reference),
[rate limits](https://console.groq.com/docs/rate-limits) and
[data](https://console.groq.com/docs/your-data) pages. Mistral's
[offline transcription](https://docs.mistral.ai/studio/audio/speech_to_text/offline_transcription)
(with its source in [platform-docs-public](https://github.com/mistralai/platform-docs-public) for the
example requests and replies), [overview](https://docs.mistral.ai/studio/audio/speech_to_text),
[API reference](https://docs.mistral.ai/api/endpoint/audio/transcriptions),
[models](https://docs.mistral.ai/getting-started/models/models_overview/),
[price](https://docs.mistral.ai/models/voxtral-mini-transcribe-26-02),
[limits](https://docs.mistral.ai/resources/known-limitations),
[free mode](https://docs.mistral.ai/getting-started/quickstarts/studio/activate-and-generate-api-key)
and [training opt-out](https://help.mistral.ai/en/articles/455207-can-i-opt-out-of-my-input-or-output-data-being-used-for-training).

**Not verified:** how long a request the 4o models take (only the 2,000 output tokens are
documented; users report about 1,400 to 1,500 s), how many tokens a minute of audio counts for
against the per-minute limit, whether the 2,000 tokens apply per chunk or per request with
`chunking_strategy = auto`, whether the diarize model takes WebM clips as known
speakers (the guide says any upload format; its example is WAV) and how well it matches them, how
many keywords gpt-transcribe takes, whether Groq trains on API data (its data page doesn't say),
which of Mistral's two length limits holds, whether it takes phrases with spaces as context bias,
its error format, whether its free mode includes Voxtral, and the OpenAI key page link (the site
couldn't be fetched). None of the three was measured on Egyptian speech here, and the clients were
tested only against local stand-ins (`tests/test_providers_openai.py`: request fields, the file sent,
parts and time offsets, speaker numbers across parts, errors 401, 413 and 429, retries, cancel, and
the voiceprint step with a stand-in model process).

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
| `app/hosted_openai.py` | the OpenAI, Groq and Mistral clients: the Opus upload, parts cut at pauses, speaker numbers across parts, labels from voiceprints |
| `app/desktop.py`, `app/selftest.py` | the desktop window and the installation check ([desktop app](10-desktop.md)) |
| `app/transcript.py` | lines from words, and the exports |
| `app/static/` | the interface (HTML, CSS and JavaScript, no build step) |
| `tests/` | unit tests: helpers, the API parsers, the HTTP API against mock services, downloads, paths, and the forced-alignment path. `RUN_MODEL_TESTS=1` also runs whisper-medium on a public clip |

Run the tests with `.venv/bin/python -m unittest discover -s tests -v`.

## API for scripts

Every change needs the header `X-Tafrigh: 1`.

| Call | What |
|---|---|
| `GET /api/status` | models (ready, or what's missing), defaults, power profile, free space |
| `POST /api/jobs?model=&speakers=&language=&prompt=&title=&name=&confirm_upload=` | the body is the file |
| `POST /api/jobs` with JSON `{"path": …, "model": …, …}` | a file on this computer, read in place |
| `GET /api/jobs`, `GET /api/jobs/<id>` | the list; one job with its lines (partial while it runs) |
| `PATCH /api/jobs/<id>` | `title`, `speaker_names`, `lines`, or `merge: {from, into}` |
| `POST /api/jobs/<id>/cancel`, `POST /api/jobs/<id>/rerun`, `DELETE /api/jobs/<id>` | |
| `GET /api/jobs/<id>/audio`, `GET /api/jobs/<id>/export/{txt,srt,vtt,md,json}` | |

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
