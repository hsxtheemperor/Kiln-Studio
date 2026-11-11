import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDesigner } from "@/lib/auth/require-designer";
import { readJsonBody } from "@/lib/http/read-json";
import { checkProjectMessageRateLimit } from "@/lib/rate-limit/project-messages";
import { queueSlackMessageDelivery } from "@/lib/slack/outbox-queue";

const MessageSchema = z.object({
  channel_id: z.string().uuid(),
  body: z.string().trim().min(1).max(2000),
}).strict();

const ProjectIdSchema = z.string().uuid();
const PAGE_SIZE = 50;

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  const authorization = await requireDesigner();
  if (!authorization.authorized) {
    return authorization.response;
  }

  const { id: projectId } = await params;
  const { searchParams } = new URL(request.url);
  const channelId = z.string().uuid().safeParse(searchParams.get("channel_id"));
  const before = searchParams.get("before");

  if (
    !ProjectIdSchema.safeParse(projectId).success ||
    !channelId.success ||
    (before !== null && !Number.isFinite(Date.parse(before)))
  ) {
    return NextResponse.json(
      { error: "A valid project, channel, and message cursor are required." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { data: project, error: projectError } = await authorization.supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .maybeSingle();
  if (projectError) {
    console.error("Project message access could not be verified.", projectError.message);
    return NextResponse.json(
      { error: "Project messages are temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!project) {
    return NextResponse.json(
      { error: "The project was not found or is not accessible." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { data: channel, error: channelError } = await authorization.supabase
    .from("project_channels")
    .select("id")
    .eq("id", channelId.data)
    .eq("project_id", projectId)
    .eq("channel_type", "project")
    .maybeSingle();
  if (channelError) {
    console.error("Project message channel could not be verified.", channelError.message);
    return NextResponse.json(
      { error: "Project messages are temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!channel) {
    return NextResponse.json(
      { error: "The project channel was not found or is not accessible." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  let query = authorization.supabase
    .from("project_channel_messages")
    .select("id, channel_id, sender_member_id, sender_name, sender_role, body, message_source, created_at")
    .eq("channel_id", channel.id);
  if (before) query = query.lt("created_at", before);

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE + 1);
  if (error) {
    if (error.code === "42501") {
      return NextResponse.json(
        { error: "You must be a project member to read this conversation." },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }
    console.error("Project messages could not be loaded.", error.message);
    return NextResponse.json(
      { error: "Project messages are temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const hasMore = (data?.length ?? 0) > PAGE_SIZE;
  const messages = (data ?? []).slice(0, PAGE_SIZE).reverse();
  return NextResponse.json(
    {
      messages,
      hasMore,
      nextCursor: hasMore ? messages[0]?.created_at ?? null : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request, { params }: RouteContext) {
  const authorization = await requireDesigner();
  if (!authorization.authorized) {
    return authorization.response;
  }

  const { id: projectId } = await params;
  if (!ProjectIdSchema.safeParse(projectId).success) {
    return NextResponse.json(
      { error: "Invalid project ID." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = MessageSchema.safeParse(body.value);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "A valid channel id and message body are required." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { data: project, error: projectError } = await authorization.supabase
    .from("projects")
    .select("id, status")
    .eq("id", projectId)
    .maybeSingle();

  if (projectError) {
    console.error("Project channel message could not be verified.", projectError.message);
    return NextResponse.json(
      { error: "The project could not be verified." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!project) {
    return NextResponse.json(
      { error: "The project was not found or is not accessible." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (project.status !== "active") {
    return NextResponse.json(
      { error: "Completed project channels are read-only." },
      { status: 409, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { data: channel, error: channelError } = await authorization.supabase
    .from("project_channels")
    .select("id, project_id, channel_type, is_archived")
    .eq("id", parsed.data.channel_id)
    .eq("project_id", projectId)
    .maybeSingle();

  if (channelError) {
    console.error("Project channel could not be verified.", channelError.message);
    return NextResponse.json(
      { error: "The project channel could not be verified." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!channel || channel.channel_type !== "project") {
    return NextResponse.json(
      { error: "The project channel was not found or is not accessible." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (channel.is_archived) {
    return NextResponse.json(
      { error: "Archived project channels are read-only." },
      { status: 409, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { data: teamMember, error: teamMemberError } = await authorization.supabase
    .from("team_members")
    .select("id, full_name")
    .eq("user_id", authorization.user.id)
    .maybeSingle();

  if (teamMemberError) {
    console.error("Message sender could not be verified.", teamMemberError.message);
    return NextResponse.json(
      { error: "Your team identity could not be verified." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!teamMember) {
    return NextResponse.json(
      { error: "A team profile is required to send project messages." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { data: projectMembership, error: projectMembershipError } = await authorization.supabase
    .from("project_members")
    .select("role_name")
    .eq("project_id", projectId)
    .eq("team_member_id", teamMember.id)
    .maybeSingle();

  if (projectMembershipError) {
    console.error("Message sender role could not be loaded.", projectMembershipError.message);
    return NextResponse.json(
      { error: "Your project role could not be verified." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  let rateLimit: Awaited<ReturnType<typeof checkProjectMessageRateLimit>>;
  try {
    rateLimit = await checkProjectMessageRateLimit(authorization.user.id);
  } catch (error) {
    console.error("Project message rate limiting is unavailable.", error);
    return NextResponse.json(
      { error: "Messaging is temporarily unavailable. Please try again." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!rateLimit.success) {
    const retryAfter = Math.max(1, Math.ceil((rateLimit.reset - Date.now()) / 1000));
    return NextResponse.json(
      { error: "You are sending messages too quickly. Please try again shortly." },
      {
        status: 429,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": String(retryAfter),
        },
      },
    );
  }

  const { data, error } = await authorization.supabase
    .from("project_channel_messages")
    .insert({
      channel_id: channel.id,
      sender_member_id: teamMember.id,
      sender_name: teamMember.full_name,
      sender_role: projectMembership?.role_name ?? "TEAM_MEMBER",
      body: parsed.data.body,
    })
    .select("id, channel_id, sender_member_id, sender_name, sender_role, body, message_source, created_at")
    .single();

  if (error) {
    if (error.code === "42501") {
      return NextResponse.json(
        { error: "You must be a project member to send messages here." },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }
    console.error("Project channel message could not be saved.", error.message);
    return NextResponse.json(
      { error: "The project message could not be saved." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const queued = await queueSlackMessageDelivery(data.id);
    if (!queued.queued) {
      console.warn("Slack message remains in the durable outbox for scheduled recovery.", {
        messageId: data.id,
      });
    }
  } catch (queueError) {
    console.error("Slack message delivery could not be queued; the outbox will recover it.", {
      messageId: data.id,
      error: queueError,
    });
  }

  return NextResponse.json(
    { message: data },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
