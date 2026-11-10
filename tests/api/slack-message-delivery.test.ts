// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  createSlackServiceClient: vi.fn(),
  decryptSlackToken: vi.fn(),
  callSlackApi: vi.fn(),
  safeSlackError: vi.fn((error: unknown) =>
    error instanceof Error ? error.message : "Slack synchronization failed.",
  ),
}));

vi.mock("@upstash/qstash", () => ({
  Receiver: class {
    verify = mocks.verify;

    constructor() {}
  },
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/slack/crypto", () => ({
  decryptSlackToken: mocks.decryptSlackToken,
}));
vi.mock("@/lib/slack/outbox", async () => {
  const actual = await vi.importActual<typeof import("@/lib/slack/outbox")>(
    "@/lib/slack/outbox",
  );
  return actual;
});
vi.mock("@/lib/slack/service", () => ({
  callSlackApi: mocks.callSlackApi,
  createSlackServiceClient: mocks.createSlackServiceClient,
  safeSlackError: mocks.safeSlackError,
}));

import { POST } from "@/app/api/slack/deliver/route";

const messageId = "40000000-0000-4000-8000-000000000001";
const projectId = "30000000-0000-4000-8000-000000000001";
const channelId = "50000000-0000-4000-8000-000000000001";

function query(result: unknown) {
  const builder = {
    select: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  for (const method of ["select", "update", "eq"] as const) {
    builder[method].mockReturnValue(builder);
  }
  return builder;
}

function qstashRequest() {
  return new Request("https://kiln-studio.example/api/slack/deliver", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "upstash-signature": "verified-signature",
    },
    body: JSON.stringify({ messageId }),
  });
}

describe("queued Slack message delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.QSTASH_CURRENT_SIGNING_KEY = "current-signing-key";
    process.env.QSTASH_NEXT_SIGNING_KEY = "next-signing-key";
    mocks.verify.mockResolvedValue(true);
    mocks.decryptSlackToken.mockReturnValue("xoxb-test-token");
    mocks.callSlackApi.mockResolvedValue({ ts: "1794172800.000100" });
  });

  it("does not post again when QStash retries after the outbox row is delivered", async () => {
    const installation = query({
      data: { encrypted_bot_token: "encrypted-token" },
      error: null,
    });
    const message = query({
      data: {
        id: messageId,
        channel_id: channelId,
        sender_name: "Designer",
        body: "A durable test message.",
        message_source: "app",
      },
      error: null,
    });
    const mapping = query({ data: { slack_channel_id: "CSLACK" }, error: null });
    const project = query({ data: { status: "active" }, error: null });
    const outboxUpdate = query({ error: null });
    let deliveryClaimed = false;
    const job = {
      id: "60000000-0000-4000-8000-000000000001",
      project_id: projectId,
      project_channel_message_id: messageId,
      status: "processing",
      attempt_count: 1,
      available_at: new Date().toISOString(),
      claimed_at: new Date().toISOString(),
      slack_message_ts: null,
      last_error: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const service = {
      from: vi.fn((table: string) => {
        const tables: Record<string, ReturnType<typeof query>> = {
          slack_installations: installation,
          project_channel_messages: message,
          slack_project_channels: mapping,
          projects: project,
          slack_message_outbox: outboxUpdate,
        };
        const result = tables[table];
        if (!result) throw new Error(`Unexpected table: ${table}`);
        return result;
      }),
      rpc: vi.fn(async () => {
        if (deliveryClaimed) return { data: [], error: null };
        deliveryClaimed = true;
        return { data: [job], error: null };
      }),
    };
    mocks.createSlackServiceClient.mockReturnValue(service);

    const firstAttempt = await POST(qstashRequest());
    const redelivery = await POST(qstashRequest());

    expect(firstAttempt.status).toBe(200);
    expect(await firstAttempt.json()).toEqual({ status: "delivered" });
    expect(redelivery.status).toBe(200);
    expect(await redelivery.json()).toEqual({ status: "already_claimed_or_delivered" });
    expect(service.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.callSlackApi).toHaveBeenCalledTimes(1);
    expect(mocks.callSlackApi).toHaveBeenCalledWith(
      "xoxb-test-token",
      "chat.postMessage",
      expect.objectContaining({ client_msg_id: messageId }),
    );
    expect(outboxUpdate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "delivered",
        slack_message_ts: "1794172800.000100",
      }),
    );
  });

  it("rejects unsigned requests before claiming an outbox message", async () => {
    const request = new Request("https://kiln-studio.example/api/slack/deliver", {
      method: "POST",
      body: JSON.stringify({ messageId }),
    });

    const response = await POST(request);

    expect(response.status).toBe(401);
    expect(mocks.createSlackServiceClient).not.toHaveBeenCalled();
  });

  it("returns a retryable failure and marks the durable outbox row retryable", async () => {
    const installation = query({
      data: { encrypted_bot_token: "encrypted-token" },
      error: null,
    });
    const outboxUpdate = query({ error: null });
    const job = {
      id: "60000000-0000-4000-8000-000000000001",
      project_id: projectId,
      project_channel_message_id: messageId,
      status: "processing",
      attempt_count: 1,
      available_at: new Date().toISOString(),
      claimed_at: new Date().toISOString(),
      slack_message_ts: null,
      last_error: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const service = {
      from: vi.fn((table: string) => {
        const tables: Record<string, ReturnType<typeof query>> = {
          slack_installations: installation,
          slack_message_outbox: outboxUpdate,
        };
        const result = tables[table];
        if (!result) throw new Error(`Unexpected table: ${table}`);
        return result;
      }),
      rpc: vi.fn().mockResolvedValue({ data: [job], error: null }),
    };
    mocks.createSlackServiceClient.mockReturnValue(service);
    mocks.callSlackApi.mockRejectedValue(new Error("Slack API unavailable."));

    const response = await POST(qstashRequest());

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "Slack message delivery will be retried.",
    });
    expect(outboxUpdate.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "retry" }),
    );
    expect(outboxUpdate.update.mock.calls[0][0].available_at).toBeTruthy();
  });
});
