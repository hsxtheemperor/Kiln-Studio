import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { GET as runDemoRetention } from "@/app/api/cron/demo-retention/route";
import { POST as runSlackSync } from "@/app/api/slack/sync/route";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  const expected = process.env.CRON_SECRET;
  const actual = request.headers.get("authorization") ?? "";
  const expectedAuthorization = expected ? `Bearer ${expected}` : "";

  return Boolean(
    expectedAuthorization &&
      actual.length === expectedAuthorization.length &&
      timingSafeEqual(Buffer.from(actual), Buffer.from(expectedAuthorization)),
  );
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { error: "Unauthorized." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const slackRequest = new Request(new URL("/api/slack/sync", request.url), {
      method: "POST",
      headers: { authorization: request.headers.get("authorization") ?? "" },
    });
    const slackResponse = await runSlackSync(slackRequest);
    const slackResult: unknown = await slackResponse.json();
    const slackSkipped = slackResponse.status === 409;

    const retentionRequest = new Request(
      new URL("/api/cron/demo-retention", request.url),
      { headers: { authorization: request.headers.get("authorization") ?? "" } },
    );
    const retentionResponse = await runDemoRetention(retentionRequest);
    const retentionResult: unknown = await retentionResponse.json();

    return NextResponse.json(
      {
        slack: {
          status: slackSkipped
            ? "skipped"
            : slackResponse.ok
              ? "completed"
              : "failed",
          result: slackResult,
        },
        retention: {
          status: retentionResponse.ok ? "completed" : "failed",
          result: retentionResult,
        },
      },
      {
        status:
          (slackResponse.ok || slackSkipped) && retentionResponse.ok ? 200 : 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    console.error("Daily scheduled maintenance failed.", error);
    return NextResponse.json(
      { error: "Daily scheduled maintenance could not be completed." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
