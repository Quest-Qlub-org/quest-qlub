# 認証設定のリリース確認

## 漏えい済みパスワードの拒否（#165）

Supabase の Pro 以上では、承認済みの対象プロジェクトで Authentication → Sign In / Providers → Email を開き、**Prevent use of leaked passwords** を有効にする。プロジェクト参照と切り替えの状態を記録する。設定が利用できるプランと認証の動作は公式ガイドで確認できる。 [Supabase Password Security](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)

Free プランを継続する場合、現在のホスト構成で登録と変更の両方に漏えい照合を強制できる Auth フックは提供されていない。ブラウザーでの事前チェックは直接の Auth リクエストに適用されない。強制が必要な環境では Pro 以上のマネージド Auth を優先し、セルフホストを選ぶ場合は Auth サービスで `GOTRUE_PASSWORD_HIBP_ENABLED=true` を設定する。セルフホストでは照合サービスに接続できない場合も新しいパスワードの設定を拒否する `GOTRUE_PASSWORD_HIBP_FAIL_CLOSED=true` を使用する。 [GoTrue の設定定義](https://github.com/supabase/auth/blob/master/internal/conf/configuration.go) · [Before User Created Hook](https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook)

隔離環境で、設定の有効化より前にテスト用の漏えい済みパスワード（`password123` など）を持つアカウントを準備する。設定の有効化後に、以下を確認し、実施日と結果を記録する。

1. 新規登録で漏えい済みパスワードを指定すると、署名済みセッションが作られずフォームに拒否理由が表示される。
2. 設定画面のパスワード変更およびメールから開く再設定画面で、同じ漏えい済みパスワードを指定すると、いずれも変更されずフォームに拒否理由が表示される。
3. 設定の有効化前に準備したテストアカウントで、元のパスワードを使うログインが成功する。新たに設定を許可されたパスワードでの変更とログインも確認する。

## 管理操作の再認証（#157）

ライターと編集長の記事・連載の更新には、現在のセッションで Sudo Mode を開始する。編集長によるロールの変更、非公開記事の閲覧、管理用プロフィール一覧、お問い合わせ閲覧にも同じ確認が必要になる。元のロール・所有者・共同編集者の条件を満たす操作のみ許可される。

Sudo Mode は認証済みセッションで発行したチャレンジと、その後に同じアカウントでパスワードまたはパスキーを使って発行した新規セッションを紐付ける。検証済み MFA がある場合は、新規セッション上での MFA 完了も必要になる。チャレンジの有効時間は3分、管理操作はパスワードまたはパスキーの確認から15分間有効。トークンの更新で期限は延長されない。

先に検証環境でマイグレーションとクライアントを揃えて適用する。`supabase/tests/sudo_authorization.sql` を `psql -v ON_ERROR_STOP=1 -f` で実行し、ライター・編集長それぞれで管理画面に入り、操作成功、離脱後の再認証、タイムアウト、ログアウト後の拒否を確認する。最後に MFA を登録した編集長でも同じ操作を確認する。

## MFA 復旧と本人通知（#163）

既発行の8文字コードは、最初の復旧・認証要素の解除・コードの再生成まで利用できる。新規発行は AAL2 の認証済みセッションのみ許可し、1コードあたり128ビットの乱数を用いる。復旧の誤入力はアカウントごとに15分間で5回まで受け付ける。

復旧を確定すると古いバックアップコードと認証要素が無効になる。ほかのセッションはトークンの更新と Sudo 操作ができなくなる。発行済みのアクセストークンを使う通常の Data API 操作にはトークンの有効期限が適用される。ライター・編集長は認証アプリを再登録し、新しいバックアップコードを発行すると管理操作を再開できる。メール確認済みのアカウントには、復旧時点の確認済みアドレスに通知する。

承認済み環境でマイグレーションを適用し、`notify-mfa-recovery` Edge Function をデプロイする。既存の `RESEND_API_KEY` に加え、Resend で認証済みの差出人を `MFA_RECOVERY_SENDER_EMAIL` に登録する。通知ワーカー専用に生成した32文字以上のランダム値を Edge Function の `MFA_RECOVERY_WORKER_TOKEN` と、Cron から読む Vault の `mfa_recovery_worker_token` に設定する。対象プロジェクトの API URL を Vault の `mfa_recovery_project_url` に登録する。 [Supabase Edge Function の定期実行](https://supabase.com/docs/guides/functions/schedule-functions)

Supabase Cron で以下を1分おきに実行する。

```sql
SELECT net.http_post(
  url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'mfa_recovery_project_url')
    || '/functions/v1/notify-mfa-recovery',
  headers := jsonb_build_object(
    'Authorization', 'Bearer ' || (
      SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'mfa_recovery_worker_token'
    ),
    'Content-Type', 'application/json'
  ),
  body := '{}'::jsonb,
  timeout_milliseconds := 30000
);
```

隔離環境で `supabase/tests/mfa_recovery.sql` を `psql -v ON_ERROR_STOP=1 -f` で実行する。テスト用アカウントで復旧、旧コードの無効化、認証アプリの再登録、新しいコードの発行を確認する。通知は `quest_qlub_private.mfa_recovery_notifications` の `status` と Edge Function ログの通知IDで照合する。送信済み・失敗の確定時に宛先を消去する。送信処理の重複は通知IDを使った冪等性キーで抑止し、再試行は5回か23時間の先に達した時点で終了する。 [Resend の冪等性キー](https://resend.com/docs/dashboard/emails/idempotency-keys)
