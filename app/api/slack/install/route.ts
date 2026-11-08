import { NextResponse } from "next/server";
import { requireStudioMember } from "@/lib/auth/require-studio-member";
import {
  createSlackOAuthState,
  getSlackOAuthStateCookieName,
} from "@/lib/slack/crypto";
import {
  getSlackClientCredentials,
  getSlackRedirectUri,
} from "@/lib/slack/service";

export async function GET(request: Request) {
  const authorization = await requireStudioMember();
  if (!authorization.authorized) return authorization.response;

  try {
    const { clientId } = getSlackClientCredentials();
    const redirectUri = getSlackRedirectUri();
    const state = createSlackOAuthState("install", authorization.user.id);
    const slackUrl = new URL("https://slack.com/oauth/v2/authorize");
    slackUrl.searchParams.set("client_id", clientId);
    slackUrl.searchParams.set("scope", "chat:write,groups:read,groups:write");
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
    console.error("Slack installation could not be started.", error);
    return NextResponse.json(
      { error: "Slack installation is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
