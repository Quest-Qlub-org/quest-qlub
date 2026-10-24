export type AppRole = "editor" | "writer" | "engineer" | "viewer";

export interface RoleConfig {
  key: string;
  label: string;
  badgeClass: string;
  description?: string;
  order: number;
  isStaff: boolean;
}

export const KNOWN_ROLES: Record<string, RoleConfig> = {
  editor: {
    key: "editor",
    label: "編集長",
    badgeClass: "bg-purple-100 text-purple-700 border-purple-200",
    description: "記事の審査・推薦、ライター管理、全体の運営",
    order: 1,
    isStaff: true,
  },
  writer: {
    key: "writer",
    label: "ライター",
    badgeClass: "bg-blue-100 text-blue-700 border-blue-200",
    description: "記事の執筆・投稿・シリーズ作成",
    order: 2,
    isStaff: true,
  },
  engineer: {
    key: "engineer",
    label: "エンジニア",
    badgeClass: "bg-emerald-100 text-emerald-700 border-emerald-200",
    description: "システムの開発・保守・技術支援",
    order: 3,
    isStaff: true,
  },
  viewer: {
    key: "viewer",
    label: "一般読者",
    badgeClass: "bg-gray-100 text-gray-600 border-gray-200",
    description: "記事の閲覧・お気に入り・コメント",
    order: 99,
    isStaff: false,
  },
};

export const STAFF_ROLES = ["editor", "writer", "engineer"] as const;

/**
 * プロフィールから有効なロール一覧を取得（roles 配列優先、無ければ role カラムにフォールバック）
 */
export function getProfileRoles(
  profile: { role?: string | null; roles?: string[] | null } | null | undefined,
): string[] {
  if (!profile) return [];
  if (Array.isArray(profile.roles) && profile.roles.length > 0) {
    const cleaned = Array.from(new Set(profile.roles.map((r) => r.trim()))).filter(Boolean);
    if (cleaned.length > 0) return cleaned;
  }
  return profile.role?.trim() ? [profile.role.trim()] : [];
}

/**
 * プロフィールが特定のロールを保持しているか判定
 */
export function profileHasRole(
  profile: { role?: string | null; roles?: string[] | null } | null | undefined,
  targetRole: string,
): boolean {
  const trimmed = targetRole?.trim();
  if (!trimmed) return false;
  return getProfileRoles(profile).includes(trimmed);
}

/**
 * 複数ロールの中から最も権限の高い主ロールを算出（下位互換の role 列同期用）
 */
export function getPrimaryRole(roles: string[]): "editor" | "writer" | "viewer" {
  if (roles.includes("editor")) return "editor";
  if (roles.includes("writer")) return "writer";
  return "viewer";
}

/**
 * ロール表示用のラベルを取得
 */
export function getRoleLabel(roleKey: string): string {
  const trimmed = roleKey?.trim() ?? "";
  return KNOWN_ROLES[trimmed]?.label ?? trimmed;
}

/**
 * ロール表示用のバッジクラスを取得
 */
export function getRoleBadgeClass(roleKey: string): string {
  const trimmed = roleKey?.trim() ?? "";
  return KNOWN_ROLES[trimmed]?.badgeClass ?? "bg-gray-100 text-gray-700 border-gray-200";
}

/**
 * ロール表示順を取得（ソート用）
 */
export function getRoleOrder(roleKey: string): number {
  const trimmed = roleKey?.trim() ?? "";
  return KNOWN_ROLES[trimmed]?.order ?? 50;
}

/**
 * スタッフ／運営メンバー（Aboutページ表示対象）のロールであるか判定
 */
export function isStaffRole(roleKey: string): boolean {
  const trimmed = roleKey?.trim();
  if (!trimmed || trimmed === "viewer" || trimmed === "guest") return false;
  const config = KNOWN_ROLES[trimmed];
  return config ? config.isStaff : true;
}

/**
 * メンバー表示名のフォーマット（display_name と username の重複を防ぎつつ整形）
 */
export function formatMemberName(
  m?: {
    display_name?: string | null;
    username?: string | null;
  } | null,
): string {
  if (!m) return "名称未設定";
  const name = m.display_name?.trim();
  const uname = m.username?.trim();
  if (name && uname && !name.toLowerCase().includes(uname.toLowerCase())) {
    return `${name} (@${uname})`;
  }
  return name || (uname ? `@${uname}` : "名称未設定");
}
