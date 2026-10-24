import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../supabase";
import type { Profile } from "../supabase";

export interface FollowCounts {
  followingCount: number;
  followersCount: number;
}

export interface FollowDetailsResult {
  allowed: boolean;
  following: Profile[];
  followers: Profile[];
}

const FALLBACK_STORAGE_KEY_PREFIX = "quest_qlub_user_follows_";

export const isUserFollowsSchemaError = (err: unknown): boolean => {
  const e = err as { code?: string; message?: string } | null;
  return (
    e?.code === "PGRST205" ||
    e?.code === "42P01" ||
    (typeof e?.message === "string" && e.message.includes("user_follows"))
  );
};

export const getLocalFollows = (userId: string): string[] => {
  if (!userId || typeof window === "undefined" || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(`${FALLBACK_STORAGE_KEY_PREFIX}${userId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const setLocalFollows = (userId: string, ids: string[]): void => {
  if (!userId || typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(`${FALLBACK_STORAGE_KEY_PREFIX}${userId}`, JSON.stringify(ids));
  } catch {
    // ignore
  }
};

/**
 * すべてのアカウントのフォロー数・フォロワー数を誰でも取得できる関数
 */
export async function fetchFollowCounts(targetUserId: string): Promise<FollowCounts> {
  if (!targetUserId) {
    return { followingCount: 0, followersCount: 0 };
  }
  try {
    const { data, error } = await supabase.rpc("get_follow_counts", {
      target_user_id: targetUserId,
    });
    if (!error && data) {
      const row = Array.isArray(data) ? data[0] : data;
      return {
        followingCount: Number(row?.following_count ?? 0),
        followersCount: Number(row?.followers_count ?? 0),
      };
    }
  } catch {
    // ignore
  }
  // フォールバック: 対象アカウントのローカル保存値があればそれを反映
  const local = getLocalFollows(targetUserId);
  return { followingCount: local.length, followersCount: 0 };
}

/**
 * フォロー中・フォロワーのアカウント詳細一覧を取得する関数（本人のみ許可）
 */
export async function fetchFollowDetails(
  targetUserId: string,
  currentUserId: string | null | undefined,
): Promise<FollowDetailsResult> {
  // 本人以外は詳細リストを一切確認できない
  if (!targetUserId || !currentUserId || targetUserId !== currentUserId) {
    return { allowed: false, following: [], followers: [] };
  }

  try {
    const [followingRes, followersRes] = await Promise.all([
      supabase.from("user_follows").select("following_id").eq("follower_id", targetUserId),
      supabase.from("user_follows").select("follower_id").eq("following_id", targetUserId),
    ]);

    let followingIds: string[] = (followingRes.data || []).map((r: any) => r.following_id);
    const followerIds: string[] = (followersRes.data || []).map((r: any) => r.follower_id);

    if (
      followingIds.length === 0 &&
      followingRes.error &&
      isUserFollowsSchemaError(followingRes.error)
    ) {
      followingIds = getLocalFollows(targetUserId);
    }

    const [followingProfilesRes, followerProfilesRes] = await Promise.all([
      followingIds.length > 0
        ? supabase
            .from("profiles")
            .select("id, role, display_name, username, x_account, avatar_url, bio, created_at")
            .in("id", followingIds)
        : Promise.resolve({ data: [] as Profile[], error: null }),
      followerIds.length > 0
        ? supabase
            .from("profiles")
            .select("id, role, display_name, username, x_account, avatar_url, bio, created_at")
            .in("id", followerIds)
        : Promise.resolve({ data: [] as Profile[], error: null }),
    ]);

    return {
      allowed: true,
      following: (followingProfilesRes.data as Profile[]) || [],
      followers: (followerProfilesRes.data as Profile[]) || [],
    };
  } catch {
    return { allowed: true, following: [], followers: [] };
  }
}

export function useFollows() {
  const { user, profile, userRole } = useAuth();
  const currentUserId = profile?.id || user?.id || null;
  const isAuthenticated = userRole !== "guest" && !!currentUserId;

  const [followedIds, setFollowedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;
    if (!isAuthenticated || !currentUserId) {
      setFollowedIds([]);
      return;
    }

    setLoading(true);
    void supabase
      .from("user_follows")
      .select("following_id")
      .eq("follower_id", currentUserId)
      .then(({ data, error }) => {
        if (!isMounted) return;
        if (!error && data) {
          const ids = data.map((r: any) => r.following_id);
          setFollowedIds(ids);
          setLocalFollows(currentUserId, ids);
        } else if (error && isUserFollowsSchemaError(error)) {
          const localIds = getLocalFollows(currentUserId);
          setFollowedIds(localIds);
        }
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isAuthenticated, currentUserId]);

  const isFollowing = useCallback(
    (writerId: string) => followedIds.includes(writerId),
    [followedIds],
  );

  /**
   * フォロー状態をトグルする。未ログインの場合は false を返しフォローを実行しない。
   */
  const toggleFollow = useCallback(
    async (writerId: string): Promise<boolean> => {
      if (!isAuthenticated || !currentUserId || !writerId || writerId === currentUserId) {
        return false;
      }

      const currentlyFollowing = followedIds.includes(writerId);
      const nextFollowedIds = currentlyFollowing
        ? followedIds.filter((id) => id !== writerId)
        : [...followedIds, writerId];

      if (currentlyFollowing) {
        setFollowedIds(nextFollowedIds);
        try {
          const { error } = await supabase
            .from("user_follows")
            .delete()
            .eq("follower_id", currentUserId)
            .eq("following_id", writerId);
          if (error) {
            if (isUserFollowsSchemaError(error)) {
              setLocalFollows(currentUserId, nextFollowedIds);
              return true;
            }
            setFollowedIds(followedIds);
            return false;
          }
        } catch {
          setFollowedIds(followedIds);
          return false;
        }
      } else {
        setFollowedIds(nextFollowedIds);
        try {
          const { error } = await supabase.from("user_follows").insert({
            follower_id: currentUserId,
            following_id: writerId,
          });
          if (error) {
            if (isUserFollowsSchemaError(error)) {
              setLocalFollows(currentUserId, nextFollowedIds);
              return true;
            }
            setFollowedIds(followedIds);
            return false;
          }
        } catch {
          setFollowedIds(followedIds);
          return false;
        }
      }

      setLocalFollows(currentUserId, nextFollowedIds);
      return true;
    },
    [isAuthenticated, currentUserId, followedIds],
  );

  return {
    followedIds,
    isFollowing,
    toggleFollow,
    isAuthenticated,
    currentUserId,
    loading,
  };
}
