# mimemo AI API

mimemo の音声処理APIです。音声ファイルを受け取り、文字起こし、チャンク要約、統合要約を行い、議事録JSONを返します。

```text
WAV / MP3
-> ffmpegで16kHz mono WAV化
-> STT
-> チャンク分割
-> 部分要約
-> 統合要約
-> 議事録JSON
```

プロジェクト全体の環境構築、APIとダッシュボードの起動手順、画面上の操作フローは [../README.md](../README.md) を参照してください。

## 推奨構成

PC/Mac向けのMVP構成です。

- STT: `faster-whisper` の `small` または `medium`
- STT compute type: CPUなら `int8`
- LLM: `llama.cpp` server + 4bit GGUF
- 現在の設定例: `Qwen3-1.7B-Q4_K_M.gguf`
- 要約方式: 長い全文を一度に投入せず、チャンク要約から統合要約へ進める

## 主な環境変数

`mimemo-api/.env.example` をコピーして `mimemo-api/.env` を作成します。

```dotenv
MIMEMO_STT_BACKEND=faster-whisper
MIMEMO_LANGUAGE=ja
MIMEMO_FFMPEG_BINARY=ffmpeg

MIMEMO_FASTER_WHISPER_MODEL=models/faster-whisper-small
MIMEMO_FASTER_WHISPER_DEVICE=cpu
MIMEMO_FASTER_WHISPER_COMPUTE_TYPE=int8

MIMEMO_LLM_BACKEND=llama.cpp
MIMEMO_LLAMA_CPP_BASE_URL=http://127.0.0.1:18080/v1
MIMEMO_LLAMA_CPP_MODEL=qwen3-1.7b-q4
MIMEMO_LLAMA_CPP_GGUF=models/qwen3-1.7b/Qwen3-1.7B-Q4_K_M.gguf
MIMEMO_LLAMA_CONTEXT=32768
MIMEMO_LLAMA_HOST=127.0.0.1
MIMEMO_LLAMA_PORT=18080

MIMEMO_MAX_CHUNK_CHARS=6000
MIMEMO_WORK_DIR=/tmp/mimemo-ai
MIMEMO_CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

`whisper.cpp` を使う場合は、STT backendとモデルパスを切り替えます。

```dotenv
MIMEMO_STT_BACKEND=whisper.cpp
MIMEMO_WHISPER_CPP_BINARY=/path/to/whisper-cli
MIMEMO_WHISPER_CPP_MODEL=models/ggml-small-q5_1.bin
```

## APIエンドポイント

APIのベースURLは通常 `http://127.0.0.1:8000` です。

```text
GET  /health      ヘルスチェック
POST /minutes     音声から文字起こしと要約を生成
POST /transcribe  音声から文字起こしのみ生成
POST /summarize   文字起こし済みsegmentsから要約を生成
```

### ヘルスチェック

```bash
curl http://127.0.0.1:8000/health
```

### 音声から議事録を生成

対応音声は WAV / MP3 です。

```bash
curl -X POST http://127.0.0.1:8000/minutes \
  -F "file=@meeting.wav"
```

### 音声から文字起こしのみ生成

```bash
curl -X POST http://127.0.0.1:8000/transcribe \
  -F "file=@meeting.mp3"
```

### 文字起こし済みデータから要約

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

APIと同じパイプラインをCLIから実行できます。

```bash
mimemo-ai transcribe meeting.wav
mimemo-ai minutes meeting.wav
mimemo-ai summarize transcript.json
```

## テスト

```bash
python -m unittest discover -s tests
```

## 出力JSON

`/minutes` と `mimemo-ai minutes` は、次のようなJSONを返します。

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

通常のMVP実行には不要です。ColabやGPUは、複数STTモデルの一括ベンチ、Qwen3-ASRの検証、独自データでのLoRA/QLoRA微調整に使います。手順は [docs/colab_gpu_eval.md](docs/colab_gpu_eval.md) にまとめています。
