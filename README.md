# Quest Qlub

> 学びの「楽しい！」をつなげる記事サービス

**本番URL**: [https://quest-qlub.vercel.app/](https://quest-qlub.vercel.app/)

## Quest Qlub とは

「学びの『楽しい！』をつなげる」をモットーに、ライターによって書かれる記事から、「学ぶこと」の楽しさや面白さを届けるコンテンツプラットフォームです。

「勉強」という固い縛りではなく、「気になったことを広げたい」「学ぶこと自体が楽しい」と思えるようなコンテンツを目指しています。

## 主な活動

Quest Qlubのライターが、「楽しい」「おもしろい」と感じたことを記事にすることで、その輪を広げています。一人でも多くの方に学びの楽しさを伝えられるよう活動しています。

## 主な機能

- **記事の閲覧・検索・絞り込み**: キーワード検索、タグ絞り込み、おすすめ・人気記事のハイライト
- **共同執筆 (Collaborator)**: 記事（`collaborator_ids`）および連載に対する複数人の共同編集者指定、下書き共有、作成者ID改ざん防止トリガー
- **予約投稿 (Scheduled Publishing)**: 未来日時を指定した自動公開予約、未公開時点での厳格なRLS保護、定期実行関数（`publish_due_scheduled_articles` RPC）
- **コメント・ピン留め・編集履歴**: 記事コメント機能、ライターによる重要コメントのピン留め（最大3件）、編集履歴の自動追跡（`comment_edit_history`）、記事ごとのコメント機能オン/オフ制御
- **フォロー機能**: 読者によるお気に入りライターのフォロー、フォロワー数・フォロー中数の集計（RPC）およびローカル退避フォールバック
- **複数ロール（マルチロール）設計**: 1アカウントに対する複数ロール（`profiles.roles text[]`）の割り当て（編集長兼エンジニア、ライター兼エンジニア等）と動的権限判定
- **ライター応募・審査**: 一般読者からのライター応募申請フォーム（`/writer-apply`）および編集長による応募内容の審査・承認一覧（`/editor-dash/applications`）
- **ライター一覧・プロフィール**: ライター情報、バイオ、執筆記事一覧、X（旧Twitter）アカウント連携
- **お気に入り機能**: ログイン読者による記事のお気に入り登録・一覧表示
- **記事執筆・連載管理**: Tiptapによるリッチテキストエディター、下書き保存、連載作成・話数割り当て、審査申請
- **編集長管理**: 全記事の審査・承認・公開・差し戻し管理、おすすめ/人気設定、ライターロール・複数ロール管理
- **認証・セキュリティ堅牢化**: Supabase Authによる認証、2要素認証 (TOTP)・パスキー (WebAuthn)・緊急バックアップコード対応（[緊急救済手順書](docs/EMERGENCY_MFA_RESET.md) あり）、管理画面への Sudo Mode 再認証（メモリ内認可・Leave-to-Lock）、行単位セキュリティ (RLS)、列レベルアクセス制御、CSPヘッダー、DOMPurifyによるサニタイズ、記事改ざん防止トリガー、多層スパム防止（ハニーポット・レート制限）
- **PWA・オフライン対応**: オフライン時のフォールバック画面（`/offline`）、PWAインストール導線、Service Worker更新通知

## 技術スタック

- **フロントエンド**: React 18 + TypeScript + Tailwind CSS
- **ツールチェーン**: [Vite+](https://viteplus.dev/) (`vp`: Vite, Rolldown, Vitest, Oxlint, Oxfmt)
- **パッケージマネージャー**: pnpm (Workspace monorepo)
- **バックエンド / DB**: Supabase (PostgreSQL, Auth, Storage, Edge Functions)
- **ホスティング**: Vercel

## ディレクトリ構造 (Architecture)

プロジェクトは pnpm ワークスペースによるモノレポ構成となっており、フロントエンドは関心の分離に基づきモジュール化されています。

```text
quest-qlub/
├── apps/
│   └── website/                   # メインWebアプリケーション
│       ├── public/                # 静的アセット (PWA manifest, アイコン等)
│       ├── vercel.json            # Vercelデプロイ設定 (SPAリライト・セキュリティヘッダー)
│       ├── src/
│       │   ├── App.tsx            # メインルーティング・レイアウト構成
│       │   ├── App.test.ts        # ルーティング等のユニットテスト
│       │   ├── main.tsx           # アプリケーションエントリーポイント
│       │   ├── supabase.ts        # Supabase クライアント初期化およびモック
│       │   ├── style.css          # グローバルCSS / Tailwind CSS
│       │   ├── assets/            # ブランドロゴ・ナビゲーション画像アセット
│       │   ├── components/        # 共通UIコンポーネント
│       │   │   ├── ArticleCard.tsx        # 記事カード
│       │   │   ├── ArticleComments.tsx    # コメント・ピン留め・編集履歴
│       │   │   ├── CollaboratorSelect.tsx # 共同執筆者選択UI
│       │   │   ├── EnvironmentBanner.tsx  # 本番DB誤接続警告バナー
│       │   │   ├── ErrorBoundary.tsx      # React エラー境界
│       │   │   ├── MfaChallengeModal.tsx  # MFAチャレンジモーダル
│       │   │   ├── MfaEnrollModal.tsx     # MFA登録モーダル
│       │   │   ├── OpeningAnimation.tsx   # 初回オープニングアニメーション
│       │   │   ├── RichTextEditor.tsx     # Tiptapリッチテキストエディタ
│       │   │   ├── RoleRoute.tsx          # ロール認可 & Sudo Mode ガード
│       │   │   ├── Skeleton.tsx           # ローディングスケルトン
│       │   │   ├── SudoConfirmModal.tsx   # Sudo 再認証 & インライン 2FA
│       │   │   ├── icons/
│       │   │   │   └── NavIcons.tsx       # ナビゲーションアイコン群
│       │   │   ├── layout/
│       │   │   │   └── AppLayout.tsx      # 全体共通ヘッダー・フッターレイアウト
│       │   │   ├── navigation/
│       │   │   │   ├── Header.tsx         # PC/タブレット用ヘッダー
│       │   │   │   ├── MobileNav.tsx      # モバイル用下部ナビゲーション
│       │   │   │   └── navItems.ts        # ナビゲーション設定定義
│       │   │   └── pwa/
│       │   │       ├── OfflineBanner.tsx  # ネットワーク切断通知バナー
│       │   │       └── ReloadPrompt.tsx   # PWA更新通知プロンプト
│       │   ├── context/           # グローバル状態管理
│       │   │   ├── AppContext.tsx         # 全Contextのファサード (`useApp`)
│       │   │   ├── AuthContext.tsx        # 認証・セッション・ロール状態
│       │   │   ├── DataContext.tsx        # 記事・ライター・連載データ
│       │   │   └── UIContext.tsx          # トースト通知・文字サイズ・外観
│       │   ├── hooks/             # カスタムフック
│       │   │   ├── useFocusTrap.ts        # モーダルフォーカストラップ
│       │   │   ├── useFollows.ts          # フォロー状態管理 & ローカル退避
│       │   │   ├── useNetworkStatus.ts    # オンライン/オフライン接続検知
│       │   │   └── usePwaInstall.ts       # PWAインストール制御
│       │   ├── types/
│       │   │   └── index.ts               # 共通型定義 (Article, Profile, Series 等)
│       │   ├── utils/             # 共通ユーティリティ
│       │   │   ├── antiSpam.ts            # スパム検知・ハニーポット
│       │   │   ├── date.ts                # 日時フォーマット
│       │   │   ├── normalizeJapanese.ts   # 日本語検索正規化
│       │   │   ├── profileQueries.ts      # スキーマ耐障害性対応プロフィール取得
│       │   │   ├── roles.ts               # 複数ロール判定・優先順位
│       │   │   ├── sanitize.ts            # DOMPurify HTMLサニタイズ
│       │   │   ├── scheduledArticles.ts   # 予約投稿ローカル退避 & 日時判定
│       │   │   ├── seo.ts                 # 動的OGP・メタタグ更新
│       │   │   ├── seriesOverrides.ts     # 連載ローカル退避ユーティリティ
│       │   │   ├── supabaseErrors.ts      # PostgREST エラー判定
│       │   │   └── validation.ts          # バリデーション関数
│       │   └── views/             # 画面ビュー
│       │       ├── HomeView.tsx           # トップ・新着・おすすめ記事
│       │       ├── ArticleView.tsx        # 記事詳細・SNSシェア・共同執筆者表示
│       │       ├── SearchView.tsx         # 検索・タグ絞り込み
│       │       ├── WritersView.tsx        # ライター一覧
│       │       ├── ProfileView.tsx        # ライター詳細・執筆記事一覧
│       │       ├── FavoritesView.tsx      # お気に入り記事一覧
│       │       ├── SettingsView.tsx       # 設定画面（統合ビュー）
│       │       ├── AboutView.tsx          # サービス紹介・動的メンバー一覧
│       │       ├── PrivacyView.tsx        # プライバシーポリシー
│       │       ├── TermsView.tsx          # 利用規約
│       │       ├── ContactView.tsx        # お問い合わせフォーム
│       │       ├── WriterApplyView.tsx    # ライター応募申請フォーム
│       │       ├── OfflineFallbackView.tsx# オフラインフォールバック画面
│       │       ├── auth/                  # 認証関連画面
│       │       │   ├── LoginView.tsx          # ログイン画面
│       │       │   ├── RegisterView.tsx       # 新規登録画面
│       │       │   ├── ForgotPasswordView.tsx # パスワード再設定申請
│       │       │   ├── ResetPasswordView.tsx  # パスワード再設定実行
│       │       │   └── SetupProfileView.tsx   # 初回プロフィール設定
│       │       ├── dashboard/             # ライター・編集長専用管理画面
│       │       │   ├── WriterDashboard.tsx        # ライターダッシュボード
│       │       │   ├── ArticleEditorView.tsx      # 記事作成・編集画面
│       │       │   ├── WriterSeriesPage.tsx       # 連載作成・管理
│       │       │   ├── EditorDashboard.tsx        # 編集長ダッシュボード
│       │       │   ├── EditorArticlesView.tsx     # 全記事審査・公開・削除
│       │       │   ├── EditorRecommendView.tsx    # おすすめ・人気設定
│       │       │   ├── EditorWritersView.tsx      # ライター権限・ロール管理
│       │       │   ├── EditorApplicationsView.tsx # ライター応募審査
│       │       │   └── AccessDeniedView.tsx       # 403権限エラー画面
│       │       └── settings/              # 設定セクション分割コンポーネント
│       │           ├── ProfileSettingsSection.tsx    # プロフィール設定
│       │           ├── AppearanceSettingsSection.tsx # 外観・文字サイズ設定
│       │           ├── RoleSettingsSection.tsx       # ロール確認・応募導線
│       │           ├── SecuritySettingsSection.tsx   # 2FA・パスキー・緊急コード
│       │           └── PwaInstallSettingsSection.tsx # PWAインストール
│       ├── package.json
│       ├── tsconfig.json
│       └── vite.config.ts
├── docs/                          # 運用ドキュメント・ランブック (緊急MFA救済手順、スキーマドリフト記録等)
├── supabase/                      # Supabase設定・マイグレーション
│   ├── config.toml
│   ├── functions/                 # Edge Functions (send-contact-email等)
│   └── migrations/                # SQLマイグレーション
├── package.json                   # ワークスペースルート package.json
├── pnpm-workspace.yaml            # pnpm ワークスペース定義
└── CONTRIBUTING.md                # 開発者向けガイド
```

### 状態管理の仕組み (`AppContext`)

各画面（`views`）は、`useApp()` フックを通じて [AppContext.tsx](apps/website/src/context/AppContext.tsx) から必要なグローバル状態（ユーザー情報、お気に入りリスト、記事一覧、ライター一覧など）を取得・操作します。これによりバケツリレー（Props Drilling）を防ぎ、関心の分離と高い保守性を保っています。

## お問い合わせ

ご質問・ご意見は [https://quest-qlub.vercel.app/contact](https://quest-qlub.vercel.app/contact) よりお願いいたします。
