# mimemo AI API

エッジ端末で動かす日本語議事録AIパイプラインです。MVPでは、STTとLLMを分けて差し替え可能にしています。

```text
音声ファイル
-> ffmpegで16kHz mono WAV化
-> STT
-> チャンク分割
-> 部分要約
-> 統合要約
-> 議事録JSON
```

## 推奨MVP構成

PC/Mac向けの最初の構成です。

- STT: `faster-whisper` の `small` or `medium`、CPUなら `int8`
- LLM: `llama.cpp` server + `Qwen3-4B-Instruct` または `Gemma` 系の4bit GGUF
- 要約方式: 1時間全文を一発投入せず、チャンク要約から統合要約へ進める

スマホ/小型SBCは次段階にし、STTは `whisper.cpp`、`sherpa-onnx`、ReazonSpeech系、LLMは1B〜2B級またはOS提供モデルを検証します。

## セットアップ

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[api,faster-whisper]"
cp .env.example .env
```

`ffmpeg` が必要です。

```bash
brew install ffmpeg
```

## llama.cpp serverを起動

GGUFモデルを `models/` に配置し、別ターミナルで起動します。

```bash
scripts/start_llama_server.sh
```

環境変数例:

```bash
export MIMEMO_LLM_BACKEND=llama.cpp
export MIMEMO_LLAMA_CPP_BASE_URL=http://127.0.0.1:18080/v1
export MIMEMO_LLAMA_CPP_MODEL=qwen3-1.7b-q4
export MIMEMO_LLAMA_CPP_GGUF=models/qwen3-1.7b/Qwen3-1.7B-Q4_K_M.gguf
```

## API起動

```bash
uvicorn mimemo_ai.api:app --host 127.0.0.1 --port 8000
```

ヘルスチェック:

```bash
curl http://127.0.0.1:8000/health
```

対応音声は WAV / MP3 です。

音声から議事録:

```bash
curl -X POST http://127.0.0.1:8000/minutes \
  -F "file=@meeting.wav"
```

## ダッシュボード接続

ダッシュボードは `NEXT_PUBLIC_MIMEMO_API_BASE_URL` の `/minutes` に音声ファイルをアップロードします。

```bash
cd ../mimemo-dashboard
cp .env.example .env.local
npm run dev
```

APIのCORS許可元は `MIMEMO_CORS_ORIGINS` で変更できます。

文字起こし済みデータから要約:

```bash
curl -X POST http://127.0.0.1:8000/summarize \
  -H "Content-Type: application/json" \
  -d '{
    "segments": [
      {"start": 0, "end": 8, "speaker": "unknown", "text": "来週までに見積もりを確認します。"}
    ]
  }'
```

## CLI

```bash
mimemo-ai transcribe meeting.wav
mimemo-ai minutes meeting.wav
mimemo-ai summarize transcript.json
```

## whisper.cppを使う場合

```bash
export MIMEMO_STT_BACKEND=whisper.cpp
export MIMEMO_WHISPER_CPP_BINARY=/path/to/whisper-cli
export MIMEMO_WHISPER_CPP_MODEL=models/ggml-small-q5_1.bin
```

## 開発用モック

モデルなしでAPIの疎通確認をする場合:

```bash
export MIMEMO_STT_BACKEND=mock
export MIMEMO_LLM_BACKEND=mock
uvicorn mimemo_ai.api:app --host 127.0.0.1 --port 8000
```

## テスト

コアロジックは標準ライブラリだけで検証できます。

```bash
python -m unittest discover -s tests
```

## 出力JSON

```json
{
  "overview": "会議概要",
  "decisions": [
    {"text": "決定事項", "evidence": ["00:12:34"]}
  ],
  "todos": [
    {"task": "TODO", "owner": null, "due": null, "evidence": ["00:15:20"]}
  ],
  "topics": ["論点"],
  "open_questions": ["未決事項"],
  "unclear": ["聞き取り不明・要確認"],
  "transcript": [],
  "chunk_count": 1
}
```

## Colab/GPUが必要な場合

MVP実行だけなら不要です。ColabやGPUは、複数STTモデルの一括ベンチ、Qwen3-ASRの検証、独自データでのLoRA/QLoRA微調整に使います。手順は [docs/colab_gpu_eval.md](docs/colab_gpu_eval.md) にまとめています。
