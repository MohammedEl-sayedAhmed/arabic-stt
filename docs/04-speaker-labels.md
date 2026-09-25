# 4. Speaker labels ("Speaker 1", "Speaker 2", …)

None of the speech-to-text models tested here label speakers, so speaker separation
(*diarization*) is a separate step that runs locally: `speakers.py`.

## How it works (voice-based)

1. **Find speech.** Silero VAD marks where anyone is talking.
2. **Voiceprints.** A 1.5-second window slides over the speech every 0.75 s (a longer step on very
   long recordings, so there are at most 2000 windows; if many short turns still exceed that, an
   evenly spaced subset is clustered and every other window joins the nearest speaker). For each
   window a speaker-embedding model — default **NVIDIA TitaNet-small** (40 MB, trained with
   telephone speech among others) — produces a *voiceprint* that captures timbre and pitch: what a
   voice sounds like, not what it says.
3. **Group by voice.** Spectral clustering (NME-SC, Park et al. 2019) groups the voiceprints into N
   speakers. The neighbour count is tuned automatically per recording, so a handful of odd windows
   (noise, crosstalk, laughter) cannot become a "speaker" of their own. N comes from `--speakers N`;
   `--speakers 0` estimates it from the eigengap.
4. **Smooth.** Inside each speech segment, a window whose two neighbours agree with each other takes
   their speaker.
5. **Attribute the text.**
   - **Whisper** returns a timestamp for every word; each word goes to the speaker whose voice is
     active at that moment, and consecutive words of one speaker form a line.
   - **Cohere and the Qwen3-ASR family** have no word timestamps. Every pause-delimited chunk of
     speech is cut at the points where the voice timeline changes speaker (snapped to the quietest
     20 ms within ±0.3 s; pieces under 0.3 s join a neighbour), and each piece is transcribed and
     labelled. All speech is transcribed.

Everything runs on the CPU with sherpa-onnx and a small ONNX voiceprint model — no PyTorch, no
account, no upload. Speaker labels add a few seconds: about 2–3 s on the 2-minute test call
(whisper-medium 68.4 s → 70.8 s); with TitaNet-small the voiceprints take 4–8 s per 10-minute
excerpt, plus the clustering. `--voiceprint-model` swaps in another model.

## What was tried, and what went wrong

| Version | Result | Problem |
|---|---|---|
| sherpa-onnx built-in pipeline, auto speaker count | test call: 4 speakers (69 s, 49 s, 5 s, 2 s) | invented two tiny "speakers" |
| same, forced to 2 speakers | **111 s vs 14 s** | merged both real voices into Speaker 1; Whisper invented text for the fragments left for Speaker 2 |
| voiceprints + spectral clustering, first version | 57 s vs 44 s, turns alternate | **the code review found a bug**: for Cohere/llama engines the speaker turns covered only the middle 0.75 s of each window, so 13–30% of the speech (up to ~46% on long calls, where the window step grows) was never transcribed. It also switched smoothing off on long recordings and mis-reported talk time |
| fixed version, WeSpeaker ResNet34 voiceprints | 58 s vs 44 s on the test call; every sample of speech reaches the model | 25.7% of words credited to the wrong person on the meeting excerpts |
| **current version: TitaNet-small voiceprints** | | **11.7%** wrong on the meeting excerpts; speaker count estimated right in 5 of 6 |

The forced-2 failure is a known weakness of agglomerative clustering: when a few outlier segments
are further from everyone than the two real voices are from each other, the two voices merge first.

## Accuracy on your meetings

Measured on the six 10-minute meeting excerpts (2–5 people each; see
[results](03-results.md#your-meetings)) as **WDER**: the share of words credited to the wrong person,
after aligning our words to the hand-corrected ElevenLabs reference and matching our Speaker 1/2/… to
the real people in the way that agrees best. `bench/compare_voiceprints.py` re-labels the *same*
Whisper words with each voiceprint model, so only the speaker step differs.

| Voiceprint model | Size | Wrong speaker, true count given | Wrong speaker, count estimated (`--speakers 0`) | Count estimated right |
|---|---|---|---|---|
| **TitaNet-small** (default) | 40 MB | **11.7%** | **10.2%** | **5 of 6** |
| 3D-Speaker CAM++ (zh+en) | 28 MB | 11.7% | 10.9% | 4 of 6 |
| TitaNet-large | 101 MB | 12.2% | 10.0% | 5 of 6 |
| WeSpeaker ResNet34 (first default) | 26 MB | 25.7% | 22.9% | 2 of 6 |
| WeSpeaker ResNet152 | 79 MB | 36.9% | 29.9% | 3 of 6 |

Per excerpt with TitaNet-small (true count given): 4.6% (2 people), 7.8%, 10.4%, 2.6% (3 people each),
16.5% (2 people), 38.4% (5 people).

For comparison, **ElevenLabs' own raw labels** differ from your corrections on 6.5% of the words on
the same stretches (5.9% over the five 2–3-person excerpts, where TitaNet-small gets 9.0%) — a
comparison that favours ElevenLabs, since the corrections started from its labels. So with TitaNet
the local labels come within a few points of ElevenLabs on 2–3-person meetings, and remain weak on
larger meetings.

The two voiceprint families trained on VoxCeleb (celebrity interviews) do worst; the models trained
with telephone and large multi-speaker data (TitaNet, 3D-Speaker) do best — as the research predicted.
With TitaNet the estimate missed only on the 5-person excerpt. There it found fewer speakers than
were present (2 of 5 with TitaNet-small, 3 with TitaNet-large) and still scored better than
clustering into the true 5 (21.6% vs 38.4%, and 16.0% vs 41.0%), so on larger meetings
`--speakers 0` is a reasonable choice even when you know the headcount. The other models also
missed on 2–3-person excerpts, and not always by finding too few: CAM++ found 3 speakers for 2
people on one excerpt and scored worse (19.0% vs 17.0% with the true count).

## Output format

```
[mm:ss-mm:ss] Speaker 1: …
[mm:ss-mm:ss] Speaker 2: …
```

With Whisper, `<name>.whisper-….speakers.words.json` also has every word with its start, end and
speaker, so speaker models can be compared without transcribing again (`bench/compare_voiceprints.py`).

## Limits

- **Boundaries are accurate to ~0.75 s** (one window step), so a word at a hand-over can land on the
  wrong side.
- **Overlapping speech** goes to one speaker only.
- **Similar voices on one channel are hard**: on the 2-minute test call the two speakers' average
  WeSpeaker voiceprints have a cosine similarity of 0.90 (1.0 = identical). TitaNet-small's are at
  0.48, though scores from different models are not directly comparable.
- **Larger meetings are hard**: 38% of words were misattributed on the 5-person excerpt even with
  TitaNet.
- The reference speaker labels used for scoring were corrected by hand from ElevenLabs output and are
  themselves imperfect, especially for short interjections.

## Known upgrades (from the research, not tested here)

- **pyannote `speaker-diarization-community-1`** with `num_speakers` — 26.7% DER on CALLHOME (no
  collar); needs PyTorch (CPU build ~184 MB) and a free Hugging Face token.
- **NVIDIA Sortformer v2.1** — 5.68% DER on 2-speaker CALLHOME (0.25 s collar) via NeMo-Speech.cpp;
  cannot be forced to a speaker count.
- Hosted: ElevenLabs Scribe has diarization built in; pyannoteAI offers a free trial month.
