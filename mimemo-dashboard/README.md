# mimemo Dashboard

mimemo のWebダッシュボードです。音声アップロード、ブラウザ録音、文字起こし・要約結果の表示、会議ライブラリの閲覧を担当します。

プロジェクト全体の起動手順は [../README.md](../README.md) を参照してください。

## セットアップ

```bash
npm install
cp .env.example .env.local
```

`.env.local` でAPIの接続先を設定します。

```dotenv
NEXT_PUBLIC_MIMEMO_API_BASE_URL=http://127.0.0.1:8000
```

## 起動

```bash
npm run dev
```

ブラウザで `http://localhost:3000` を開きます。

## 主な機能

- WAV / MP3 の音声アップロード
- 「このPCで録音」「Google Meetで録音」からのブラウザ録音
- APIの `/minutes` への音声送信
- 処理進捗の表示
- 文字起こし、要約、TODO、決定事項、議事録本文の表示
- `localStorage` を使った会議ライブラリ保存
- 会議詳細画面の表示

## 開発チェック

```bash
npm run typecheck
npm run build
```
