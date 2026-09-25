#!/usr/bin/env python3
"""Proof of concept: transcribe a meeting recording entirely on this machine.

The audio is split at pauses (Silero VAD) into chunks of at most 25 s, each
chunk is transcribed by the chosen engine, and the transcript is printed and
saved with timestamps to results/poc/.

With --speakers, speakers are told apart by voice (see speakers.py: a
voiceprint every 0.75 s, grouped by spectral clustering) and each line is
labelled Speaker 1, Speaker 2, ... in order of first appearance. Whisper
gives word timestamps, so every word gets the speaker whose voice is active
at that moment; the llama and cohere engines have no word timestamps and are
transcribed one speaker turn at a time.

Engines:
  whisper  Whisper through faster-whisper (int8 on CPU): the code-switching fine-tune
           whisper-medium-arabic-codeswitched by default, or --whisper-model large-v3
  llama    a Qwen3-ASR-family GGUF (R2T2, base Qwen3-ASR, Audar-ASR) served by
           llama-server on 127.0.0.1: bench/serve.sh r2t2|qwen3asr|audar 8081
  cohere   Cohere Transcribe Arabic (GGUF) run in process by transcribe.cpp

Usage:
  .venv/bin/python transcribe.py audio-test/record1_test_2min.wav
  .venv/bin/python transcribe.py meeting.wav --speakers 2
  .venv/bin/python transcribe.py meeting.wav --engine llama --port 8081
"""
import argparse
import base64
import io
import json
import re
import resource
import sys
import time
from pathlib import Path

import numpy as np
import requests
import soundfile as sf
from faster_whisper import WhisperModel, decode_audio
from faster_whisper.vad import VadOptions, get_speech_timestamps

import speakers

SR = 16000
MAX_CHUNK_S = 25
MAX_LINE_S = 30
TAIL = np.zeros(SR // 2, dtype=np.float32)  # R2T2 drops the last words without trailing silence
LANGUAGE_NAMES = {"ar": "Arabic", "en": "English"}
# An Egyptian sentence with English terms in Latin script. As Whisper large-v3's initial prompt it
# keeps Whisper in dialect (instead of rewriting into formal Arabic) and writes English terms in
# English: WER 47% -> 34% on ArzEn, 40% -> 22% on Perle. The code-switching fine-tune doesn't need it.
STYLE_PROMPT = "يعني احنا كنا بنتكلم عن ال project بتاعنا و ال deadline و ال meeting اللي جاي مع ال team."
MODELS = Path(__file__).resolve().parent / "models"
COHERE_MODEL = str(MODELS / "cohere-transcribe-arabic-07-2026-gguf" / "cohere-transcribe-arabic-07-2026-Q4_K_M.gguf")
# Best local model on the Perle clips and the test call; falls back to large-v3 if not downloaded.
WHISPER_CS = MODELS / "whisper-medium-arabic-codeswitched-ct2"
DEFAULT_WHISPER = str(WHISPER_CS) if WHISPER_CS.exists() else "large-v3"


def split_at_pauses(audio):
    """Return [start, end] sample ranges: VAD speech segments merged up to MAX_CHUNK_S."""
    vad = VadOptions(min_silence_duration_ms=500, speech_pad_ms=200, max_speech_duration_s=MAX_CHUNK_S)
    chunks = []
    for s in get_speech_timestamps(audio, vad):
        if chunks and s["end"] - chunks[-1][0] <= MAX_CHUNK_S * SR:
            chunks[-1][1] = s["end"]
        else:
            chunks.append([s["start"], s["end"]])
    return chunks


def snap_to_pause(audio, t, radius=int(0.3 * SR), frame=SR // 50):
    """Move sample index t to the quietest 20 ms frame within +-radius."""
    lo, hi = max(0, t - radius), min(len(audio), t + radius)
    if hi - lo < 2 * frame:
        return t
    energy = [float(np.mean(audio[k:k + frame] ** 2)) for k in range(lo, hi - frame + 1, frame)]
    return lo + int(np.argmin(energy)) * frame + frame // 2


def speaker_pieces(audio, a, b, timeline, min_len=int(0.3 * SR)):
    """Split chunk [a, b) where the speaker changes; pieces shorter than min_len join a neighbour."""
    cuts = sorted({min(max(snap_to_pause(audio, int(t * SR)), a + 1), b - 1) for t in timeline.changes(a / SR, b / SR)})
    pieces = []
    for x, y in zip([a] + cuts, cuts + [b]):
        if pieces and (y - x < min_len or pieces[-1][1] - pieces[-1][0] < min_len):
            pieces[-1][1] = y
        else:
            pieces.append([x, y])
    return pieces


def speaker_lines(engine, audio, timeline, on_chunk=None):
    """Transcribe and attribute the text to speakers. Engines with word timestamps (Whisper)
    get each word labelled with the voice active at that moment; the others transcribe each
    pause-delimited chunk in pieces cut where the speaker changes, so no speech is skipped.
    Returns (lines, words); words is [start, end, word, speaker] per word, or [] for engines
    without word timestamps. on_chunk(i, n, lines) is called after every chunk."""
    lines, words = [], []

    def add(start, end, speaker, text):
        last = lines[-1] if lines else None
        if last and last["speaker"] == speaker and start - last["end"] < 1.5 and end - last["start"] < MAX_LINE_S:
            last["end"], last["text"] = round(end, 2), f"{last['text']} {text}"
        else:
            lines.append({"start": round(start, 2), "end": round(end, 2), "speaker": speaker, "text": text})

    chunks = split_at_pauses(audio)
    for i, (a, b) in enumerate(chunks, 1):
        if hasattr(engine, "words"):
            for ws, we, word in engine.words(np.concatenate([audio[a:b], TAIL])):
                s, e = a / SR + ws, a / SR + we
                speaker = timeline.speaker_at((s + e) / 2)
                add(s, e, speaker, word)
                words.append([round(s, 2), round(e, 2), word, speaker])
        else:
            for x, y in speaker_pieces(audio, a, b, timeline):
                text = engine(np.concatenate([audio[x:y], TAIL]))
                if text:
                    add(x / SR, y / SR, timeline.speaker_at((x + y) / 2 / SR), text)
        if on_chunk:
            on_chunk(i, len(chunks), lines)
    return lines, words


class Whisper:
    def __init__(self, args):
        self.name = "whisper-" + Path(args.whisper_model).name
        self.model = WhisperModel(args.whisper_model, device="cpu", compute_type="int8",
                                  cpu_threads=args.threads, local_files_only=True)
        self.language = None if args.language == "auto" else args.language
        default_prompt = STYLE_PROMPT if Path(args.whisper_model).name == "large-v3" else None
        self.prompt = default_prompt if args.prompt is None else (args.prompt or None)

    def __call__(self, audio):
        return " ".join(w for _, _, w in self.words(audio))

    def words(self, audio):
        """(start, end, word) with times in seconds from the start of `audio` (under 30 s,
        ending with the TAIL silence)."""
        segments, _ = self.model.transcribe(audio, language=self.language, beam_size=5, initial_prompt=self.prompt,
                                            condition_on_previous_text=False, without_timestamps=True,
                                            word_timestamps=True)
        # Keep only the first decoding window. With word timestamps faster-whisper would go on to
        # decode from the last word's end; on a chunk under 30 s that remainder is silence, where
        # Whisper invents "شكراً لكم". Not advancing the generator also skips that extra work.
        s = next(iter(segments), None)
        words = [(w.start, w.end, w.word.strip()) for w in (s.words or [])] if s is not None and s.seek == 0 else []
        words = [w for w in words if w[2]]
        # Whisper sometimes stops early and skips the end of a chunk; transcribe what's left.
        # Only recurse when that makes progress (the remainder starts well after the beginning).
        speech_end = len(audio) / SR - len(TAIL) / SR
        if words and words[-1][1] > 0.5 and speech_end - words[-1][1] > 2:
            start = words[-1][1] - 0.2
            words += [(a + start, b + start, w) for a, b, w in self.words(audio[int(start * SR):])]
        return words


class Llama:
    """Qwen3-ASR-family model behind llama-server's OpenAI-compatible chat API."""

    def __init__(self, args):
        base = f"http://127.0.0.1:{args.port}"
        self.name = Path(requests.get(f"{base}/props", timeout=10).json()["model_path"]).stem
        self.url = f"{base}/v1/chat/completions"
        # "language X<asr_text>" as the start of the reply forces the language; omit it to auto-detect.
        lang = LANGUAGE_NAMES.get(args.language, args.language)
        self.prefix = "" if args.language == "auto" else f"language {lang}<asr_text>"
        self.context = args.prompt or ""  # Qwen3-ASR reads the system turn as context

    def __call__(self, audio):
        wav = io.BytesIO()
        sf.write(wav, audio, SR, format="WAV", subtype="PCM_16")
        content = [{"type": "input_audio",
                    "input_audio": {"data": base64.b64encode(wav.getvalue()).decode(), "format": "wav"}}]
        # Same layout as the official Qwen3-ASR prompt: a system turn with the context, then the audio.
        messages = [{"role": "system", "content": self.context}, {"role": "user", "content": content}]
        if self.prefix:
            messages.append({"role": "assistant", "content": self.prefix})
        r = requests.post(self.url, json={"messages": messages, "temperature": 0, "max_tokens": 512},
                          timeout=600)
        r.raise_for_status()
        text = r.json()["choices"][0]["message"]["content"].removeprefix(self.prefix)
        return re.sub(r"^\s*language\s+\S+?\s*<asr_text>", "", text).strip()


class Cohere:
    """Cohere Transcribe Arabic GGUF run in process by transcribe.cpp (no word timestamps)."""

    def __init__(self, args):
        import transcribe_cpp

        path = Path(args.cohere_model)
        self.name = path.stem
        self.model = transcribe_cpp.Model(path, backend="cpu")
        self.session = self.model.session(n_threads=args.threads)
        self.language = "ar" if args.language == "auto" else args.language

    def __call__(self, audio):
        import transcribe_cpp

        try:
            text = self.session.run(np.asarray(audio, dtype=np.float32), language=self.language).text
        except transcribe_cpp.errors.OutputTruncated as e:
            # The decoder hit its length cap, usually stuck repeating itself. Transcribe the halves
            # separately; if the audio is already short, keep what it said before the loop.
            if len(audio) > 4 * SR:
                cut = quietest_point(audio)
                return f"{self(audio[:cut])} {self(audio[cut:])}".strip()
            partial = getattr(e, "partial_result", None)
            text = trim_loop(partial.text if partial else "")
        # On hesitant phone speech it adds notes such as (تأتأة) "stutter" or (غير مفهوم) "unclear".
        return re.sub(r"\s*\([^()]*\)", "", text).strip()


def quietest_point(audio, frame=SR // 10):
    """Sample index of the quietest 100 ms frame in the middle third of `audio`."""
    lo, hi = len(audio) // 3 // frame, 2 * len(audio) // 3 // frame
    energy = [float(np.mean(audio[i * frame:(i + 1) * frame] ** 2)) for i in range(lo, hi)]
    return (lo + int(np.argmin(energy))) * frame


def trim_loop(text, max_n=8, min_repeats=3):
    """Cut a trailing loop: an n-gram repeated min_repeats+ times at the end is kept once."""
    words = text.split()
    for n in range(1, max_n + 1):
        gram, k = words[-n:], 1
        while len(words) >= n * (k + 1) and words[-n * (k + 1):-n * k] == gram:
            k += 1
        if k >= min_repeats:
            return " ".join(words[:len(words) - n * (k - 1)])
    return text


ENGINES = {"whisper": Whisper, "llama": Llama, "cohere": Cohere}


def stamp(seconds):
    s = int(seconds)
    return f"{s // 60:02d}:{s % 60:02d}"


def line(x):
    who = "" if x["speaker"] is None else f"Speaker {x['speaker']}: "
    return f"[{stamp(x['start'])}-{stamp(x['end'])}] {who}{x['text']}"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("audio")
    ap.add_argument("--engine", choices=list(ENGINES), default="whisper")
    ap.add_argument("--language", default="ar", help="ar, en or auto (default: ar)")
    ap.add_argument("--prompt", help="style/vocabulary hint: Whisper's initial prompt (default for large-v3: "
                                     "an Egyptian code-switched sentence; '' for none) or Qwen3-ASR's context")
    ap.add_argument("--port", type=int, default=8081, help="llama-server port")
    ap.add_argument("--whisper-model", default=DEFAULT_WHISPER,
                    help="faster-whisper model name or local CTranslate2 folder (default: the "
                         "Arabic-English code-switching fine-tune if downloaded, else large-v3)")
    ap.add_argument("--cohere-model", default=COHERE_MODEL, help="Cohere Transcribe GGUF for --engine cohere")
    ap.add_argument("--speakers", type=int, metavar="N",
                    help="label speakers: the number of speakers, or 0 to estimate it")
    ap.add_argument("--voiceprint-model", default=str(speakers.MODEL),
                    help="speaker-embedding ONNX model for --speakers (default: WeSpeaker ResNet34)")
    ap.add_argument("--out", default=str(Path(__file__).resolve().parent / "results" / "poc"),
                    help="output folder (default: results/poc)")
    ap.add_argument("--threads", type=int, default=10)
    args = ap.parse_args()
    if args.speakers is not None and args.speakers < 0:
        ap.error("--speakers must be 0 (estimate) or the number of speakers")
    if args.engine == "cohere" and args.prompt:
        print("note: --prompt has no effect with --engine cohere", file=sys.stderr)

    audio = decode_audio(args.audio, sampling_rate=SR)
    if not len(audio):
        sys.exit(f"{args.audio}: no audio")
    engine = ENGINES[args.engine](args)
    print(f"{args.audio}: {len(audio) / SR / 60:.1f} min, engine {engine.name}\n")
    t0 = time.time()
    timeline = None
    if args.speakers is not None:
        timeline = speakers.diarize(audio, args.speakers or None, min(args.threads, 4), args.voiceprint_model)
        if not len(timeline.centers):
            print("not enough speech for voiceprints; transcribing without speaker labels", flush=True)
            timeline = None
        else:
            talk, sims = timeline.summary()
            print("voices: " + ", ".join(f"Speaker {s} talks {t:.0f} s" for s, t in talk.items())
                  + f" (voiceprint similarity between speakers: {', '.join(f'{x:.2f}' for x in sims) or '-'})",
                  flush=True)

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    stem = f"{Path(args.audio).stem}.{engine.name}" + ("" if timeline is None else ".speakers")

    def save(lines, words=()):
        (out / f"{stem}.txt").write_text("".join(line(x) + "\n" for x in lines))
        (out / f"{stem}.json").write_text(json.dumps(lines, ensure_ascii=False, indent=1))
        if words:  # word-level timings, so speaker models can be compared without re-transcribing
            (out / f"{stem}.words.json").write_text(json.dumps(words, ensure_ascii=False))

    def progress(i, n, lines):
        save(lines)  # a crash or kill hours in keeps everything transcribed so far
        print(f"  chunk {i}/{n} ({time.time() - t0:.0f} s)", flush=True)

    lines, words = [], []
    if timeline is None:
        chunks = split_at_pauses(audio)
        for i, (a, b) in enumerate(chunks, 1):
            text = engine(np.concatenate([audio[a:b], TAIL]))
            if text:
                lines.append({"start": round(a / SR, 2), "end": round(b / SR, 2), "speaker": None, "text": text})
                print(line(lines[-1]), flush=True)
            if i % 10 == 0:
                save(lines)
    else:
        lines, words = speaker_lines(engine, audio, timeline, progress)
        print()
        for x in lines:
            print(line(x))
    took = time.time() - t0
    save(lines, words)
    (out / f"{stem}.meta.json").write_text(json.dumps({
        "audio": str(args.audio), "audio_s": round(len(audio) / SR, 2), "engine": engine.name,
        "language": args.language, "prompt": getattr(engine, "prompt", None) or getattr(engine, "context", None),
        "speakers": args.speakers, "voiceprint_model": Path(args.voiceprint_model).name if timeline else None,
        "seconds": round(took, 1), "rtf": round(took / (len(audio) / SR), 3),
        "peak_rss_mb": round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024),
    }, ensure_ascii=False, indent=1))
    print(f"\n{took:.0f} s to transcribe {len(audio) / SR:.0f} s of audio "
          f"({took / (len(audio) / SR):.2f}x real time). Saved {out / stem}.txt")


if __name__ == "__main__":
    main()
