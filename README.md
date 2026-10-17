# Quest Qlub

> 学びの「楽しい！」をつなげる記事サービス

**本番URL**: [https://share-quest.vercel.app/](https://share-quest.vercel.app/)

## Quest Qlub とは

「学びの『楽しい！』をつなげる」をモットーに、ライターによって書かれる記事から、「学ぶこと」の楽しさや面白さを届けるコンテンツプラットフォームです。

「勉強」という固い縛りではなく、「気になったことを広げたい」「学ぶこと自体が楽しい」と思えるようなコンテンツを目指しています。

## 主な活動

Quest Qlubのライターが、「楽しい」「おもしろい」と感じたことを記事にすることで、その輪を広げています。一人でも多くの方に学びの楽しさを伝えられるよう活動しています。

## 主な機能

- **記事の閲覧・検索・絞り込み**: キーワード検索、タグ絞り込み、おすすめ・人気記事のハイライト
- **ライター一覧・プロフィール**: ライター情報、バイオ、記事一覧、X（旧Twitter）アカウントへのリンク
- **お気に入り機能**: ログイン読者による記事のお気に入り登録・一覧表示
- **記事執筆・編集**: Tiptapによるリッチテキストエディター、下書き保存、連載管理、投稿申請
- **編集長管理**: 記事の審査・承認・公開管理、おすすめ/人気設定、ライター権限の管理
- **お問い合わせ・認証**: Supabase Authによる認証（パスワードリセット対応）、2要素認証 (TOTP)・パスキー (WebAuthn)・緊急バックアップコード対応（[緊急救済手順書](docs/EMERGENCY_MFA_RESET.md) あり）、お問い合わせフォーム（Edge Functionsによるメール送信連携）
- **セキュリティ堅牢化**: 行単位セキュリティ (RLS)、列レベルアクセス制御、CSPヘッダー、DOMPurifyによるサニタイズ、記事改ざん防止トリガー、閲覧数・いいね数トランザクション制御

## 技術スタック

- **フロントエンド**: React 18 + TypeScript + Tailwind CSS
- **ツールチェーン**: [Vite+](https://viteplus.dev/) (`vp`: Vite, Rolldown, Vitest, Oxlint, Oxfmt)
- **パッケージマネージャー**: pnpm (Workspace monorepo)
- **バックエンド / DB**: Supabase (PostgreSQL, Auth, Storage, Edge Functions)
- **ホスティング**: Vercel

## ディレクトリ構造 (Architecture)

プロジェクトは pnpm ワークスペースによるモノレポ構成となっており、フロントエンドは画面単位でモジュール化されています。

```text
share-quest/
├── apps/
│   └── website/                   # メインWebアプリケーション
│       ├── public/                # 静的アセット
│       ├── vercel.json            # Vercelデプロイ設定 (SPAリライト・セキュリティヘッダー)
│       ├── src/
│       │   ├── App.tsx            # メインルーティング・ナビゲーション・レイアウト
│       │   ├── App.test.ts        # ルーティング等のユニットテスト
│       │   ├── main.tsx           # エントリーポイント
│       │   ├── supabase.ts        # Supabase クライアント初期化および型定義
│       │   ├── style.css          # グローバルCSS / Tailwind CSS
│       │   ├── assets/            # 画像・アイコンアセット
│       │   ├── components/        # 共通UIコンポーネント
│       │   │   ├── ArticleCard.tsx      # 記事カード
│       │   │   ├── RichTextEditor.tsx   # Tiptapリッチテキストエディタ
│       │   │   ├── MfaChallengeModal.tsx# MFAチャレンジモーダル
│       │   │   └── icons/
│       │   │       └── NavIcons.tsx     # ナビゲーションアイコン群
│       │   ├── context/
│       │   │   └── AppContext.tsx # グローバル状態管理 (Context / Provider)
│       │   ├── types/
│       │   │   └── index.ts       # 共通型定義 (Article, Series, ステータスマップ等)
│       │   ├── utils/             # 共通ユーティリティ
│       │   │   ├── sanitize.ts    # DOMPurify HTMLサニタイズ
│       │   │   ├── sanitize.test.ts
│       │   │   ├── validation.ts  # バリデーション関数
│       │   │   └── validation.test.ts
│       │   └── views/             # 画面ビュー
│       │       ├── HomeView.tsx         # トップ・新着・おすすめ記事
│       │       ├── ArticleView.tsx      # 記事詳細・SNSシェア
│       │       ├── SearchView.tsx       # 検索・タグ絞り込み
│       │       ├── WritersView.tsx      # ライター一覧
│       │       ├── ProfileView.tsx      # ライター詳細 (Xアカウント連携)
│       │       ├── FavoritesView.tsx    # お気に入り記事一覧
│       │       ├── SettingsView.tsx     # 設定 (表示名, X連携, MFA, 文字サイズ)
│       │       ├── ContactView.tsx      # お問い合わせフォーム
│       │       ├── AboutView.tsx        # サービス紹介
│       │       ├── PrivacyView.tsx      # プライバシーポリシー
│       │       ├── TermsView.tsx        # 利用規約
│       │       ├── auth/                # 認証関連画面
│       │       │   ├── LoginView.tsx
│       │       │   ├── RegisterView.tsx
│       │       │   ├── ForgotPasswordView.tsx
│       │       │   ├── ResetPasswordView.tsx
│       │       │   └── SetupProfileView.tsx
│       │       └── dashboard/           # ライター・編集長ダッシュボード
│       │           ├── AccessDeniedView.tsx     # 403権限エラー画面
│       │           ├── WriterDashboard.tsx      # ライター記事一覧・管理
│       │           ├── ArticleEditorView.tsx    # 記事作成・編集画面
│       │           ├── WriterSeriesPage.tsx     # 連載作成・管理
│       │           ├── EditorDashboard.tsx      # 編集長ダッシュボード
│       │           ├── EditorArticlesView.tsx   # 全記事審査・公開・削除
│       │           ├── EditorRecommendView.tsx  # おすすめ・人気設定
│       │           └── EditorWritersView.tsx    # ライター権限管理
│       ├── package.json
│       ├── tsconfig.json
│       └── vite.config.ts
├── docs/                          # 運用ドキュメント・ランブック (緊急MFA救済手順等)
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

ご質問・ご意見は [https://share-quest.vercel.app/contact](https://share-quest.vercel.app/contact) よりお願いいたします。
