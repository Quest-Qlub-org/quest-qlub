import { describe, it, expect, vi, beforeEach, afterEach } from "vite-plus/test";
import { handleContactRequest, resetRateLimitMapForTests } from "./index";

function setMockDenoEnv(envMap: Record<string, string | undefined>) {
  (globalThis as Record<string, unknown>).Deno = {
    env: {
      get: (key: string) => envMap[key],
    },
  };
}

function makeRequest(options: {
  method?: string;
  body?: unknown;
  rawBody?: string;
  headers?: Record<string, string>;
}): Request {
  const { method = "POST", body, rawBody, headers = {} } = options;
  const init: RequestInit = {
    method,
    headers: {
      origin: "https://quest-qlub.vercel.app",
      "cf-connecting-ip": "203.0.113.10",
      ...headers,
    },
  };
  if (method !== "GET" && method !== "OPTIONS") {
    init.body = rawBody !== undefined ? rawBody : JSON.stringify(body);
  }
  return new Request("https://example.supabase.co/functions/v1/send-contact-email", init);
}

describe("send-contact-email Edge Function (#148)", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    resetRateLimitMapForTests();
    setMockDenoEnv({
      RESEND_API_KEY: "test-resend-key",
      CONTACT_RECEIVER_EMAIL: "contact@quest-qlub.com",
      CONTACT_SENDER_EMAIL: "Quest Qlub <noreply@quest-qlub.com>",
    });
  });

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).Deno;
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("rejects non-POST methods with 405 before consuming IP rate-limit quota", async () => {
    for (let i = 0; i < 5; i++) {
      const res = await handleContactRequest(makeRequest({ method: "GET" }));
      expect(res.status).toBe(405);
    }

    globalThis.fetch = vi.fn(
      async () => new Response(JSON.stringify({ id: "email-1" }), { status: 200 }),
    ) as typeof fetch;

    const postRes = await handleContactRequest(
      makeRequest({
        body: {
          name: "Test User",
          email: "user@example.com",
          subject: "Hello",
          body: "Valid message body",
        },
      }),
    );
    expect(postRes.status).toBe(200);
  });

  it("returns 400 instead of 500 when JSON body is null, primitive, array, or malformed", async () => {
    for (const badBody of ["null", "123", '"hello"', "[]", "{invalid"]) {
      const res = await handleContactRequest(makeRequest({ rawBody: badBody }));
      expect(res.status).toBe(400);
    }
  });

  it("does not consume email rate-limit quota on invalid payloads before validation", async () => {
    const targetEmail = "victim@example.com";

    // Send 4 invalid requests targeting victim@example.com from distinct IPs
    for (let i = 0; i < 4; i++) {
      const res = await handleContactRequest(
        makeRequest({
          headers: { "cf-connecting-ip": `198.51.100.${i + 1}` },
          body: {
            name: "",
            email: targetEmail,
            subject: "Missing name",
            body: "Should fail validation before email rate limit",
          },
        }),
      );
      expect(res.status).toBe(400);
    }

    globalThis.fetch = vi.fn(
      async () => new Response(JSON.stringify({ id: "email-2" }), { status: 200 }),
    ) as typeof fetch;

    const validRes = await handleContactRequest(
      makeRequest({
        headers: { "cf-connecting-ip": "198.51.100.99" },
        body: {
          name: "Real Victim",
          email: targetEmail,
          subject: "Legit inquiry",
          body: "Hello team",
        },
      }),
    );
    expect(validRes.status).toBe(200);
  });

  it("excludes legacy share-quest.vercel.app from allowed CORS origins", async () => {
    const res = await handleContactRequest(
      makeRequest({
        method: "OPTIONS",
        headers: { origin: "https://share-quest.vercel.app" },
      }),
    );
    expect(res.headers.get("access-control-allow-origin")).toBe("https://quest-qlub.vercel.app");

    const allowedRes = await handleContactRequest(
      makeRequest({
        method: "OPTIONS",
        headers: { origin: "https://quest-qlub-git-main-quest-qlub.vercel.app" },
      }),
    );
    expect(allowedRes.headers.get("access-control-allow-origin")).toBe(
      "https://quest-qlub-git-main-quest-qlub.vercel.app",
    );
  });

  it("returns stealth 200 without calling Resend when honeypot field is populated", async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as typeof fetch;

    const res = await handleContactRequest(
      makeRequest({
        body: {
          name: "Bot",
          email: "bot@example.com",
          subject: "Spam",
          body: "Buy stuff",
          _hp: "filled-by-bot",
        },
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects CR/LF characters in name, email, or subject with 400", async () => {
    const res = await handleContactRequest(
      makeRequest({
        body: {
          name: "Alice",
          email: "alice@example.com",
          subject: "Hello\r\nBcc: attacker@evil.com",
          body: "Valid body",
        },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rate-limits repeated requests per IP and per normalized email", async () => {
    globalThis.fetch = vi.fn(
      async () => new Response(JSON.stringify({ id: "email-ok" }), { status: 200 }),
    ) as typeof fetch;

    const validBody = {
      name: "Alice",
      email: "Alice@Example.com",
      subject: "Question",
      body: "Message",
    };

    // 3 requests from distinct IPs for same normalized email succeed
    for (let i = 0; i < 3; i++) {
      const res = await handleContactRequest(
        makeRequest({
          headers: { "cf-connecting-ip": `192.0.2.${i + 1}` },
          body: validBody,
        }),
      );
      expect(res.status).toBe(200);
    }

    // 4th request for same normalized email (different case, new IP) is 429
    const emailLimitedRes = await handleContactRequest(
      makeRequest({
        headers: { "cf-connecting-ip": "192.0.2.99" },
        body: { ...validBody, email: "alice@example.com" },
      }),
    );
    expect(emailLimitedRes.status).toBe(429);

    // 3 requests from same IP with distinct emails succeed, 4th is 429
    for (let i = 0; i < 3; i++) {
      const res = await handleContactRequest(
        makeRequest({
          headers: { "cf-connecting-ip": "198.51.100.50" },
          body: { ...validBody, email: `distinct-${i}@example.com` },
        }),
      );
      expect(res.status).toBe(200);
    }

    const ipLimitedRes = await handleContactRequest(
      makeRequest({
        headers: { "cf-connecting-ip": "198.51.100.50" },
        body: { ...validBody, email: "distinct-3@example.com" },
      }),
    );
    expect(ipLimitedRes.status).toBe(429);
  });
});
