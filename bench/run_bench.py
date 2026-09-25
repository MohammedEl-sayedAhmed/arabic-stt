#!/usr/bin/env python3
"""Run one engine over a test-set manifest and save the hypotheses with timings.

Usage:
  .venv/bin/python bench/run_bench.py <set> <audio> --engine whisper|llama|cohere [--language ar|auto]
    set:   arzen | perle | mixat | meetings   (data/<set>/manifest.jsonl)
    audio: wav16k | phone             (phone = resampled through 8 kHz)

Writes results/<set>.<audio>.<model>.<language>.jsonl and skips clips already in it.
The llama engine needs bench/serve.sh running.
"""
import argparse
import json
import sys
import time
from pathlib import Path

import soundfile as sf

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from transcribe import COHERE_MODEL, ENGINES  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("set")
    ap.add_argument("audio")
    ap.add_argument("--engine", choices=list(ENGINES), required=True)
    ap.add_argument("--language", default="ar", help="ar, en or auto")
    ap.add_argument("--prompt", default="", help="style hint passed to the engine; results get a -prompt suffix")
    ap.add_argument("--port", type=int, default=8081)
    ap.add_argument("--whisper-model", default="large-v3")
    ap.add_argument("--cohere-model", default=COHERE_MODEL)
    ap.add_argument("--threads", type=int, default=10)
    ap.add_argument("--limit", type=int)
    args = ap.parse_args()

    engine = ENGINES[args.engine](args)
    config = args.language + ("-prompt" if args.prompt else "")
    out_path = ROOT / "results" / f"{args.set}.{args.audio}.{engine.name}.{config}.jsonl"
    done = {json.loads(line)["id"] for line in open(out_path)} if out_path.exists() else set()
    items = [json.loads(line) for line in open(ROOT / "data" / args.set / "manifest.jsonl")][: args.limit]
    with open(out_path, "a") as out:
        for item in items:
            if item["id"] in done:
                continue
            audio, sr = sf.read(ROOT / item[args.audio], dtype="float32")
            t0 = time.time()
            hyp = engine(audio)
            took = time.time() - t0
            out.write(json.dumps({"id": item["id"], "hyp": hyp, "seconds": round(took, 2),
                                  "audio_s": round(len(audio) / sr, 2)}, ensure_ascii=False) + "\n")
            out.flush()
            print(f"{item['id']}  {took:5.1f}s  {hyp[:90]}", flush=True)


if __name__ == "__main__":
    main()
