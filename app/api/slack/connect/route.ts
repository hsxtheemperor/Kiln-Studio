import { NextResponse } from "next/server";
import { requireDesigner } from "@/lib/auth/require-designer";
import {
  createSlackOAuthState,
  getSlackOAuthStateCookieName,
} from "@/lib/slack/crypto";
import {
  getSlackClientCredentials,
  getSlackRedirectUri,
} from "@/lib/slack/service";

export async function GET(request: Request) {
  const authorization = await requireDesigner();
  if (!authorization.authorized) return authorization.response;

  try {
    const { clientId } = getSlackClientCredentials();
    const redirectUri = getSlackRedirectUri();
    const state = createSlackOAuthState("link", authorization.user.id);
    const slackUrl = new URL("https://slack.com/oauth/v2/authorize");
    slackUrl.searchParams.set("client_id", clientId);
    slackUrl.searchParams.set("user_scope", "openid,profile,email");
    slackUrl.searchParams.set("redirect_uri", redirectUri);
    slackUrl.searchParams.set("state", state);

    const response = NextResponse.redirect(slackUrl);
    response.cookies.set(getSlackOAuthStateCookieName(), state, {
      httpOnly: true,
      sameSite: "lax",
      secure: new URL(request.url).protocol === "https:",
      path: "/api/slack/callback",
      maxAge: 10 * 60,
    });
    return response;
  } catch (error) {
    console.error("Slack user linking could not be started.", error);
    return NextResponse.json(
      { error: "Slack user linking is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
