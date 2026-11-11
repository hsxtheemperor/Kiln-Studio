"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ProjectRole } from "@/lib/studio/constants";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { ProjectChannelMessageRow } from "@/lib/supabase/database.types";
import type { ProjectChannelView, ProjectManagerOption } from "@/lib/studio/project-channels";

type ChannelPresence = {
  online_member_ids: string[];
  typing_member_ids: string[];
};

type MessagePage = {
  hasMore: boolean;
  nextCursor: string | null;
  loading: boolean;
};

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isProjectChannelMessage(value: unknown): value is ProjectChannelMessageRow {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value && typeof value.id === "string" &&
    "channel_id" in value && typeof value.channel_id === "string" &&
    "sender_member_id" in value &&
      (typeof value.sender_member_id === "string" || value.sender_member_id === null) &&
    "sender_name" in value && typeof value.sender_name === "string" &&
    "sender_role" in value &&
      (typeof value.sender_role === "string" || value.sender_role === null) &&
    "body" in value && typeof value.body === "string" &&
    "message_source" in value &&
      (value.message_source === "app" || value.message_source === "slack") &&
    "created_at" in value && typeof value.created_at === "string"
  );
}

const projectMemberRoles = [
  "TEAM_MEMBER",
  "DESIGNER",
  ...Object.values(ProjectRole).filter((role) => role !== ProjectRole.PROJECT_MANAGER),
];

function getErrorMessage(payload: unknown, fallback: string): string {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    return payload.error;
  }
  return fallback;
}

function formatRoleName(role: string): string {
  return role
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
}

export function TeamWorkspace({
  scope,
  liveProjectChannels,
  liveProjectChannelsError,
  channelPage,
  hasMoreChannels,
  teamMemberOptions,
  teamMemberOptionsError,
}: {
  scope: "admin" | "designer";
  liveProjectChannels: ProjectChannelView[];
  liveProjectChannelsError?: string;
  channelPage: number;
  hasMoreChannels: boolean;
  teamMemberOptions?: ProjectManagerOption[];
  teamMemberOptionsError?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const slackStatus = searchParams.get("slack");
  const [slackConnection, setSlackConnection] = useState<{
    workspaceInstalled: boolean;
    accountLinked: boolean;
    workspaceName: string | null;
  } | null>(null);
  const [slackConnectionError, setSlackConnectionError] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [projectError, setProjectError] = useState("");
  const [savingProjectId, setSavingProjectId] = useState<string | null>(null);
  const [savingMessageChannelId, setSavingMessageChannelId] = useState<string | null>(null);
  const [savingMembershipProjectId, setSavingMembershipProjectId] = useState<string | null>(null);
  const [collaborationErrors, setCollaborationErrors] = useState<Record<string, string>>({});
  const [messagesByChannel, setMessagesByChannel] = useState<
    Record<string, ProjectChannelMessageRow[]>
  >({});
  const [messagePages, setMessagePages] = useState<Record<string, MessagePage>>({});
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [presenceByChannel, setPresenceByChannel] = useState<
    Record<string, ChannelPresence>
  >({});
  const [presenceErrors, setPresenceErrors] = useState<Record<string, string>>({});
  const [membersByProject, setMembersByProject] = useState<
    Record<string, ProjectChannelView["members"]>
  >(() =>
    Object.fromEntries(liveProjectChannels.map((channel) => [channel.project_id, channel.members])),
  );

  useEffect(() => {
    const channelIds = new Set(liveProjectChannels.map((channel) => channel.id));
    setMessagesByChannel((current) =>
      Object.fromEntries(Object.entries(current).filter(([id]) => channelIds.has(id))),
    );
    setMessagePages((current) =>
      Object.fromEntries(Object.entries(current).filter(([id]) => channelIds.has(id))),
    );
    setMembersByProject(
      Object.fromEntries(liveProjectChannels.map((channel) => [channel.project_id, channel.members])),
    );
  }, [liveProjectChannels]);

  useEffect(() => {
    let active = true;
    void fetch("/api/slack/status", { cache: "no-store" })
      .then(async (response) => {
        const payload: unknown = await response.json();
        if (!response.ok) throw new Error(getErrorMessage(payload, "Slack status is unavailable."));
        if (
          typeof payload === "object" &&
          payload !== null &&
          "workspaceInstalled" in payload &&
          typeof payload.workspaceInstalled === "boolean" &&
          "accountLinked" in payload &&
          typeof payload.accountLinked === "boolean" &&
          "workspaceName" in payload &&
          (typeof payload.workspaceName === "string" || payload.workspaceName === null)
        ) {
          if (active) {
            setSlackConnection({
              workspaceInstalled: payload.workspaceInstalled,
              accountLinked: payload.accountLinked,
              workspaceName: payload.workspaceName,
            });
          }
          return;
        }
        throw new Error("Slack status response was invalid.");
      })
      .catch((error: unknown) => {
        if (active) {
          setSlackConnectionError(
            error instanceof Error ? error.message : "Slack connection status is unavailable.",
          );
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const channel = liveProjectChannels.find((item) => item.id === activeChannelId);
    if (!channel) return;

    let supabase: ReturnType<typeof createSupabaseBrowserClient>;
    try {
      supabase = createSupabaseBrowserClient();
    } catch (error) {
      console.error("Project channel realtime is unavailable.", error);
      return;
    }

    const subscription = supabase
      .channel(`project-messages-${channel.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "project_channel_messages",
          filter: `channel_id=eq.${channel.id}`,
        },
        (payload) => {
          const message = payload.new as ProjectChannelMessageRow;
          setMessagesByChannel((current) => {
            const messages = current[channel.id] ?? [];
            if (messages.some((item) => item.id === message.id)) return current;
            return {
              ...current,
              [channel.id]: [...messages, message],
            };
          });
        },
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error(`Realtime updates are unavailable for project channel ${channel.id}.`);
        }
      });

    return () => {
      void supabase.removeChannel(subscription);
    };
  }, [activeChannelId, liveProjectChannels]);

  useEffect(() => {
    const channel = liveProjectChannels.find((item) => item.id === activeChannelId);
    if (!channel || channel.project_status !== "active" || channel.is_archived) return;
    const projectId = channel.project_id;
    const channelId = channel.id;

    let active = true;
    let refreshing = false;
    let heartbeating = false;

    async function refreshPresence() {
      if (refreshing) return;
      refreshing = true;
      try {
        const response = await fetch(
          `/api/projects/${projectId}/presence?channel_id=${channelId}`,
          { cache: "no-store" },
        );
        const payload: unknown = await response.json();
        if (!response.ok) {
          throw new Error(getErrorMessage(payload, "Presence is temporarily unavailable."));
        }
        const onlineMemberIds =
          typeof payload === "object" && payload !== null && "online_member_ids" in payload
            ? payload.online_member_ids
            : undefined;
        const typingMemberIds =
          typeof payload === "object" && payload !== null && "typing_member_ids" in payload
            ? payload.typing_member_ids
            : undefined;
        if (
          !isStringArray(onlineMemberIds) ||
          !isStringArray(typingMemberIds)
        ) {
          throw new Error("Presence response was invalid.");
        }
        if (active) {
          setPresenceByChannel((current) => ({
            ...current,
            [channelId]: {
              online_member_ids: onlineMemberIds,
              typing_member_ids: typingMemberIds,
            },
          }));
          setPresenceErrors((current) => ({ ...current, [channelId]: "" }));
        }
      } catch (error) {
        if (active) {
          setPresenceErrors((current) => ({
            ...current,
            [channelId]:
              error instanceof Error ? error.message : "Presence is temporarily unavailable.",
          }));
        }
      } finally {
        refreshing = false;
      }
    }

    async function heartbeat() {
      if (heartbeating) return;
      heartbeating = true;
      try {
        const response = await fetch(`/api/projects/${projectId}/presence`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channel_id: channelId }),
        });
        if (!response.ok) {
          const payload: unknown = await response.json();
          throw new Error(getErrorMessage(payload, "Presence is temporarily unavailable."));
        }
      } catch (error) {
        if (active) {
          setPresenceErrors((current) => ({
            ...current,
            [channelId]:
              error instanceof Error ? error.message : "Presence is temporarily unavailable.",
          }));
        }
      } finally {
        heartbeating = false;
      }
    }

    void heartbeat().then(refreshPresence);
    const refreshTimer = window.setInterval(() => void refreshPresence(), 10_000);
    const heartbeatTimer = window.setInterval(() => void heartbeat(), 20_000);

    return () => {
      active = false;
      window.clearInterval(refreshTimer);
      window.clearInterval(heartbeatTimer);
      void fetch(
        `/api/projects/${projectId}/presence?channel_id=${channelId}`,
        { method: "DELETE", keepalive: true },
      );
    };
  }, [activeChannelId, liveProjectChannels]);

  useEffect(() => {
    const channel = liveProjectChannels.find((item) => item.id === activeChannelId);
    if (!channel || channel.project_status !== "active" || channel.is_archived) return;
    const projectId = channel.project_id;
    const channelId = channel.id;

    const timer = window.setTimeout(() => {
      void fetch(`/api/projects/${projectId}/presence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel_id: channelId,
          typing: Boolean(drafts[channelId]?.trim()),
        }),
      }).then(async (response) => {
        if (!response.ok) {
          const payload: unknown = await response.json();
          throw new Error(getErrorMessage(payload, "Typing status is unavailable."));
        }
      }).catch((error: unknown) => {
        setPresenceErrors((current) => ({
          ...current,
          [channelId]:
            error instanceof Error ? error.message : "Typing status is unavailable.",
        }));
      });
    }, 400);

    return () => {
      window.clearTimeout(timer);
    };
  }, [activeChannelId, drafts, liveProjectChannels]);

  async function loadChannelMessages(channel: ProjectChannelView, before?: string) {
    setMessagePages((current) => ({
      ...current,
      [channel.id]: { ...current[channel.id], hasMore: current[channel.id]?.hasMore ?? false, nextCursor: current[channel.id]?.nextCursor ?? null, loading: true },
    }));
    setCollaborationErrors((current) => ({ ...current, [channel.id]: "" }));

    try {
      const cursor = before ? `&before=${encodeURIComponent(before)}` : "";
      const response = await fetch(
        `/api/projects/${channel.project_id}/messages?channel_id=${encodeURIComponent(channel.id)}${cursor}`,
        { cache: "no-store" },
      );
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(getErrorMessage(payload, "Project messages could not be loaded."));
      }
      if (
        typeof payload !== "object" ||
        payload === null ||
        !("messages" in payload) ||
        !Array.isArray(payload.messages) ||
        !payload.messages.every(isProjectChannelMessage) ||
        !("hasMore" in payload) ||
        typeof payload.hasMore !== "boolean"
      ) {
        throw new Error("The project message response was invalid.");
      }

      const hasMore = payload.hasMore;
      const nextCursor = "nextCursor" in payload && typeof payload.nextCursor === "string"
        ? payload.nextCursor
        : null;
      const incoming = payload.messages;
      setMessagesByChannel((current) => {
        const existing = current[channel.id] ?? [];
        const combined = before ? [...incoming, ...existing] : [...existing, ...incoming];
        const unique = [...new Map(combined.map((message) => [message.id, message])).values()]
          .sort((left, right) => left.created_at.localeCompare(right.created_at));
        return { ...current, [channel.id]: unique };
      });
      setMessagePages((current) => ({
        ...current,
        [channel.id]: {
          hasMore,
          nextCursor,
          loading: false,
        },
      }));
    } catch (error) {
      setCollaborationErrors((current) => ({
        ...current,
        [channel.id]: error instanceof Error ? error.message : "Project messages could not be loaded.",
      }));
      setMessagePages((current) => ({
        ...current,
        [channel.id]: { ...current[channel.id], loading: false },
      }));
    }
  }

  function toggleConversation(channel: ProjectChannelView) {
    if (activeChannelId === channel.id) {
      setActiveChannelId(null);
      return;
    }
    setActiveChannelId(channel.id);
    void loadChannelMessages(channel);
  }

  async function sendMessage(channel: ProjectChannelView) {
    const body = (drafts[channel.id] ?? "").trim();
    if (!body) return;

    setSavingMessageChannelId(channel.id);
    setCollaborationErrors((errors) => ({ ...errors, [channel.id]: "" }));
    try {
      const response = await fetch(`/api/projects/${channel.project_id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel_id: channel.id, body }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        setCollaborationErrors((errors) => ({
          ...errors,
          [channel.id]: getErrorMessage(payload, "The message could not be sent."),
        }));
        return;
      }

      if (
        typeof payload !== "object" ||
        payload === null ||
        !("message" in payload) ||
        typeof payload.message !== "object" ||
        payload.message === null ||
        !("id" in payload.message)
      ) {
        throw new Error("The project message response was invalid.");
      }
      if (!isProjectChannelMessage(payload.message)) {
        throw new Error("The project message response was invalid.");
      }
      const savedMessage = payload.message;
      setMessagesByChannel((current) => {
        const messages = current[channel.id] ?? [];
        if (messages.some((message) => message.id === savedMessage.id)) return current;
        return { ...current, [channel.id]: [...messages, savedMessage] };
      });
      setDrafts((currentDrafts) => ({ ...currentDrafts, [channel.id]: "" }));
    } catch (error) {
      setCollaborationErrors((errors) => ({
        ...errors,
        [channel.id]: error instanceof Error ? error.message : "Could not reach the server. Please try again.",
      }));
    } finally {
      setSavingMessageChannelId(null);
    }
  }

  async function addProjectMember(projectId: string, form: HTMLFormElement) {
    const formData = new FormData(form);
    const teamMemberId = formData.get("team_member_id");
    const roleName = formData.get("role_name");
    if (typeof teamMemberId !== "string" || typeof roleName !== "string") return;

    setSavingMembershipProjectId(projectId);
    setCollaborationErrors((errors) => ({ ...errors, [projectId]: "" }));
    try {
      const response = await fetch(`/api/projects/${projectId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team_member_id: teamMemberId, role_name: roleName }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        setCollaborationErrors((errors) => ({
          ...errors,
          [projectId]: getErrorMessage(payload, "The project member could not be added."),
        }));
        return;
      }
      form.reset();
      router.refresh();
    } catch {
      setCollaborationErrors((errors) => ({
        ...errors,
        [projectId]: "Could not reach the server. Please try again.",
      }));
    } finally {
      setSavingMembershipProjectId(null);
    }
  }

  async function removeProjectMember(projectId: string, memberId: string, memberName: string) {
    if (!window.confirm(`Remove ${memberName} from this project? They will lose access to its channel history.`)) {
      return;
    }
    setSavingMembershipProjectId(projectId);
    setCollaborationErrors((errors) => ({ ...errors, [projectId]: "" }));
    try {
      const response = await fetch(`/api/projects/${projectId}/members`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team_member_id: memberId }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        setCollaborationErrors((errors) => ({
          ...errors,
          [projectId]: getErrorMessage(payload, "The project member could not be removed."),
        }));
        return;
      }
      router.refresh();
    } catch {
      setCollaborationErrors((errors) => ({
        ...errors,
        [projectId]: "Could not reach the server. Please try again.",
      }));
    } finally {
      setSavingMembershipProjectId(null);
    }
  }

  async function updateProject(
    projectId: string,
    values: { deadline_date?: string | null; project_manager_id?: string | null; status?: "completed" },
  ) {
    setSavingProjectId(projectId);
    setProjectError("");

    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : "The project could not be updated.";
        setProjectError(message);
        return;
      }

      router.refresh();
    } catch {
      setProjectError("Could not reach the server. Please try again.");
    } finally {
      setSavingProjectId(null);
    }
  }

  return (
    <main className="admin-main">
      <div className="admin-heading-row">
        <div>
          <p className="eyebrow">Team workspace</p>
          <h1>People, roles, and project channels</h1>
        </div>
        <a className="button-secondary" href={scope === "admin" ? "/admin" : "/designer"}>
          Back to dashboard
        </a>
      </div>

      <div className="team-overview-grid">
        <div className="team-metric-card">
          <span>Active team</span>
          <strong>{teamMemberOptions?.length ?? 0}</strong>
          <small>People available for project assignments</small>
        </div>
        <div className="team-metric-card">
          <span>Active projects</span>
          <strong>{liveProjectChannels.filter((channel) => channel.project_status === "active").length}</strong>
          <small>Project channels accepting messages</small>
        </div>
        <div className="team-metric-card">
          <span>Archived channels</span>
          <strong>{liveProjectChannels.filter((channel) => channel.is_archived).length}</strong>
          <small>Completed project history</small>
        </div>
      </div>

      <section className="team-panel slack-connection-panel">
        <div>
          <div className="ops-card-header">
            <h3>Slack integration</h3>
            <span>Optional collaboration sync</span>
          </div>
          <p>
            Link your verified Slack account to connect project conversations. Kiln Studio continues
            to control project membership and message access.
          </p>
          {slackConnectionError && (
            <p className="form-error" role="status">{slackConnectionError}</p>
          )}
          {slackConnection && (
            <p className={slackConnection.accountLinked ? "form-success" : "empty-state"} role="status">
              {slackConnection.accountLinked
                ? `Slack account linked${slackConnection.workspaceName ? ` to ${slackConnection.workspaceName}` : ""}.`
                : slackConnection.workspaceInstalled
                  ? "Workspace connected. Link your Slack account to join project channels."
                  : "No Slack workspace is currently connected."}
            </p>
          )}
          {slackStatus && (
            <p
              className={
                slackStatus === "installed" || slackStatus === "linked"
                  ? "form-success"
                  : "form-error"
              }
              role="status"
            >
              {slackStatus === "installed"
                ? "Slack workspace connected."
                : slackStatus === "linked"
                  ? "Slack account linked."
                  : slackStatus === "cancelled"
                    ? "Slack authorization was cancelled."
                    : slackStatus === "wrong_workspace"
                      ? "Use the Slack workspace installed by the studio admin."
                      : slackStatus === "team_profile_required"
                        ? "A team profile is required before linking Slack."
                              : slackStatus === "workspace_change_required"
                                ? "This app is already connected to another workspace. Disconnect it there before changing workspaces."
                              : "Slack could not be connected. Check the app configuration and try again."}
            </p>
          )}
        </div>
        <div className="slack-connection-actions">
          {scope === "admin" && (
            <a className="button-secondary" href="/api/slack/install">
              Install or reconnect workspace
            </a>
          )}
          {slackConnection?.workspaceInstalled && (
            <a className="button-secondary" href="/api/slack/connect">
              {slackConnection.accountLinked ? "Relink my Slack account" : "Link my Slack account"}
            </a>
          )}
        </div>
      </section>

      <section className="team-panel" style={{ marginTop: "24px" }}>
        <div className="ops-card-header">
          <h3>Project channels</h3>
          <span>Priority, then nearest deadline</span>
        </div>
        {liveProjectChannelsError ? (
          <p className="form-error" role="alert">{liveProjectChannelsError}</p>
        ) : liveProjectChannels.length === 0 ? (
          <p className="empty-state">No accepted inquiries have become projects yet.</p>
        ) : (
          <div className="channel-list">
            {projectError && <p className="form-error" role="alert">{projectError}</p>}
            {teamMemberOptionsError && scope === "admin" && (
              <p className="form-error" role="alert">{teamMemberOptionsError}</p>
            )}
            {liveProjectChannels.map((channel) => (
              <article
                key={channel.id}
                className={`channel-row${channel.is_archived ? " channel-archived" : ""}`}
              >
                <div>
                  <strong>#{channel.channel_name}</strong>
                  <p>
                    Priority: {channel.priority_label} ({channel.priority_score}/10)
                    {" · "}Deadline: {channel.deadline_date ?? "Not set"}
                    {" · "}Status: {channel.project_status}
                  </p>
                  <p className="project-channel-description">{channel.description}</p>
                  {(channel.is_project_manager || scope === "admin") && channel.project_status === "active" && (
                    <form
                      className="project-controls"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const formData = new FormData(event.currentTarget);
                        const deadlineValue = formData.get("deadline_date");
                        const values: {
                          deadline_date?: string | null;
                          project_manager_id?: string | null;
                        } = {
                          deadline_date:
                            typeof deadlineValue === "string" && deadlineValue
                              ? deadlineValue
                              : null,
                        };

                        if (scope === "admin") {
                          const managerValue = formData.get("project_manager_id");
                          values.project_manager_id =
                            typeof managerValue === "string" && managerValue
                              ? managerValue
                              : null;
                        }

                        void updateProject(channel.project_id, values);
                      }}
                    >
                      <label>
                        Deadline
                        <input
                          aria-label={`Deadline for ${channel.channel_name}`}
                          type="date"
                          name="deadline_date"
                          defaultValue={channel.deadline_date ?? ""}
                          disabled={savingProjectId === channel.project_id}
                        />
                      </label>
                      {scope === "admin" && (
                        <label>
                          Project manager
                          <select
                            name="project_manager_id"
                            defaultValue={channel.project_manager_id ?? ""}
                            disabled={savingProjectId === channel.project_id || !teamMemberOptions?.length}
                          >
                            <option value="">Unassigned</option>
                            {teamMemberOptions?.map((member) => (
                              <option key={member.id} value={member.id}>
                                {member.full_name} ({member.email})
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      <button
                        className="button-secondary"
                        type="submit"
                        disabled={savingProjectId === channel.project_id}
                      >
                        Save project
                      </button>
                      {channel.is_project_manager && (
                        <button
                          className="button-primary"
                          type="button"
                          disabled={savingProjectId === channel.project_id}
                          onClick={() => void updateProject(channel.project_id, { status: "completed" })}
                        >
                          Mark completed
                        </button>
                      )}
                    </form>
                  )}
                </div>
                {channel.is_archived && <span className="status-pill">Archived</span>}
              </article>
            ))}
          </div>
        )}
      </section>
      {(channelPage > 1 || hasMoreChannels) && (
        <nav className="admin-heading-row" aria-label="Project channel pages">
          {channelPage > 1 ? (
            <Link className="button-secondary" href={`/${scope === "admin" ? "admin" : "designer"}/team?page=${channelPage - 1}`}>
              Previous channels
            </Link>
          ) : <span />}
          <span>Page {channelPage}</span>
          {hasMoreChannels && channelPage < 1000 ? (
            <Link className="button-secondary" href={`/${scope === "admin" ? "admin" : "designer"}/team?page=${channelPage + 1}`}>
              More channels
            </Link>
          ) : <span />}
        </nav>
      )}

      <section className="team-workspace-grid">
        <div className="team-panel">
          <div className="ops-card-header">
            <h3>Team directory</h3>
            <span>{teamMemberOptions?.length ?? 0} active members</span>
          </div>
          {teamMemberOptionsError ? (
            <p className="form-error" role="alert">{teamMemberOptionsError}</p>
          ) : !teamMemberOptions?.length ? (
            <p className="empty-state">No active team members are available.</p>
          ) : (
            <div className="team-list">
              {teamMemberOptions.map((member) => (
                <div className="team-member" key={member.id}>
                  <div>
                    <strong>{member.full_name}</strong>
                    <p>{[member.title, member.specialty].filter(Boolean).join(" · ") || member.email}</p>
                  </div>
                  <span className="availability-pill">{member.availability_status.replace("_", " ")}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="team-panel">
          <div className="ops-card-header">
            <h3>Project collaboration</h3>
            <span>Database-backed membership and chat</span>
          </div>
          <p className="empty-state">
            Project channels are the durable collaboration rooms. Membership changes control access to
            each channel and its history.
          </p>
        </div>
      </section>

      <section className="team-chat-grid">
        {liveProjectChannels.map((channel) => {
          const canManageTeam =
            (scope === "admin" || channel.is_project_manager) &&
            channel.project_status === "active";
          const channelMembers = membersByProject[channel.project_id] ?? channel.members;
          const channelMessages = messagesByChannel[channel.id] ?? [];
          const messagePage = messagePages[channel.id];
          const isConversationOpen = activeChannelId === channel.id;
          const channelPresence = presenceByChannel[channel.id];
          const typingNames = channelMembers
            .filter((member) => channelPresence?.typing_member_ids.includes(member.team_member_id))
            .map((member) => member.full_name);
          const assignedMemberIds = new Set(channelMembers.map((member) => member.team_member_id));
          const availableMembers = (teamMemberOptions ?? []).filter(
            (member) => !assignedMemberIds.has(member.id),
          );

          return (
            <article key={channel.id} className="project-channel-card">
              <div className="project-channel-head">
                <strong>#{channel.channel_name}</strong>
                <span>
                  {channel.is_archived
                    ? "Archived"
                    : isConversationOpen
                      ? `${channelPresence?.online_member_ids.length ?? 0} online · ${channelMembers.length} members`
                      : `${channelMembers.length} members`}
                </span>
              </div>
              {typingNames.length > 0 && (
                <p className="presence-status" aria-live="polite">
                  {typingNames.join(", ")} {typingNames.length === 1 ? "is" : "are"} typing
                </p>
              )}
              {presenceErrors[channel.id] && (
                <p className="form-error" role="status">{presenceErrors[channel.id]}</p>
              )}
              <p>{channel.description}</p>

              <div className="project-members-list">
                <h4>Project team</h4>
                {channelMembers.map((member) => (
                  <div className="project-member-row" key={member.id}>
                    <div>
                      <strong>{member.full_name}</strong>
                      <span>
                        {member.role_name === "PROJECT_MANAGER"
                          ? "Project manager"
                          : formatRoleName(member.role_name)}
                      </span>
                    </div>
                    {canManageTeam && member.role_name !== "PROJECT_MANAGER" && (
                      <button
                        className="button-secondary"
                        type="button"
                        disabled={savingMembershipProjectId === channel.project_id}
                        onClick={() =>
                          void removeProjectMember(
                            channel.project_id,
                            member.team_member_id,
                            member.full_name,
                          )
                        }
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {canManageTeam && (
                <form
                  className="project-controls project-member-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void addProjectMember(channel.project_id, event.currentTarget);
                  }}
                >
                  <label>
                    Add team member
                    <select
                      name="team_member_id"
                      required
                      defaultValue=""
                      disabled={savingMembershipProjectId === channel.project_id || !availableMembers.length}
                    >
                      <option value="" disabled>
                        {availableMembers.length ? "Choose a team member" : "Everyone is assigned"}
                      </option>
                      {availableMembers.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.full_name} ({member.email})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Role
                    <select
                      name="role_name"
                      defaultValue="TEAM_MEMBER"
                      disabled={savingMembershipProjectId === channel.project_id}
                    >
                      {projectMemberRoles.map((role) => (
                        <option key={role} value={role}>
                          {formatRoleName(role)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="button-secondary"
                    type="submit"
                    disabled={
                      savingMembershipProjectId === channel.project_id ||
                      !availableMembers.length ||
                      !teamMemberOptions?.length
                    }
                  >
                    Add to project
                  </button>
                </form>
              )}
              {collaborationErrors[channel.project_id] && (
                <p className="form-error" role="alert">{collaborationErrors[channel.project_id]}</p>
              )}

              <button
                className="button-secondary"
                type="button"
                aria-expanded={isConversationOpen}
                onClick={() => toggleConversation(channel)}
              >
                {isConversationOpen ? "Close conversation" : "Open conversation"}
              </button>
              {isConversationOpen && (
                <>
                  {messagePage?.hasMore && messagePage.nextCursor && (
                    <button
                      className="button-secondary"
                      type="button"
                      onClick={() => void loadChannelMessages(channel, messagePage.nextCursor ?? undefined)}
                      disabled={messagePage.loading}
                    >
                      {messagePage.loading ? "Loading…" : "Load older messages"}
                    </button>
                  )}
                  {messagePage?.loading && channelMessages.length === 0 ? (
                    <p className="loading-state" role="status">Loading conversation…</p>
                  ) : (
                    <div className="channel-thread" aria-live="polite">
                      {channelMessages.length ? (
                        channelMessages.map((message) => (
                          <div key={message.id} className="chat-message">
                            <div className="message-meta">
                              <strong>{message.sender_name}</strong>
                              {message.sender_role && <span>{message.sender_role}</span>}
                              <time dateTime={message.created_at}>
                                {new Date(message.created_at).toLocaleString()}
                              </time>
                            </div>
                            <p>{message.body}</p>
                          </div>
                        ))
                      ) : (
                        <p className="empty-state">No messages yet. Start the project conversation.</p>
                      )}
                    </div>
                  )}

                  {channel.project_status === "active" ? (
                    <form
                      className="chat-composer"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void sendMessage(channel);
                      }}
                    >
                      <input
                        aria-label={`Message ${channel.channel_name}`}
                        value={drafts[channel.id] ?? ""}
                        maxLength={2000}
                        onChange={(event) =>
                          setDrafts((currentDrafts) => ({
                            ...currentDrafts,
                            [channel.id]: event.target.value,
                          }))
                        }
                        disabled={savingMessageChannelId === channel.id}
                        placeholder={`Message ${channel.channel_name}…`}
                      />
                      <button
                        className="button-primary"
                        type="submit"
                        disabled={savingMessageChannelId === channel.id || !drafts[channel.id]?.trim()}
                      >
                        Send
                      </button>
                    </form>
                  ) : (
                    <p className="empty-state">This completed project channel is read-only.</p>
                  )}
                </>
              )}
              {collaborationErrors[channel.id] && (
                <p className="form-error" role="alert">{collaborationErrors[channel.id]}</p>
              )}
            </article>
          );
        })}
      </section>
    </main>
  );
}
