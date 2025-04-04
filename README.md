# Electron IPC vs WebSocket 通信テスト  
All code written by LLM
This survey was conducted entirely by AI, so there is no guarantee of results.  


このプロジェクトは、Electron アプリケーションにおける IPC (Inter-Process Communication) と WebSocket 通信の性能比較を目的としたテストアプリケーションです。

## 概要

Electron アプリケーションでは、レンダラープロセス（フロントエンド）とメインプロセス（バックエンド）間の通信に IPC が一般的に使用されますが、WebSocket による通信も可能です。このプロジェクトでは、両方の通信方法の性能（レイテンシー）を測定・比較します。

## テスト詳細

### 測定方法

- **メインプロセス**: `process.hrtime()` を使用して高精度な時間計測
- **レンダラープロセス**: `performance.now()` を使用して時間計測

### テストシナリオ

1. **レンダラープロセス起点の通信テスト**

   - レンダラープロセスからメインプロセスにデータを送信
   - メインプロセスからレンダラープロセスにレスポンスを返す
   - 往復時間（ラウンドトリップタイム）を計測

2. **メインプロセス起点の通信テスト**
   - メインプロセスからイベントを発行（メニューボタン操作など）
   - レンダラープロセスでイベントを受信して処理
   - メインプロセスにレスポンスを返す
   - 全体の処理時間を計測

### 通信方式

#### IPC 通信

Electron の標準的な通信方式である IPC を使用したテスト。

#### WebSocket 通信

- メインプロセスに WebSocket サーバーを実装
- レンダラープロセスから WebSocket クライアントとして接続
- 同様のデータ通信テストを実施

※ WebSocket 機能はフラグによってオン/オフ可能  
メニューの toggle を押すこで WSserver を起動できます

## UI 構成

テストアプリケーションの UI は以下の要素で構成されています：

1. **結果表示ウィンドウ**

   - 各通信プロセスの詳細な時間計測結果を表示

2. **レンダラー起点テストボタン**

   - レンダラーからメインプロセスへのデータ送信と応答時間計測を開始

3. **メインプロセス起点テストボタン**
   - メインプロセスからのイベント発行による処理時間計測を開始

## プロジェクト設定

このプロジェクトは Electron Forge を使用して初期化されています。

## 開発環境の準備

```bash
# 依存パッケージのインストール
npm install

# 開発サーバーの起動
npm start

# アプリケーションのビルド
npm run make
```

## 技術スタック

- Electron
- TypeScript
- WebSocket (ws)

## 結果サンプル

<img width="816" alt="スクリーンショット 2025-03-29 18 28 19" src="https://github.com/user-attachments/assets/359e2a23-96e6-4dbe-9bd5-8a72ca0c2c3d" />  
<img width="847" alt="スクリーンショット 2025-03-29 18 22 40" src="https://github.com/user-attachments/assets/f5ec16b4-452c-4717-819c-9265f6cfdc7f" />


