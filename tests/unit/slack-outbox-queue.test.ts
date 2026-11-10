// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  publishJSON: vi.fn(),
  client: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@upstash/qstash", () => ({
  Client: class {
    publishJSON = mocks.publishJSON;

    constructor(options: unknown) {
      mocks.client(options);
    }
  },
}));

import { queueSlackMessageDelivery } from "@/lib/slack/outbox-queue";

describe("queueSlackMessageDelivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.QSTASH_TOKEN = "test-qstash-token";
    process.env.QSTASH_CURRENT_SIGNING_KEY = "test-current-signing-key";
    process.env.QSTASH_NEXT_SIGNING_KEY = "test-next-signing-key";
    process.env.NEXT_PUBLIC_SITE_URL = "https://kiln-studio.example";
    mocks.publishJSON.mockResolvedValue({ messageId: "qstash-message-id" });
  });

  it("publishes each message with a stable QStash deduplication ID", async () => {
    const messageId = "40000000-0000-4000-8000-000000000001";

    await expect(queueSlackMessageDelivery(messageId)).resolves.toEqual({ queued: true });

    expect(mocks.client).toHaveBeenCalledWith({ token: "test-qstash-token" });
    expect(mocks.publishJSON).toHaveBeenCalledWith({
      url: "https://kiln-studio.example/api/slack/deliver",
      body: { messageId },
      retries: 5,
      deduplicationId: `slack-message-${messageId}`,
    });
  });

  it("leaves delivery to the durable outbox and cron for local development", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";

    await expect(
      queueSlackMessageDelivery("40000000-0000-4000-8000-000000000001"),
    ).resolves.toEqual({ queued: false });

    expect(mocks.publishJSON).not.toHaveBeenCalled();
  });
});
