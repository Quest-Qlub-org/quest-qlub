// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vite-plus/test";
import { findVerifiedTotpFactor, verifyTotpCode, verifyBackupCode } from "./mfa";
import { supabase } from "../supabase";

describe("mfa utils", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("findVerifiedTotpFactor", () => {
    it("returns the first verified TOTP factor id", async () => {
      vi.spyOn(supabase.auth.mfa, "listFactors").mockResolvedValue({
        data: {
          totp: [
            { id: "unverified-1", status: "unverified" },
            { id: "verified-1", status: "verified" },
          ],
          phone: [],
          all: [],
        },
        error: null,
      } as never);

      const result = await findVerifiedTotpFactor();
      expect(result).toEqual({
        factorId: "verified-1",
        errorType: null,
        errorMessage: null,
      });
    });

    it("returns not_found when only unverified factors exist", async () => {
      vi.spyOn(supabase.auth.mfa, "listFactors").mockResolvedValue({
        data: {
          totp: [{ id: "unverified-1", status: "unverified" }],
          phone: [],
          all: [],
        },
        error: null,
      } as never);

      const result = await findVerifiedTotpFactor();
      expect(result.factorId).toBeNull();
      expect(result.errorType).toBe("not_found");
    });

    it("returns fetch_failed when listFactors returns an error", async () => {
      vi.spyOn(supabase.auth.mfa, "listFactors").mockResolvedValue({
        data: null,
        error: new Error("fetch failed"),
      } as never);

      const result = await findVerifiedTotpFactor();
      expect(result.factorId).toBeNull();
      expect(result.errorType).toBe("fetch_failed");
    });

    it("returns exception when listFactors throws", async () => {
      vi.spyOn(supabase.auth.mfa, "listFactors").mockRejectedValue(new Error("network"));

      const result = await findVerifiedTotpFactor();
      expect(result.factorId).toBeNull();
      expect(result.errorType).toBe("exception");
    });
  });

  describe("verifyTotpCode", () => {
    it("creates a challenge and verifies trimmed code", async () => {
      const challengeSpy = vi.spyOn(supabase.auth.mfa, "challenge").mockResolvedValue({
        data: { id: "challenge-1" },
        error: null,
      } as never);
      const verifySpy = vi.spyOn(supabase.auth.mfa, "verify").mockResolvedValue({
        data: { access_token: "token" },
        error: null,
      } as never);

      const result = await verifyTotpCode("factor-1", " 123456 ");
      expect(result).toEqual({ success: true, errorMessage: null });
      expect(challengeSpy).toHaveBeenCalledWith({ factorId: "factor-1" });
      expect(verifySpy).toHaveBeenCalledWith({
        factorId: "factor-1",
        challengeId: "challenge-1",
        code: "123456",
      });
    });

    it("returns failure message when challenge fails", async () => {
      vi.spyOn(supabase.auth.mfa, "challenge").mockResolvedValue({
        data: null,
        error: { message: "Challenge error" },
      } as never);
      const verifySpy = vi.spyOn(supabase.auth.mfa, "verify");

      const result = await verifyTotpCode("factor-1", "123456");
      expect(result).toEqual({ success: false, errorMessage: "Challenge error" });
      expect(verifySpy).not.toHaveBeenCalled();
    });

    it("returns localized error when verify fails", async () => {
      vi.spyOn(supabase.auth.mfa, "challenge").mockResolvedValue({
        data: { id: "challenge-1" },
        error: null,
      } as never);
      vi.spyOn(supabase.auth.mfa, "verify").mockResolvedValue({
        data: null,
        error: new Error("invalid code"),
      } as never);

      const result = await verifyTotpCode("factor-1", "000000");
      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain("認証コードが正しくありません");
    });
  });

  describe("verifyBackupCode", () => {
    it("verifies backup code and refreshes session", async () => {
      const rpcSpy = vi
        .spyOn(supabase, "rpc")
        .mockResolvedValue({ data: true, error: null } as never);
      const refreshSpy = vi.spyOn(supabase.auth, "refreshSession").mockResolvedValue({
        data: { session: null, user: null },
        error: null,
      } as never);

      const result = await verifyBackupCode(" ABCD-1234 ");
      expect(result).toEqual({ success: true, errorMessage: null });
      expect(rpcSpy).toHaveBeenCalledWith("verify_and_consume_backup_code", {
        p_code: "ABCD-1234",
      });
      expect(refreshSpy).toHaveBeenCalled();
    });

    it("explains a server-enforced recovery cooldown", async () => {
      vi.spyOn(supabase, "rpc").mockResolvedValue({
        data: null,
        error: { code: "PT429" },
      } as never);
      const refreshSpy = vi.spyOn(supabase.auth, "refreshSession");

      const result = await verifyBackupCode("ABCD-1234");

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain("試行上限");
      expect(refreshSpy).not.toHaveBeenCalled();
    });

    it("returns failure when RPC returns false", async () => {
      vi.spyOn(supabase, "rpc").mockResolvedValue({ data: false, error: null } as never);
      const refreshSpy = vi.spyOn(supabase.auth, "refreshSession");

      const result = await verifyBackupCode("WRONG");
      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain("バックアップコードが正しくない");
      expect(refreshSpy).not.toHaveBeenCalled();
    });
  });
});
