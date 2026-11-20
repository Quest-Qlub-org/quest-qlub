interface DenoRuntime {
  env: { get(key: string): string | undefined };
  serve?: (handler: (req: Request) => Response | Promise<Response>) => unknown;
}

function getDeno(): DenoRuntime | undefined {
  return (globalThis as { Deno?: DenoRuntime }).Deno;
}

type DeliveryError =
  | "provider_rejected"
  | "provider_unavailable"
  | "network_error"
  | "provider_rate_limit";

interface NotificationJob {
  receipt_id: string;
  lease_token: string;
  name: string;
  email: string;
  subject: string;
  body: string;
}

interface WorkerConfig {
  supabaseUrl: string;
  serviceKey: string;
  resendKey: string;
  from: string;
  to: string;
}

async function matchesSecret(supplied: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [suppliedHash, expectedHash] = await Promise.all(
    [supplied, expected].map(async (value) => {
      return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
    }),
  );
  let difference = 0;
  for (let i = 0; i < suppliedHash.length; i++) {
    difference |= suppliedHash[i] ^ expectedHash[i];
  }
  return difference === 0;
}

async function callDb<T>(
  config: WorkerConfig,
  operation: "claim_contact_notifications" | "finish_contact_notification",
  args: Record<string, string | null>,
): Promise<T> {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/rpc/${operation}`, {
    method: "POST",
    headers: {
      apikey: config.serviceKey,
      Authorization: `Bearer ${config.serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(operation);
  }
  return response.json();
}

async function sendNotification(
  config: WorkerConfig,
  job: NotificationJob,
): Promise<DeliveryError | null> {
  try {
    const result = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.resendKey}`,
        "Idempotency-Key": `contact-receipt/${job.receipt_id}`,
      },
      body: JSON.stringify({
        from: config.from,
        to: [config.to],
        reply_to: job.email,
        subject: `【お問い合わせ】${job.subject}`,
        text: `受付ID ${job.receipt_id}\nお名前 ${job.name}\nメールアドレス ${job.email}\n\n${job.body}`,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    // Only the status is needed. Provider responses may contain submitted content.
    void result.body?.cancel().catch(() => {});
    if (result.ok) return null;
    if (result.status === 429) return "provider_rate_limit";
    if (result.status >= 500 || result.status === 408 || result.status === 409) {
      return "provider_unavailable";
    }
    return "provider_rejected";
  } catch {
    return "network_error";
  }
}

async function processNotification(config: WorkerConfig, job: NotificationJob): Promise<boolean> {
  const deliveryError = await sendNotification(config, job);
  try {
    const status = await callDb<string | null>(config, "finish_contact_notification", {
      job_receipt_id: job.receipt_id,
      job_lease_token: job.lease_token,
      delivery_error: deliveryError,
    });
    console.info(
      JSON.stringify({
        receipt_id: job.receipt_id,
        status: status ?? "stale_lease",
        error_kind: deliveryError,
      }),
    );
    return true;
  } catch {
    console.error(
      JSON.stringify({
        receipt_id: job.receipt_id,
        status: "processing",
        error_kind: "database_finalize",
      }),
    );
    return false;
  }
}

export async function handleContactRequest(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return Response.json(
      { error: "method_not_allowed" },
      { status: 405, headers: { Allow: "POST" } },
    );
  }

  const env = getDeno()?.env;
  const secret = env?.get("CONTACT_NOTIFICATION_WORKER_SECRET");
  const supplied = req.headers.get("x-contact-worker-secret");
  if (!secret || secret.length < 32 || !supplied || !(await matchesSecret(supplied, secret))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabaseUrl = env?.get("SUPABASE_URL");
  const serviceKey = env?.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendKey = env?.get("RESEND_API_KEY");
  if (!supabaseUrl || !serviceKey || !resendKey) {
    console.error(JSON.stringify({ error_kind: "worker_configuration" }));
    return Response.json({ error: "worker_configuration" }, { status: 503 });
  }

  const config: WorkerConfig = {
    supabaseUrl,
    serviceKey,
    resendKey,
    from: env?.get("CONTACT_SENDER_EMAIL") ?? "Quest Qlub <onboarding@resend.dev>",
    to: env?.get("CONTACT_RECEIVER_EMAIL") ?? "contact@quest-qlub.com",
  };

  try {
    const jobs = await callDb<NotificationJob[]>(config, "claim_contact_notifications", {});
    const finalized = await Promise.all(jobs.map((job) => processNotification(config, job)));
    return Response.json(
      { claimed: jobs.length },
      { status: finalized.every(Boolean) ? 200 : 503 },
    );
  } catch {
    console.error(JSON.stringify({ error_kind: "database_claim" }));
    return Response.json({ error: "database_claim" }, { status: 503 });
  }
}

getDeno()?.serve?.(handleContactRequest);
