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

Each model is shown with its strengths (see below). Local ones run through
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
| Speechmatics | hosted | its Arabic–English bilingual pack (`ar_en`); doesn't train on your audio | `language`, `api_model` (enhanced or standard), `speaker_sensitivity`, `base_url` region, `delete_after`, API key |
| Google Gemini | hosted | Gemini 3.5 Transcribe, which follows Arabic–English code-switching; free tier (which trains on your audio) | `api_model`, `language_codes`, `max_minutes`, `inline_limit_mb`, `delete_after`, API key |
| Deepgram Nova-3 | hosted | fast Arabic-only transcripts (`ar-EG`); the app opts out of training | `api_model`, `language`, `diarize_model`, `mip_opt_out`, API key |
| AssemblyAI | hosted | Universal-3.5 Pro, which follows code-switching | `speech_models`, `expected_languages`, `base_url` (US or EU), `delete_after`, API key |
| Azure AI Speech | hosted | the `ar-EG` locale; Microsoft stores nothing | region (in *Settings*), `locale`, `max_speakers`, `max_minutes`, `endpoint`, API key |

The other sections are `[server]` (host and port; keep it on 127.0.0.1), `[storage]` (the data
folder, whether to keep the original, the upload limit), `[defaults]` (model, speakers, language)
and `[local]` (Python, CPU threads, voiceprint model, `performance_while_running`). Personal
overrides go in `app_data/config.toml` with the same layout, so `app/config.toml` can stay as
shipped. A `[[models]]` entry there with the same `id` changes only the fields it lists, and
`disabled = true` hides a model.

### Gemini, Deepgram, AssemblyAI and Azure Speech

These run through `app/hosted_more.py`. Their keys are entered in *Settings* like the others, or set in
`GEMINI_API_KEY`, `DEEPGRAM_API_KEY`, `ASSEMBLYAI_API_KEY` or `AZURE_SPEECH_KEY`. An Azure key works
only in the region of its Speech resource, so the Azure row in *Settings* also has a region field. The
region is saved with the key in `secrets.json`; `AZURE_SPEECH_REGION` overrides it, and `region` in the
config is the default (`westeurope`). None of the four has been measured on Egyptian speech here.

- **Gemini** ([keys](https://aistudio.google.com/apikey)) uses `gemini-3.5-transcribe` through the
  Interactions API, with `store: false` so Google doesn't keep the request. The app asks for verbatim
  text with word times and speaker labels when they are on (up to 8; three or more is experimental).
  For Arabic + English it sends no `language_codes`, so the model detects the language, which its
  guide says is how it follows code-switching. With word times one request takes at most 30 minutes, so
  longer recordings go in parts of up to 29 minutes, each cut at the quietest moment of its last two
  minutes. Speaker numbers restart in every part, so merge them in the transcript. A part too large
  for a 20 MB request is uploaded with the Files API and deleted after it is transcribed. The model
  can't combine key terms with word times, so it gets no vocabulary. With a general model in
  `api_model` (for example `gemini-3.8-flash`), the app sends instructions instead (Egyptian Arabic as
  spoken, English terms in Latin script, your terms if `prompt = true`) and a JSON schema for segments
  with start, end, speaker and text; those times come from the model and are less exact. The free
  tier costs nothing, but Google uses what you send to improve its products and human reviewers may
  read it, except for users in the EEA, Switzerland and the UK. With billing on it isn't used, and the
  price is about $0.30 an hour ($2 per million audio tokens in, $12 per million text tokens out).
- **Deepgram** ([keys](https://console.deepgram.com/)) gets the audio as the body of one request to
  `/v1/listen` with `model=nova-3`, `language=ar-EG`, `smart_format`, `utterances`, `diarize_model=latest`
  for speaker labels (`diarize=true` is deprecated), your terms as `keyterm` (up to 100) and
  `mip_opt_out=true`, which keeps the audio out of Deepgram's model training. Nova-3 has 17 Arabic
  codes, but its code-switching mode (`language=multi`) doesn't include Arabic, and with one language
  set it transcribes only that language, so English terms may come out in Arabic letters or be
  dropped. It can't detect Arabic, so auto-detect also sends `ar-EG`. There is $200 of free credit,
  then $0.0043 a minute ($0.26 an hour) with speaker labels included, and $0.0013 a minute more with
  key terms. Deepgram stores no transcripts.
- **AssemblyAI** ([dashboard](https://www.assemblyai.com/dashboard/home)) gets the audio through
  `/v2/upload`, then a transcript request with Universal-3.5 Pro (Universal-2 as the fallback),
  language detection expecting `ar` and `en` (how Universal-3.5 Pro follows switches between
  languages), `speaker_labels`, `speakers_expected` when you give the number (it is taken as exact)
  and your terms as `keyterms_prompt`. The app polls until it is done, then deletes the transcript,
  which also deletes the uploaded audio. After a cancel it deletes it at once or, if AssemblyAI
  refuses while the job runs, tries again every 30 seconds while the app is open. New accounts get
  $50 (up to 185 hours), then it costs $0.21 an hour, $0.02 more with speaker labels and $0.05 more
  with key terms. AssemblyAI may train on the audio; free accounts can't opt out, paid ones can under
  *Data controls*. Its data page says audio sent to the EU endpoint
  (`base_url = "https://api.eu.assemblyai.com"`) isn't used for training.
- **Azure AI Speech** ([portal](https://portal.azure.com/), *Keys and Endpoint* of the Speech resource)
  uses fast transcription: one multipart request to
  `https://<region>.api.cognitive.microsoft.com/speechtotext/transcriptions:transcribe?api-version=2025-10-15`
  with the key in `Ocp-Apim-Subscription-Key`, the audio, and a definition with `locales: ["ar-EG"]`,
  `diarization` (`maxSpeakers` is your number, or 10 for auto-detect; it must be 2 to 35) and
  `profanityFilterMode: "None"`. With one locale it transcribes that language, with several it picks
  one for the whole file, and its multilingual model has no Arabic, so there is no code-switching.
  Microsoft doesn't store audio or transcripts from fast transcription. It costs $0.36 an hour and
  isn't part of the free (F0) tier. The REST reference allows under 2 hours and 250 MB per request,
  while the how-to guide and the quotas page say under 5 hours and 500 MB, so the app sends parts of
  up to 115 minutes. Fast transcription runs in 22 regions, including `westeurope`, `northeurope`,
  `francecentral`, `italynorth` and `swedencentral`, but not `uaenorth` or `qatarcentral`. Phrase
  lists are off (`prompt = false`), because the language table lists them for `ar-SA` and `en-US`
  but not for `ar-EG`.

These details come from the providers' pages as they were on 25 September 2026: Gemini
[transcribe](https://ai.google.dev/gemini-api/docs/transcribe),
[Interactions API](https://ai.google.dev/gemini-api/docs/interactions) and
[reference](https://ai.google.dev/api/interactions-api), [files](https://ai.google.dev/gemini-api/docs/files),
[audio](https://ai.google.dev/gemini-api/docs/audio),
[structured output](https://ai.google.dev/gemini-api/docs/structured-output),
[models](https://ai.google.dev/gemini-api/docs/models), [pricing](https://ai.google.dev/gemini-api/docs/pricing),
[terms](https://ai.google.dev/gemini-api/terms) and [errors](https://ai.google.dev/gemini-api/docs/api-errors);
Deepgram [pre-recorded](https://developers.deepgram.com/docs/pre-recorded-audio),
[API reference](https://developers.deepgram.com/reference/speech-to-text/listen-pre-recorded),
[languages](https://developers.deepgram.com/docs/models-languages-overview),
[language detection](https://developers.deepgram.com/docs/language-detection),
[diarization](https://developers.deepgram.com/docs/diarization),
[utterances](https://developers.deepgram.com/docs/utterances),
[keyterm](https://developers.deepgram.com/docs/keyterm),
[training opt-out](https://developers.deepgram.com/docs/the-deepgram-model-improvement-partnership-program),
[errors](https://developers.deepgram.com/docs/errors) and [pricing](https://deepgram.com/pricing);
AssemblyAI [models](https://www.assemblyai.com/docs/pre-recorded-audio/select-the-speech-model),
[languages](https://www.assemblyai.com/docs/pre-recorded-audio/supported-languages),
[code switching](https://www.assemblyai.com/docs/pre-recorded-audio/code-switching),
[speaker labels](https://www.assemblyai.com/docs/pre-recorded-audio/label-speakers),
[key terms](https://www.assemblyai.com/docs/pre-recorded-audio/universal-3-5-pro/prompting), the API
reference for [upload](https://www.assemblyai.com/docs/pre-recorded-audio/api-reference/files/upload),
[submit](https://www.assemblyai.com/docs/pre-recorded-audio/api-reference/transcripts/submit) and
[delete](https://www.assemblyai.com/docs/pre-recorded-audio/api-reference/transcripts/delete),
[data and training](https://www.assemblyai.com/docs/data-retention-and-model-training),
[opt-out](https://www.assemblyai.com/docs/faq/how-to-opt-out-of-data-sharing-for-our-model-improvement-program),
[endpoints](https://www.assemblyai.com/docs/pre-recorded-audio/select-the-region),
[file limits](https://www.assemblyai.com/docs/faq/are-there-any-limits-on-file-size-or-file-duration-for-files-submitted-to-the-api),
[billing](https://www.assemblyai.com/docs/billing-and-pricing) and [pricing](https://www.assemblyai.com/pricing);
Azure [fast transcription](https://learn.microsoft.com/azure/ai-services/speech-service/fast-transcription-create),
[REST reference](https://learn.microsoft.com/rest/api/speechtotext/transcriptions/transcribe?view=rest-speechtotext-2025-10-15),
[diarization](https://learn.microsoft.com/azure/ai-services/speech-service/configure-language-identification-diarization),
[regions](https://learn.microsoft.com/azure/ai-services/speech-service/regions?tabs=stt),
[languages](https://learn.microsoft.com/azure/ai-services/speech-service/language-support?tabs=stt),
[phrase lists](https://learn.microsoft.com/azure/ai-services/speech-service/improve-accuracy-phrase-list),
[quotas](https://learn.microsoft.com/azure/ai-services/speech-service/speech-services-quotas-and-limits),
[data privacy](https://learn.microsoft.com/azure/ai-foundry/responsible-ai/speech-service/speech-to-text/data-privacy-security),
the `maxSpeakers` range in the
[SDK reference](https://learn.microsoft.com/python/api/azure-ai-transcription/azure.ai.transcription.models.transcriptiondiarizationoptions),
and the price from the [Azure Retail Prices API](https://prices.azure.com/api/retail/prices), because the
[pricing page](https://azure.microsoft.com/pricing/details/speech/) loads its prices with JavaScript. The
clients were tested against local stand-ins that follow these formats, not against the services.

Not verified: whether a Gemini language hint such as `ar-EG` would do better on code-switched speech
than detection, and what its free tier's limits are (AI Studio shows them); whether Deepgram's `keyterm`
works for Arabic (the page names Nova-3 but no languages) and what the "pricing impacts" of
`mip_opt_out` in its API reference are (the program page names none); whether AssemblyAI deletes a
transcript that is still processing, and whether a key works on its EU endpoint without changes; the
real limit per Azure request (2 or 5 hours) and how English words come out with the `ar-EG` locale.

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
| `app/hosted_more.py` | the Gemini, Deepgram, AssemblyAI and Azure Speech clients, and cutting long recordings at pauses |
| `app/downloads.py` | model downloads, resumable and checked against the pinned size and SHA-256 |
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
