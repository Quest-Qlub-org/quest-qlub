# Google OAuth のカスタムドメイン

[Issue #77](https://github.com/Quest-Qlub-org/quest-qlub/issues/77) の公開ページのデザイン変更は既に main に反映済みです。残作業では、Google が認証後に呼び出す Supabase Auth のコールバックをサービスの独自ドメインに切り替えます。Quest Qlub に戻る URL は、ログイン画面で渡しているアプリのオリジンです。

## 事前に決めること

- Supabase の有料プランと Custom Domains アドオンを利用できることを確認し、DNS を管理できるホスト名を決めます。以下では `api.example.com` を例にします。
- 対象の Supabase プロジェクト、Google OAuth クライアント、アプリの公開オリジンを照合します。検証用プロジェクトと OAuth クライアントがある場合はそこで先に試します。

## 切り替え

1. DNS に、`api.example.com` から対象プロジェクトの `<project-ref>.supabase.co` への CNAME を作成します。Supabase の General Settings でカスタムドメインを登録し、提示された TXT レコードを DNS に追加します。ドメインの検証と証明書発行が終わるまで待ちます。 [Supabase Custom Domains](https://supabase.com/docs/guides/platform/custom-domains)
2. Google Auth Platform の Branding で使用するドメインを確認し、対象クライアントの Authorized redirect URIs に `https://api.example.com/auth/v1/callback` を追加します。切り戻しに使う既存の `https://<project-ref>.supabase.co/auth/v1/callback` も登録しておきます。複数の OAuth プロバイダーを使っている場合は各クライアントを更新します。 [Supabase の Google ログイン設定](https://supabase.com/docs/guides/auth/social-sign-in/auth-google)
3. Supabase Auth の Site URL と Redirect URLs に、ログインを提供するアプリの公開オリジンが登録されていることを確認します。Quest Qlub のログインボタンは現在のオリジンを `redirectTo` として渡します。 [Supabase Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
4. Supabase でカスタムドメインを有効化します。これ以降の OAuth フローは新しいコールバックを使います。今回の切り替えでは既存の API URL と Vercel の CSP をそのまま使えます。アプリの API URL も移行する場合は、事前に CSP の `connect-src`、開発・検証環境の本番ホスト遮断設定、画像のキャッシュ設定も更新します。 [Supabase の有効化手順](https://supabase.com/docs/guides/platform/custom-domains#prepare-to-activate-your-domain)

## 動作確認と切り戻し

- PC とスマートフォンの新しいブラウザーセッションで Google ログインを実行します。Google に送られる `redirect_uri` と表示されるドメイン、Quest Qlub に戻った後のセッション、初回のプロフィール設定、ログアウトを確認します。
- `redirect_uri_mismatch` が出た場合は、Google 側の登録値をスキーム・ホスト・パスまで照合します。切り戻す場合は、既存の Google コールバック登録が残っている状態で、Supabase のカスタムドメインを削除し、既存の URL でログインを再確認します。 [Supabase のドメイン削除手順](https://supabase.com/docs/guides/platform/custom-domains)
