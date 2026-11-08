// @vitest-environment node

import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSlackServiceClient: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/slack/service", () => ({
  createSlackServiceClient: mocks.createSlackServiceClient,
}));

import { POST } from "../../app/api/slack/events/route";

const signingSecret = "test-slack-signing-secret";

function signedRequest(body: string, timestamp = String(Math.floor(Date.now() / 1000))) {
  const signature = `v0=${createHmac("sha256", signingSecret)
    .update(`v0:${timestamp}:${body}`)
    .digest("hex")}`;
  return new Request("https://kiln-studio.test/api/slack/events", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-slack-request-timestamp": timestamp,
      "x-slack-signature": signature,
    },
    body,
  });
}

describe("Slack Events API endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SLACK_SIGNING_SECRET = signingSecret;
  });

  it("rejects unsigned and invalidly signed payloads", async () => {
    const unsigned = await POST(
      new Request("https://kiln-studio.test/api/slack/events", {
        method: "POST",
        body: JSON.stringify({ type: "event_callback" }),
      }),
    );
    expect(unsigned.status).toBe(401);

    const invalid = await POST(
      new Request("https://kiln-studio.test/api/slack/events", {
        method: "POST",
        headers: {
          "x-slack-request-timestamp": String(Math.floor(Date.now() / 1000)),
          "x-slack-signature": "v0=invalid",
        },
        body: JSON.stringify({ type: "event_callback" }),
      }),
    );
    expect(invalid.status).toBe(401);
    expect(mocks.createSlackServiceClient).not.toHaveBeenCalled();
  });

  it("responds to Slack URL verification challenges only after signature validation", async () => {
    const response = await POST(
      signedRequest(JSON.stringify({ type: "url_verification", challenge: "challenge-1" })),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ challenge: "challenge-1" });
    expect(mocks.createSlackServiceClient).not.toHaveBeenCalled();
  });

  it("passes signed message events to the idempotent membership-aware database function", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "stored", error: null });
    mocks.createSlackServiceClient.mockReturnValue({ rpc });
    const event = {
      type: "event_callback",
      event_id: "EvSlackTest0001",
      event: {
        type: "message",
        channel: "C_PROJECT",
        user: "U_TEAM_MEMBER",
        ts: "1794146400.000100",
        text: "A durable Slack update",
      },
    };

    const response = await POST(signedRequest(JSON.stringify(event)));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, outcome: "stored" });
    expect(rpc).toHaveBeenCalledWith("persist_slack_inbound_message", {
      p_event_id: "EvSlackTest0001",
      p_provider_channel_id: "C_PROJECT",
      p_provider_message_ts: "1794146400.000100",
      p_slack_user_id: "U_TEAM_MEMBER",
      p_body: "A durable Slack update",
    });
  });

  it("acknowledges bot messages without mirroring them back to Slack", async () => {
    const rpc = vi.fn();
    mocks.createSlackServiceClient.mockReturnValue({ rpc });
    const event = {
      type: "event_callback",
      event_id: "EvSlackBot0001",
      event: {
        type: "message",
        bot_id: "B_KILN",
        channel: "C_PROJECT",
        user: "U_KILN",
        ts: "1794146400.000200",
        text: "Kiln message",
      },
    };

    const response = await POST(signedRequest(JSON.stringify(event)));
    expect(response.status).toBe(200);
    expect(rpc).not.toHaveBeenCalled();
  });
});
