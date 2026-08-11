import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import type { Language } from "./i18n";
import { tr, useLanguage } from "./i18n";
import { InlineMath } from "./Formula";

export const formatMoney = (value: number, compact = true, language: Language = "en") => {
  const locale = language === "fa" ? "fa-IR" : "en-US";
  if (compact && Math.abs(value) >= 1_000) {
    const amount = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value / 1_000);
    return language === "fa" ? `${amount} میلیارد تومان` : `${amount} billion tomans`;
  }
  const amount = new Intl.NumberFormat(locale, { maximumFractionDigits: compact ? 1 : 2 }).format(value);
  return language === "fa" ? `${amount} میلیون تومان` : `${amount} million tomans`;
};

export function formatMonthLabel(monthId: string, language: Language) {
  const monthNumber = Number.parseInt(monthId.replace(/^M/i, ""), 10);
  if (!Number.isFinite(monthNumber)) return monthId;
  return language === "fa"
    ? `ماه ${monthNumber.toLocaleString("fa-IR")} ام`
    : `Month ${monthNumber.toLocaleString("en-US")}`;
}

export const formatNumber = (value: number, digits = 1, language: Language = "en") =>
  new Intl.NumberFormat(language === "fa" ? "fa-IR" : "en-US", { maximumFractionDigits: digits }).format(value);

export function ResultTag({ children, tone = "blue" }: { children: ReactNode; tone?: "blue" | "green" | "amber" | "red" | "slate" }) {
  return <span className={`result-tag ${tone}`}>{children}</span>;
}

export function MetricCard({ label, value, detail, tone = "blue" }: { label: ReactNode; value: ReactNode; detail: ReactNode; tone?: string }) {
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
      <div><ResultTag tone="slate">{tr(language, "Academic provenance", "مشارکت‌کنندگان")}</ResultTag><strong lang="fa" dir="rtl">{names}</strong></div>
      <p>{summary}</p>
      <small>{files} · <a href="/methodology">{tr(language, "Full methodology notes", "یادداشت‌های کامل روش‌شناسی")}</a></small>
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
      <div><span>{tr(language, "Formula used", "روابط مورد استفاده")}</span><InlineMath equation={formula} className="reference-formula" /></div>
      <p>{children}</p>
    </section>
  );
}
