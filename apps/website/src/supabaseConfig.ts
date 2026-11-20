const productionHostname = "uksgnlfnxytqljrctiqg.supabase.co";
const deployment = import.meta.env.VITE_VERCEL_TARGET_ENV || import.meta.env.VITE_VERCEL_ENV;
const runtimeHostname = typeof window === "undefined" ? "" : window.location.hostname;

export const isTest =
  import.meta.env.MODE === "test" ||
  (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV === "test";

export const isDevelopment =
  !isTest &&
  (import.meta.env.DEV ||
    import.meta.env.MODE !== "production" ||
    (Boolean(deployment) && deployment !== "production") ||
    ["localhost", "127.0.0.1", "[::1]"].includes(runtimeHostname));

type SupabaseConfig = { url: string; anonKey: string } | { error: string };

function getHostname(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.hostname.replace(/\.$/, "");
    }
  } catch {
    // The startup screen explains malformed or missing configuration.
  }
  return "";
}

function getSupabaseConfig(): SupabaseConfig {
  if (isTest) {
    return {
      url: "https://test-mock.supabase.co",
      anonKey: "mock-anon-key-for-unit-testing",
    };
  }

  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? "";
  const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? "";
  const productionUrl = (import.meta.env.VITE_SUPABASE_PRODUCTION_URL as string | undefined) ?? "";
  const hostname = getHostname(url);
  if (
    isDevelopment &&
    hostname &&
    (hostname === productionHostname || hostname === getHostname(productionUrl))
  ) {
    return {
      error:
        "開発・検証環境から本番用 Supabase への接続を停止しました。開発用プロジェクトかローカル Supabase の接続情報を設定してください。",
    };
  }

  if (!hostname || !anonKey) {
    return {
      error: "VITE_SUPABASE_URL と VITE_SUPABASE_ANON_KEY に有効な接続情報を設定してください。",
    };
  }

  return { url, anonKey };
}

export const supabaseConfig = getSupabaseConfig();
