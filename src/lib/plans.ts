// Plan limits. Billing (Razorpay) arrives in phase 2; until then workspaces get
// the "beta" plan unless DEFAULT_PLAN says otherwise.

export interface PlanLimits {
  name: string;
  maxChannels: number;
  postsPerMonth: number;
  maxScheduleDays: number;
  maxVideoBytes: number;
}

const MB = 1024 * 1024;

export const PLANS: Record<string, PlanLimits> = {
  free: { name: "Free", maxChannels: 3, postsPerMonth: 20, maxScheduleDays: 30, maxVideoBytes: 100 * MB },
  pro: { name: "Pro", maxChannels: 1000, postsPerMonth: Infinity, maxScheduleDays: 365, maxVideoBytes: 250 * MB },
  beta: { name: "Beta", maxChannels: 200, postsPerMonth: Infinity, maxScheduleDays: 365, maxVideoBytes: 1024 * MB },
};

export function planLimits(planId: string | undefined | null): PlanLimits {
  return PLANS[planId ?? "free"] ?? PLANS.free;
}
