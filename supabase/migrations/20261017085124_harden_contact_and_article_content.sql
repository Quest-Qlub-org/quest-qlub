-- ============================================================================
-- セキュリティ強化（サーバ側・DBのみで完結）
-- ----------------------------------------------------------------------------
-- S3: contact_messages のレート制限を DB 側で強制する。
--   クライアントは contact_messages へ直接 INSERT するため、Edge Function の
--   インメモリ制限（コールドスタートで消える・インスタンス毎）だけでは不十分。
--   DB トリガーで「同一メールアドレスにつき10分あたり3件」に制限する。
--
-- S2: 記事本文（articles.content）に危険な HTML が保存されるのをサーバ側で拒否する。
--   表示時はクライアントで DOMPurify（許可リスト方式）を通しているが、多層防御と
--   して保存経路（直接API含む）でも代表的な XSS ベクタを拒否する。
--   ※ これは許可リスト方式ではないため単独では完全ではない。表示時サニタイズが
--     主防御であり、本トリガーは補助的な防御である。
-- ============================================================================

-- S3: contact_messages のレート制限 -----------------------------------------
CREATE INDEX IF NOT EXISTS contact_messages_email_created_at_idx
  ON public.contact_messages (email, created_at DESC);

CREATE OR REPLACE FUNCTION public.enforce_contact_rate_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  recent_count integer;
BEGIN
  SELECT count(*) INTO recent_count
  FROM public.contact_messages
  WHERE email = NEW.email
    AND created_at > now() - interval '10 minutes';

  IF recent_count >= 3 THEN
    RAISE EXCEPTION '同じメールアドレスから短時間に複数のお問い合わせが送信されています。しばらくしてから再度お試しください。';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_contact_rate_limit ON public.contact_messages;
CREATE TRIGGER trg_enforce_contact_rate_limit
  BEFORE INSERT ON public.contact_messages
  FOR EACH ROW EXECUTE FUNCTION public.enforce_contact_rate_limit();

-- S2: 記事本文の危険な HTML を拒否 ------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_article_content()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  c text := coalesce(NEW.content, '');
BEGIN
  IF c ~* '<\s*(script|iframe|object|embed|applet|base|meta|link|style|form|svg)\b'
     OR c ~* '<[^>]+\son[a-z]+\s*='
     OR c ~* '(href|src|xlink:href)\s*=\s*["'']?\s*(javascript|vbscript|data:text/html)'
     OR c ~* '\ssrcdoc\s*=' THEN
    RAISE EXCEPTION '記事本文に許可されていないHTMLが含まれています。';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_validate_article_content ON public.articles;
CREATE TRIGGER trg_validate_article_content
  BEFORE INSERT OR UPDATE ON public.articles
  FOR EACH ROW EXECUTE FUNCTION public.validate_article_content();

-- トリガー関数の実行権限は不要なため剥奪（多層防御）
REVOKE EXECUTE ON FUNCTION public.enforce_contact_rate_limit() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_article_content() FROM PUBLIC, anon, authenticated;
