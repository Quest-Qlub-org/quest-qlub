import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient }));

const productionUrl = "https://uksgnlfnxytqljrctiqg.supabase.co";

describe("Supabase startup", () => {
  beforeEach(() => {
    vi.resetModules();
    createClient.mockClear();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MODE", "production");
    vi.stubEnv("DEV", false);
    vi.stubEnv("VITE_VERCEL_ENV", undefined);
    vi.stubEnv("VITE_VERCEL_TARGET_ENV", undefined);
    vi.stubEnv("VITE_SUPABASE_PRODUCTION_URL", undefined);
    vi.stubEnv("VITE_SUPABASE_URL", productionUrl);
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "fixture-anon-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it.each([
    { mode: "development", dev: true, deployment: undefined },
    { mode: "staging", dev: false, deployment: undefined },
    { mode: "production", dev: false, deployment: "preview" },
  ])("blocks production in non-production deployment %#", async ({ mode, dev, deployment }) => {
    vi.stubEnv("MODE", mode);
    vi.stubEnv("DEV", dev);
    vi.stubEnv("VITE_VERCEL_ENV", deployment);

    await expect(import("./supabase")).rejects.toThrow("本番用 Supabase への接続を停止");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("blocks a production build previewed locally", async () => {
    vi.stubGlobal("window", { location: { hostname: "127.0.0.1" } });

    await expect(import("./supabase")).rejects.toThrow("本番用 Supabase への接続を停止");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("blocks a configured production custom domain in preview", async () => {
    vi.stubEnv("VITE_VERCEL_TARGET_ENV", "staging");
    vi.stubEnv("VITE_SUPABASE_PRODUCTION_URL", "https://api.example.com");
    vi.stubEnv("VITE_SUPABASE_URL", "https://API.example.com./");

    await expect(import("./supabase")).rejects.toThrow("本番用 Supabase への接続を停止");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("allows the production client in production", async () => {
    vi.stubEnv("VITE_VERCEL_ENV", "production");

    await import("./supabase");

    expect(createClient).toHaveBeenCalledExactlyOnceWith(
      productionUrl,
      "fixture-anon-key",
      expect.objectContaining({ global: undefined }),
    );
  });

  it("allows a local Supabase endpoint in development", async () => {
    vi.stubEnv("MODE", "development");
    vi.stubEnv("DEV", true);
    vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:54321");

    await import("./supabase");

    expect(createClient).toHaveBeenCalledExactlyOnceWith(
      "http://127.0.0.1:54321",
      "fixture-anon-key",
      expect.any(Object),
    );
  });

  it("rejects invalid connection settings before calling the SDK", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "not-a-url");

    await expect(import("./supabase")).rejects.toThrow("VITE_SUPABASE_URL");
    expect(createClient).not.toHaveBeenCalled();
  });

  it.each([
    { mode: "test", nodeEnv: "production" },
    { mode: "production", nodeEnv: "test" },
  ])("isolates tests regardless of the configured endpoint %#", async ({ mode, nodeEnv }) => {
    vi.stubEnv("MODE", mode);
    vi.stubEnv("NODE_ENV", nodeEnv);

    await import("./supabase");

    expect(createClient).toHaveBeenCalledExactlyOnceWith(
      "https://test-mock.supabase.co",
      "mock-anon-key-for-unit-testing",
      expect.any(Object),
    );
    const { fetch } = createClient.mock.calls[0][2].global;
    expect((await fetch(productionUrl)).status).toBe(503);
  });
});
