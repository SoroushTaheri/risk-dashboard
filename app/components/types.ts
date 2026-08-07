export type ViewKey = "portfolio" | "risk" | "utility" | "individual" | "collective" | "ruin" | "methodology";

export type MonthRow = {
  month_id: string;
  accidents: number;
  own_claims: number;
  third_claims: number;
  total_loss_cases: number;
  overlap_accidents: number;
  own_amount: number;
  third_amount: number;
  payout: number;
};

export type PortfolioSummary = {
  months: number;
  total_payout: number;
  mean_payout: number;
  p95_payout: number;
  max_payout: number;
  source_sha256: string;
  reconciliation_status: string;
  max_relative_difference: number;
  generator_version: string;
};

export type PortfolioData = { months: MonthRow[]; summary: PortfolioSummary };
