# Quest Qlub — AI エージェント開発ガイドライン (AGENTS.md)

このドキュメントは、本リポジトリで作業するすべての AI アシスタントおよび自律コーディングエージェント（Google Antigravity, Cursor, GitHub Copilot, Claude Code 等）に向けた開発規範・ルールブックです。
作業を開始する前に必ず本ドキュメントを一読し、以下の規則を厳守してください。

---

## 1. プロジェクト基本情報 & ブランド

- **サービス名称**: **Quest Qlub**（※旧名称: SHARE Quest。ブランド改名済みのため、新規UIやコードでは Quest Qlub を使用すること）
- **コンセプト**: 学びの「楽しい！」をつなげる記事プラットフォーム
- **本番URL**: [https://quest-qlub.vercel.app/](https://quest-qlub.vercel.app/)
- **リポジトリ構成**: pnpm ワークスペースによるモノレポ
  - `apps/website/`: メインWebアプリケーション（React 18 + TypeScript + Tailwind CSS）
  - `supabase/`: データベース定義、マイグレーション、Edge Functions (Deno)
  - `docs/`: 運用ドキュメント・ランブック（`schema-drift.md`, `EMERGENCY_MFA_RESET.md` 等）

---

## 2. ツールチェーン & コマンド実行ルール

本プロジェクトは統合ツールチェーン **Vite+ (`vp`)** を採用しています。
環境によっては `vp` コマンドがグローバル PATH に直接配置されていない場合があるため、**`pnpm exec vp <command>`** または `package.json` のスクリプトを使用してください。

### 必須の検証フロー（作業完了前に必ず実行）

コード変更を行った際は、完了を宣言する前に必ず以下のコマンドを実行し、エラーや警告がゼロであることを確認してください：

```bash
# 1. コード整形 (Oxfmt) & 静的解析 (Oxlint) の検証
pnpm exec vp check

# 2. 自動フォーマット・自動修正が必要な場合
pnpm exec vp check --fix

# 3. ユニットテストの実行（全テストが PASS すること）
pnpm exec vp test

# 4. TypeScript 型チェック & プロダクションビルド検証
pnpm --filter website run build

# または全検証の一括実行
pnpm run ready
```

---

## 3. 環境分離 & 安全性原則（最重要ルール）

> [!CAUTION]
> **本番データベースへの直接変更の禁止**
> 本番用 Supabase プロジェクト（`uksgnlfnxytqljrctiqg`）の接続情報をローカル環境で更新・削除等に利用してはなりません。

- **ローカル開発**: `apps/website/.env.development.local` に開発用 Supabase の接続情報を設定して行います。本番DB接続が検出された場合は画面上部に警告バナー（`EnvironmentBanner`）が表示されます。
- **ユニットテスト**: `apps/website/src/supabase.ts` の `isTest` により、自動テスト実行時は実DBへの通信が完全に遮断され、テスト用モックが適用されます。実DBへ通信するようなテストコードを書かないでください。
- **マイグレーション**: データベースの変更は必ず `supabase/migrations/` に新規 SQL ファイルとして記録してください。既存のマイグレーション履歴やドリフト状況は必ず `docs/schema-drift.md` を参照してください。

---

## 4. アーキテクチャ & ディレクトリ責務

フロントエンド（`apps/website/src/`）は関心の分離に基づきモジュール化されています：

```text
apps/website/src/
├── views/             # 画面ビュー（HomeView, ArticleView, SearchView 等）
│   ├── auth/          # 認証関連画面（LoginView, RegisterView, ResetPassword 等）
│   ├── dashboard/     # ライター・編集長専用画面（WriterDashboard, EditorDashboard 等）
│   └── settings/      # 設定セクション分割コンポーネント
├── components/        # 再利用可能な共通UIコンポーネント
│   ├── navigation/    # ヘッダー・モバイルナビゲーション
│   ├── icons/         # 画像アイコン・ブランドロゴ
│   └── layout/        # アプリ全体共通レイアウト（AppLayout）
├── context/           # グローバル状態管理
│   ├── AuthContext.tsx# ユーザー認証・ロール・セッション復元
│   ├── DataContext.tsx# 記事・ライター・連載・お気に入りの取得・更新
│   ├── UIContext.tsx  # トースト通知・フォントサイズ設定
│   └── AppContext.tsx # 上記を集約した Facade（useApp フック）
├── hooks/             # カスタム React フック（useFollows, useFocusTrap 等）
├── utils/             # 純粋関数ユーティリティ（sanitize, validation, antiSpam 等）
├── types/             # 共通型定義（Article, Profile, Series 等）
└── test/              # テスト共通基盤（test-utils.tsx）
```

### 設計・コーディングの指針

- **状態管理 (State Management)**:
  - コンポーネント間でのバケツリレー（Props Drilling）を避け、各画面は `useApp()` フック（または分割された `useAuth()`, `useData()`, `useUI()`）からグローバル状態を取得・更新してください。
- **画面遷移 (Navigation)**:
  - `react-router-dom` を採用しています。画面遷移には `useApp().navigate(viewName, param)` または標準の `useNavigate()` を使用してください。
- **ユーザーロール**:
  - `guest`（未ログイン） / `viewer`（一般読者） / `writer`（ライター） / `editor`（編集長）の4段階です。
  - ルートのアクセス制限は `components/RoleRoute.tsx` で制御されます。

---

## 5. セキュリティ規範

- **XSS の防止**:
  - 記事本文など動的な HTML をブラウザにレンダリングする際は、**必ず `utils/sanitize.ts` の `sanitizeHtml`（DOMPurify 許可リスト）を通してください**。サニタイズを経由しない `dangerouslySetInnerHTML` は禁止です。
- **ロール権限の改ざん防止**:
  - `profiles.role` 列はクライアント（`authenticated` ロール）からの直接 UPDATE 権限が DB レベルで剥奪されています。ロールの変更は必ず Supabase の管理用 RPC 関数（`admin_change_user_role` 等）経由で行ってください。
- **お問い合わせスパム・レート制限**:
  - お問い合わせ機能（`ContactView` / Edge Function / DBトリガー）にはレート制限と多層防御が組み込まれています。

---

## 6. テスト作成・品質ガイドライン

機能の追加・改修時には、リグレッションを防ぐため**必ずテストを作成または更新**してください。

### テスト共通基盤 (`src/test/test-utils.tsx`) の活用

テスト作成時のボイラープレートを最小限に抑えるため、以下のヘルパーが用意されています：

- **モックファクトリ**:
  - `createTestArticle(overrides)`: 記事オブジェクトを生成
  - `createTestProfile(overrides)`: プロフィールオブジェクトを生成
  - `createTestSeries(overrides)`: 連載オブジェクトを生成
- **イベント操作**:
  - `setNativeValue(inputElement, value)`: `input` / `textarea` の値変更とイベント発火を自動化
- **レンダラー**:
  - `renderWithRouter(ui, options)`: React Router と UIProvider を包含したテストマウント

```tsx
// テストコード作成例
import { describe, it, expect } from "vite-plus/test";
import { createTestArticle, setNativeValue } from "../test/test-utils";

describe("ExampleFeature", () => {
  it("works properly", () => {
    const article = createTestArticle({ title: "カスタム記事" });
    expect(article.title).toBe("カスタム記事");
  });
});
```

---

<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

## Running Scripts

Run TypeScript and JavaScript files with `vpx <file>`, for example `vpx ./scripts/seed.ts --dry-run`. It handles enums, decorators, JSX, and tsconfig `paths`, so do not add `tsx` or `ts-node` to run scripts. `vpx --watch <file>` reruns the file when a file it uses changes, in place of `tsx watch`. `vp node <file>` runs plain Node.js.

## Tool Versions

Run `vp toolchain` to show versions and relationships in the active Vite+
release. Add a tool name to select part of the graph. For example, run
`vp toolchain vite`. Use `--global` to ignore the local `vite-plus` package. Use
`vp why <package>` to show the package-manager dependency graph.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->
