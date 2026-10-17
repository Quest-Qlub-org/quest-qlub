-- ============================================================================
-- 修正: 記事本文のサーバ側検証（S2）の正規表現バグ対応
-- ----------------------------------------------------------------------------
-- 直前の `20261017085124_harden_contact_and_article_content.sql` で作成した
-- validate_article_content() は、適用時にバックスラッシュが二重化して保存され
-- （`\\s`）、さらにタグ判定に Postgres ARE では「後退(backspace)」を意味する
-- `\b` を使っていたため、パターンが機能していなかった。
--
-- 本マイグレーションで正しい定義（`\s` = 空白、タグ終端は `[\s>/]` または末尾）
-- に置き換える。実DBで `<\s*(script|...)([\s>/]|$)` が `<script>` を検知することを
-- 確認済み。
-- ============================================================================

CREATE OR REPLACE FUNCTION public.validate_article_content()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  c text := coalesce(NEW.content, '');
BEGIN
  IF c ~* '<\s*(script|iframe|object|embed|applet|base|meta|link|style|form|svg)([\s>/]|$)'
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

REVOKE EXECUTE ON FUNCTION public.validate_article_content() FROM PUBLIC, anon, authenticated;
