type RecoveryNotification = {
  notification_id: string;
  to_email: string;
  attempt: number;
};

type NotificationOutcome = "sent" | "retry" | "permanent";

async function sendNotice(
  job: RecoveryNotification,
  resendKey: string,
  sender: string,
  requestFetch: typeof fetch,
): Promise<NotificationOutcome> {
  try {
    const response = await requestFetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `mfa-recovery/${job.notification_id}`,
      },
      body: JSON.stringify({
        from: sender,
        to: [job.to_email],
        subject: "Quest Qlub のアカウント復旧が行われました",
        text: [
          "Quest Qlub のアカウントでバックアップコードによる復旧が行われました。",
          "以前の認証アプリの登録とバックアップコードは無効になりました。",
          "心当たりがある場合は、セキュリティ設定から認証アプリを再登録し、新しいコードを保存してください。",
          "心当たりがない場合は、パスワードを変更し、Quest Qlub のお問い合わせ窓口にご連絡ください。",
        ].join("\n"),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    await response.body?.cancel();
    if (response.ok) return "sent";
    return response.status === 409 || response.status === 429 || response.status >= 500
      ? "retry"
      : "permanent";
  } catch {
    return "retry";
  }
}

export async function handleRecoveryNotifications(
  request: Request,
  {
    env = Deno.env,
    requestFetch = fetch,
  }: {
    env?: Pick<typeof Deno.env, "get">;
    requestFetch?: typeof fetch;
  } = {},
): Promise<Response> {
  if (request.method !== "POST") return new Response(null, { status: 405 });

  const token = env.get("MFA_RECOVERY_WORKER_TOKEN");
  const authorization = request.headers.get("Authorization");
  if (!token || token.length < 32 || !authorization) return new Response(null, { status: 401 });

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(token),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  const expected = await crypto.subtle.sign("HMAC", key, encoder.encode(`Bearer ${token}`));
  if (!(await crypto.subtle.verify("HMAC", key, expected, encoder.encode(authorization)))) {
    return new Response(null, { status: 401 });
  }

  const databaseUrl = env.get("SUPABASE_URL");
  const databaseKey = env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendKey = env.get("RESEND_API_KEY");
  const sender = env.get("MFA_RECOVERY_SENDER_EMAIL");
  if (!databaseUrl || !databaseKey || !resendKey || !sender) {
    console.error("MFA recovery notification worker configuration is incomplete");
    return new Response(null, { status: 503 });
  }

  async function rpc<T>(name: string, body: object = {}): Promise<T> {
    const response = await requestFetch(`${databaseUrl}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        apikey: databaseKey!,
        Authorization: `Bearer ${databaseKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Database RPC ${name} failed with HTTP ${response.status}`);
    }
    return (await response.json()) as T;
  }

  let jobs: RecoveryNotification[];
  try {
    jobs = await rpc<RecoveryNotification[]>("claim_mfa_recovery_notifications");
  } catch {
    console.error("MFA recovery notification claim failed");
    return new Response(null, { status: 503 });
  }

  const completed = await Promise.allSettled(
    jobs.map(async (job) => {
      const outcome = await sendNotice(job, resendKey, sender, requestFetch);
      const updated = await rpc<boolean>("finish_mfa_recovery_notification", {
        p_id: job.notification_id,
        p_attempt: job.attempt,
        p_outcome: outcome,
      });
      console.log(
        JSON.stringify({
          notification_id: job.notification_id,
          attempt: job.attempt,
          outcome: updated ? outcome : "lease_ended",
        }),
      );
    }),
  );
  if (completed.some((result) => result.status === "rejected")) {
    console.error("MFA recovery notification completion could not be recorded");
    return new Response(null, { status: 503 });
  }

  return new Response(null, { status: 204 });
}

if (import.meta.main) {
  Deno.serve((request) => handleRecoveryNotifications(request));
}
