// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runDemoRetention: vi.fn(),
  runSlackSync: vi.fn(),
}));

vi.mock("@/app/api/cron/demo-retention/route", () => ({
  GET: mocks.runDemoRetention,
}));
vi.mock("@/app/api/slack/sync/route", () => ({
  POST: mocks.runSlackSync,
}));

import { GET } from "@/app/api/cron/daily/route";

const CRON_SECRET = "test-cron-secret-with-at-least-32-characters";

function request(authorization?: string) {
  return new Request("https://kiln-studio.test/api/cron/daily", {
    headers: authorization ? { authorization } : undefined,
  });
}

describe("daily cron endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = CRON_SECRET;
    mocks.runSlackSync.mockResolvedValue(
      Response.json({ processed: { completed: 0 } }),
    );
    mocks.runDemoRetention.mockResolvedValue(
      Response.json({ deleted: 0, deletedReferenceFiles: 0 }),
    );
  });

  it("rejects unauthorized calls without running scheduled tasks", async () => {
    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(mocks.runSlackSync).not.toHaveBeenCalled();
    expect(mocks.runDemoRetention).not.toHaveBeenCalled();
  });

  it("runs Slack synchronization before demo retention with the cron authorization", async () => {
    const response = await GET(request(`Bearer ${CRON_SECRET}`));

    expect(response.status).toBe(200);
    expect(mocks.runSlackSync).toHaveBeenCalledOnce();
    expect(mocks.runDemoRetention).toHaveBeenCalledOnce();
    expect(mocks.runSlackSync.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.runDemoRetention.mock.invocationCallOrder[0],
    );
    expect(mocks.runSlackSync.mock.calls[0][0].headers.get("authorization")).toBe(
      `Bearer ${CRON_SECRET}`,
    );
    expect(mocks.runDemoRetention.mock.calls[0][0].headers.get("authorization")).toBe(
      `Bearer ${CRON_SECRET}`,
    );
  });

  it("still runs retention when Slack is not installed", async () => {
    mocks.runSlackSync.mockResolvedValue(
      Response.json({ error: "Slack is not installed." }, { status: 409 }),
    );

    const response = await GET(request(`Bearer ${CRON_SECRET}`));

    expect(response.status).toBe(200);
    expect(mocks.runDemoRetention).toHaveBeenCalledOnce();
    expect(await response.json()).toMatchObject({
      slack: { status: "skipped" },
      retention: { status: "completed" },
    });
  });

  it("reports a failed task with a retryable server error status", async () => {
    mocks.runSlackSync.mockResolvedValue(
      Response.json({ error: "Slack sync failed." }, { status: 503 }),
    );

    const response = await GET(request(`Bearer ${CRON_SECRET}`));

    expect(response.status).toBe(503);
    expect(mocks.runDemoRetention).toHaveBeenCalledOnce();
    expect(await response.json()).toMatchObject({
      slack: { status: "failed" },
      retention: { status: "completed" },
    });
  });
});
