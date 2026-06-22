# mimemo

mimemo は、音声ファイルまたはブラウザ録音から日本語の文字起こしと議事録要約を作るローカル実行向けのアプリです。

```text
音声取り込み
-> APIへアップロード
-> ffmpegで16kHz mono WAVへ変換
-> STTで文字起こし
-> LLMで要約
-> ダッシュボードに表示
-> 会議ライブラリへ保存
```

## ディレクトリ構成

```text
.
├── mimemo-api/        # FastAPI + STT/LLM パイプライン
└── mimemo-dashboard/  # Next.js ダッシュボード
```

詳細なAPI仕様やCLIは [mimemo-api/README.md](mimemo-api/README.md) も参照してください。

## 必要なもの

- Python 3.11 以上
- Node.js / npm
- `ffmpeg`
- 実AIで要約する場合は `llama-server` と GGUF モデル
- 実AIで文字起こしする場合は `faster-whisper` 用モデル、または `whisper.cpp` 用モデル

macOS では `ffmpeg` を Homebrew で入れられます。

```bash
brew install ffmpeg
```

`.env`、`.venv`、`node_modules`、`.next`、`models` は git 管理外です。秘密情報やモデルファイルはコミットしないでください。

## 最短起動: モデルなしで動作確認

まず画面とAPI接続だけ確認したい場合は、STT/LLMをモックで起動します。モデルのダウンロードは不要です。

### 1. APIを起動

```bash
cd mimemo-api
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[api]"
cp .env.example .env
MIMEMO_STT_BACKEND=mock MIMEMO_LLM_BACKEND=mock .venv/bin/uvicorn mimemo_ai.api:app --host 127.0.0.1 --port 8000
```

別ターミナルでヘルスチェックします。

```bash
curl http://127.0.0.1:8000/health
```

### 2. ダッシュボードを起動

```bash
cd mimemo-dashboard
npm install
cp .env.example .env.local
npm run dev
```

ブラウザで `http://localhost:3000` を開きます。

`mimemo-dashboard/.env.local` の `NEXT_PUBLIC_MIMEMO_API_BASE_URL` が `http://127.0.0.1:8000` になっていれば、ダッシュボードはローカルAPIへ接続します。

## 実AIで動かす

実際に文字起こしと要約を行う場合は、API側にSTTとLLMの実行環境を用意します。

### 1. API依存関係を入れる

```bash
cd mimemo-api
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[api,faster-whisper]"
cp .env.example .env
```

### 2. モデルを配置する

`.env.example` の初期値では、次の場所を参照します。

```text
mimemo-api/models/faster-whisper-small
mimemo-api/models/qwen3-1.7b/Qwen3-1.7B-Q4_K_M.gguf
```

別の場所に置く場合は `mimemo-api/.env` を編集してください。

```dotenv
MIMEMO_FASTER_WHISPER_MODEL=models/faster-whisper-small
MIMEMO_LLAMA_CPP_GGUF=models/qwen3-1.7b/Qwen3-1.7B-Q4_K_M.gguf
MIMEMO_LLAMA_CPP_BASE_URL=http://127.0.0.1:18080/v1
MIMEMO_LLAMA_HOST=127.0.0.1
MIMEMO_LLAMA_PORT=18080
```

### 3. llama.cpp serverを起動

`llama-server` がPATH上にある状態で、別ターミナルから起動します。

```bash
cd mimemo-api
./scripts/start_llama_server.sh
```

### 4. APIを起動

```bash
cd mimemo-api
source .venv/bin/activate
.venv/bin/uvicorn mimemo_ai.api:app --host 127.0.0.1 --port 8000
```

### 5. ダッシュボードを起動

```bash
cd mimemo-dashboard
npm install
cp .env.example .env.local
npm run dev
```

`http://localhost:3000` を開きます。

## 画面での動作フロー

1. 右上の「音声を追加」からWAV/MP3をアップロードします。
2. 「新規会議」から「このPCで録音」または「Google Meetで録音」を選ぶこともできます。
3. ブラウザ録音はWAVに変換され、アップロード音声と同じ `/minutes` の処理フローに入ります。
4. ダッシュボードの「音声取り込み」には、アップロード後の処理進捗が表示されます。
5. APIが文字起こし、要約、TODO、決定事項、議事録本文を生成します。
6. 結果はダッシュボードに表示され、会議ライブラリへ保存されます。
7. 会議ライブラリの「開く」から、保存済み会議の詳細画面を確認できます。

Google Meetで録音する場合は、ブラウザの画面共有またはタブ共有で音声共有を有効にしてください。この機能はGoogle Meet API連携ではなく、ブラウザの録音機能を使います。

## 対応音声と保存

- アップロード/API入力: WAV、MP3
- ブラウザ録音: 録音後にWAVへ変換してAPIへ送信
- 保存先: ブラウザの `localStorage`
- 保存キー: `mimemo:meetings`
- 保存内容: 文字起こし、要約、TODO、議事録などの処理結果

生の音声ファイルは会議ライブラリには保存していません。

## APIエンドポイント

APIのベースURLは通常 `http://127.0.0.1:8000` です。

```text
GET  /health      ヘルスチェック
POST /minutes     音声から文字起こしと要約を生成
POST /transcribe  音声から文字起こしのみ生成
POST /summarize   文字起こし済みsegmentsから要約を生成
```

音声から議事録を作る例:

```bash
curl -X POST http://127.0.0.1:8000/minutes \
  -F "file=@meeting.wav"
```

## 開発チェック

API:

```bash
cd mimemo-api
source .venv/bin/activate
python -m unittest discover -s tests
```

ダッシュボード:

```bash
cd mimemo-dashboard
npm run typecheck
npm run build
```

## よくあるトラブル

### `http://localhost:3000` が起動しない

`mimemo-dashboard/package.json` の `dev` は `next dev --webpack` です。次で起動してください。

```bash
cd mimemo-dashboard
npm run dev
```

すでに3000番ポートが使われている場合、Next.jsが別ポートを案内します。そのURLを開いてください。

### ダッシュボードからAPIへ接続できない

APIが `127.0.0.1:8000` で起動しているか確認してください。

```bash
curl http://127.0.0.1:8000/health
```

ダッシュボード側は `mimemo-dashboard/.env.local` を確認します。

```dotenv
NEXT_PUBLIC_MIMEMO_API_BASE_URL=http://127.0.0.1:8000
```

API側のCORS許可元は `mimemo-api/.env` の `MIMEMO_CORS_ORIGINS` で変更できます。

### `ffmpeg` の変換で失敗する

`ffmpeg` がインストールされているか確認してください。

```bash
ffmpeg -version
```

### LLMへ接続できない

実AIモードでは `llama-server` が必要です。未起動の場合は、`mimemo-api` で次を実行します。

```bash
./scripts/start_llama_server.sh
```

モデルなしで疎通確認だけしたい場合は、APIをモックで起動してください。

```bash
MIMEMO_STT_BACKEND=mock MIMEMO_LLM_BACKEND=mock .venv/bin/uvicorn mimemo_ai.api:app --host 127.0.0.1 --port 8000
```

### ブラウザ録音が始まらない

`localhost` またはHTTPSで開き、マイク権限を許可してください。Google Meet録音では、共有対象のタブや画面で音声共有を有効にしてください。
