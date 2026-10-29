# 開発者向けガイド (Developer Guide)

Quest Qlub の開発環境構築、開発フロー、コーディング規約、およびデプロイ手順についてのガイドです。

---

## 前提条件

- **Node.js**: `>= 22.12.0`
- **pnpm**: `>= 10.0.0`
- **Vite+ (`vp`)**: 本プロジェクトは統合ツールチェーン Vite+ を採用しています

---

## セットアップ

### 1. リポジトリのクローン

```bash
git clone https://github.com/Quest-Qlub-org/quest-qlub.git
cd quest-qlub
```

### 2. 依存関係のインストール

Vite+ の CLI (`vp`) または `pnpm` を使用します：

```bash
vp install
# または
pnpm install
```

### 3. 環境変数の設定（環境分離）

当プロジェクトでは、**本番データと開発データの混在・汚染を防ぐため、開発・テスト・本番環境を厳密に分離**しています。

1. **ローカル開発環境 (`vp dev`)**:
   `apps/website/.env.example` をコピーして `apps/website/.env.development.local` を作成し、**開発用**の Supabase 接続情報を設定します：

   ```bash
   cp apps/website/.env.example apps/website/.env.development.local
   ```

   ```env
   VITE_SUPABASE_URL=https://your-dev-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-dev-anon-key
   ```

   > [!WARNING]
   > 本番用 Supabase プロジェクトの接続情報をローカル環境に設定しないでください。
   > ローカル開発サーバー起動時、本番DBへの接続が検出された場合は画面上に警告バナーが表示されます。

2. **自動テスト環境 (`vp test`)**:
   `apps/website/.env.test`（リポジトリ同梱）が自動的に適用されるため、設定作業は不要です。外部の実データベースへは一切通信しません。

3. **本番環境 (Vercel)**:
   Vercel ダッシュボードの「Settings」>「Environment Variables」にて本番用接続情報を設定します。

### 4. 開発サーバーの起動

```bash
vp dev
# または
pnpm run dev
```

ローカルサーバーが起動し、ブラウザから `http://localhost:5173` 等でアクセスできます。

---

## 開発コマンド・品質チェック

Vite+ (`vp`) の統合コマンドを使用して、フォーマット、静的解析、型チェック、テストを実行します。

| コマンド               | 説明                                                     |
| ---------------------- | -------------------------------------------------------- |
| `vp dev`               | 開発サーバーの起動                                       |
| `vp check`             | コード整形 (Oxfmt) および静的解析 (Oxlint) の実行        |
| `vp check --fix`       | フォーマットと自動修正可能なリントエラーの修正           |
| `vp test`              | Vitest によるユニットテストの実行                        |
| `vp run website#build` | TypeScript 型チェック (`tsc`) およびプロダクションビルド |
| `pnpm run ready`       | `vp check` + 全テスト + 全パッケージビルドの一括実行     |

---

## 開発フローとブランチ運用

本リポジトリの `main` ブランチには保護ルールが設定されています。新機能開発や不具合修正は以下の手順で行います。

1. `main` ブランチを最新化：
   ```bash
   git checkout main
   git pull origin main
   ```
2. 作業用ブランチを作成：
   ```bash
   git checkout -b feat/your-feature-name
   ```
3. コードを編集し、チェック・テストを実行：
   ```bash
   vp check
   vp test
   vp run website#build
   ```
4. コミットしてプッシュ：
   ```bash
   git add -A
   git commit -m "feat: 機能の概要"
   git push -u origin feat/your-feature-name
   ```
   _※コミット時に `pre-commit` フックが走り、ステージされたファイルのフォーマットと検証が自動実行されます。_
5. GitHub上でプルリクエストを作成し、レビュー後にマージします。

---

## デプロイ

- **本番環境**: `main` ブランチへのマージ / プッシュによって Vercel に自動デプロイされます。
- **デプロイ設定**:
  - `vercel.json` は `apps/website/vercel.json` に配置されており、SPAリライトやCSP/HSTSなどのセキュリティヘッダーが定義されています。
  - Vercelダッシュボードの「Environment Variables」に `VITE_SUPABASE_URL` と `VITE_SUPABASE_ANON_KEY` を登録する必要があります。

---

## URL設計

| URL                      | 画面名                                | 対象ロール         | 概要                                                  |
| ------------------------ | ------------------------------------- | ------------------ | ----------------------------------------------------- |
| `/`                      | ホーム (`home`)                       | 全員               | トップページ、新着・人気・おすすめ記事                |
| `/search`                | 検索 (`search`)                       | 全員               | キーワード検索・タグ絞り込み                          |
| `/writers`               | ライター一覧 (`writers`)              | 全員               | 編集長・ライター一覧                                  |
| `/writers/:username`     | ライター詳細 (`profile`)              | 全員               | ライタープロフィール、Xアカウントリンク、執筆記事一覧 |
| `/articles/:id`          | 記事詳細 (`article`)                  | 全員               | 記事本文、いいね、SNSシェア                           |
| `/favorites`             | お気に入り (`favorites`)              | ログイン読者以上   | お気に入り記事一覧                                    |
| `/settings`              | 設定 (`settings`)                     | 全員               | アカウント設定、Xアカウント連携、文字サイズ変更       |
| `/about`                 | サービス紹介 (`about`)                | 全員               | Quest Qlubの概要とメンバー紹介                        |
| `/privacy`               | プライバシーポリシー (`privacy`)      | 全員               | プライバシーポリシー                                  |
| `/terms`                 | 利用規約 (`terms`)                    | 全員               | 利用規約                                              |
| `/contact`               | お問い合わせ (`contact`)              | 全員               | 運営へのお問い合わせフォーム                          |
| `/login`                 | ログイン (`login`)                    | 未ログイン         | メール・パスワードログイン                            |
| `/register`              | 新規登録 (`register`)                 | 未ログイン         | 読者アカウント新規登録                                |
| `/forgot-password`       | パスワード再設定 (`forgotPassword`)   | 未ログイン         | 再設定メール送信申請                                  |
| `/reset-password`        | パスワード再設定 (`resetPassword`)    | 未ログイン         | 新しいパスワードの設定                                |
| `/writer-dash`           | ライターダッシュボード (`writerDash`) | `writer`, `editor` | 自身の記事一覧・ステータス確認                        |
| `/writer-dash/new`       | 記事新規作成 (`writerNew`)            | `writer`, `editor` | Tiptapエディターによる記事執筆                        |
| `/writer-dash/edit/:id`  | 記事編集 (`writerEdit`)               | `writer`, `editor` | 執筆済み記事の編集                                    |
| `/writer-dash/series`    | 連載管理 (`writerSeries`)             | `writer`, `editor` | 連載の新規作成・記事紐付け                            |
| `/editor-dash`           | 編集長ダッシュボード (`editorDash`)   | `editor`           | 編集長専用トップ                                      |
| `/editor-dash/articles`  | 全記事管理 (`editorArticles`)         | `editor`           | 記事の審査・承認（公開）・削除                        |
| `/editor-dash/recommend` | おすすめ管理 (`editorRecommend`)      | `editor`           | おすすめ記事・人気記事の選定                          |
| `/editor-dash/writers`   | ライター管理 (`editorWriters`)        | `editor`           | ユーザーのロール昇格・管理                            |

---

## ユーザーロールと権限

| ロール   | 権限概要                                                                         |
| -------- | -------------------------------------------------------------------------------- |
| `guest`  | 未ログインユーザー。記事の閲覧・検索、お問い合わせが可能。                       |
| `viewer` | ログイン済み読者。お気に入り機能が利用可能。                                     |
| `writer` | 認証済みライター。記事の作成・編集・下書き保存・投稿申請、連載の管理が可能。     |
| `editor` | 編集長。全記事の審査・承認（公開）・削除、おすすめ設定、ライター権限昇格が可能。 |

### ロール変更方法

開発・管理時のロール変更は Supabase SQL Editor で実行します：

```sql
UPDATE public.profiles SET role = 'editor' WHERE email = '対象メールアドレス';
```

---

## 注意事項

- **コード規約とファイル分割**: 画面は `src/views/`、管理系は `src/views/dashboard/`、共通コンポーネントは `src/components/` に適切に配置してください。
- **コミット前フック**: `vite-plus` のフックにより、コミット時に自動で `vp check --fix` が走ります。ビルドエラーが発生した場合はエラー箇所を修正してから再度コミットしてください。
- **セキュリティ方針**: 記事HTMLのレンダリングには必ず `utils/sanitize.ts`（DOMPurify）を通し、XSSを防止してください。
