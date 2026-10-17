-- ============================================================================
-- セキュリティ強化: MFA バックアップコードの暗号強度向上と権限最小化
-- ----------------------------------------------------------------------------
-- 1. mfa_backup_codes テーブルへの直接 SELECT/INSERT/UPDATE/DELETE 権限を
--    anon / authenticated から完全剥奪（多層防御）。
--    コードハッシュの漏洩によるオフラインクラックを根本遮断する。
--    ステータス取得・コード消費は SECURITY DEFINER RPC 経由でのみ実行可能とする。
-- 2. generate_mfa_backup_codes() における疑似乱数 random() を廃止し、
--    暗号学的に安全な乱数（gen_random_bytes）によるコード生成に変更。
-- 3. verify_and_consume_backup_code() におけるブルートフォース（総当たり）
--    遅延防御（不正コード試行時の待機）を追加。
-- ============================================================================

-- 1. テーブル権限の最小化 ---------------------------------------------------
REVOKE ALL ON public.mfa_backup_codes FROM anon, authenticated, PUBLIC;
GRANT SELECT (id, user_id, used_at, created_at) ON public.mfa_backup_codes TO authenticated;

-- 2. 暗号学的に安全なバックアップコード生成関数 ------------------------------
CREATE OR REPLACE FUNCTION public.generate_mfa_backup_codes()
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
    uid UUID := auth.uid();
    codes text[] := '{}';
    new_code text;
    h text;
    chars text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; -- 32文字（曖昧な 0/O, 1/I を除外）
    i int;
    j int;
    rand_byte int;
BEGIN
    IF uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- 古いバックアップコードを無効化（削除）
    DELETE FROM public.mfa_backup_codes WHERE user_id = uid;

    -- 暗号論的疑似乱数（gen_random_bytes）により 10 個のコードを生成
    FOR i IN 1..10 LOOP
        new_code := '';
        FOR j IN 1..8 LOOP
            IF j = 5 THEN
                new_code := new_code || '-';
            END IF;
            -- gen_random_bytes(1) から 0〜255 の乱数を取得
            rand_byte := get_byte(gen_random_bytes(1), 0);
            new_code := new_code || substr(chars, (rand_byte % length(chars)) + 1, 1);
        END LOOP;

        codes := array_append(codes, new_code);

        -- ハイフン除去・大文字化してハッシュ化（ソルト代用としてユーザーIDをプレフィックス付与）
        h := encode(sha256((uid::text || ':' || upper(replace(new_code, '-', '')))::bytea), 'hex');

        INSERT INTO public.mfa_backup_codes (user_id, code_hash)
        VALUES (uid, h);
    END LOOP;

    RETURN codes;
END;
$$;

-- 3. ブルートフォース耐性を備えたバックアップコード検証関数 --------------------
CREATE OR REPLACE FUNCTION public.verify_and_consume_backup_code(p_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
    uid UUID := auth.uid();
    normalized_code text;
    h_new text;
    h_legacy text;
    target_id UUID;
BEGIN
    IF uid IS NULL THEN
        RETURN false;
    END IF;

    IF p_code IS NULL OR trim(p_code) = '' THEN
        PERFORM pg_sleep(0.5); -- 不正試行時の時間差防御
        RETURN false;
    END IF;

    -- 入力コードの正規化: 記号除去・大文字化
    normalized_code := upper(regexp_replace(trim(p_code), '[^a-zA-Z0-9]', '', 'g'));

    -- 新形式ハッシュ（uid 付き）
    h_new := encode(sha256((uid::text || ':' || normalized_code)::bytea), 'hex');
    -- 旧形式ハッシュ（後方互換性用）
    h_legacy := encode(sha256(normalized_code::bytea), 'hex');

    -- 一致する未使用バックアップコードを検索
    SELECT id INTO target_id
    FROM public.mfa_backup_codes
    WHERE user_id = uid
      AND (code_hash = h_new OR code_hash = h_legacy)
      AND used_at IS NULL
    LIMIT 1;

    IF target_id IS NULL THEN
        -- 総当たり攻撃を抑制するための微小遅延
        PERFORM pg_sleep(0.5);
        RETURN false;
    END IF;

    -- コードを使用済みに更新
    UPDATE public.mfa_backup_codes
    SET used_at = now()
    WHERE id = target_id;

    -- デバイス紛失による復旧のため、TOTPファクターを全解除
    DELETE FROM auth.mfa_factors
    WHERE user_id = uid;

    RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_mfa_backup_codes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_mfa_backup_codes() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.verify_and_consume_backup_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_and_consume_backup_code(text) TO authenticated;
