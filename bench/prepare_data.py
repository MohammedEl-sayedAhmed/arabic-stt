#!/usr/bin/env python3
"""Build the test sets as 16 kHz mono WAV files plus JSONL manifests.

mixat: a fixed random sample of Arabic-English code-switched clips from the
Mixat test split (Emirati Arabic), with reference transcripts. Each clip also
gets a "phone" copy, resampled to 8 kHz and back, to match the bandwidth of
the local recordings.

meetings: 2-minute excerpts of the local recordings in audio-test/, split at
pauses into chunks of at most 25 s. They have no reference transcripts and
never leave this machine.

Every prepared file ends with 0.5 s of silence (R2T2 drops trailing words
without it) so all models get identical input.

arzen: Egyptian Arabic-English code-switched clips from the ArzEn validation
split, the closest public match to the local recordings' dialect.

Usage: .venv/bin/python bench/prepare_data.py [mixat] [arzen] [perle] [meetings]
"""
import json
import random
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

import numpy as np
import soundfile as sf
from faster_whisper import decode_audio
from faster_whisper.vad import VadOptions, get_speech_timestamps

ROOT = Path(__file__).resolve().parent.parent
MIXAT = ROOT / "data" / "mixat"
MEETINGS = ROOT / "data" / "meetings"
SR = 16000
N_CLIPS = 60
SEED = 42
TAIL = np.zeros(SR // 2, dtype=np.float32)
# Hugging Face datasets: (repo, split, cached row index under data/, fields kept per row or None to skip)
DATASETS = {
    "mixat": ("sqrk/mixat-tri", "test", "mixat/test_meta.json",
              lambda r: {"language": r["language"], "duration_ms": r["duration_ms"], "transcript": r["transcript"]}),
    "arzen": ("ahmedsamirtarjama/MBZUAI_ArzEn_wav", "validation", "arzen_val_meta.json",
              lambda r: {"text": r["text"]}),
    "perle": ("Perle-ai/ASR_Code_Switch", "train", "perle_egyptian_meta.json",
              lambda r: {"text": r["transcript"]} if r["language_pair"] == "Egyptian Arabic–English" else None),
}

# (file, excerpt start in seconds or None to pick the 2-minute window with the most speech)
RECORDINGS = [
    ("record1_test_2min.wav", 0),
    ("record2.wav", None),
    ("rec3.wav", None),
]
EXCERPT_S = 120
MAX_CHUNK_S = 25


def ffmpeg(src, dst, filters):
    subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-i", str(src), "-ac", "1",
                    "-af", filters, "-ar", str(SR), "-c:a", "pcm_s16le", str(dst)], check=True)


def pad_tail(path):
    audio, sr = sf.read(path, dtype="float32")
    sf.write(path, np.concatenate([audio, TAIL]), sr, subtype="PCM_16")


def rows_api(name, offset, length):
    repo, split = DATASETS[name][:2]
    url = (f"https://datasets-server.huggingface.co/rows?dataset={repo}&config=default&split={split}"
           f"&offset={offset}&length={length}")
    with urllib.request.urlopen(url, timeout=60) as r:
        return json.load(r)


def audio_src(row):
    audio = row["audio"]
    return (audio[0] if isinstance(audio, list) else audio)["src"]


def load_index(name):
    """Rows of a test set (text + audio URL), fetched from the Hugging Face rows API once and cached."""
    path = ROOT / "data" / DATASETS[name][2]
    if not path.exists():
        keep, rows, offset = DATASETS[name][3], [], 0
        while True:
            page = rows_api(name, offset, 100)
            for x in page["rows"]:
                fields = keep(x["row"])
                if fields is not None:
                    rows.append({"idx": x["row_idx"], **fields, "audio_src": audio_src(x["row"])})
            offset += 100
            if offset >= page["num_rows_total"]:
                break
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(rows, ensure_ascii=False, indent=1))
    return json.loads(path.read_text())


def fetch_clip(name, row, dst):
    try:
        urllib.request.urlretrieve(row["audio_src"], dst)
    except Exception:  # signed asset URLs expire; ask the rows API for a fresh one
        urllib.request.urlretrieve(audio_src(rows_api(name, row["idx"], 1)["rows"][0]["row"]), dst)


def prepare_mixat():
    rows = load_index("mixat")
    pool = [r for r in rows if r["language"] == "CS" and 3000 <= r["duration_ms"] <= 30000]
    sample = sorted(random.Random(SEED).sample(pool, N_CLIPS), key=lambda r: r["idx"])
    for d in ("raw", "wav16k", "phone"):
        (MIXAT / d).mkdir(exist_ok=True)
    with open(MIXAT / "manifest.jsonl", "w") as out:
        for r in sample:
            cid = f"mixat{r['idx']:04d}"
            raw = MIXAT / "raw" / f"{cid}.wav"
            if not raw.exists():
                fetch_clip("mixat", r, raw)
            for d, filters in (("wav16k", "aresample=16000"), ("phone", "aresample=8000,aresample=16000")):
                dst = MIXAT / d / f"{cid}.wav"
                if not dst.exists():
                    ffmpeg(raw, dst, filters)
                    pad_tail(dst)
            out.write(json.dumps({"id": cid, "duration": r["duration_ms"] / 1000,
                                  "wav16k": str((MIXAT / "wav16k" / f"{cid}.wav").relative_to(ROOT)),
                                  "phone": str((MIXAT / "phone" / f"{cid}.wav").relative_to(ROOT)),
                                  "reference": r["transcript"]}, ensure_ascii=False) + "\n")
    total = sum(r["duration_ms"] for r in sample) / 60000
    print(f"mixat: {len(sample)} clips, {total:.1f} min")


def prepare_arzen(n_clips=40, name="arzen"):
    """Egyptian Arabic-English code-switched clips from the ArzEn validation split."""
    out_dir = ROOT / "data" / name
    for d in ("raw", "wav16k", "phone"):
        (out_dir / d).mkdir(parents=True, exist_ok=True)
    rows = load_index(name)
    mixed = [r for r in rows if re.search(r"[A-Za-z]", r["text"]) and re.search(r"[؀-ۿ]", r["text"])]
    kept = []
    for r in random.Random(SEED).sample(mixed, min(len(mixed), 3 * n_clips)):
        cid = f"{name}{r['idx']:04d}"
        raw = out_dir / "raw" / f"{cid}.wav"
        if not raw.exists():
            fetch_clip(name, r, raw)
        duration = sf.info(raw).duration
        if 3 <= duration <= 25:
            kept.append((cid, raw, duration, r["text"]))
        if len(kept) == n_clips:
            break
    with open(out_dir / "manifest.jsonl", "w") as out:
        for cid, raw, duration, text in sorted(kept):
            for d, filters in (("wav16k", "aresample=16000"), ("phone", "aresample=8000,aresample=16000")):
                dst = out_dir / d / f"{cid}.wav"
                if not dst.exists():
                    ffmpeg(raw, dst, filters)
                    pad_tail(dst)
            out.write(json.dumps({"id": cid, "duration": round(duration, 2),
                                  "wav16k": str((out_dir / "wav16k" / f"{cid}.wav").relative_to(ROOT)),
                                  "phone": str((out_dir / "phone" / f"{cid}.wav").relative_to(ROOT)),
                                  "reference": text}, ensure_ascii=False) + "\n")
    print(f"{name}: {len(kept)} clips, {sum(k[2] for k in kept) / 60:.1f} min")


def prepare_perle(n_clips=40):
    """Egyptian Arabic-English rows of Perle-ai/ASR_Code_Switch: tech and work sentences."""
    prepare_arzen(n_clips, name="perle")


def speech_windows(speech, n_samples, excerpt, step):
    """Yield (start, speech_seconds) for each candidate excerpt window."""
    mask = np.zeros(n_samples, dtype=bool)
    for s in speech:
        mask[s["start"]:s["end"]] = True
    for start in range(60 * SR, n_samples - excerpt, step):
        yield start, mask[start:start + excerpt].sum() / SR


def chunk_speech(speech, max_len):
    """Merge consecutive VAD segments into chunks no longer than max_len samples."""
    chunks = []
    for s in speech:
        if chunks and s["end"] - chunks[-1][0] <= max_len:
            chunks[-1][1] = s["end"]
        else:
            chunks.append([s["start"], s["end"]])
    return chunks


def prepare_meetings():
    MEETINGS.mkdir(exist_ok=True)
    vad = VadOptions(min_silence_duration_ms=500, speech_pad_ms=200, max_speech_duration_s=MAX_CHUNK_S)
    excerpt = EXCERPT_S * SR
    with open(MEETINGS / "manifest.jsonl", "w") as out:
        for name, start_s in RECORDINGS:
            audio = decode_audio(str(ROOT / "audio-test" / name), sampling_rate=SR)
            if start_s is None:
                speech = get_speech_timestamps(audio, vad)
                start, _ = max(speech_windows(speech, len(audio), excerpt, 30 * SR), key=lambda w: w[1])
            else:
                start = int(start_s * SR)
            clip = audio[start:start + excerpt]
            speech = get_speech_timestamps(clip, vad)
            stem = Path(name).stem
            chunks = chunk_speech(speech, MAX_CHUNK_S * SR)
            for i, (a, b) in enumerate(chunks):
                path = MEETINGS / f"{stem}_{i:02d}.wav"
                sf.write(path, np.concatenate([clip[a:b], TAIL]), SR, subtype="PCM_16")
                out.write(json.dumps({"id": f"{stem}_{i:02d}", "source": name,
                                      "start": round((start + a) / SR, 2), "end": round((start + b) / SR, 2),
                                      "wav16k": str(path.relative_to(ROOT))}) + "\n")
            voiced = sum(s["end"] - s["start"] for s in speech) / SR
            print(f"{name}: excerpt {start / SR:.0f}-{start / SR + EXCERPT_S:.0f} s, "
                  f"{voiced:.0f} s of speech, {len(chunks)} chunks")


if __name__ == "__main__":
    steps = {"mixat": prepare_mixat, "arzen": prepare_arzen, "perle": prepare_perle, "meetings": prepare_meetings}
    for name in sys.argv[1:] or steps:
        steps[name]()
