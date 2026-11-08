export const AvailabilityStatus = {
  AVAILABLE: "AVAILABLE",
  BUSY: "BUSY",
  AWAY: "AWAY",
  ON_LEAVE: "ON_LEAVE",
} as const;

export type AvailabilityStatusValue =
  (typeof AvailabilityStatus)[keyof typeof AvailabilityStatus];

export const SystemRole = {
  ADMIN: "ADMIN",
  MEMBER: "MEMBER",
} as const;

export type SystemRoleValue = (typeof SystemRole)[keyof typeof SystemRole];

export const ProjectRole = {
  PROJECT_MANAGER: "PROJECT_MANAGER",
  DESIGN_LEAD: "DESIGN_LEAD",
  RESEARCH_LEAD: "RESEARCH_LEAD",
  CLIENT_LIAISON: "CLIENT_LIAISON",
  CREATIVE_DIRECTOR: "CREATIVE_DIRECTOR",
  PRODUCTION_HANDOFF: "PRODUCTION_HANDOFF",
} as const;

export type ProjectRoleValue = (typeof ProjectRole)[keyof typeof ProjectRole];

export const ChannelType = {
  GENERAL: "GENERAL",
  ANNOUNCEMENT: "ANNOUNCEMENT",
  PROJECT: "PROJECT",
  SYSTEM: "SYSTEM",
} as const;

export type ChannelTypeValue = (typeof ChannelType)[keyof typeof ChannelType];

export const ChannelMemberRole = {
  MODERATOR: "MODERATOR",
  MEMBER: "MEMBER",
} as const;

export type ChannelMemberRoleValue =
  (typeof ChannelMemberRole)[keyof typeof ChannelMemberRole];

export const availabilityLabels: Record<AvailabilityStatusValue, string> = {
  [AvailabilityStatus.AVAILABLE]: "Available",
  [AvailabilityStatus.BUSY]: "Busy",
  [AvailabilityStatus.AWAY]: "Away",
  [AvailabilityStatus.ON_LEAVE]: "On leave",
};

export const projectRoleLabels: Record<ProjectRoleValue, string> = {
  [ProjectRole.PROJECT_MANAGER]: "Project manager",
  [ProjectRole.DESIGN_LEAD]: "Design lead",
  [ProjectRole.RESEARCH_LEAD]: "Research lead",
  [ProjectRole.CLIENT_LIAISON]: "Client liaison",
  [ProjectRole.CREATIVE_DIRECTOR]: "Creative director",
  [ProjectRole.PRODUCTION_HANDOFF]: "Production handoff",
};

export function getAvailabilityLabel(status: AvailabilityStatusValue): string {
  return availabilityLabels[status] ?? "Available";
}

export function getAvailabilityClassName(status: AvailabilityStatusValue): string {
  return `availability-${status.toLowerCase().replace(/_/g, "-")}`;
}

export function getProjectRoleLabel(role: ProjectRoleValue): string {
  return projectRoleLabels[role] ?? role;
}
