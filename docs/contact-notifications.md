# 受付通知の運用

問い合わせとライター応募の受理時に、受付IDごとにメール送信ジョブが同じトランザクションで作られます。移行前の受付は送信状況が不明なので自動通知の対象外です。

同じメールアドレスからは10分間に3件、管理された Supabase ゲートウェイが `CF-Connecting-IP` を渡す場合は同じIPから1分間に3件まで受理します。自己ホスト環境では、信頼するゲートウェイでこのヘッダーを上書きする構成を確認してください。通知のワーカー全体で1分間に最大10件を確保します。

## 検証環境への設定

1. マイグレーションを適用し、`supabase/tests/contact_notification_queue.sql` を初期化済みの隔離DBで実行します。
2. `send-contact-email` に `RESEND_API_KEY`、送り先の `CONTACT_RECEIVER_EMAIL`、検証済み送信者の `CONTACT_SENDER_EMAIL` を設定します。32文字以上のランダムな `CONTACT_NOTIFICATION_WORKER_SECRET` を生成し、Edge Function のシークレットと Vault の `contact_notification_worker_secret` に同じ値を登録します。Vault の `contact_notification_project_url` には対象環境の Supabase URL を登録します。
3. `send-contact-email` の新しい実装をデプロイします。この関数は `X-Contact-Worker-Secret` を照合し、サーバー側の `SUPABASE_SERVICE_ROLE_KEY` でDBのワーカー関数を呼び出します。
4. `pg_cron`、`pg_net` を有効にした対象環境で次のジョブを一度登録します。シークレットの値はジョブの定義に含めず、実行時に Vault から読み出します。

```sql
SELECT cron.schedule(
  'contact-notification-worker',
  '* * * * *',
  $job$
  SELECT net.http_post(
    url := (
      SELECT rtrim(decrypted_secret, '/')
      FROM vault.decrypted_secrets WHERE name = 'contact_notification_project_url'
    ) || '/functions/v1/send-contact-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Contact-Worker-Secret', (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets WHERE name = 'contact_notification_worker_secret'
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 45000
  );
  $job$
);
```

## 状況確認

隔離環境でテスト受付を送信し、受付IDの通知が `sent` になることを確認します。

```sql
SELECT receipt_id, status, attempts, first_attempt_at, next_attempt_at, sent_at, error_kind
FROM quest_qlub_private.contact_notification_jobs
ORDER BY next_attempt_at DESC
LIMIT 100;
```

一時的な障害では `pending` に戻り、間隔を広げて最大5回送信を試みます。送信時には受付IDから作った同じ冪等性キーを Resend に渡します。ワーカーが中断された場合は2分後に再試行でき、初回の試行から23時間を過ぎたジョブは `failed` になります。送信結果を確認できなかった `lease_expired` は、再送前に運営側で配信履歴と受付IDを照合してください。ログには受付ID、ジョブ状態、エラー種別が記録されます。

切り替え時はDB、Edge Function、Cron、Web の順に反映します。旧Webからの直接保存もマイグレーション適用後はキューに入ります。旧Webと旧Edge Functionが同時に稼働する期間は直接通知も発生するため、DB適用からワーカー切り替えまでの間は Cron を停止してください。対象期間の受付は配信履歴と照合してから処理します。

- [Supabase の Edge Function スケジュール](https://supabase.com/docs/guides/functions/schedule-functions)
- [Resend の冪等性キー](https://resend.com/docs/dashboard/emails/idempotency-keys)

## ライター応募の審査

新規応募は確認済みメールアドレスを持つログイン済みユーザーが送信できます。受付にはユーザーIDと受付時点の確認済みメールアドレスが保存されます。メールアドレスを変更しても同じアカウントが審査対象です。編集長は管理画面で再認証し、応募カードの現在のプロフィール、ユーザーID、受付時メールを確認してから承認または見送りを確定します。送信ジョブの状態も同じカードで確認できます。

アカウントと紐付いていない旧形式の応募は閲覧できます。審査する場合は応募者にログインして再応募してもらってください。

個別にライターロールを管理する場合は、ライター・ロール管理の一覧でアカウントを確認し、そのカードからロールを変更します。
