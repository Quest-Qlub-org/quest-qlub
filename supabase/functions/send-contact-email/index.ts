import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// 明示的に許可するオリジン（本番・ローカル）
const ALLOWED_ORIGINS = [
  "https://share-quest.vercel.app",
  "https://quest-qlub.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000",
];

// このプロジェクト自身の Vercel プレビューのみ許可（任意の *.vercel.app は許可しない）
// 例: https://quest-qlub-15t83eki3-quest-qlub.vercel.app
//     https://quest-qlub-git-main-quest-qlub.vercel.app
const ALLOWED_PREVIEW_ORIGIN = /^https:\/\/quest-qlub[a-z0-9-]*\.vercel\.app$/;

function isAllowedOrigin(origin: string): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (ALLOWED_PREVIEW_ORIGIN.test(origin)) return true;
  const allowedOriginEnv = Deno.env.get("ALLOWED_ORIGIN");
  return !!allowedOriginEnv && origin === allowedOriginEnv;
}

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowedOriginEnv = Deno.env.get("ALLOWED_ORIGIN");
  const fallback = allowedOriginEnv || "https://quest-qlub.vercel.app";

  return {
    "Access-Control-Allow-Origin": isAllowedOrigin(origin) ? origin : fallback,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/;

// In-memory rate limiting map: ip/email -> timestamps array
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1分
const MAX_REQUESTS_PER_WINDOW = 3; // 1分間に最大3回まで

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const timestamps = (rateLimitMap.get(key) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (timestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    return true;
  }
  timestamps.push(now);
  rateLimitMap.set(key, timestamps);
  return false;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // クライアントIPの取得
    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("cf-connecting-ip") ||
      "unknown-ip";

    if (isRateLimited(`ip:${clientIp}`)) {
      return new Response(
        JSON.stringify({
          error:
            "短時間に多数のリクエストが送信されました。しばらく時間をおいて再度お試しください。",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 429,
        },
      );
    }

    const raw = await req.json();

    // ボット対策1: ハニーポットフィールドのチェック（人間には見えないダミー項目）
    if (raw._hp || raw.honeypot || raw.website_trap) {
      console.warn("Honeypot field triggered by bot from IP:", clientIp);
      // ボットには成功したように見せかけて実際の送信は行わない（ステルス拒否）
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    const email = typeof raw.email === "string" ? raw.email.trim() : "";
    const subject = typeof raw.subject === "string" ? raw.subject.trim() : "";
    const body = typeof raw.body === "string" ? raw.body.trim() : "";

    // メールアドレス単位のレート制限
    if (email && isRateLimited(`email:${email}`)) {
      return new Response(
        JSON.stringify({
          error:
            "このメールアドレスから短時間に連続してお問い合わせが送信されました。しばらくお待ちください。",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 429,
        },
      );
    }

    // Validation
    if (!name || !email || !subject || !body) {
      return new Response(JSON.stringify({ error: "すべての項目を入力してください。" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    if (name.length > 100 || subject.length > 200 || body.length > 5000) {
      return new Response(JSON.stringify({ error: "入力文字数が上限を超えています。" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    if (!EMAIL_REGEX.test(email) || email.length > 254) {
      return new Response(JSON.stringify({ error: "有効なメールアドレスを入力してください。" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Header injection prevention: reject CR / LF in email and subject
    if (/[\r\n]/.test(email) || /[\r\n]/.test(name) || /[\r\n]/.test(subject)) {
      return new Response(JSON.stringify({ error: "不正な改行文字が含まれています。" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const safeName = escapeHtml(name);
    const safeEmail = escapeHtml(email);
    const safeSubject = escapeHtml(subject);
    const safeBody = escapeHtml(body);
    const safeMailto = encodeURIComponent(email);

    const adminHtml = `
<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#bf783a;padding:32px 40px;">
            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">📬 新しいお問い合わせ</h1>
            <p style="margin:6px 0 0;color:#f7ebe0;font-size:13px;">Quest Qlub お問い合わせフォームより</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 40px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;">
                <p style="margin:0;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">お名前</p>
                <p style="margin:4px 0 0;font-size:15px;color:#1e293b;font-weight:600;">${safeName}</p>
              </td></tr>
              <tr><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;">
                <p style="margin:0;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">メールアドレス</p>
                <p style="margin:4px 0 0;font-size:15px;color:#bf783a;">${safeEmail}</p>
              </td></tr>
              <tr><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;">
                <p style="margin:0;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">件名</p>
                <p style="margin:4px 0 0;font-size:15px;color:#1e293b;font-weight:600;">${safeSubject}</p>
              </td></tr>
              <tr><td style="padding:10px 0;">
                <p style="margin:0;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">内容</p>
                <p style="margin:8px 0 0;font-size:15px;color:#334155;line-height:1.7;white-space:pre-wrap;">${safeBody}</p>
              </td></tr>
            </table>
            <div style="margin-top:28px;">
              <a href="mailto:${safeMailto}" style="display:inline-block;background:#bf783a;color:#ffffff;font-size:14px;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none;">このメールに返信する</a>
            </div>
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0;">
            <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;">© 2026 Quest Qlub — このメールはお問い合わせフォームから自動送信されました</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
 </body>
</html>`;

    const receiverEmail = Deno.env.get("CONTACT_RECEIVER_EMAIL");
    if (!receiverEmail) {
      console.warn("CONTACT_RECEIVER_EMAIL is not set. Defaulting to contact@quest-qlub.com");
    }
    const toEmail = receiverEmail || "contact@quest-qlub.com";

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
      },
      body: JSON.stringify({
        from: "Quest Qlub <onboarding@resend.dev>",
        to: toEmail,
        reply_to: email,
        subject: `【お問い合わせ】${subject}`,
        html: adminHtml,
      }),
    });

    const result = await res.json();
    console.log("Resend response:", JSON.stringify(result));

    if (!res.ok) {
      console.error("Resend API error:", result);
      return new Response(JSON.stringify({ error: "メール送信サービスでエラーが発生しました。" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 502,
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (e) {
    console.error("Error:", e);
    return new Response(JSON.stringify({ error: "サーバー内部エラーが発生しました。" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
