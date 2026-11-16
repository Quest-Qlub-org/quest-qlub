import { supabase, type Profile } from "../supabase";
import { enrichFallbackProfileRoles, getLocalRolesOverride, normalizeRoles } from "./roles";
import { isRolesColumnSchemaError } from "./supabaseErrors";

export const PROFILE_SELECT_FIELDS_WITH_ROLES =
  "id, role, roles, display_name, username, x_account, avatar_url, bio, created_at";

export const PROFILE_SELECT_FIELDS_BASE =
  "id, role, display_name, username, x_account, avatar_url, bio, created_at";

export interface ProfileListQueryOptions {
  inRole?: string[];
  inIds?: string[];
  in?: { column: string; values: string[] };
  eq?: { column: string; value: string };
  order?: { column: string; ascending?: boolean };
  range?: { from: number; to: number };
  ignoreLocalOverrides?: boolean;
}

export interface SingleProfileQueryOptions {
  ignoreLocalOverrides?: boolean;
}

export function applyProfileRoleOverrides(profile: Profile): Profile {
  // DB から有効な roles 配列を取得できた場合はそれを最優先し、localStorage で上書きしない
  if (Array.isArray(profile.roles) && profile.roles.length > 0) {
    return profile;
  }
  const localOverride = getLocalRolesOverride(profile.id);
  if (localOverride && localOverride.length > 0) {
    return {
      ...profile,
      roles: normalizeRoles(localOverride, profile.role),
    };
  }
  return profile;
}

/**
 * プロフィール一覧取得（roles カラム未存在時の 42703 自動フォールバックとロールオーバーライド適用）
 */
export async function fetchProfilesListWithFallback(
  options: ProfileListQueryOptions = {},
): Promise<Profile[] | null> {
  const buildQuery = (selectFields: string) => {
    const table: any = supabase.from("profiles");
    if (!table || typeof table.select !== "function") return null;
    let query: any = table.select(selectFields);
    if (options.inRole && options.inRole.length > 0) {
      if (selectFields === PROFILE_SELECT_FIELDS_WITH_ROLES && typeof query.or === "function") {
        const roleList = options.inRole.join(",");
        const rolesConditions = options.inRole.map((r) => `roles.cs.{${r}}`).join(",");
        query = query.or(`role.in.(${roleList}),${rolesConditions}`);
      } else if (typeof query.in === "function") {
        query = query.in("role", options.inRole);
      }
    }
    if (options.inIds && options.inIds.length > 0 && typeof query.in === "function") {
      query = query.in("id", options.inIds);
    }
    if (
      options.in &&
      options.in.values &&
      options.in.values.length > 0 &&
      typeof query.in === "function"
    ) {
      query = query.in(options.in.column, options.in.values);
    }
    if (options.eq && typeof query.eq === "function") {
      query = query.eq(options.eq.column, options.eq.value);
    }
    if (options.order && typeof query.order === "function") {
      query = query.order(options.order.column, { ascending: options.order.ascending ?? false });
    }
    if (options.range && typeof query.range === "function") {
      query = query.range(options.range.from, options.range.to);
    }
    return query;
  };

  const initialQuery = buildQuery(PROFILE_SELECT_FIELDS_WITH_ROLES);
  if (!initialQuery) return null;
  const res = await initialQuery;
  if (!res) return null;
  if (res.error && isRolesColumnSchemaError(res.error)) {
    const fallbackQuery = buildQuery(PROFILE_SELECT_FIELDS_BASE);
    if (!fallbackQuery) return null;
    const fallbackRes = await fallbackQuery;
    if (fallbackRes && !fallbackRes.error && fallbackRes.data) {
      return (fallbackRes.data as unknown as Profile[]).map((p) =>
        enrichFallbackProfileRoles(p, { ignoreLocalOverrides: options.ignoreLocalOverrides }),
      );
    }
    return null;
  }
  if (!res.error && res.data) {
    const rows = res.data as unknown as Profile[];
    return options.ignoreLocalOverrides ? rows : rows.map(applyProfileRoleOverrides);
  }
  return null;
}

/**
 * 単一プロフィール取得（roles カラム未存在時の 42703 自動フォールバックとロールオーバーライド適用）
 */
export async function fetchSingleProfileWithFallback(
  filter: {
    id?: string;
    username?: string;
  },
  options: SingleProfileQueryOptions = {},
): Promise<Profile | null> {
  const buildQuery = (selectFields: string) => {
    const table: any = supabase.from("profiles");
    if (!table || typeof table.select !== "function") return null;
    let query: any = table.select(selectFields);
    if (filter.id) {
      query = query.eq("id", filter.id);
    } else if (filter.username) {
      query = query.eq("username", filter.username);
    }
    return query.maybeSingle();
  };

  const res = await buildQuery(PROFILE_SELECT_FIELDS_WITH_ROLES);
  if (res.error && isRolesColumnSchemaError(res.error)) {
    const fallbackRes = await buildQuery(PROFILE_SELECT_FIELDS_BASE);
    if (!fallbackRes.error && fallbackRes.data) {
      return enrichFallbackProfileRoles(fallbackRes.data as unknown as Profile, {
        ignoreLocalOverrides: options.ignoreLocalOverrides,
      });
    }
    return null;
  }
  if (!res.error && res.data) {
    const row = res.data as unknown as Profile;
    return options.ignoreLocalOverrides ? row : applyProfileRoleOverrides(row);
  }
  return null;
}
