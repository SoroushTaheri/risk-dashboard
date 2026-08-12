export type ViewKey = "portfolio" | "risk" | "utility" | "individual" | "collective" | "ruin";

export type MonthRow = {
  month_id: string;
  accidents: number;
  at_fault_own_claims: number;
  injured_excess_claims: number;
  own_claims: number;
  liability_claims: number;
  total_claims: number;
  own_amount: number;
  third_property_amount: number;
  third_bodily_amount: number;
  third_amount: number;
  payout: number;
  uncovered_property_excess: number;
};

export type PortfolioSummary = {
  months: number;
  vehicles: number;
  third_party_policies: number;
  own_damage_policies: number;
  total_policies: number;
  total_accidents_across_months: number;
  total_claims_across_months: number;
  at_fault_own_damage_claims_across_months: number;
  injured_party_excess_claims_across_months: number;
  liability_claims_across_months: number;
  own_damage_paid_across_months: number;
  liability_paid_across_months: number;
  uncovered_property_excess_across_months: number;
  months_with_uncovered_property_excess: number;
  mean_accidents: number;
  mean_claims: number;
  mean_payout: number;
  p95_payout: number;
  max_payout: number;
  source_sha256: string;
  reconciliation_status: string;
  generator_version: string;
  monetary_unit: string;
  policy_models: Record<string, {
    policy_count: number;
    mean_claim_probability: number;
    mean_paid_loss: number;
  }>;
};

export type PortfolioData = { months: MonthRow[]; summary: PortfolioSummary };
