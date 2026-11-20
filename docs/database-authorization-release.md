# DB 認可のリリース検証

## 隔離環境での検証

CI の **Database authorization** はローカル Supabase を起動して全マイグレーションを適用し、履歴と実効権限を照合します。続けてテストデータで各ロールの操作を検証します。手元で同じ手順を実行する場合は、ローカルスタックと `psql` を用意します。

```bash
supabase start
supabase db reset --local --no-seed
export PGHOST=127.0.0.1 PGPORT=54322 PGDATABASE=postgres PGUSER=postgres PGPASSWORD=postgres
bash supabase/verify-authorization.sh
for test in supabase/tests/*.sql; do
  psql -X -w -v ON_ERROR_STOP=1 -f "$test" || break
done
```

## 承認済み環境での照合

1. 対象のプロジェクト参照、DB ホスト、リリース対象コミットを確認します。承認済みの検証接続で、`supabase_migrations.schema_migrations` を参照できるロールを使います。接続情報は `PGHOST`、`PGDATABASE`、`PGUSER` と安全に管理された認証ファイルで設定します。リモート接続では接続先の CA を使って `PGSSLMODE=verify-full` を設定します。
2. リリース対象と同じコミットから `bash supabase/verify-authorization.sh` を実行します。読み取り専用で、履歴、RLS の有効状態、ポリシーの定義、ロール別テーブル・列・関数権限、トリガーを照合します。差分がある場合は両方の結果を表示し、終了コードを 1 にします。
3. 確認日時、対象環境、コミット、未適用と履歴のみのバージョン、権限差分、判断を [スキーマドリフト記録](schema-drift.md) に残します。履歴とカタログの両方を確認したうえで、差分を解消するリリース手順をレビューします。SQL の操作テストは隔離環境で実行します。

カタログ上の期待値は [expected.jsonl](../supabase/authorization/expected.jsonl) にあります。認可のマイグレーションを変更するときは、新しい隔離 DB で履歴を再生してから、以下の読み取りクエリで更新候補を取得します。既存との差分をレビューし、意図した変更と操作テストを同じコミットに含めます。

```bash
psql -X -w -qAt -v ON_ERROR_STOP=1 -f supabase/authorization/catalog.sql > authorization-candidate.jsonl
diff -u supabase/authorization/expected.jsonl authorization-candidate.jsonl
```

## 関数の呼び出し元

`expected.jsonl` の `function` 行に、関数ごとの実効 `EXECUTE` 権限を記録しています。行にある空配列は、API ロールに実行を許可していないことを表します。

| 呼び出し元               | 関数と目的                                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `anon` / `authenticated` | `increment_views` と `publish_due_scheduled_articles` は公開記事の表示、`get_follow_counts` は公開フォロー件数、`check_is_editor` は RLS 内の編集長判定 |
| `authenticated`          | `begin_sudo_session`、`confirm_sudo_session`、`revoke_sudo_session` は管理画面の再認証。非公開スキーマの `has_active_sudo` は RLS から参照する          |
| `authenticated`          | `admin_get_all_profiles`、`admin_change_user_role`、`admin_set_user_roles`、`admin_promote_writer` は編集長用。DB で編集長権限と再認証状態を確認する    |
| `authenticated`          | MFA のバックアップコード発行・残数確認・復旧、未確認要素の整理                                                                                          |
| `service_role`           | 運用者による `admin_emergency_mfa_reset` の緊急対応                                                                                                     |
| DB 内部                  | 各認可・受付トリガーとその内部ヘルパー。旧 `increment_likes` / `decrement_likes` は廃止済みで、お気に入りのトリガーが集計を更新する                     |

関連資料は [Supabase の関数権限](https://supabase.com/docs/guides/database/functions#function-privileges) と [マイグレーションの管理](https://supabase.com/docs/guides/deployment/managing-environments) を参照してください。
