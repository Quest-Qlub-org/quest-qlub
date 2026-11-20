import { createClient } from "@supabase/supabase-js";
import { isTest, supabaseConfig } from "./supabaseConfig";

export { isTest };

if ("error" in supabaseConfig) {
  throw new Error(supabaseConfig.error);
}

export const supabase = createClient(supabaseConfig.url, supabaseConfig.anonKey, {
  global: isTest ? { fetch: async () => new Response(null, { status: 503 }) } : undefined,
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    experimental: { passkey: true },
  },
});

export type UserRole = "viewer" | "writer" | "editor" | "engineer";

export interface Profile {
  id: string;
  email?: string;
  role: UserRole;
  roles?: string[];
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  bio?: string | null;
  x_account?: string | null;
  created_at?: string | null;
}
