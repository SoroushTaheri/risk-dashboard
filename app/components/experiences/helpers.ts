import type { MonthRow } from "../types";

export type Coverage = "total" | "own" | "third";

export function valuesFor(months: MonthRow[], coverage: Coverage) {
  return months.map((row) => coverage === "own" ? row.own_amount : coverage === "third" ? row.third_amount : row.payout);
}

export function quantile(values: number[], probability: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(probability * sorted.length) - 1)];
}

export function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function variance(values: number[]) {
  const center = mean(values);
  return values.reduce((sum, value) => sum + (value - center) ** 2, 0) / Math.max(1, values.length - 1);
}

export function histogram(values: number[], bins = 24) {
  const lower = Math.min(...values);
  const upper = Math.max(...values);
  const width = (upper - lower) / bins || 1;
  const counts = Array.from({ length: bins }, () => 0);
  values.forEach((value) => { counts[Math.min(bins - 1, Math.floor((value - lower) / width))] += 1; });
  return counts.map((count, index) => [lower + width * (index + 0.5), count]);
}

export function normalPdf(x: number, mu: number, sd: number) {
  return Math.exp(-0.5 * ((x - mu) / sd) ** 2) / (sd * Math.sqrt(2 * Math.PI));
}

export function useMonthNumber(key: string, fallback: number) {
  const initial = typeof window === "undefined" ? fallback : Number(new URLSearchParams(window.location.search).get(key)) || fallback;
  return initial;
}

export function updateMonth(key: string, value: string | number) {
  const url = new URL(window.location.href);
  url.searchParams.set(key, String(value));
  window.history.replaceState({}, "", url);
}
