#!/bin/sh
# Run the ArzEn benchmark for each model and language setting, one model at a time
# so the timings don't compete for the CPU. Finished clips are skipped, so it resumes.
# Usage: bench/run_all.sh [wav16k|phone ...]
set -eu
cd "$(dirname "$0")/.."
PY=.venv/bin/python
PORT=8090
[ $# -eq 0 ] && set -- wav16k

for audio in "$@"; do
  for model in qwen3asr r2t2; do
    pkill -x llama-server || true
    sleep 2
    THREADS=8 bench/serve.sh "$model" "$PORT" > /dev/null 2>&1 &
    until curl -s "http://127.0.0.1:$PORT/health" | grep -q ok; do sleep 2; done
    for lang in ar auto; do
      $PY -u bench/run_bench.py arzen "$audio" --engine llama --port "$PORT" --language "$lang"
    done
  done
  pkill -x llama-server || true
  $PY -u bench/run_bench.py arzen "$audio" --engine whisper --language ar
done
echo "BENCHMARK DONE"
