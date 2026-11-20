import { expect, it } from "vite-plus/test";
import { handleRecoveryNotifications } from "./index.ts";

const env = {
  get(name: string) {
    const values: Record<string, string> = {
      MFA_RECOVERY_WORKER_TOKEN: "local-only-test-token-at-least-32-characters",
      MFA_RECOVERY_SENDER_EMAIL: "Quest Qlub <account@example.test>",
      RESEND_API_KEY: "fake-resend-key",
      SUPABASE_URL: "https://db.example.test",
      SUPABASE_SERVICE_ROLE_KEY: "fake-service-role-key",
    };
    return values[name];
  },
};

function workerRequest(token: string) {
  return new Request("https://edge.example.test/notify-mfa-recovery", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

it("a wrong worker token is rejected before contacting the database", async () => {
  const result = await handleRecoveryNotifications(workerRequest("wrong-token"), {
    env,
    requestFetch: () => {
      throw new Error("unauthorized request used a network service");
    },
  });
  expect(result.status).toBe(401);
});

it("retry and success keep the same idempotency key and record only the outcome", async () => {
  const outcomes: unknown[] = [];
  const resendKeys: (string | null)[] = [];
  let attempt = 0;

  const requestFetch: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const headers = new Headers(init?.headers);
    if (url.pathname.endsWith("/claim_mfa_recovery_notifications")) {
      if (headers.get("Authorization") !== "Bearer fake-service-role-key") {
        throw new Error("missing service authorization");
      }
      attempt += 1;
      return Response.json([
        {
          notification_id: "recovery-test-id",
          to_email: "account@example.test",
          attempt,
        },
      ]);
    }
    if (url.hostname === "api.resend.com") {
      if (typeof init?.body !== "string") throw new Error("expected JSON request");
      const body = JSON.parse(init.body);
      if (body.to[0] !== "account@example.test") throw new Error("wrong recipient");
      resendKeys.push(headers.get("Idempotency-Key"));
      return new Response("provider-body-not-persisted", { status: attempt === 1 ? 503 : 200 });
    }
    if (url.pathname.endsWith("/finish_mfa_recovery_notification")) {
      if (typeof init?.body !== "string") throw new Error("expected JSON request");
      outcomes.push(JSON.parse(init.body));
      return Response.json(true);
    }
    throw new Error("unexpected call");
  };

  for (let invocation = 0; invocation < 2; invocation += 1) {
    const result = await handleRecoveryNotifications(
      workerRequest("local-only-test-token-at-least-32-characters"),
      {
        env,
        requestFetch,
      },
    );
    expect(result.status).toBe(204);
  }

  expect(resendKeys).toEqual(["mfa-recovery/recovery-test-id", "mfa-recovery/recovery-test-id"]);
  expect(outcomes).toEqual([
    { p_id: "recovery-test-id", p_attempt: 1, p_outcome: "retry" },
    { p_id: "recovery-test-id", p_attempt: 2, p_outcome: "sent" },
  ]);
});
