import { supabase, type Profile } from "../supabase";
import { enrichFallbackProfileRoles, getLocalRolesOverride, normalizeRoles } from "./roles";
import { isRolesColumnSchemaError } from "./supabaseErrors";

export const PROFILE_SELECT_FIELDS_WITH_ROLES =
  "id, role, roles, display_name, username, x_account, avatar_url, bio, created_at";

export const PROFILE_SELECT_FIELDS_BASE =
  "id, role, display_name, username, x_account, avatar_url, bio, created_at";

export interface ProfileListQueryOptions {
  inRole?: string[];
  eq?: { column: string; value: string };
  order?: { column: string; ascending?: boolean };
  range?: { from: number; to: number };
}

export function applyProfileRoleOverrides(profile: Profile): Profile {
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
    let query: any = supabase.from("profiles").select(selectFields);
    if (options.inRole && options.inRole.length > 0 && typeof query.in === "function") {
      query = query.in("role", options.inRole);
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

  const res = await buildQuery(PROFILE_SELECT_FIELDS_WITH_ROLES);
  if (res.error && isRolesColumnSchemaError(res.error)) {
    const fallbackRes = await buildQuery(PROFILE_SELECT_FIELDS_BASE);
    if (!fallbackRes.error && fallbackRes.data) {
      return (fallbackRes.data as unknown as Profile[]).map(enrichFallbackProfileRoles);
    }
    return null;
  }
  if (!res.error && res.data) {
    return (res.data as unknown as Profile[]).map(applyProfileRoleOverrides);
  }
  return null;
}

/**
 * 単一プロフィール取得（roles カラム未存在時の 42703 自動フォールバックとロールオーバーライド適用）
 */
export async function fetchSingleProfileWithFallback(filter: {
  id?: string;
  username?: string;
}): Promise<Profile | null> {
  const buildQuery = (selectFields: string) => {
    let query: any = supabase.from("profiles").select(selectFields);
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
      return enrichFallbackProfileRoles(fallbackRes.data as unknown as Profile);
    }
    return null;
  }
  if (!res.error && res.data) {
    return applyProfileRoleOverrides(res.data as unknown as Profile);
  }
  return null;
}
