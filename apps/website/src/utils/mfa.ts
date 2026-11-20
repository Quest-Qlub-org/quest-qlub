import { supabase } from "../supabase";

export interface VerifiedTotpFactorResult {
  factorId: string | null;
  errorType: "fetch_failed" | "not_found" | "exception" | null;
  errorMessage: string | null;
}

export interface MfaVerifyResult {
  success: boolean;
  errorMessage: string | null;
}

/**
 * 検証済みの TOTP ファクター ID を取得する。
 */
export async function findVerifiedTotpFactor(): Promise<VerifiedTotpFactorResult> {
  try {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error || !data) {
      return {
        factorId: null,
        errorType: "fetch_failed",
        errorMessage: "2要素認証情報の取得に失敗しました",
      };
    }

    const verifiedTotp = data.totp?.find((f) => f.status === "verified");
    if (!verifiedTotp) {
      return {
        factorId: null,
        errorType: "not_found",
        errorMessage: "有効な2要素認証ファクターが見つかりませんでした",
      };
    }

    return {
      factorId: verifiedTotp.id,
      errorType: null,
      errorMessage: null,
    };
  } catch {
    return {
      factorId: null,
      errorType: "exception",
      errorMessage: "通信エラーが発生しました",
    };
  }
}

/**
 * TOTP チャレンジを作成して 6 桁コードを検証する。
 */
export async function verifyTotpCode(factorId: string, rawCode: string): Promise<MfaVerifyResult> {
  const code = rawCode.trim();
  if (!factorId || !code) {
    return {
      success: false,
      errorMessage: "認証コードを入力してください",
    };
  }

  const challenge = await supabase.auth.mfa.challenge({ factorId });
  if (challenge.error || !challenge.data) {
    return {
      success: false,
      errorMessage: challenge.error?.message || "認証チャレンジの作成に失敗しました",
    };
  }

  const verify = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.data.id,
    code,
  });

  if (verify.error) {
    return {
      success: false,
      errorMessage: "認証コードが正しくありません。最新の6桁コードを入力してください。",
    };
  }

  return {
    success: true,
    errorMessage: null,
  };
}

/**
 * 緊急バックアップコードを検証・消費し、セッションを更新する。
 */
export async function verifyBackupCode(rawCode: string): Promise<MfaVerifyResult> {
  const code = rawCode.trim();
  if (!code) {
    return {
      success: false,
      errorMessage: "バックアップコードを入力してください",
    };
  }

  const { data: isValid, error: rpcErr } = await supabase.rpc("verify_and_consume_backup_code", {
    p_code: code,
  });

  if (rpcErr?.code === "PT429") {
    return {
      success: false,
      errorMessage: "バックアップコードの試行上限に達しました。15分ほどおいて再度お試しください。",
    };
  }
  if (rpcErr) {
    return {
      success: false,
      errorMessage: "バックアップコードを確認できませんでした。再度ログインしてお試しください。",
    };
  }
  if (!isValid) {
    return {
      success: false,
      errorMessage: "バックアップコードが正しくないか、すでに使用されています。",
    };
  }

  // 成功: 2FAリセットセッションをリフレッシュして最新化
  await supabase.auth.refreshSession().catch(() => {});
  return {
    success: true,
    errorMessage: null,
  };
}
