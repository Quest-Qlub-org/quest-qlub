# スキーマ・マイグレーションの現状記録

最終更新: 2026-11-16

このドキュメントは、Supabase の実DB（本番プロジェクト `uksgnlfnxytqljrctiqg`）と
`supabase/migrations/` の間の差分、および未適用のマイグレーションを記録する。

## 背景

認可（RLS・関数・トリガー）を担う一部のオブジェクトが、リポジトリではなく
ライブDBにのみ存在していた。再構築・ブランチ・復元時に認可が失われるリスクが
あったため、`20261017062721_capture_auth_schema.sql` でライブ定義を冪等に取り込んだ。

## マイグレーション履歴の不一致（未解消）

DB の `supabase_migrations.schema_migrations` に記録済みのバージョンと、
リポジトリのファイル名が一致していないものがある。

- DB履歴にはあるが、リポジトリにファイルが無い
  - `20260906050553` `create_mfa_backup_codes_v2`
    （内容は `20260906140500_mfa_backup_codes.sql` とほぼ同一と推定）
- リポジトリにはあるが、DB履歴に記録が無い
  - `20260906063000_harden_security_and_fix_vulnerabilities.sql`
  - `20260906140500_mfa_backup_codes.sql`
  - `20260906143500_admin_emergency_mfa_reset.sql`

> 解消には DB 履歴（`schema_migrations`）の調整が必要なため、影響範囲を確認のうえ
> 別タスクで対応する。

### 2026-11-20 認可の照合（本番、読み取り）

[Issue #161 の監査記録](https://github.com/Quest-Qlub-org/quest-qlub/issues/161) では、本番の履歴上の最新バージョンが `20261113120000` でした。後続の修正は一部が実効定義に反映されていました。公開スキーマの対象9テーブルで RLS は有効でした。一般ロールからプロフィールのメールと復旧コードのハッシュを読み取る権限、およびプロフィールのロールを直接更新する権限は確認されませんでした。廃止済みの記事集計関数には実行権限が残っていました。

2026-11-21 の隔離 PostgreSQL では、全履歴の再生時に `get_mfa_backup_codes_status()` の戻り値が `json` から `jsonb` に変わる箇所で停止しました。`20261113115959` は旧 `json` 定義だけを除去し、直後の `20261113120000` で置き換えます。既に `jsonb` の環境はこの前処理の対象外です。

修正後は隔離 PostgreSQL 17・18 で全37件のマイグレーションを再生し、6本の SQL テストが通りました。両バージョンが同じ権限カタログを返しました。

以後の適用履歴とカタログの照合は、[DB 認可のリリース検証](database-authorization-release.md) に従います。

## 適用済みのマイグレーション（デプロイ順序に依存）

- `20261017063000_restrict_role_update.sql`（適用済み）
  - **実装上の注意**: `authenticated` は `profiles` に「テーブルレベル UPDATE」を
    持つため、`REVOKE UPDATE (role)`（列単位）だけでは無効だった。テーブルレベル
    UPDATE を剥奪したうえで、必要な列のみ許可する。
    ```sql
    REVOKE UPDATE ON public.profiles FROM authenticated;
    GRANT UPDATE (email, display_name, username, avatar_url, bio, x_account)
      ON public.profiles TO authenticated;
    ```
  - **適用順序**: デプロイ済みの `SetupProfileView` が upsert で `role` を送信する
    ため、`role` を除去したコードの**デプロイ後に適用**した（本番適用済み）。
  - 以降 `authenticated` は `role` を直接更新できない。ロール変更は
    `admin_change_user_role()`（SECURITY DEFINER）経由のみ。

- `20261017085124_harden_contact_and_article_content.sql`（適用済み）
  - **S3**: `contact_messages` のレート制限を DB トリガーで強制
    （同一メールアドレスにつき10分あたり3件）。Edge Function のインメモリ
    制限はコールドスタート・インスタンス毎で信頼できないため、DB 側を主防御とした。
    インデックス `contact_messages_email_created_at_idx` を追加（後に `20261116123000` で `lower(trim(email))` に合わせた式インデックス `idx_contact_messages_lower_trim_email_created_at` へ整理）。
  - **S2**: `articles.content` に代表的な XSS ベクタが含まれる場合、保存を拒否
    （`<script>`/`<iframe>` 等のタグ、タグ内イベントハンドラ、`javascript:` 等の
    URL スキーム、`srcdoc`）。
    - **注意**: 許可リスト方式ではなく**補助的な**多層防御。主防御は表示時の
      `sanitizeHtml()`（DOMPurify 許可リスト）であり、本トリガー単独では完全では
      ない。既存4記事が抵触しないことは確認済み。
  - **修正**: `20261017090141_fix_article_content_validation.sql` で `validate_article_content()`
    の正規表現を是正。適用時に `\s` が二重化して保存された点、および Postgres ARE では
    `\b` が後退(backspace)を意味し機能しなかった点を修正（タグ終端を `[\s>/]` または
    末尾に変更）。実DBで `<script>` / イベントハンドラ / `javascript:` / `srcdoc` を
    検知し、通常の本文では誤検知しないことを確認済み。

- `20261017100000_harden_mfa_backup_codes_security.sql`（未適用・次回デプロイ）
  - **MFAバックアップコードの暗号強度向上と権限最小化**:
    - `mfa_backup_codes` テーブルの直接 SELECT/INSERT/UPDATE/DELETE 権限を剥奪し、メタデータ列のみ許可。ハッシュ流出によるオフラインクラックを遮断。
    - `generate_mfa_backup_codes()` の疑似乱数 `random()` を廃止し、暗号学的安全な乱数 `gen_random_bytes` による生成へ更新。
    - `verify_and_consume_backup_code()` におけるブルートフォース試行への微小遅延防御を追加。

- `20261017101000_capture_missing_schema_and_policies.sql`（適用済み）
  - **スキーマドリフト解消 & 記事認可ポリシー強化**:
    - `admin_promote_writer` 関数本体の正式定義とリポジトリ取り込み（本番適用済み）。
    - `articles` の UPDATE / DELETE ポリシーに `profiles.role IN ('writer', 'editor')` の存在チェックを追加し、降格された元ライターによる不正更新・削除を遮断。

- `20261018010000_implement_comments_and_follows.sql`（適用済み）
  - **コメント機能・フォロー機能のDB化と権限・プライバシー強化**:
    - `articles.comments_enabled` 列の追加（ライター・編集長による記事ごとのコメントオン/オフ制御、オフ時はライター・編集長以外の過去コメント閲覧も遮断）。
    - `article_comments` テーブル作成および `is_pinned`（ライターのみ・最大3件トリガー検証）、`updated_at`、RLSポリシーの設定。
    - `comment_edit_history` テーブルと自動履歴記録トリガー（`trg_enforce_comment_update_rules`）の追加（全ユーザーが編集履歴を閲覧可能）。
    - `user_follows` テーブルの作成、全ユーザー公開用カウント集計RPC `get_follow_counts(uuid)`、および本人限定の詳細一覧SELECT RLSポリシーの設定。
  - **クライアント側スキーマ耐障害性（Graceful Degradation）**:
    - `ArticleComments` コンポーネントに `localStorage` 永続化フォールバック（`quest_qlub_comments_${articleId}`）を整備。万一のスキーマドリフト（PGRST205 / 42P01 / 42703）や一時的な通信障害時にも、コメント投稿・ピン留め・編集・削除がローカルに安全保持され、ブラウザ更新でコメントが消失しない耐障害性を担保。
    - `comments_enabled` 列が存在しない場合でも PostgREST 42703 エラーで記事一覧が非表示にならないよう、`DataContext`, `ProfileView`, `WriterDashboard` では安全なカラム定義（`ARTICLE_LIST_FIELDS`）を採用。
    - `ArticleEditorView` での保存・更新時には、DB側で `comments_enabled` が未存在の場合（42703）に自動で除外リトライする多層防御フォールバックを組み込み、未適用・適用後の両方でシームレスに動作する互換性を担保。
    - `user_follows` テーブルおよび `get_follow_counts` 関数が未適用の状態（PGRST205 / 42P01 / 42883）でも、`useFollows` フックがアカウント別の `localStorage`（`quest_qlub_user_follows_${currentUserId}`）へ透過的にフォールバック。ログイン済みユーザーがフォロー操作を行ってもエラーで弾かれたり `/login` に強制リダイレクトされることなく、安全にフォロー状態が維持されるクライアント耐障害性を担保。
    - 各画面（`ArticleView`, `ProfileView`, `WritersView`）において、フォローボタン押下時の未認証判定（`!isAuthenticated`）と実行失敗判定（`!ok`）を明確に分離。ログイン済みユーザーの操作失敗を「未ログイン」と誤認して `/login` に飛ばす挙動を根本解消するとともに、著者本人による自己フォロー操作の抑止（ボタン非表示および警告通知）を徹底。

- `20261024070000_add_profile_roles_array.sql`（`20261113120000` で同期済み / Issue #54）
  - **プロフィール複数ロール対応（roles配列列と管理RPC）**:
    - `public.profiles` に `roles text[] DEFAULT '{}'::text[]` を追加し、1アカウントに複数のロール（例: 編集長 + エンジニア、ライター + エンジニア）を付与可能に拡張。
    - `anon`, `authenticated` に `roles` 列の SELECT 権限を付与（公開プロフィールおよび `/about` での表示用）。
    - 編集長専用の複数ロール一括更新RPC `admin_set_user_roles(target_user_id text, new_roles text[])` を新設（最後の編集長アカウント降格防止チェック付き、下位互換のため既存 `role` 列も主ロールとして自動同期）。
    - 既存の `admin_change_user_role`, `admin_promote_writer`, `admin_get_all_profiles` を `roles` 配列と同期するよう拡張。
    - `check_is_editor()` 関数およびトリガー `prevent_self_role_escalation`, `enforce_profile_initial_role` を更新し、`roles` 配列による権限昇格の不正試行を DB トリガー層で防御。
  - **クライアント側スキーマ耐障害性（Graceful Degradation）**:
    - `roles` カラムが DB 未適用の環境（42703 エラー）でも、`AuthContext`, `DataContext` (`fetchWriters`, `loadMoreWriters`, `fetchTeamMembers`), `ProfileView`, `EditorWritersView` のすべてで自動除外リトライと単一 `role` カラムへのフォールバック（`getProfileRoles`）を整備。
    - `admin_set_user_roles` RPC が未定義（42883 エラー）の場合でも、`EditorWritersView` が即座に従来の `admin_change_user_role` へ自動フォールバックし、さらにローカルオーバーライド（`setLocalRolesOverride`）およびカスタムイベント（`quest_qlub_roles_updated`）と Supabase Realtime 購読によって `/about` へ即座に複数ロール・カスタムロールを反映。
    - `/about`（`AboutView`）では、ハードコードされていたメンバー一覧を廃止し、取得したロール情報から「編集長」「ライター」「エンジニア」「その他カスタムロール」へ動的分類して自動反映。複数ロールを持つメンバー（例: ライター兼エンジニアの「るーと」、編集長兼エンジニアの「Noimzip」）は該当するすべてのセクションへ重複して自動掲載される。

- `20261024120000_fix_series_edit_and_scheduled_articles.sql`（`20261113120000` で同期済み / Issue #54）
  - **連載（`series`）編集権限の修復（Issue #54-10）**:
    - `public.series` テーブルに対する `authenticated` の `SELECT, INSERT, UPDATE, DELETE` 権限および `anon` の `SELECT` 権限を明示的に GRANT。
    - `writer_id`（`text`/`uuid` 型の差異を吸収するため `(writer_id)::text = (auth.uid())::text`）と `profiles.roles` 配列も考慮した `series_insert_own_or_editor`, `series_update_own_or_editor`, `series_delete_own_or_editor` RLS ポリシーを再構築し、0件更新（サイレント失敗）や権限拒否を根本解消。
    - フロントエンド側（`WriterSeriesPage.tsx` + `utils/seriesOverrides.ts`）では DB マイグレーション未適用時でも連載の編集・新規作成・削除および記事の割り当て・話数変更が維持されるローカル永続化フォールバックを整備。
  - **予約投稿（`scheduled_at` / `status = 'scheduled'`）の実装（Issue #54-3）**:
    - `public.articles` に `scheduled_at TIMESTAMPTZ DEFAULT NULL` 列およびインデックス `articles_scheduled_at_idx` を追加。
    - 予約日時が到来した記事を自動公開する `publish_due_scheduled_articles()` RPC（`SECURITY DEFINER`）を追加。
    - `enforce_article_update_rules()` トリガーおよび `articles_select_published` RLS ポリシーを更新し、公開予約記事（`status = 'scheduled'` または未来の `scheduled_at`）が予約時刻到来前に一般公開されないよう保護。
    - クライアント側（`utils/scheduledArticles.ts`）にも 42703 カラム未存在時の自動除外リトライと `localStorage` フォールバック（`quest_qlub_scheduled_articles_v1`）を実装。

- `20261029143600_fix_article_comments_public_rls.sql`（適用済み）
  - **未認証（anon）読者による記事コメント閲覧権限の修復**:
    - `article_comments` の SELECT ポリシーにおいて、`check_is_editor()` 関数が単一の `FOR SELECT TO public` ポリシー内に含まれていたため、関数実行権限を持たない `anon`（未ログイン）ユーザーがコメントを取得する際に `ERROR 42501: permission denied for function check_is_editor` が発生し、コメントが確認できない不具合を根本解消。
    - `anon` ロールへの `check_is_editor()` EXECUTE 権限を付与（内部で `auth.uid()` を参照するため安全に `false` を返却）。
    - `article_comments` の SELECT ポリシーを `article_comments_select_public`（`TO public`、`comments_enabled = true` の記事コメントを誰でも閲覧可能）と `article_comments_select_staff`（`TO authenticated`、`comments_enabled = false` 時に記事ライターまたは編集長が閲覧可能）に分離。
    - `article_comments` および `comment_edit_history` に対する `anon`, `authenticated` の `SELECT` 権限を明示的に GRANT。

- `20261109163000_add_collaborators_to_articles_and_series.sql`（`20261113120000` で同期済み）
  - **記事・連載の共同編集機能（collaborator_ids）と複数執筆者表示**:
    - `public.articles` および `public.series` に `collaborator_ids text[] DEFAULT '{}'::text[]` カラムと GIN インデックスを追加。
    - `articles` の下書き閲覧（`articles_select_own_drafts`）および更新（`articles_update_own_articles`）ポリシーを拡張し、共同編集者（`auth.uid() = ANY(collaborator_ids)`）による下書き閲覧・更新・申請を許可。ライター/編集長ロール検証を維持。
    - `articles` 更新トリガー関数 `enforce_article_update_rules()` を更新し、共同編集者による `writer_id` 改ざんを防止（`NEW.writer_id := OLD.writer_id`）。
    - `series` の更新ポリシー（`series_update_own_or_editor`）および `enforce_series_update_rules()` トリガーを追加し、共同編集者による連載の更新を許可しつつ作成者ID改ざんを抑止。
    - 記事・連載の削除（DELETE）権限は主作成者および編集長のみに限定。共同編集者による削除操作はUIおよびDBポリシーで遮断。
  - **クライアント側スキーマ耐障害性（Graceful Degradation）**:
    - 安全な記事一覧取得フィールド（`ARTICLE_LIST_FIELDS`）から `collaborator_ids` を除外し、未適用環境での 42703 エラー（`column articles.collaborator_ids does not exist`）による一覧取得失敗（`DataContext` の `fetchArticles`, `loadMoreArticles` や `ProfileView`, `SearchView` 等）を根絶。
    - ライター・連載管理（`WriterDashboard`, `WriterSeriesPage`）では共同執筆記事のオプショナル取得フィールド（`WRITER_ARTICLE_LIST_FIELDS = \`${ARTICLE_LIST_FIELDS}, collaborator_ids\``）を利用し、DB未適用時の 42703 エラー検知で安全な `ARTICLE_LIST_FIELDS` へ自動フォールバック。未適用DBでもマイ記事が確実に表示され、適用後DBでは共同編集記事や「共同編集」バッジがシームレスに表示される多層防御を構築。
    - 編集長管理（`EditorArticlesView`）でもオプショナルフィールド `EDITOR_ARTICLE_LIST_FIELDS` に `collaborator_ids` を含め、未適用時は安全な `ARTICLE_LIST_FIELDS` に自動縮退。
    - `isArticleOptionalColumnSchemaError` 判定ユーティリティに `collaborator_ids` を追加し、DB列未存在時（42703エラー）でも自動除外リトライで下書き保存や連載保存を継続可能に。
    - 記事詳細画面（`ArticleView`）の「この記事を書いた人」セクションで、主執筆者＋共同執筆者のカードを重複排除した上で複数人並べて表示。各執筆者への個別フォローおよびプロフィール遷移に対応。
    - コメント管理（`ArticleComments`）でも共同執筆者判定と「共同執筆者」バッジを導入。
    - 連載管理（`WriterSeriesPage`）で共同編集連載のカード表示（「共同編集」バッジ）および連載内記事の表示・話数管理に対応。

- `20261111205000_fix_articles_insert_delete_roles_array.sql`（適用済み / Issue #70）
  - **記事 INSERT / DELETE RLS ポリシーの複数ロール（`profiles.roles`）配列対応**:
    - `profiles.roles` 配列導入後、下書き閲覧（`articles_select_own_drafts`）や更新（`articles_update_own_articles`）の RLS ポリシーは roles 配列を考慮するよう更新されていたが、記事の作成（`articles_insert_writer_or_editor`）および削除（`articles_delete_own_articles`）ポリシーが旧来の `profiles.role IN ('writer', 'editor')` のまま残存していた。
    - 主ロールが `engineer` や `viewer` であり、`roles` 配列に `writer` または `editor` を保持しているアカウントが記事作成（INSERT）や自記事削除（DELETE）を行った際に RLS 違反（42501 `permission denied`）で拒否される不具合を根本解消。
    - `articles_insert_writer_or_editor` および `articles_delete_own_articles` の認可条件に `'writer' = ANY(COALESCE(profiles.roles, '{}'::text[])) OR 'editor' = ANY(COALESCE(profiles.roles, '{}'::text[]))` を追加。本番実DB（`uksgnlfnxytqljrctiqg`）へ適用・検証完了。
- `20261111205500_harden_collaborator_permissions_and_comments.sql`（未適用だった差分は `20261113120000` へ統合同期）
  - **共同編集者の collaborator_ids 改ざん防止 & コメント削除権限付与**:
    - トリガー関数 `enforce_article_update_rules()` および `enforce_series_update_rules()` を更新し、主作成者（`writer_id`）以外の共同編集者が更新した際に `NEW.collaborator_ids := OLD.collaborator_ids;` を強制。主作成者または編集長のみが共同編集者を変更できるようにガードを追加。
    - `article_comments_delete` RLS ポリシーに共同編集者（`(auth.uid())::text = ANY(COALESCE(articles.collaborator_ids, '{}'::text[]))`）を追加し、共同執筆記事に対するコメント削除（モデレーション）を共同編集者にも許可。
    - `article_comments_select_staff` RLS ポリシーにも同様に共同編集者を追加し、コメント機能オフ時の整合性を担保。

- `20261113120000_comprehensive_security_performance_and_schema_sync.sql`（本番DB `uksgnlfnxytqljrctiqg` 部分適用済み / Issue #122, #135）
  - **外部キーインデックス追加 & パフォーマンス最適化（Issue #135）**:
    - 欠落していた外部キーインデックスを追加: `idx_articles_series_id` (`articles(series_id)`), `idx_favorites_article_id` (`favorites(article_id)`), `idx_series_writer_id` (`series(writer_id)`)。
    - 全 RLS ポリシー内の `auth.uid()` / `auth.role()` 呼び出しを `(select auth.uid())` 形式へ最適化し、`get_advisors` 上で `unindexed_foreign_keys` 0 件・`auth_rls_initplan` 0 件を確認済み。
  - **スキーマ同期 & セキュリティ強化（Issue #122）**:
    - `profiles.roles` 配列、`articles.scheduled_at` / `collaborator_ids`、`series.collaborator_ids`、`user_follows` 権限・RLS、`contact_messages` / `comment_edit_history` / `mfa_backup_codes` / `storage.objects` のハードニングを統合。
    - **手動実行が残るステートメント**: MCP SQL クライアントの仕様により `DELETE` / `DROP` を含む一部ステートメント（不要関数/ポリシーの `DROP FUNCTION` / `DROP POLICY`、および `mfa_backup_codes` / `auth.mfa_factors` 関連の `DELETE` を含む関数再定義など）は自動キャンセルされたため、同マイグレーションファイル内の該当 SQL を Supabase Dashboard SQL Editor（または `supabase db push`）から手動適用する必要がある（詳細は Issue #122 コメントを参照）。

## 過去の計画メモ（`20261113120000` へ統合された Issue #78, #79, #80, #85）

- **Issue #78: `comment_edit_history` の直接 INSERT 権限剥奪および閲覧制限ポリシー改修**:
  - **背景・課題**: `comment_edit_history` テーブルには DB トリガー `trg_enforce_comment_update_rules`（SECURITY DEFINER）による自動挿入が行われるが、`comment_edit_history_insert` ポリシーおよび INSERT 権限がクライアント（`authenticated`）に残存しているため、PostgREST 経由で直接 INSERT を実行して過去の編集履歴やタイムスタンプを捏造できる脆弱性が存在する。また、SELECT ポリシーが `USING (true)` となっており、記事の `comments_enabled = false` 設定時にも履歴が漏洩する。
  - **対応方針**:
    - `REVOKE INSERT ON public.comment_edit_history FROM authenticated, anon, PUBLIC;` を実行し、トリガー経由のみで履歴追加を許可。
    - `comment_edit_history_insert` ポリシーを `WITH CHECK (false)` へ変更（`20261112040000`）、`20261113120000` で直接 INSERT 権限を剥奪し、`20261116123000` で同ポリシーを削除。
    - `comment_edit_history_select` ポリシーを `USING (EXISTS (SELECT 1 FROM public.article_comments WHERE article_comments.id = comment_edit_history.comment_id))` に改修し、親コメントの閲覧権限（`comments_enabled` およびスタッフ権限）と連動させる。

- **Issue #79: `user_follows` テーブルに対する `authenticated` ロールへの GRANT 権限不足の解消**:
  - **背景・課題**: `20261018010000_implement_comments_and_follows.sql` で RLS ポリシーは定義されたが、明示的な `GRANT SELECT, INSERT, DELETE ON public.user_follows TO authenticated;` が欠落していた。デフォルト権限が継承されない環境では 42501（`permission denied for table user_follows`）が発生する（現在はクライアント側 `useFollows` の `localStorage` 退避で画面クラッシュを回避中）。
  - **対応方針**:
    - 新規マイグレーションにて `GRANT SELECT, INSERT, DELETE ON public.user_follows TO authenticated;` を明示的に適用し、実DBへのフォロー状態の安全な永続化を保証する。

- **Issue #80: `contact_messages` の SELECT RLS ポリシーにおけるマルチロール対応**:
  - **背景・課題**: `contact_messages` の SELECT ポリシーが旧来の単一ロール列 `profiles.role = 'editor'` をハードコードしており、主ロールが `engineer` 等で `roles` 配列に `editor` を保持する複数ロールアカウントが `/editor-dash/applications`（`EditorApplicationsView`）でライター応募申請一覧を取得できない。
  - **対応方針**:
    - ポリシーの条件を既存の編集長判定共通関数 `public.check_is_editor()` に統一し、複数ロールアカウントでも確実にアクセスできるようにする。

- **Issue #85: Supabase Storage `thumbnails` バケット RLS ポリシーにおけるマルチロール（`profiles.roles` 配列）対応**:
  - **背景・課題**: `storage.objects` の `storage_thumbnails_insert_writer`, `update_writer`, `delete_writer` ポリシーが `profiles.role IN ('writer', 'editor')` のみを評価しており、主ロールが `engineer` や `viewer` で `roles` に `writer` または `editor` を持つアカウントがアイキャッチ画像・本文画像をアップロードする際に 403 エラーが発生する。
  - **対応方針**:
    - `storage.objects` の上記3ポリシーを更新し、`'writer' = ANY(COALESCE(profiles.roles, '{}'::text[])) OR 'editor' = ANY(COALESCE(profiles.roles, '{}'::text[]))` の認可条件を追加する。

## 新規・未適用マイグレーション（Issue #138, #140, #141, #148）

- `20261116120000_fix_security_triggers_and_series_delete_rls.sql`（未適用・次回デプロイ / Issue #138）
  - **予約投稿トリガー保護・連載 DELETE 権限・コメント更新改ざん防止の強化**:
    - `enforce_article_update_rules()` で `NEW.status IN ('published', 'scheduled')` または `OLD.status IN ('published', 'scheduled') AND OLD.scheduled_at > now()` の場合に非編集長による `scheduled_at` 変更を抑止。
    - `series_delete_own_or_editor` RLS に `(writer_id)::text = ((select auth.uid()))::text` および現役 `writer`/`editor` ロール確認を追加。
    - `enforce_comment_update_rules_and_history()` で `NEW.author_name := OLD.author_name` および本文未変更時の `NEW.updated_at := OLD.updated_at` を強制。
- `20261116121000_fix_scheduled_publish_comment_notnull_and_indexes.sql`（未適用・次回デプロイ / Issue #140）
  - **予約投稿バッチ・コメント NOT NULL・重複 RLS・GIN インデックスの修正**:
    - `enforce_article_update_rules()` の行単位 GUC リセットを廃止し、`publish_due_scheduled_articles()` / `increment_views()` / `sync_article_likes_on_favorite()` 側で例外時も確実にリセット（2件以上同時の予約公開失敗を解消）。
    - `enforce_comment_rate_limit()` で `NEW.updated_at := NEW.created_at` を設定（`NOT NULL` 違反解消）。
    - `enforce_article_insert_rules()` で `draft` / `pending` の `scheduled_at` を保持。
    - `article_comments_select_public` / `article_comments_select_staff` の旧重複ポリシーを削除し、`idx_articles_collaborator_ids` / `idx_series_collaborator_ids` GIN インデックスを追加。
- `20260901000000_baseline_schema.sql` & `20261116122000_fix_article_comments_author_id_constraint.sql`（未適用・次回デプロイ / Issue #141）
  - **クリーン環境再現性（ベースライン DDL）と `article_comments.author_id` 制約是正**:
    - コアテーブル（`profiles`, `series`, `articles`, `favorites`, `contact_messages`）、`storage.buckets` 初期レコード、初期関数シグネチャを冪等に定義し、初期マイグレーションの非冪等 `CREATE POLICY` へ `DROP POLICY IF EXISTS` ガードを追加。
    - `article_comments.author_id` の外部キーを `ON DELETE CASCADE`・`NOT NULL` へ統一。
- `20261116123000_cleanup_storage_avatars_comment_policy_and_contact_idx.sql`（未適用・次回デプロイ / Issue #148）
  - **残余 DB 整理**:
    - `storage_avatars_insert_own` / `update_own` / `delete_own` を `((select auth.uid()))::text` 化。
    - 未使用の `comment_edit_history_insert` ポリシーを削除。
    - `idx_contact_messages_lower_trim_email_created_at` 式インデックスを作成し、旧 `contact_messages_email_created_at_idx` を削除。

## セキュリティ強化（コード・Edge Function）

- **S4**: `send-contact-email` の CORS 許可リストを厳格化し、メールヘッダインジェクション対策（CR/LF 除去）やプロキシヘッダに基づくクライアント IP のレート制限・入力検証を強化。さらに `Deno.serve` 移行・HTTP メソッド/JSON オブジェクト検証順序是正・レガシーオリジン削除を実施（Issue #123, #148 / Edge Function 再デプロイ待ち）。
- **S6**: OGP / sitemap エンドポイント（`apps/website/api/_shared.ts`, `article-ogp.ts`, `writer-ogp.ts`, `sitemap.ts`）の共有化、予約投稿記事の公開判定（`buildPublishedOrDueFilter` + 42703 フォールバック）、Bot UA 誤マッチ修正を実施。

## 依存関係のバージョン状況（Dependabot & ツールチェーン）

- **主要ツールチェーン & ライブラリ**:
  - `vite-plus`: `1.4.0`（内部ツール: Vite `8.3.5`, Vitest `5.0.5`, Oxlint `1.89.0`, Oxfmt `0.74.0`, Rolldown `1.2.15`, tsdown `0.23.1`）
  - `@supabase/supabase-js`: `2.119.0`
  - `react-router-dom`: `7.18.5`
  - `lucide-react`: `1.72.0`
  - `@tiptap/*`: `3.33.1`
  - `dompurify`: `3.4.17`
- **脆弱性対応オーバーライド**:
  - `tinypool` / `source-map-js` / `@babel/core` は `pnpm.overrides` で修正版へ固定。
  - 2026-11-21 に Workbox のビルド依存を `glob@14.0.2` / `minimatch@11.0.9` に更新し、`pnpm audit` で検出が0件であることを確認。

## 未対応・許容済み

- **S5** `increment_views`: セッション識別が無く重複カウントを排除できないため、
  閲覧数インフレは許容（低リスク。機密性・完全性には影響しない）。
- マイグレーション履歴の不一致（上記）: `schema_migrations` の調整が必要なため
  別タスクで対応する。
