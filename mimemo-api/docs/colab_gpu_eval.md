# Colab/GPU検証手順

MVPはローカルCPU/Metalで始められます。Colab GPUは、モデル比較と将来の微調整用です。

## 1. STTベンチ

```bash
pip install faster-whisper jiwer
```

評価対象:

- `small`, `medium`, `large-v3`, `large-v3-turbo`
- `compute_type=float16` on GPU
- `compute_type=int8_float16` on GPU
- `compute_type=int8` on CPU

見る指標:

- 実時間比
- メモリ使用量
- 固有名詞の誤り
- 日本語句読点の自然さ
- 議事録の決定事項/TODO抽出への影響

## 2. Qwen3-ASRなど大型ASRの検証

Qwen3-ASR系はCUDA前提のサンプルが多く、スマホやSBCの第一候補にはしにくいです。ただし精度比較の上限値としてColab GPUで試す価値があります。

検証では、最終的にエッジで動かす候補と同じ音声セットを使います。

## 3. LLM要約ベンチ

同じ文字起こしJSONに対して、以下を比較します。

- Qwen3 1.7B / 4B
- Gemma E2B / E4B
- Llama 3.2 1B / 3B

評価観点:

- 根拠がない決定事項を追加していないか
- TODOの担当・期限を勝手に補完していないか
- JSONスキーマを守るか
- 長い会議で重複や矛盾が増えないか

## 4. 微調整が必要になる条件

最初からファインチューニングは不要です。次の問題がプロンプトと後処理で解消しない場合だけ検討します。

- 毎回同じ議事録フォーマットに失敗する
- 業界特有のTODO/決定事項の判定を外す
- 社内用語補正だけでは専門用語を扱えない

微調整する場合は、まず要約LLMだけをLoRA/QLoRAで試します。STTは学習よりも、用語辞書・後処理・マイク品質改善のほうが先です。
