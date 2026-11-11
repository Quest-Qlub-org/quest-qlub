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

### スキーマ耐障害性原則 (Graceful Degradation against Schema Drift)

本番 DB とローカル / プレビュー環境の差異、またはマイグレーション適用とフロントエンドデプロイのタイミングラグに起因するスキーマドリフト（PostgREST 42703 `undefined_column`, 42P01 `undefined_table`, 42883 `undefined_function` 等）に対して、UI がクラッシュ・白画面・強制リダイレクトしない **Graceful Degradation（段階的縮退）** 原則を徹底してください。

1. **安全な一覧クエリ (`ARTICLE_LIST_FIELDS`)**:
   - 記事一覧クエリでは、巨大な本文（`content`）や未適用リスクのあるオプショナルカラムを除外し、実DBで確実に存在するカラムのみで構成された `ARTICLE_LIST_FIELDS` を利用してください。
2. **オプショナル機能の自動フォールバック**:
   - `comments_enabled`、`scheduled_at`、`collaborator_ids` などのオプショナルカラムは、DB エラー検知時に自動除外リトライや `localStorage`（コメント、フォロー、予約投稿日時の退避等）へ透過的にフォールバックする設計を維持してください。
   - エラー判定には `utils/supabaseErrors.ts` の判定関数（`isUndefinedColumnError`, `isRolesColumnSchemaError`, `isArticleOptionalColumnSchemaError` 等）を利用してください。
3. **プロフィール情報の安全取得**:
   - プロフィール取得時は、`roles` 列未存在時の 42703 フォールバックとローカルロールオーバーライドが組み込まれた `utils/profileQueries.ts`（`fetchSingleProfileWithFallback`, `fetchProfilesListWithFallback`）を経由してください。

---

## 4. アーキテクチャ & ディレクトリ責務

フロントエンド（`apps/website/src/`）は関心の分離に基づきモジュール化されています：

```text
apps/website/src/
├── views/                     # 画面ビュー
│   ├── HomeView.tsx           # トップ・新着・おすすめ記事
│   ├── ArticleView.tsx        # 記事詳細・SNSシェア・共同執筆者表示
│   ├── SearchView.tsx         # 検索・タグ絞り込み
│   ├── WritersView.tsx        # ライター一覧
│   ├── ProfileView.tsx        # ライタープロフィール・執筆記事一覧
│   ├── FavoritesView.tsx      # お気に入り記事一覧
│   ├── SettingsView.tsx       # 設定画面（各設定セクションを統合）
│   ├── AboutView.tsx          # サービス紹介・メンバー一覧（複数ロール動的分類）
│   ├── PrivacyView.tsx        # プライバシーポリシー
│   ├── TermsView.tsx          # 利用規約
│   ├── ContactView.tsx        # お問い合わせフォーム（スパム防止・レート制限）
│   ├── WriterApplyView.tsx    # ライター応募申請フォーム
│   ├── OfflineFallbackView.tsx# オフライン時フォールバック画面
│   ├── auth/                  # 認証関連画面
│   │   ├── LoginView.tsx          # ログイン（インライン2FA対応）
│   │   ├── RegisterView.tsx       # アカウント登録
│   │   ├── ForgotPasswordView.tsx # パスワード再設定申請
│   │   ├── ResetPasswordView.tsx  # パスワード再設定実行
│   │   └── SetupProfileView.tsx   # 初回プロフィール設定
│   ├── dashboard/             # ライター・編集長専用管理画面
│   │   ├── WriterDashboard.tsx        # ライターダッシュボード（記事一覧・ステータス管理）
│   │   ├── ArticleEditorView.tsx      # 記事作成・編集画面（予約投稿・共同執筆者設定対応）
│   │   ├── WriterSeriesPage.tsx       # 連載作成・管理（共同執筆連載対応）
│   │   ├── EditorDashboard.tsx        # 編集長ダッシュボード（統計・管理メニュー）
│   │   ├── EditorArticlesView.tsx     # 全記事審査・公開・削除管理
│   │   ├── EditorRecommendView.tsx    # おすすめ・人気記事ピックアップ設定
│   │   ├── EditorWritersView.tsx      # ライターロール・複数ロール管理
│   │   ├── EditorApplicationsView.tsx # ライター応募審査・承認一覧
│   │   └── AccessDeniedView.tsx       # 403権限エラー画面
│   └── settings/              # 設定セクション分割コンポーネント
│       ├── ProfileSettingsSection.tsx    # 表示名・自己紹介・X連携・アバター
│       ├── AppearanceSettingsSection.tsx # フォントサイズ・ダークモード設定
│       ├── RoleSettingsSection.tsx       # 現在のロール確認・ライター応募導線
│       ├── SecuritySettingsSection.tsx   # 2要素認証 (TOTP)・パスキー・緊急コード
│       └── PwaInstallSettingsSection.tsx # PWAインストール導線・オフライン状態
├── components/                # 再利用可能な共通UIコンポーネント
│   ├── navigation/            # ナビゲーション（Header, MobileNav, navItems）
│   ├── icons/                 # 画像アイコン・ブランドロゴ
│   ├── layout/                # アプリ共通レイアウト（AppLayout）
│   ├── pwa/                   # PWA支援（OfflineBanner, ReloadPrompt）
│   ├── ArticleCard.tsx        # 記事カードコンポーネント
│   ├── ArticleComments.tsx    # コメント・ピン留め・編集履歴コンポーネント
│   ├── CollaboratorSelect.tsx # 共同執筆者選択UI
│   ├── EnvironmentBanner.tsx  # 本番DB誤接続警告バナー
│   ├── ErrorBoundary.tsx      # React エラーバウンダリ
│   ├── MfaChallengeModal.tsx  # MFA認証モーダル
│   ├── MfaEnrollModal.tsx     # MFA登録モーダル
│   ├── OpeningAnimation.tsx   # オープニングアニメーション
│   ├── RichTextEditor.tsx     # Tiptap ベースのリッチテキストエディタ
│   ├── RoleRoute.tsx          # ロール認可 & Sudo Mode ガード
│   ├── Skeleton.tsx           # ローディングスケルトン
│   └── SudoConfirmModal.tsx   # Sudo 再認証 & インライン 2FA モーダル
├── context/                   # グローバル状態管理
│   ├── AuthContext.tsx        # ユーザー認証・ロール・セッション復元
│   ├── DataContext.tsx        # 記事・ライター・連載・お気に入りの取得・更新
│   ├── UIContext.tsx          # トースト通知・フォントサイズ・ダークモード設定
│   └── AppContext.tsx         # 上記を集約した Facade（useApp フック）
├── hooks/                     # カスタム React フック
│   ├── useFocusTrap.ts        # モーダル等のフォーカストラップ
│   ├── useFollows.ts          # ライターフォロー状態管理 & ローカル退避
│   ├── useNetworkStatus.ts    # オンライン/オフライン接続検知
│   └── usePwaInstall.ts       # PWAインストールプロンプト制御
├── utils/                     # 純粋関数ユーティリティ
│   ├── antiSpam.ts            # スパム検知・ハニーポット・レート制限
│   ├── date.ts                # 日時フォーマット
│   ├── normalizeJapanese.ts   # 日本語検索正規化
│   ├── profileQueries.ts      # スキーマ耐障害性対応プロフィール取得
│   ├── roles.ts               # 複数ロール判定・優先順位・ラベル定義
│   ├── sanitize.ts            # DOMPurify 記事本文サニタイズ
│   ├── scheduledArticles.ts   # 予約投稿ローカル退避 & 日時判定
│   ├── seo.ts                 # OGP・メタタグ動的更新
│   ├── seriesOverrides.ts     # 連載ローカル退避ユーティリティ
│   ├── supabaseErrors.ts      # PostgREST スキーマエラー判定
│   └── validation.ts          # 入力バリデーション関数
├── types/                     # 共通型定義（Article, Profile, Series 等）
└── test/                      # テスト共通基盤（test-utils.tsx, apiEndpoints 等）
```

バックエンド・データベース構成：

```text
supabase/
├── migrations/        # 冪等性を担保した SQL マイグレーション履歴
└── functions/         # Supabase Edge Functions (Deno)
    └── send-contact-email/ # お問い合わせ通知メール送信（Resend連携・多層防御）
docs/
├── schema-drift.md    # 実DBとマイグレーションの差分記録・適用状況
└── EMERGENCY_MFA_RESET.md # 緊急時 MFA リセット運用手順書
```

### 設計・コーディングの指針

- **状態管理 (State Management)**:
  - コンポーネント間でのバケツリレー（Props Drilling）を避け、各画面は `useApp()` フック（または分割された `useAuth()`, `useData()`, `useUI()`）からグローバル状態を取得・更新してください。
- **画面遷移 (Navigation) & ルーティング一覧**:
  - `react-router-dom` を採用しています。画面遷移には `useApp().navigate(viewName, param)` または標準の `useNavigate()` を使用してください。
  - ルートのアクセス制限は `components/RoleRoute.tsx` で制御されます。

  #### URL ルーティング対応表

  | パス                        | 画面コンポーネント       | アクセス権限                    | 備考                                              |
  | :-------------------------- | :----------------------- | :------------------------------ | :------------------------------------------------ |
  | `/`                         | `HomeView`               | 一般公開 (`guest` 含む全ロール) | トップ・新着・おすすめ・人気記事                  |
  | `/search`                   | `SearchView`             | 一般公開                        | キーワード検索・タグ絞り込み                      |
  | `/writers`                  | `WritersView`            | 一般公開                        | ライター一覧・フォロー導線                        |
  | `/writers/:username`        | `ProfileView`            | 一般公開                        | ライター詳細・執筆記事一覧                        |
  | `/articles/:id`             | `ArticleView`            | 一般公開（公開済み記事のみ）    | 記事詳細・共同執筆者表示・コメント・フォロー      |
  | `/favorites`                | `FavoritesView`          | 一般公開（未ログイン時は案内）  | ログイン読者のお気に入り記事一覧                  |
  | `/settings`                 | `SettingsView`           | 一般公開（未ログイン時は案内）  | プロフィール・外観・ロール・セキュリティ・PWA設定 |
  | `/about`                    | `AboutView`              | 一般公開                        | サービス紹介・メンバー一覧（複数ロール動的分類）  |
  | `/privacy`                  | `PrivacyView`            | 一般公開                        | プライバシーポリシー                              |
  | `/terms`                    | `TermsView`              | 一般公開                        | 利用規約                                          |
  | `/contact`                  | `ContactView`            | 一般公開                        | お問い合わせ（多層スパム防止・レート制限）        |
  | `/offline`                  | `OfflineFallbackView`    | 一般公開                        | ネットワーク切断時のフォールバック画面            |
  | `/writer-apply`             | `WriterApplyView`        | 一般公開（ログイン推奨）        | 一般読者向けライター応募申請フォーム              |
  | `/login`                    | `LoginView`              | 未認証（認証後はトップへ）      | ログイン（インライン2FA対応）                     |
  | `/register`                 | `RegisterView`           | 未認証                          | アカウント新規登録                                |
  | `/forgot-password`          | `ForgotPasswordView`     | 未認証                          | パスワード再設定メール送信申請                    |
  | `/reset-password`           | `ResetPasswordView`      | トークン所持者                  | 新規パスワード再設定実行                          |
  | `/setup-profile`            | `SetupProfileView`       | ログイン済みユーザー            | 初回プロフィール登録（表示名・ユーザー名）        |
  | `/writer-dash`              | `WriterDashboard`        | `writer` / `editor` + Sudo Mode | マイ記事一覧・ステータス管理・執筆導線            |
  | `/writer-dash/new`          | `ArticleEditorPage`      | `writer` / `editor` + Sudo Mode | 記事新規作成（予約投稿・共同執筆者選択）          |
  | `/writer-dash/edit/:id`     | `ArticleEditorPage`      | `writer` / `editor` + Sudo Mode | 自身または共同編集記事の編集                      |
  | `/writer-dash/series`       | `WriterSeriesPage`       | `writer` / `editor` + Sudo Mode | 連載作成・管理・記事紐付け（共同連載対応）        |
  | `/editor-dash`              | `EditorDashboard`        | `editor` + Sudo Mode            | 編集長ダッシュボード（統計・メニュー）            |
  | `/editor-dash/articles`     | `EditorArticlesView`     | `editor` + Sudo Mode            | 全記事の審査・承認・公開・差し戻し・削除          |
  | `/editor-dash/recommend`    | `EditorRecommendView`    | `editor` + Sudo Mode            | おすすめ・人気記事のピックアップ設定              |
  | `/editor-dash/writers`      | `EditorWritersView`      | `editor` + Sudo Mode            | ユーザーロール変更・複数ロール（配列）管理        |
  | `/editor-dash/applications` | `EditorApplicationsView` | `editor` + Sudo Mode            | ライター応募申請の審査・昇格処理                  |

- **ユーザーロールと複数ロール設計**:
  - ロール体系:
    - `guest`: 未ログイン訪問者
    - `viewer`: 一般登録読者
    - `writer`: 記事・連載の執筆・審査申請を行うライター
    - `editor`: 全記事・連載の審査・承認・編集・ユーザーロール管理を行う編集長
    - `engineer`: 開発・運用・システム保守担当エンジニア
  - **複数ロールの所持（`profiles.roles text[]`）**:
    - 1アカウントが複数のロール（例: ライター兼エンジニア、編集長兼エンジニア等）を同時に保持できます。
    - 単一列 `profile.role === "writer"` による安易な比較は行わず、**必ず `utils/roles.ts` のヘルパー関数群（`profileHasRole`, `getProfileRoles`, `getPrimaryRole`, `isStaffRole`）を使用してください**。
  - ルートのアクセス制限は `components/RoleRoute.tsx` で制御されます。
- **記事・連載の共同編集（Collaborator）**:
  - 記事（`articles.collaborator_ids`）および連載（`series.collaborator_ids`）には共同編集者を指定可能です。
  - 共同編集者は下書きの閲覧・更新・審査申請を行えますが、主作成者（`writer_id`）の改ざんや削除（DELETE）権限は持たず、削除は主作成者および編集長のみに限定されます。
- **予約投稿（Scheduled Publishing）**:
  - `articles.scheduled_at` および `status = 'scheduled'` により未来日時の自動公開が可能です。予約時刻到来前の記事は一般公開（`articles_select_published` RLS）から厳格に保護されます。
  - 公開時刻到来後は RPC 関数 `publish_due_scheduled_articles()` により公開状態へ昇格します。

---

## 5. セキュリティ規範

- **Sudo Mode（ステップアップ再認証 + MFA一気通貫）**:
  - ライターおよび編集長専用ダッシュボード（`/writer-dash/*`, `/editor-dash/*`）へのアクセスには、端末放置やセッション乗っ取りを防止するための Sudo Mode が必須です。
  - **メモリ内プライベート認可 (`inMemorySudoAuthorized`)**: ブラウザの DevTools やストレージ改ざんによる権限バイパスを遮断するため、Sudo 認可フラグはメモリ内変数としてのみ保持されます。
  - **Leave-to-Lock 原則**: 管理エリアから一般画面等へアンマウント離脱した際、Sudo 認可は即座に自動失効します。ただし、Sudo 再認証に伴う一時的な 2FA チャレンジ（`mfaChallengeRequired` または MFA ハンドシェイク猶予 `SUDO_MFA_HANDSHAKE_GRACE_MS`）によるアンマウント時は失効させず維持されます。
  - **注意（管理画面内サブページ遷移時の失効リスクと Layout Route 推奨）**:
    - 現在の実装では `App.tsx` の各管理ルートに個別の `<RoleRoute>` がマウントされているため、同一管理エリア内のサブページ間移動（例: `/writer-dash` から `/writer-dash/series` 等）でも以前の `RoleRoute` のアンマウントにより Leave-to-Lock クリーンアップが発火し、Sudo 認可が意図せず失効してしまう UX 課題が存在します（Issue #84）。
    - そのため、管理エリアのルーティングは将来的に共通の Layout Route（`<RoleRoute><Outlet /></RoleRoute>`）として階層化し、管理エリア内でのサブページ移動ではアンマウントが発生しない構造へリファクタリングすることが強く推奨されます。
  - Sudo タイムアウトは 15 分（`SUDO_TIMEOUT_MS = 15 * 60 * 1000`）です。
- **XSS の防止**:
  - 記事本文など動的な HTML をブラウザにレンダリングする際は、**必ず `utils/sanitize.ts` の `sanitizeHtml`（DOMPurify 許可リスト）を通してください**。サニタイズを経由しない `dangerouslySetInnerHTML` は禁止です。
- **ロール権限の改ざん防止**:
  - `profiles.role` および `profiles.roles` 列はクライアント（`authenticated` ロール）からの直接 UPDATE 権限が DB レベルで剥奪されています。ロールの変更は必ず Supabase の管理用 RPC 関数（単一ロール: `admin_change_user_role` / 複数ロール一括: `admin_set_user_roles`）経由で行ってください。
- **お問い合わせスパム・レート制限**:
  - お問い合わせ機能（`ContactView` / Edge Function `send-contact-email` / DBトリガー）にはレート制限と多層防御（ハニーポット、文字数・改行制限、IP & メールアドレスレート制限）が組み込まれています。

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
