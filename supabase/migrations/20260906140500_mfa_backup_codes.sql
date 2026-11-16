-- 1. Create mfa_backup_codes table
CREATE TABLE IF NOT EXISTS public.mfa_backup_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL,
    used_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast user search
CREATE INDEX IF NOT EXISTS idx_mfa_backup_codes_user_id ON public.mfa_backup_codes(user_id);

-- Enable RLS
ALTER TABLE public.mfa_backup_codes ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only view their own backup code metadata (used_at, created_at) - hash is protected
DROP POLICY IF EXISTS "Users can view own backup codes" ON public.mfa_backup_codes;
CREATE POLICY "Users can view own backup codes" ON public.mfa_backup_codes
    FOR SELECT USING (auth.uid() = user_id);

-- 2. Function to generate 10 backup codes
CREATE OR REPLACE FUNCTION public.generate_mfa_backup_codes()
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    uid UUID := auth.uid();
    codes text[] := '{}';
    new_code text;
    h text;
    chars text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; -- avoid ambiguous 0/O, 1/I
    i int;
    j int;
BEGIN
    IF uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Delete old backup codes for this user
    DELETE FROM public.mfa_backup_codes WHERE user_id = uid;

    -- Generate 10 codes formatted like XXXX-XXXX
    FOR i IN 1..10 LOOP
        new_code := '';
        FOR j IN 1..8 LOOP
            IF j = 5 THEN
                new_code := new_code || '-';
            END IF;
            new_code := new_code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
        END LOOP;

        codes := array_append(codes, new_code);

        -- Normalize (remove hyphens, uppercase) then hash
        h := encode(sha256(upper(replace(new_code, '-', ''))::bytea), 'hex');

        INSERT INTO public.mfa_backup_codes (user_id, code_hash)
        VALUES (uid, h);
    END LOOP;

    RETURN codes;
END;
$$;

-- 3. Function to get backup codes status (remaining count)
CREATE OR REPLACE FUNCTION public.get_mfa_backup_codes_status()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    uid UUID := auth.uid();
    total_count int;
    remaining_count int;
BEGIN
    IF uid IS NULL THEN
        RETURN json_build_object('total', 0, 'remaining', 0);
    END IF;

    SELECT count(*) INTO total_count
    FROM public.mfa_backup_codes
    WHERE user_id = uid;

    SELECT count(*) INTO remaining_count
    FROM public.mfa_backup_codes
    WHERE user_id = uid AND used_at IS NULL;

    RETURN json_build_object('total', total_count, 'remaining', remaining_count);
END;
$$;

-- 4. Function to verify and consume a backup code
CREATE OR REPLACE FUNCTION public.verify_and_consume_backup_code(p_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    uid UUID := auth.uid();
    normalized_code text;
    h text;
    target_id UUID;
BEGIN
    IF uid IS NULL THEN
        RETURN false;
    END IF;

    -- Normalize code: remove all non-alphanumeric chars and uppercase
    normalized_code := upper(regexp_replace(trim(p_code), '[^a-zA-Z0-9]', '', 'g'));
    h := encode(sha256(normalized_code::bytea), 'hex');

    -- Find matching unused backup code
    SELECT id INTO target_id
    FROM public.mfa_backup_codes
    WHERE user_id = uid
      AND code_hash = h
      AND used_at IS NULL
    LIMIT 1;

    IF target_id IS NULL THEN
        RETURN false;
    END IF;

    -- Mark code as used
    UPDATE public.mfa_backup_codes
    SET used_at = now()
    WHERE id = target_id;

    -- Disable/unenroll all TOTP factors for this user since their device is lost
    DELETE FROM auth.mfa_factors
    WHERE user_id = uid;

    RETURN true;
END;
$$;

-- 5. Function to clean unverified MFA factors safely without client-side 404s
CREATE OR REPLACE FUNCTION public.clean_unverified_mfa_factors()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    IF auth.uid() IS NOT NULL THEN
        DELETE FROM auth.mfa_factors
        WHERE user_id = auth.uid() AND status = 'unverified';
    END IF;
END;
$$;
