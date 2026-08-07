import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import type { Language } from "./i18n";
import { tr, useLanguage } from "./i18n";

export const formatMoney = (value: number, compact = true, language: Language = "en") =>
  new Intl.NumberFormat(language === "fa" ? "fa-IR" : "en-US", {
    style: "currency",
    currency: "IRT",
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : 0,
  }).format(value);

export const formatNumber = (value: number, digits = 1, language: Language = "en") =>
  new Intl.NumberFormat(language === "fa" ? "fa-IR" : "en-US", { maximumFractionDigits: digits }).format(value);

export function ResultTag({ children, tone = "blue" }: { children: ReactNode; tone?: "blue" | "green" | "amber" | "red" | "slate" }) {
  return <span className={`result-tag ${tone}`}>{children}</span>;
}

export function MetricCard({ label, value, detail, tone = "blue" }: { label: string; value: string; detail: string; tone?: string }) {
  return (
    <article className={`metric-card metric-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

export function Notice({ kind = "info", title, children }: { kind?: "info" | "warning" | "success"; title: string; children: ReactNode }) {
  const Icon = kind === "warning" ? AlertTriangle : kind === "success" ? CheckCircle2 : Info;
  return (
    <div className={`notice notice-${kind}`}>
      <Icon size={18} aria-hidden="true" />
      <div><strong>{title}</strong><p>{children}</p></div>
    </div>
  );
}

export function Contributor({ names, files, summary }: { names: string; files: string; summary: string }) {
  const { language } = useLanguage();
  return (
    <aside className="contributor-panel">
      <div><ResultTag tone="slate">{tr(language, "Academic provenance", "منشأ علمی")}</ResultTag><strong lang="fa" dir="rtl">{names}</strong></div>
      <p>{summary}</p>
      <small>{files} · <a href="/methodology">{tr(language, "Full adaptation notes", "یادداشت‌های کامل یکپارچه‌سازی")}</a></small>
    </aside>
  );
}

export function PanelCredit({ names, role }: { names: string; role?: string }) {
  const { language } = useLanguage();
  return (
    <div className="panel-credit">
      <span>{tr(language, "Calculation contribution", "مشارکت در محاسبات")}</span>
      <strong lang="fa" dir="rtl">{names}</strong>
      {role ? <small>{role}</small> : null}
    </div>
  );
}

export function ReferenceBand({ source, formula, children }: { source: string; formula: string; children: ReactNode }) {
  const { language } = useLanguage();
  return (
    <section className="reference-band" aria-label={tr(language, "Connection to course reference", "ارتباط با منبع درسی")}>
      <div><span>{tr(language, "Course reference", "منبع درسی")}</span><strong>{source}</strong></div>
      <div><span>{tr(language, "Formula used", "فرمول مورد استفاده")}</span><code dir="ltr">{formula}</code></div>
      <p>{children}</p>
    </section>
  );
}
