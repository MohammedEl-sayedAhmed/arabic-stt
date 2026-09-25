#!/bin/sh
# Run benchmark configurations one after another, loading one model at a time.
# Each argument is model:audio:language, where model is qwen3asr | r2t2 | audar | whisper | cohere, e.g.
#   bench/run_configs.sh whisper:wav16k:ar qwen3asr:phone:ar
# Set PROMPT to pass the same style hint to every run, SET to pick the test set (default arzen),
# WHISPER_MODEL to use another faster-whisper model (name or local folder).
set -eu
cd "$(dirname "$0")/.."
PY=.venv/bin/python
PORT=8090
loaded=""

for cfg in "$@"; do
  model=${cfg%%:*}; rest=${cfg#*:}; audio=${rest%%:*}; lang=${rest#*:}
  if [ "$model" = whisper ] || [ "$model" = cohere ]; then
    pkill -x llama-server || true
    loaded=""
    if [ "$model" = whisper ]; then engine="--engine whisper --whisper-model ${WHISPER_MODEL:-large-v3}"
    else engine="--engine cohere"; fi
  else
    if [ "$loaded" != "$model" ]; then
      pkill -x llama-server || true
      sleep 2
      THREADS=8 bench/serve.sh "$model" "$PORT" > /dev/null 2>&1 &
      until curl -s "http://127.0.0.1:$PORT/health" | grep -q ok; do sleep 2; done
      loaded=$model
    fi
    engine="--engine llama --port $PORT"
  fi
  # $engine is split into words on purpose.
  if [ -n "${PROMPT:-}" ]; then
    $PY -u bench/run_bench.py "${SET:-arzen}" "$audio" $engine --language "$lang" --prompt "$PROMPT"
  else
    $PY -u bench/run_bench.py "${SET:-arzen}" "$audio" $engine --language "$lang"
  fi
done
pkill -x llama-server || true
echo "CONFIGS DONE"
