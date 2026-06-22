#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

model_path="${MIMEMO_LLAMA_CPP_GGUF:-models/qwen3-1.7b/Qwen3-1.7B-Q4_K_M.gguf}"
host="${MIMEMO_LLAMA_HOST:-127.0.0.1}"
port="${MIMEMO_LLAMA_PORT:-8080}"
context="${MIMEMO_LLAMA_CONTEXT:-32768}"

exec llama-server \
  -m "$model_path" \
  -c "$context" \
  --host "$host" \
  --port "$port"
