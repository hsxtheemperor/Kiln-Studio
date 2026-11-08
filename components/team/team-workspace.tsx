"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AvailabilityStatus,
  ChannelType,
  type AvailabilityStatusValue,
  type ChannelTypeValue,
  getAvailabilityClassName,
  getAvailabilityLabel,
} from "@/lib/studio/constants";
import type { ProjectChannelView, ProjectManagerOption } from "@/lib/studio/project-channels";

type ProjectAssignment = {
  project: string;
  role: string;
  status: "Active" | "Waiting on client" | "Needs review";
};

type TeamMember = {
  id: string;
  name: string;
  title: string;
  specialty: string;
  availability: AvailabilityStatusValue;
  assignedProjects: ProjectAssignment[];
};

type ChannelMessage = {
  id: string;
  sender: string;
  role: string;
  body: string;
  time: string;
  side: "self" | "team";
};

type Channel = {
  id: string;
  name: string;
  type: ChannelTypeValue;
  description: string;
  moderator: string;
  members: string[];
  messages: ChannelMessage[];
};

const teamMembers: TeamMember[] = [
  {
    id: "maya",
    name: "Maya Sol",
    title: "Creative lead",
    specialty: "Brand direction",
    availability: AvailabilityStatus.AVAILABLE,
    assignedProjects: [
      { project: "Northlane rebrand", role: "Project owner", status: "Active" },
      { project: "Parley packaging", role: "Creative director", status: "Needs review" },
    ],
  },
  {
    id: "leo",
    name: "Leo Grant",
    title: "Senior designer",
    specialty: "Packaging & product",
    availability: AvailabilityStatus.BUSY,
    assignedProjects: [
      { project: "Northlane rebrand", role: "Design lead", status: "Active" },
      { project: "Harvest retail identity", role: "Packaging designer", status: "Waiting on client" },
    ],
  },
  {
    id: "nina",
    name: "Nina Park",
    title: "UX strategist",
    specialty: "Experience mapping",
    availability: AvailabilityStatus.AWAY,
    assignedProjects: [
      { project: "Brookline app", role: "Research lead", status: "Active" },
    ],
  },
  {
    id: "omar",
    name: "Omar Singh",
    title: "Account manager",
    specialty: "Client communication",
    availability: AvailabilityStatus.AVAILABLE,
    assignedProjects: [
      { project: "Northlane rebrand", role: "Client liaison", status: "Active" },
      { project: "Harvest retail identity", role: "Account manager", status: "Waiting on client" },
    ],
  },
  {
    id: "sofia",
    name: "Sofia Voss",
    title: "Production partner",
    specialty: "Handoff & QA",
    availability: AvailabilityStatus.AVAILABLE,
    assignedProjects: [
      { project: "Brookline app", role: "Production handoff", status: "Needs review" },
    ],
  },
];

const initialChannels: Channel[] = [
  {
    id: "general",
    name: "General chat",
    type: ChannelType.GENERAL,
    description: "Everything cross-team and cross-project.",
    moderator: "Maya Sol",
    members: ["Maya Sol", "Leo Grant", "Nina Park", "Omar Singh", "Sofia Voss"],
    messages: [
      { id: "g-1", sender: "Maya Sol", role: "Creative lead", body: "Morning sync: client feedback is due today for Northlane. Please flag any blockers before 3PM.", time: "09:12", side: "team" },
      { id: "g-2", sender: "You", role: "Studio lead", body: "I’ll share the updated client notes in the project room once they come in.", time: "09:14", side: "self" },
    ],
  },
  {
    id: "announcements",
    name: "Announcements",
    type: ChannelType.ANNOUNCEMENT,
    description: "Admin-only updates and critical studio notices.",
    moderator: "Admin",
    members: ["Admin"],
    messages: [
      { id: "a-1", sender: "Admin", role: "Studio lead", body: "All teams: the client review for Northlane moves to Thursday at 11:00. Please prepare review decks and any open questions.", time: "08:40", side: "team" },
    ],
  },
  {
    id: "northlane",
    name: "Northlane rebrand",
    type: ChannelType.PROJECT,
    description: "Rebrand sprint with creative direction, design, and client communication synced to the same workspace.",
    moderator: "Maya Sol",
    members: ["Maya Sol", "Leo Grant", "Omar Singh"],
    messages: [
      { id: "n-1", sender: "Maya Sol", role: "Project owner", body: "We have the revised tone deck. Leo, can you update the concept directions before the next review?", time: "10:10", side: "team" },
      { id: "n-2", sender: "Leo Grant", role: "Design lead", body: "Yes — I’ll refine the packaging direction and send the updated explorations this afternoon.", time: "10:12", side: "team" },
    ],
  },
  {
    id: "brookline",
    name: "Brookline app",
    type: ChannelType.PROJECT,
    description: "UX sprint focused on research, flows, and production delivery details.",
    moderator: "Nina Park",
    members: ["Nina Park", "Sofia Voss"],
    messages: [
      { id: "b-1", sender: "Nina Park", role: "Research lead", body: "I’ve mapped the onboarding friction points. We need a smoother first-run flow before QA.", time: "11:00", side: "team" },
    ],
  },
];

export function TeamWorkspace({
  scope,
  liveProjectChannels,
  liveProjectChannelsError,
  teamMemberOptions,
  teamMemberOptionsError,
}: {
  scope: "admin" | "designer";
  liveProjectChannels: ProjectChannelView[];
  liveProjectChannelsError?: string;
  teamMemberOptions?: ProjectManagerOption[];
  teamMemberOptionsError?: string;
}) {
  const router = useRouter();
  const [channels, setChannels] = useState(initialChannels);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [projectError, setProjectError] = useState("");
  const [savingProjectId, setSavingProjectId] = useState<string | null>(null);

  const availableCount = teamMembers.filter((member) => member.availability === AvailabilityStatus.AVAILABLE).length;
  const awayCount = teamMembers.filter((member) => member.availability === AvailabilityStatus.AWAY).length;
  const unassignedCount = teamMembers.filter((member) => member.assignedProjects.length === 0).length;
  const projectChannels = channels.filter((channel) => channel.type === ChannelType.PROJECT);

  function sendMessage(channelId: string) {
    const value = (drafts[channelId] ?? "").trim();
    if (!value) {
      return;
    }

    const nextMessage: ChannelMessage = {
      id: `${channelId}-${Date.now()}`,
      sender: scope === "admin" ? "Studio lead" : "Design lead",
      role: scope === "admin" ? "Admin" : "Designer",
      body: value,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      side: "self",
    };

    setChannels((currentChannels) =>
      currentChannels.map((channel) =>
        channel.id === channelId
          ? { ...channel, messages: [...channel.messages, nextMessage] }
          : channel,
      ),
    );
    setDrafts((currentDrafts) => ({ ...currentDrafts, [channelId]: "" }));
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
          <span>Total team</span>
          <strong>{teamMembers.length}</strong>
          <small>People under studio operations</small>
        </div>
        <div className="team-metric-card">
          <span>Available</span>
          <strong>{availableCount}</strong>
          <small>Ready to take on more work</small>
        </div>
        <div className="team-metric-card">
          <span>Away</span>
          <strong>{awayCount}</strong>
          <small>Unavailable for the next handoff window</small>
        </div>
        <div className="team-metric-card">
          <span>Unassigned</span>
          <strong>{unassignedCount}</strong>
          <small>Good for triage or overflow work</small>
        </div>
      </div>

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

      <section className="team-workspace-grid">
        <div className="team-panel">
          <div className="ops-card-header">
            <h3>Team roster</h3>
            <span>{teamMembers.length} members</span>
          </div>

          <div className="team-list">
            {teamMembers.map((member) => (
              <div className="team-member" key={member.id}>
                <div>
                  <strong>{member.name}</strong>
                  <p>
                    {member.title} · {member.specialty}
                  </p>
                </div>
                <div className="member-assignment">
                  <span className={`availability-pill ${getAvailabilityClassName(member.availability)}`}>
                    {getAvailabilityLabel(member.availability)}
                  </span>
                  <div className="team-projects">
                    {member.assignedProjects.length === 0 ? (
                      <span className="empty-tag">Unassigned</span>
                    ) : (
                      member.assignedProjects.map((project) => (
                        <span key={`${member.id}-${project.project}`} className="project-tag">
                          {project.project} · {project.role}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="team-panel">
          <div className="ops-card-header">
            <h3>Sample channel preview</h3>
            <span>Illustrative data</span>
          </div>

          <div className="channel-list">
            {channels.map((channel) => (
              <div key={channel.id} className={`channel-row channel-${channel.type}`}>
                <div>
                  <strong>#{channel.name}</strong>
                  <p>{channel.description}</p>
                </div>
                <div className="channel-meta">
                  <span>{channel.members.length} members</span>
                  <span>{channel.moderator}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="team-chat-grid">
        <div className="ops-card">
          <div className="ops-card-header">
            <h3>Sample project chat preview</h3>
            <span>Local only - not persistent</span>
          </div>
          <div className="team-channel-list">
            {projectChannels.map((channel) => (
              <div key={channel.id} className="project-channel-card">
                <div className="project-channel-head">
                  <strong>#{channel.name}</strong>
                  <span>{channel.moderator}</span>
                </div>
                <p>{channel.description}</p>
                <ul>
                  {channel.members.map((member) => (
                    <li key={`${channel.id}-${member}`}>{member}</li>
                  ))}
                </ul>
                <div className="channel-thread">
                  {channel.messages.map((message) => (
                    <div key={message.id} className={`chat-message ${message.side}`}>
                      <div className="message-meta">
                        <strong>{message.sender}</strong>
                        <span>{message.role}</span>
                        <time>{message.time}</time>
                      </div>
                      <p>{message.body}</p>
                    </div>
                  ))}
                </div>
                <div className="chat-composer">
                  <input
                    aria-label={`Message ${channel.name}`}
                    value={drafts[channel.id] ?? ""}
                    onChange={(event) =>
                      setDrafts((currentDrafts) => ({
                        ...currentDrafts,
                        [channel.id]: event.target.value,
                      }))
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        sendMessage(channel.id);
                      }
                    }}
                    placeholder={`Message ${channel.name}…`}
                  />
                  <button className="button-primary" type="button" onClick={() => sendMessage(channel.id)}>
                    Send
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="ops-card">
          <div className="ops-card-header">
            <h3>General and announcements</h3>
            <span>{channels.filter((channel) => channel.type !== ChannelType.PROJECT).length} channels</span>
          </div>

          {channels
          .filter((channel) => channel.type !== ChannelType.PROJECT)
            .map((channel) => (
              <div key={channel.id} className="general-channel">
                <div className="project-channel-head">
                  <strong>#{channel.name}</strong>
                  <span>{channel.type === ChannelType.ANNOUNCEMENT ? "Admin only" : "All team"}</span>
                </div>
                <p>{channel.description}</p>
                <div className="channel-thread">
                  {channel.messages.map((message) => (
                    <div key={message.id} className={`chat-message ${message.side}`}>
                      <div className="message-meta">
                        <strong>{message.sender}</strong>
                        <span>{message.role}</span>
                        <time>{message.time}</time>
                      </div>
                      <p>{message.body}</p>
                    </div>
                  ))}
                </div>
                <div className="chat-composer">
                  <input
                    aria-label={`Message ${channel.name}`}
                    value={drafts[channel.id] ?? ""}
                    onChange={(event) =>
                      setDrafts((currentDrafts) => ({
                        ...currentDrafts,
                        [channel.id]: event.target.value,
                      }))
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        sendMessage(channel.id);
                      }
                    }}
                    placeholder={`Message ${channel.name}…`}
                  />
                  <button className="button-primary" type="button" onClick={() => sendMessage(channel.id)}>
                    Send
                  </button>
                </div>
              </div>
            ))}
        </div>
      </section>
    </main>
  );
}
