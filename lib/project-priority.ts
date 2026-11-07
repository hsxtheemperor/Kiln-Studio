export type ProjectPriorityInput = {
  budget_range?: string | null;
  design_complexity?: number | null;
  timeline?: string | null;
};

export type ProjectPriorityResult = {
  priority_score: number;
  priority_label: "unknown" | "low" | "medium" | "high" | "urgent";
};

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

  const weighted = budget === 0 && complexity === 0 && urgency === 0 ? 0 : Math.min(10, Math.round((budget + complexity + urgency) / 3));

  if (weighted <= 0) {
    return { priority_score: 0, priority_label: "unknown" };
  }

  if (weighted <= 3) {
    return { priority_score: weighted, priority_label: "low" };
  }

  if (weighted <= 6) {
    return { priority_score: weighted, priority_label: "medium" };
  }

  if (weighted <= 8) {
    return { priority_score: weighted, priority_label: "high" };
  }

  return { priority_score: weighted, priority_label: "urgent" };
}
