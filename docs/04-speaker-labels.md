# 4. Speaker labels ("Speaker 1", "Speaker 2", …)

None of the speech-to-text models tested here label speakers, so speaker separation
(*diarization*) is a separate step that runs locally: `speakers.py`.

## How it works now (voice-based)

1. **Find speech.** Silero VAD marks where anyone is talking.
2. **Voiceprints.** A 1.5-second window slides over the speech every 0.75 s. For each window,
   WeSpeaker (ResNet34, trained on VoxCeleb) produces a 256-number *voiceprint* (speaker embedding)
   that captures timbre and pitch — what a voice sounds like, not what it says.
3. **Group by voice.** Spectral clustering (NME-SC, Park et al. 2019) groups all voiceprints into
   N speakers. The neighbour count is tuned automatically per recording, so a handful of odd
   windows (noise, crosstalk, laughter) cannot become a "speaker" of their own. N comes from
   `--speakers N`; `--speakers 0` estimates it from the eigengap (less reliable on phone audio).
4. **Smooth.** A 3-window majority filter removes single-window flips.
5. **Attribute words.** Whisper returns a timestamp for every word; each word goes to the speaker
   whose voice is active at that moment, and consecutive words of one speaker form a line. Models
   without word timestamps (Qwen3-ASR family, Cohere) are transcribed one speaker turn at a time.

Everything runs on the CPU with two small ONNX-based pieces (sherpa-onnx + a 26 MB voiceprint
model) — no PyTorch, no account, no upload. About 10 s for a 2-minute clip.

## What was tried first, and why it was replaced

| Version | Result on the 2-min call (2 speakers) | Problem |
|---|---|---|
| sherpa-onnx built-in pipeline, auto speaker count | 4 speakers: 69 s, 49 s, 5 s, 2 s | invented two tiny "speakers" |
| same, forced to 2 speakers | **111 s vs 14 s** | merged both real voices into Speaker 1; Speaker 2 was 3 fragments, and Whisper invented text for them |
| **voiceprints + spectral clustering (current)** | **57 s vs 44 s**, turns alternate | see limits below |

The forced-2 failure is a known weakness of agglomerative clustering: when a few outlier segments
are further from everyone than the two real voices are from each other, the two voices merge first.

## Output format

```
[mm:ss-mm:ss] Speaker 1: …
[mm:ss-mm:ss] Speaker 2: …
```

On the 2-minute test call the lines alternate the way a conversation does: short questions,
long explanations, one-word acknowledgements and echoes land on the other speaker. (The call's
transcripts stay local in `results/poc/` and are not part of this repository.)

## Limits (measured or known)

- **No ground truth.** Nobody has marked who really speaks when in your recordings, so the speaker
  accuracy is judged by reading (questions and answers alternate; a repeated word lands on the
  other speaker). The person who was on the call is the best judge.
- **The two voices sound alike to the model:** the average voiceprints of the two speakers have a
  cosine similarity of 0.90 (1.0 = identical). Phone audio and similar voices make this hard.
- **Boundaries are accurate to ~0.75 s**, so a word at a hand-over can land on the wrong side.
- **Overlapping speech** goes to one speaker only.

## Known upgrades (from the research)

- **TitaNet voiceprints** (NVIDIA; trained on telephone speech) instead of VoxCeleb WeSpeaker — a
  drop-in model swap in sherpa-onnx.
- **pyannote `speaker-diarization-community-1`** with `num_speakers=2` (26.7% DER on CALLHOME, no
  collar) — needs PyTorch (CPU build ~184 MB) and a free Hugging Face token.
- **NVIDIA Sortformer v2.1** (5.68% DER on 2-speaker CALLHOME, 0.25 s collar) via NeMo-Speech.cpp —
  cannot be forced to 2 speakers.
- Hosted: ElevenLabs Scribe has diarization built in (best speaker-attributed error on CallHome in
  a third-party test); pyannoteAI offers a free trial month.
