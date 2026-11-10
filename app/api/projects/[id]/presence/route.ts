import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDesigner } from "@/lib/auth/require-designer";
import { readJsonBody } from "@/lib/http/read-json";

export const runtime = "nodejs";

const IdSchema = z.string().uuid();
const PresenceSchema = z.object({
  channel_id: z.string().uuid(),
  typing: z.boolean().optional(),
}).strict();
const PRESENCE_TTL_SECONDS = 45;
const TYPING_TTL_SECONDS = 8;

type RouteContext = { params: Promise<{ id: string }> };
type PresenceAuthorization =
  | {
      ok: true;
      projectId: string;
      channelId: string;
      memberId: string;
      memberIds: string[];
    }
  | { ok: false; response: NextResponse };

function presenceKey(projectId: string, memberId: string) {
  return `kiln:presence:project:${projectId}:member:${memberId}`;
}

function typingKey(projectId: string, channelId: string, memberId: string) {
  return `kiln:typing:project:${projectId}:channel:${channelId}:member:${memberId}`;
}

async function authorizeProject(
  params: RouteContext["params"],
  channelId: string,
): Promise<PresenceAuthorization> {
  const authorization = await requireDesigner();
  if (!authorization.authorized) {
    return { ok: false, response: authorization.response };
  }

  const { id: projectId } = await params;
  if (!IdSchema.safeParse(projectId).success || !IdSchema.safeParse(channelId).success) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Invalid project or channel ID." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      ),
    } as const;
  }

  const { data: project, error: projectError } = await authorization.supabase
    .from("projects")
    .select("id, status")
    .eq("id", projectId)
    .maybeSingle();
  if (projectError) {
    console.error("Project presence scope could not be verified.", projectError.message);
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Project presence is temporarily unavailable." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      ),
    } as const;
  }
  if (!project) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "The project was not found or is not accessible." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      ),
    } as const;
  }
  if (project.status !== "active") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Presence is unavailable for completed projects." },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      ),
    } as const;
  }

  const { data: channel, error: channelError } = await authorization.supabase
    .from("project_channels")
    .select("id")
    .eq("id", channelId)
    .eq("project_id", projectId)
    .eq("channel_type", "project")
    .eq("is_archived", false)
    .maybeSingle();
  if (channelError) {
    console.error("Project presence channel could not be verified.", channelError.message);
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Project presence is temporarily unavailable." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      ),
    } as const;
  }
  if (!channel) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "The project channel was not found or is not accessible." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      ),
    } as const;
  }

  const { data: teamMember, error: memberError } = await authorization.supabase
    .from("team_members")
    .select("id")
    .eq("user_id", authorization.user.id)
    .maybeSingle();
  if (memberError) {
    console.error("Project presence member could not be verified.", memberError.message);
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Project presence is temporarily unavailable." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      ),
    } as const;
  }
  if (!teamMember) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "A team profile is required for project presence." },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      ),
    } as const;
  }

  const { data: membership, error: membershipError } = await authorization.supabase
    .from("project_members")
    .select("team_member_id")
    .eq("project_id", projectId)
    .eq("team_member_id", teamMember.id)
    .maybeSingle();
  if (membershipError) {
    console.error("Project presence membership could not be verified.", membershipError.message);
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Project presence is temporarily unavailable." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      ),
    } as const;
  }
  if (!membership) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "You must be a project member to use presence in this channel." },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      ),
    } as const;
  }

  const { data: projectMembers, error: membersError } = await authorization.supabase
    .from("project_members")
    .select("team_member_id")
    .eq("project_id", projectId);
  if (membersError) {
    console.error("Project presence roster could not be loaded.", membersError.message);
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Project presence is temporarily unavailable." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      ),
    } as const;
  }

  return {
    ok: true,
    projectId,
    channelId,
    memberId: teamMember.id,
    memberIds: (projectMembers ?? []).map((member) => member.team_member_id),
  };
}

export async function GET(request: Request, { params }: RouteContext) {
  const channelId = new URL(request.url).searchParams.get("channel_id") ?? "";
  const scope = await authorizeProject(params, channelId);
  if (!scope.ok) {
    return scope.response;
  }

  try {
    const redis = Redis.fromEnv();
    const [onlineValues, typingValues] = await Promise.all([
      Promise.all(
        scope.memberIds.map((memberId) =>
          redis.get(presenceKey(scope.projectId, memberId)),
        ),
      ),
      Promise.all(
        scope.memberIds.map((memberId) =>
          redis.get(typingKey(scope.projectId, scope.channelId, memberId)),
        ),
      ),
    ]);

    return NextResponse.json(
      {
        online_member_ids: scope.memberIds.filter((_, index) => onlineValues[index] === "1"),
        typing_member_ids: scope.memberIds.filter((_, index) => typingValues[index] === "1"),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Project presence could not be loaded.", error);
    return NextResponse.json(
      { error: "Project presence is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  const body = await readJsonBody(request);
  if (!body.ok) {
    return body.response;
  }
  const parsed = PresenceSchema.safeParse(body.value);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "A valid channel ID and typing state are required." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const scope = await authorizeProject(params, parsed.data.channel_id);
  if (!scope.ok) {
    return scope.response;
  }

  try {
    const redis = Redis.fromEnv();
    await redis.set(
      presenceKey(scope.projectId, scope.memberId),
      "1",
      { ex: PRESENCE_TTL_SECONDS },
    );
    if (parsed.data.typing !== undefined) {
      const typingPresenceKey = typingKey(scope.projectId, scope.channelId, scope.memberId);
      if (parsed.data.typing) {
        await redis.set(typingPresenceKey, "1", { ex: TYPING_TTL_SECONDS });
      } else {
        await redis.del(typingPresenceKey);
      }
    }

    return new NextResponse(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Project presence could not be updated.", error);
    return NextResponse.json(
      { error: "Project presence is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const channelId = new URL(request.url).searchParams.get("channel_id") ?? "";
  const scope = await authorizeProject(params, channelId);
  if (!scope.ok) {
    return scope.response;
  }

  try {
    await Redis.fromEnv().del(typingKey(scope.projectId, scope.channelId, scope.memberId));
    return new NextResponse(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Project typing presence could not be cleared.", error);
    return NextResponse.json(
      { error: "Project presence is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
