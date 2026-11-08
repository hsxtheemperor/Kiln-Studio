export type ProjectPriorityInput = {
  budget_range?: string | null;
  design_complexity?: number | null;
  timeline?: string | null;
};

export type ProjectPriorityResult = {
  priority_score: number;
};

export const PRIORITY_UNKNOWN = 0;
export const PRIORITY_MIN = 1;
export const PRIORITY_MAX = 10;

export type PriorityLabel = "unknown" | "low" | "medium" | "high" | "urgent";

export function getPriorityLabel(score: number): PriorityLabel {
  if (score <= PRIORITY_UNKNOWN) return "unknown";
  if (score <= 3) return "low";
  if (score <= 6) return "medium";
  if (score <= 8) return "high";
  return "urgent";
}

function budgetScore(budget: string | null | undefined): number {
  if (!budget) return 0;

  const map: Record<string, number> = {
    under_5k: 2,
    "5k_10k": 4,
    "10k_25k": 6,
    "25k_50k": 8,
    "50k_plus": 10,
    not_sure: 0,
  };

  return map[budget] ?? 0;
}

function complexityScore(value: number | null | undefined): number {
  if (value === null || value === undefined || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(10, Math.round(value)));
}

function urgencyScore(timeline: string | null | undefined): number {
  if (!timeline) return 0;
  const normalized = timeline.toLowerCase();
  if (normalized.includes("urgent") || normalized.includes("asap") || normalized.includes("2 weeks")) return 3;
  if (normalized.includes("this month") || normalized.includes("within a month")) return 2;
  if (normalized.includes("next quarter") || normalized.includes("later")) return 1;
  return 0;
}

export function computeProjectPriority(input: ProjectPriorityInput): ProjectPriorityResult {
  const budget = budgetScore(input.budget_range);
  const complexity = complexityScore(input.design_complexity);
  const urgency = urgencyScore(input.timeline);

  const hasScoringInputs =
    input.budget_range != null ||
    input.design_complexity != null ||
    input.timeline != null;
  if (!hasScoringInputs) return { priority_score: PRIORITY_UNKNOWN };

  const weighted = Math.round((budget + complexity + urgency) / 3);
  return {
    priority_score: Math.max(PRIORITY_MIN, Math.min(PRIORITY_MAX, weighted)),
  };
}
