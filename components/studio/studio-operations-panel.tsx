"use client";

import { useMemo, useState } from "react";
import {
  AvailabilityStatus,
  type AvailabilityStatusValue,
  getAvailabilityClassName,
  getAvailabilityLabel,
} from "@/lib/studio/constants";

type ClientRequestSummary = {
  id: string;
  name?: string | null;
  email?: string | null;
  company?: string | null;
  status?: string | null;
  created_at?: string;
};

type TeamMember = {
  id: string;
  name: string;
  title: string;
  specialty: string;
  availability: AvailabilityStatusValue;
  role: string;
};

type ChatMessage = {
  id: string;
  sender: string;
  role: string;
  body: string;
  time: string;
  side: "self" | "team";
};

const baseTeam: TeamMember[] = [
  {
    id: "maya",
    name: "Maya Sol",
    title: "Creative lead",
    specialty: "Brand direction",
    availability: AvailabilityStatus.AVAILABLE,
    role: "Project owner",
  },
  {
    id: "leo",
    name: "Leo Grant",
    title: "Senior designer",
    specialty: "Packaging & product",
    availability: AvailabilityStatus.AWAY,
    role: "Design lead",
  },
  {
    id: "nina",
    name: "Nina Park",
    title: "UX strategist",
    specialty: "Experience mapping",
    availability: AvailabilityStatus.BUSY,
    role: "Research + UX",
  },
  {
    id: "omar",
    name: "Omar Singh",
    title: "Account manager",
    specialty: "Client communication",
    availability: AvailabilityStatus.AVAILABLE,
    role: "Client liaison",
  },
];

const baseMessages: ChatMessage[] = [
  {
    id: "m-1",
    sender: "Maya Sol",
    role: "Creative lead",
    body: "Team — can we lock the first concept review for the candle brand brief by tomorrow morning?",
    time: "09:12",
    side: "team",
  },
  {
    id: "m-2",
    sender: "You",
    role: "Project lead",
    body: "Yes, I’ll align the client feedback and share the final notes before the design review.",
    time: "09:14",
    side: "self",
  },
  {
    id: "m-3",
    sender: "Leo Grant",
    role: "Senior designer",
    body: "I’ve flagged the packaging complexity; we should assign a second pair of eyes before approval.",
    time: "09:16",
    side: "team",
  },
];

export function StudioOperationsPanel({
  scope,
  requests,
}: {
  scope: "admin" | "designer";
  requests: ClientRequestSummary[];
}) {
  const [members, setMembers] = useState<TeamMember[]>(baseTeam);
  const [messages, setMessages] = useState<ChatMessage[]>(baseMessages);
  const [draft, setDraft] = useState("");

  const activeRequests = useMemo(
    () => requests.slice(0, 4),
    [requests],
  );

  function updateMemberRole(memberId: string, nextRole: string) {
    setMembers((currentMembers) =>
      currentMembers.map((member) =>
        member.id === memberId ? { ...member, role: nextRole } : member,
      ),
    );
  }

  function sendMessage() {
    const trimmed = draft.trim();
    if (!trimmed) {
      return;
    }

    setMessages((currentMessages) => [
      ...currentMessages,
      {
        id: `m-${Date.now()}`,
        sender: "You",
        role: scope === "admin" ? "Studio lead" : "Design lead",
        body: trimmed,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        side: "self",
      },
    ]);
    setDraft("");
  }

  return (
    <section className="studio-operations" id="team-room">
      <div className="ops-header">
        <div>
          <p className="eyebrow">Studio coordination</p>
          <h2>{scope === "admin" ? "Client and team overview" : "Client watch and team room"}</h2>
        </div>
      </div>

      <div className="ops-grid">
        <div className="ops-card">
          <div className="ops-card-header">
            <h3>Project team</h3>
            <span>{members.length} people</span>
          </div>

          <div className="team-list">
            {members.map((member) => (
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
                  <label>
                    <span>Role</span>
                    <select
                      aria-label={`${member.name} role`}
                      value={member.role}
                      onChange={(event) => updateMemberRole(member.id, event.target.value)}
                    >
                      <option value="Project owner">Project owner</option>
                      <option value="Design lead">Design lead</option>
                      <option value="Client liaison">Client liaison</option>
                      <option value="Research + UX">Research + UX</option>
                      <option value="Production handoff">Production handoff</option>
                    </select>
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="ops-card">
          <div className="ops-card-header">
            <h3>Internal chat</h3>
            <span>{messages.length} messages</span>
          </div>

          <div className="chat-thread" aria-live="polite">
            {messages.map((message) => (
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
              aria-label="Type a message"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  sendMessage();
                }
              }}
              placeholder="Share an update for the project room…"
            />
            <button className="button-primary" type="button" onClick={sendMessage}>
              Send
            </button>
          </div>
        </div>
      </div>

      <div className="ops-card request-card">
        <div className="ops-card-header">
          <h3>Live client requests</h3>
          <span>{activeRequests.length} active</span>
        </div>

        <div className="request-list">
          {activeRequests.length === 0 && (
            <p className="empty-state">No client requests are pending right now.</p>
          )}
          {activeRequests.map((request) => (
            <div className="request-row" key={request.id}>
              <div>
                <strong>{request.name ?? "Anonymous client"}</strong>
                <p>{request.company ?? "Independent project"}</p>
              </div>
              <div>
                <span className="status-pill" data-status={request.status ?? "new"}>
                  {request.status ?? "new"}
                </span>
              </div>
              <div className="request-meta">
                <span>{request.email ?? "No email on file"}</span>
                <time>{request.created_at ? new Date(request.created_at).toLocaleDateString() : "New"}</time>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
