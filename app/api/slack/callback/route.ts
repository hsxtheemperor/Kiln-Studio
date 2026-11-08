import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDesigner } from "@/lib/auth/require-designer";
import {
  encryptSlackToken,
  getSlackOAuthStateCookieName,
  verifySlackOAuthState,
} from "@/lib/slack/crypto";
import {
  createSlackServiceClient,
  getSlackClientCredentials,
  getSlackRedirectUri,
} from "@/lib/slack/service";

const OAuthResponseSchema = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  access_token: z.string().optional(),
  bot_user_id: z.string().optional(),
  team: z.object({ id: z.string(), name: z.string() }).optional(),
  authed_user: z.object({ id: z.string() }).optional(),
});

function callbackRedirect(request: Request, path: string, result: string) {
  const target = new URL(path, request.url);
  target.searchParams.set("slack", result);
  const response = NextResponse.redirect(target);
  response.cookies.delete(getSlackOAuthStateCookieName());
  return response;
}

export async function GET(request: Request) {
  const authorization = await requireDesigner();
  if (!authorization.authorized) return authorization.response;

  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  if (error) {
    return callbackRedirect(
      request,
      authorization.user.app_metadata.access_level === "studio_member" ? "/admin/team" : "/designer/team",
      "cancelled",
    );
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const stateCookie = (await import("next/headers")).cookies;
  const cookieStore = await stateCookie();
  const verifiedState = state
    ? verifySlackOAuthState(
        state,
        cookieStore.get(getSlackOAuthStateCookieName())?.value,
      )
    : null;

  if (!code || !verifiedState || verifiedState.userId !== authorization.user.id) {
    return callbackRedirect(
      request,
      authorization.user.app_metadata.access_level === "studio_member" ? "/admin/team" : "/designer/team",
      "invalid_state",
    );
  }

  if (
    verifiedState.purpose === "install" &&
    authorization.user.app_metadata.access_level !== "studio_member"
  ) {
    return callbackRedirect(request, "/designer/team", "forbidden");
  }

  try {
    const { clientId, clientSecret } = getSlackClientCredentials();
    const formData = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: getSlackRedirectUri(),
    });
    const tokenResponse = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData,
      cache: "no-store",
    });
    if (!tokenResponse.ok) {
      throw new Error(`Slack OAuth returned HTTP ${tokenResponse.status}.`);
    }

    const parsedResponse = OAuthResponseSchema.safeParse(await tokenResponse.json());
    if (!parsedResponse.success || !parsedResponse.data.ok) {
      throw new Error("Slack OAuth did not return a valid authorization.");
    }

    const oauth = parsedResponse.data;
    const slackUserId = oauth.authed_user?.id;
    if (!slackUserId) {
      throw new Error("Slack OAuth did not verify a Slack user identity.");
    }

    const service = createSlackServiceClient();
    if (verifiedState.purpose === "install") {
      if (!oauth.access_token || !oauth.bot_user_id || !oauth.team) {
        throw new Error("Slack OAuth did not return a complete workspace installation.");
      }

      const { error: installationError } = await service
        .from("slack_installations")
        .upsert(
          {
            id: true,
            workspace_id: oauth.team.id,
            workspace_name: oauth.team.name,
            bot_user_id: oauth.bot_user_id,
            encrypted_bot_token: encryptSlackToken(oauth.access_token),
            installed_by: authorization.user.id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" },
        );
      if (installationError) {
        throw new Error("Slack workspace installation could not be saved.");
      }

      const { data: teamMember, error: teamMemberError } = await service
        .from("team_members")
        .select("id")
        .eq("user_id", authorization.user.id)
        .maybeSingle();
      if (teamMemberError) throw new Error("The installer team profile could not be verified.");

      if (teamMember) {
        const { error: mappingError } = await service
          .from("slack_user_mappings")
          .upsert(
            {
              team_member_id: teamMember.id,
              slack_user_id: slackUserId,
              linked_by: authorization.user.id,
            },
            { onConflict: "team_member_id" },
          );
        if (mappingError) {
          throw new Error("The installing Slack user could not be linked to the team profile.");
        }
      }
    } else {
      const { data: installation, error: installationError } = await service
        .from("slack_installations")
        .select("workspace_id")
        .eq("id", true)
        .maybeSingle();
      if (installationError) throw new Error("The Slack workspace could not be verified.");
      if (!installation || !oauth.team || installation.workspace_id !== oauth.team.id) {
        return callbackRedirect(
          request,
          authorization.user.app_metadata.access_level === "studio_member" ? "/admin/team" : "/designer/team",
          "wrong_workspace",
        );
      }

      const { data: teamMember, error: teamMemberError } = await service
        .from("team_members")
        .select("id")
        .eq("user_id", authorization.user.id)
        .eq("is_active", true)
        .maybeSingle();
      if (teamMemberError) throw new Error("The team profile could not be verified.");
      if (!teamMember) {
        return callbackRedirect(
          request,
          authorization.user.app_metadata.access_level === "studio_member" ? "/admin/team" : "/designer/team",
          "team_profile_required",
        );
      }

      const { error: mappingError } = await service
        .from("slack_user_mappings")
        .upsert(
          {
            team_member_id: teamMember.id,
            slack_user_id: slackUserId,
            linked_by: authorization.user.id,
          },
          { onConflict: "team_member_id", ignoreDuplicates: true },
        );
      if (mappingError) {
        throw new Error("The Slack account is already linked to another team profile.");
      }
    }

    return callbackRedirect(
      request,
      authorization.user.app_metadata.access_level === "studio_member" ? "/admin/team" : "/designer/team",
      verifiedState.purpose === "install" ? "installed" : "linked",
    );
  } catch (callbackError) {
    console.error("Slack OAuth callback failed.", callbackError);
    return callbackRedirect(
      request,
      authorization.user.app_metadata.access_level === "studio_member" ? "/admin/team" : "/designer/team",
      "error",
    );
  }
}
