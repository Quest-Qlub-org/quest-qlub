export const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/;

export interface ContactFormInput {
  name: string;
  email: string;
  subject: string;
  body: string;
}

export function validateContactForm(input: ContactFormInput): {
  isValid: boolean;
  error?: string;
} {
  const name = input.name.trim();
  const email = input.email.trim();
  const subject = input.subject.trim();
  const body = input.body.trim();

  if (!name || !email || !subject || !body) {
    return { isValid: false, error: "すべての項目を入力してください" };
  }

  if (name.length > 100 || subject.length > 200 || body.length > 5000) {
    return { isValid: false, error: "入力文字数が上限を超えています" };
  }

  if (!EMAIL_REGEX.test(email) || email.length > 254) {
    return { isValid: false, error: "有効なメールアドレスを入力してください" };
  }

  if (/[\r\n]/.test(email) || /[\r\n]/.test(name) || /[\r\n]/.test(subject)) {
    return { isValid: false, error: "不正な改行文字が含まれています" };
  }

  return { isValid: true };
}

export function normalizeHandle(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .trim()
    .replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, "")
    .split(/[/?#]/)[0]
    .replace(/^@+/, "")
    .trim();
}

export function normalizeXAccount(raw: string | null | undefined): string {
  return normalizeHandle(raw);
}

export const MIN_PASSWORD_LENGTH = 8;

export function validatePassword(password: string): {
  isValid: boolean;
  error?: string;
} {
  if (!password) {
    return { isValid: false, error: "パスワードを入力してください" };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      isValid: false,
      error: `パスワードは${MIN_PASSWORD_LENGTH}文字以上で入力してください`,
    };
  }
  return { isValid: true };
}
