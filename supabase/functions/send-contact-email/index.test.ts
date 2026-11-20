import { describe, it, expect, vi, beforeEach, afterEach } from "vite-plus/test";
import { handleContactRequest } from "./index";

const secret = "fake-worker-secret-long-enough-for-tests";
const apiUrl = "https://test-mock.supabase.co";
const resendUrl = "https://api.resend.com/emails";
const job = {
  receipt_id: "test-receipt",
  lease_token: "test-lease",
  name: "テスト応募者",
  email: "writer@example.test",
  subject: "保存された件名",
  body: "保存された本文",
};

function setMockDenoEnv(overrides: Record<string, string | undefined> = {}) {
  const env: Record<string, string | undefined> = {
    CONTACT_NOTIFICATION_WORKER_SECRET: secret,
    SUPABASE_URL: apiUrl,
    SUPABASE_SERVICE_ROLE_KEY: "service-key",
    RESEND_API_KEY: "resend-key",
    ...overrides,
  };
  vi.stubGlobal("Deno", { env: { get: (key: string) => env[key] } });
}

function makeRequest({ method = "POST", workerSecret = secret } = {}) {
  const options: RequestInit = { method, headers: { "x-contact-worker-secret": workerSecret } };
  if (method === "POST") {
    options.body = JSON.stringify({ subject: "ブラウザーが指定した件名" });
  }
  return new Request(`${apiUrl}/functions/v1/send-contact-email`, options);
}

describe("contact notification worker", () => {
  beforeEach(() => {
    setMockDenoEnv();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("requires staff scheduling credentials before claiming any job", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    expect((await handleContactRequest(makeRequest({ method: "GET" }))).status).toBe(405);
    expect((await handleContactRequest(makeRequest({ workerSecret: "wrong" }))).status).toBe(401);
    setMockDenoEnv({ CONTACT_NOTIFICATION_WORKER_SECRET: undefined });
    expect((await handleContactRequest(makeRequest())).status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends only the stored receipt and logs the outcome without message or provider content", async () => {
    const logs = vi.spyOn(console, "info").mockImplementation(() => {});
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json([job]))
      .mockResolvedValueOnce(Response.json({ private: "provider-response-content" }))
      .mockResolvedValueOnce(Response.json("sent"));
    vi.stubGlobal("fetch", fetch);

    const response = await handleContactRequest(makeRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ claimed: 1 });
    const [[claimUrl, claimRequest], [provider, delivery], [finishUrl, finishRequest]] =
      fetch.mock.calls;
    expect(claimUrl).toBe(`${apiUrl}/rest/v1/rpc/claim_contact_notifications`);
    expect(JSON.parse(claimRequest.body)).toEqual({});
    expect(provider).toBe(resendUrl);
    expect(delivery.headers["Idempotency-Key"]).toBe("contact-receipt/test-receipt");
    expect(JSON.parse(delivery.body)).toMatchObject({
      reply_to: job.email,
      subject: "【お問い合わせ】保存された件名",
    });
    expect(JSON.parse(delivery.body).text).toContain(job.body);
    expect(finishUrl).toBe(`${apiUrl}/rest/v1/rpc/finish_contact_notification`);
    expect(JSON.parse(finishRequest.body)).toEqual({
      job_receipt_id: job.receipt_id,
      job_lease_token: job.lease_token,
      delivery_error: null,
    });
    expect(logs.mock.calls).toEqual([
      [JSON.stringify({ receipt_id: job.receipt_id, status: "sent", error_kind: null })],
    ]);
  });

  it("records retryable errors and reuses the receipt key with a new lease", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json([job]))
      .mockResolvedValueOnce(new Response("temporary outage", { status: 503 }))
      .mockResolvedValueOnce(Response.json("pending"))
      .mockResolvedValueOnce(Response.json([{ ...job, lease_token: "second-lease" }]))
      .mockResolvedValueOnce(Response.json({}))
      .mockResolvedValueOnce(Response.json("sent"));
    vi.stubGlobal("fetch", fetch);

    expect((await handleContactRequest(makeRequest())).status).toBe(200);
    expect((await handleContactRequest(makeRequest())).status).toBe(200);

    const deliveries = fetch.mock.calls.filter(([url]) => url === resendUrl);
    expect(deliveries.map(([, options]) => options.headers["Idempotency-Key"])).toEqual([
      "contact-receipt/test-receipt",
      "contact-receipt/test-receipt",
    ]);
    expect(JSON.parse(fetch.mock.calls[2][1].body)).toMatchObject({
      job_lease_token: job.lease_token,
      delivery_error: "provider_unavailable",
    });
    expect(JSON.parse(fetch.mock.calls[5][1].body)).toMatchObject({
      job_lease_token: "second-lease",
      delivery_error: null,
    });
  });

  it("leaves an unfinalized claim to be retried after the lease expires", async () => {
    const logs = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json([job]))
      .mockResolvedValueOnce(Response.json({}))
      .mockResolvedValueOnce(new Response("private PostgREST error", { status: 502 }));
    vi.stubGlobal("fetch", fetch);

    expect((await handleContactRequest(makeRequest())).status).toBe(503);
    expect(logs.mock.calls).toEqual([
      [
        JSON.stringify({
          receipt_id: job.receipt_id,
          status: "processing",
          error_kind: "database_finalize",
        }),
      ],
    ]);
  });
});
