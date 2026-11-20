# 認証設定のリリース確認

## 漏えい済みパスワードの拒否（#165）

Supabase の Pro 以上では、承認済みの対象プロジェクトで Authentication → Sign In / Providers → Email を開き、**Prevent use of leaked passwords** を有効にする。プロジェクト参照と切り替えの状態を記録する。設定が利用できるプランと認証の動作は公式ガイドで確認できる。 [Supabase Password Security](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)

Free プランを継続する場合、現在のホスト構成で登録と変更の両方に漏えい照合を強制できる Auth フックは提供されていない。ブラウザーでの事前チェックは直接の Auth リクエストに適用されない。強制が必要な環境では Pro 以上のマネージド Auth を優先し、セルフホストを選ぶ場合は Auth サービスで `GOTRUE_PASSWORD_HIBP_ENABLED=true` を設定する。セルフホストでは照合サービスに接続できない場合も新しいパスワードの設定を拒否する `GOTRUE_PASSWORD_HIBP_FAIL_CLOSED=true` を使用する。 [GoTrue の設定定義](https://github.com/supabase/auth/blob/master/internal/conf/configuration.go) · [Before User Created Hook](https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook)

隔離環境で、設定の有効化より前にテスト用の漏えい済みパスワード（`password123` など）を持つアカウントを準備する。設定の有効化後に、以下を確認し、実施日と結果を記録する。

1. 新規登録で漏えい済みパスワードを指定すると、署名済みセッションが作られずフォームに拒否理由が表示される。
2. 設定画面のパスワード変更およびメールから開く再設定画面で、同じ漏えい済みパスワードを指定すると、いずれも変更されずフォームに拒否理由が表示される。
3. 設定の有効化前に準備したテストアカウントで、元のパスワードを使うログインが成功する。新たに設定を許可されたパスワードでの変更とログインも確認する。
