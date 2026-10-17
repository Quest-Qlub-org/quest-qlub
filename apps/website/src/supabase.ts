import { createClient } from "@supabase/supabase-js";

// テスト環境判定（Vitest / NODE_ENV / MODE）
export const isTest =
  import.meta.env.MODE === "test" ||
  (globalThis as unknown as { process?: { env?: { NODE_ENV?: string } } }).process?.env
    ?.NODE_ENV === "test";

// アプリケーション動作モード
export const appMode = import.meta.env.MODE;
export const isDev = import.meta.env.DEV;

// テスト環境の場合は実DB接続を完全遮断し、常にテスト専用モックURLを使用
const supabaseUrl = isTest
  ? "https://test-mock.supabase.co"
  : (import.meta.env.VITE_SUPABASE_URL as string | undefined);

const supabaseAnonKey = isTest
  ? "mock-anon-key-for-unit-testing"
  : (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined);

if (!supabaseUrl || typeof supabaseUrl !== "string") {
  throw new Error(
    "環境変数 VITE_SUPABASE_URL が設定されていません。\n" +
      ".env.example を参考に apps/website/.env.development.local を作成してください。",
  );
}

if (!supabaseAnonKey || typeof supabaseAnonKey !== "string") {
  throw new Error(
    "環境変数 VITE_SUPABASE_ANON_KEY が設定されていません。\n" +
      ".env.example を参考に apps/website/.env.development.local を作成してください。",
  );
}

// 本番SupabaseプロジェクトIDへの直結判定
export const isConnectedToProductionDb = supabaseUrl.includes("uksgnlfnxytqljrctiqg");

// ローカル開発時に本番DBへ直結している場合はコンソール警告を出力
if (isDev && isConnectedToProductionDb) {
  console.warn(
    "%c⚠️ [Quest Qlub 開発環境警告] 本番用Supabaseデータベースに直接接続しています！\n" +
      "開発・テスト時のデータ変更が本番環境に反映される危険があります。\n" +
      "安全のため、開発用プロジェクトまたはブランチを作成し、.env.development.local に設定することを推奨します。",
    "background: #fff3cd; color: #856404; font-size: 14px; font-weight: bold; padding: 4px;",
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    experimental: { passkey: true },
  },
});

export type UserRole = "viewer" | "writer" | "editor";

export interface Profile {
  id: string;
  email?: string;
  role: UserRole;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  bio?: string | null;
  x_account?: string | null;
}
