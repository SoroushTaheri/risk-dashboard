"use client";

import {
  Activity,
  BarChart3,
  BookOpen,
  ChevronRight,
  CircleGauge,
  FlaskConical,
  Menu,
  Network,
  Scale,
  ShieldCheck,
  X,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { ViewKey } from "./types";
import { usePortfolio } from "./usePortfolio";
import { PortfolioExperience } from "./experiences/PortfolioExperience";
import { RiskExperience } from "./experiences/RiskExperience";
import { UtilityExperience } from "./experiences/UtilityExperience";
import { IndividualExperience } from "./experiences/IndividualExperience";
import { CollectiveExperience } from "./experiences/CollectiveExperience";
import { RuinExperience } from "./experiences/RuinExperience";
import { MethodologyExperience } from "./experiences/MethodologyExperience";
import { LanguageProvider, tr, useLanguage } from "./i18n";

const nav = [
  { key: "portfolio", label: ["Portfolio", "پرتفوی"], caption: ["Source data and lineage", "داده‌های منبع و زنجیره‌ی ردیابی"], href: "/", icon: CircleGauge },
  { key: "risk", label: ["Risk Measures", "سنجه‌های ریسک"], caption: ["Chapter 2 - Dr. Payandeh", "فصل 2 - دکتر پاینده"], href: "/risk-measures", icon: BarChart3 },
  { key: "utility", label: ["Utility & Reinsurance", "مطلوبیت و بیمه‌ی اتکایی"], caption: ["Chapter 1", "فصل 1"], href: "/utility-reinsurance", icon: Scale },
  { key: "individual", label: ["Individual Risk", "مدل ریسک انفرادی"], caption: ["Chapter 2", "فصل 2"], href: "/individual-risk", icon: Network },
  { key: "collective", label: ["Collective Risk", "مدل ریسک جمعی"], caption: ["Chapter 3", "فصل 3"], href: "/collective-risk", icon: Activity },
  { key: "ruin", label: ["Solvency & Ruin", "توانگری و ورشکستگی"], caption: ["Chapter 4", "فصل 4"], href: "/solvency-ruin", icon: ShieldCheck },
  { key: "methodology", label: ["Methodology & Credits", "روش‌شناسی و عوامل پروژه"], caption: ["Assumptions, sources, and people", "فرض‌ها، منابع و افراد"], href: "/methodology", icon: BookOpen },
] as const;

const titles: Record<ViewKey, { eyebrow: [string, string]; title: [string, string]; description: [string, string] }> = {
  portfolio: { eyebrow: ["Portfolio · Entities before aggregates", "پرتفوی · موجودیت‌ها پیش از تجمیع"], title: ["Policies, accidents, claims, and paid loss", "بیمه‌نامه، حادثه، خسارت و پرداخت"], description: ["The 1,000 rows are synthetic monthly observations of one stationary portfolio. The page separates contracts, physical events, policy claims, and insurer-paid amounts before any actuarial calculation uses them.", "هزار ردیف، مشاهدات ماهانه‌ی شبیه‌سازی‌شده یک پرتفوی ثابت هستند. این صفحه پیش از هر محاسبه‌ی بیم‌سنجی، قراردادها، رویدادهای فیزیکی، پرونده‌های خسارت و مبالغ پرداختی بیمه‌گر را جدا می‌کند."] },
  risk: { eyebrow: ["Chapter 2 - Dr. Payandeh · Risk measurement", "فصل ۲ - دکتر پاینده · اندازه‌گیری ریسک"], title: ["VaR, TVaR, and the upper tail of loss", "ارزش در معرض ریسک، ارزش دنباله‌ای و بخش بالایی توزیع خسارت"], description: ["The controls change the confidence level p, loss variable X, and retention d in the chapter formulas. The charts compare empirical, normal, and EVT estimates on the same portfolio.", "کنترل‌ها سطح اطمینان p، متغیر خسارت X و حد نگهداری d را در فرمول‌های فصل تغییر می‌دهند. نمودارها برآورد تجربی، نرمال و نظریه‌ی مقادیر حدی را روی یک پرتفوی مقایسه می‌کنند."] },
  utility: { eyebrow: ["Modern Actuarial Risk Theory · Chapter 1", "Modern Actuarial Risk Theory · فصل ۱"], title: ["Utility, acceptable premium, and reinsurance", "مطلوبیت، حق‌بیمه‌ی قابل‌قبول و بیمه‌ی اتکایی"], description: ["Compare textbook utility functions on the full empirical monthly loss sample, then see how risk aversion and retention shape the practical reinsurance price window.", "توابع مطلوبیت کتاب را روی کل نمونه تجربی خسارت ماهانه مقایسه کنید و ببینید ریسک‌گریزی و حد نگهداری چگونه بازه عملی قیمت بیمه اتکایی را شکل می‌دهند."] },
  individual: { eyebrow: ["Modern Actuarial Risk Theory · Chapter 2", "Modern Actuarial RIsk Theory · فصل ۲"], title: ["From policy risks to aggregate loss", "از ریسک هر بیمه‌نامه تا خسارت کل"], description: ["Coverage-specific policy losses are aggregated across the selected policy set. The comparison shows when convolution and moment approximations depend on the independence assumption.", "خسارت‌های مختص هر پوشش در مجموعه‌ی بیمه‌نامه‌های انتخاب‌شده تجمیع می‌شوند. مقایسه نشان می‌دهد پیچش و تقریب‌های گشتاوری در چه شرایطی به فرض استقلال وابسته‌اند."] },
  collective: { eyebrow: ["Modern Actuarial Risk Theory · Chapter 3", "Modern Actuarial RIsk Theory · فصل ۳"], title: ["Claim frequency, severity, and aggregate loss", "فراوانی خسارت، شدت خسارت و خسارت کل"], description: ["The collective model combines a random monthly claim count with matching claim severities. Frequency fit, severity choice, and numerical method are kept separate and visible.", "مدل جمعی تعداد تصادفی خسارت ماهانه را با شدت خسارت‌های متناظر ترکیب می‌کند. برازش فراوانی، انتخاب توزیع شدت و روش عددی به‌صورت جدا و شفاف نمایش داده می‌شوند."] },
  ruin: { eyebrow: ["Modern Actuarial Risk Theory · Chapter 4", "Modern Actuarial RIsk Theory · فصل ۴"], title: ["Surplus, solvency, and finite-horizon ruin", "مازاد، توانگری و ورشکستگی در افق محدود"], description: ["The surplus process links initial capital, safety loading, and the same retained monthly aggregate loss used by reinsurance. The result is a reproducible finite-horizon simulation, not an invented ultimate-ruin bound.", "فرایند مازاد سرمایه‌ی اولیه، ضریب اطمینان و همان خسارت کل ماهانه‌ی نگهداری‌شده‌ی مورد استفاده در اتکایی را به هم مرتبط می‌کند. نتیجه یک شبیه‌سازی بازتولیدپذیر افق محدود است، نه کران ساختگی ورشکستگی نهایی."] },
  methodology: { eyebrow: ["Methodology · Sources, assumptions, and people", "روش‌شناسی · منابع، فرض‌ها و افراد"], title: ["How each result is produced and credited", "هر نتیجه چگونه تولید شده و به چه کسانی نسبت داده می‌شود"], description: ["Review the source lineage, generation rules, result types, theoretical limits, and the students whose work contributes to each calculation.", "زنجیره‌ی داده، قواعد تولید، نوع نتایج، محدودیت‌های نظری و دانشجویانی را ببینید که کارشان در هر محاسبه نقش داشته است."] },
};

export function Dashboard({ initialView }: { initialView: ViewKey }) {
  return <LanguageProvider><DashboardContent initialView={initialView} /></LanguageProvider>;
}

function DashboardContent({ initialView }: { initialView: ViewKey }) {
  const { data, error } = usePortfolio();
  const [open, setOpen] = useState(false);
  const { language, setLanguage } = useLanguage();
  const page = titles[initialView];
  const copy = (pair: readonly [string, string]) => tr(language, pair[0], pair[1]);

  return (
    <div className="app-shell">
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <div className="brand-row">
          <Link className="brand" href="/" aria-label={tr(language, "Risk Theory Lab home", "صفحه‌ی اصلی آزمایشگاه نظریه ریسک")}>
            <span className="brand-mark"><FlaskConical size={21} aria-hidden="true" /></span>
            <span><strong>{tr(language, "Risk Analysis Dashboard", "داشبورد تحلیلی ریسک")}</strong><small>{tr(language, "Shahid Beheshti University", "دانشگاه شهید بهشتی")}</small></span>
          </Link>
          <button className="icon-button close-menu" onClick={() => setOpen(false)} aria-label={tr(language, "Close navigation", "بستن فهرست")}><X size={20} /></button>
        </div>
        <nav aria-label="Primary navigation">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.key} href={item.href} className={initialView === item.key ? "nav-link active" : "nav-link"} aria-current={initialView === item.key ? "page" : undefined}>
                <Icon size={18} aria-hidden="true" />
                <span><strong>{copy(item.label)}</strong><small>{copy(item.caption)}</small></span>
                <ChevronRight size={15} className="nav-chevron" aria-hidden="true" />
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-status">
          <span className={`status-dot ${data?.summary.reconciliation_status === "pass" ? "pass" : "waiting"}`} />
          <div><strong>{data?.summary.reconciliation_status === "pass" ? tr(language, "Entity data reconciled", "داده‌های موجودیتی تطبیق یافتند") : tr(language, "Checking data", "در حال بررسی داده‌ها")}</strong><small>{data ? tr(language, `${data.summary.months.toLocaleString()} months · v${data.summary.generator_version}`, `${data.summary.months.toLocaleString("fa-IR")} ماه · نسخه‌ی ${data.summary.generator_version}`) : tr(language, "Loading manifest", "در حال بارگذاری گزارش")}</small></div>
        </div>
      </aside>
      {open ? <button className="scrim" aria-label={tr(language, "Close navigation", "بستن فهرست")} onClick={() => setOpen(false)} /> : null}

      <main>
        <header className="topbar">
          <button className="icon-button menu-button" onClick={() => setOpen(true)} aria-label={tr(language, "Open navigation", "باز کردن فهرست")}><Menu size={21} /></button>
          <div className="breadcrumb"><FlaskConical size={15} aria-hidden="true" /><span>{tr(language, "Dashboard", "داشبورد")}</span><ChevronRight size={13} /><strong>{copy(nav.find((item) => item.key === initialView)!.label)}</strong></div>
          <div className="topbar-actions">
            <div className="language-switch" role="group" aria-label={tr(language, "Language", "زبان")}>
              <button className={language === "en" ? "active" : ""} onClick={() => setLanguage("en")} lang="en">EN</button>
              <button className={language === "fa" ? "active" : ""} onClick={() => setLanguage("fa")} lang="fa">فارسی</button>
            </div>
            <div className="course-chip">{tr(language, "SBU · Spring 1405", "دانشگاه شهید بهشتی · بهار ۱۴۰۵")}</div>
          </div>
        </header>
        <div className="page-wrap">
          <section className="page-intro">
            <p className="eyebrow">{copy(page.eyebrow)}</p>
            <h1>{copy(page.title)}</h1>
            <p>{copy(page.description)}</p>
          </section>
          {error ? <div className="error-state">{tr(language, "The reconciled dataset could not be loaded", "داده‌های تطبیق‌داده‌شده بارگذاری نشدند")}: {error}</div> : null}
          {!data ? <LoadingState /> : <Experience view={initialView} data={data} />}
        </div>
      </main>
    </div>
  );
}

function LoadingState() {
  const { language } = useLanguage();
  return <div className="loading-grid" aria-label={tr(language, "Loading actuarial data", "در حال بارگذاری داده‌های بیم‌سنجی")}><div /><div /><div /><div className="loading-chart" /></div>;
}

function Experience({ view, data }: { view: ViewKey; data: NonNullable<ReturnType<typeof usePortfolio>["data"]> }) {
  if (view === "portfolio") return <PortfolioExperience data={data} />;
  if (view === "risk") return <RiskExperience data={data} />;
  if (view === "utility") return <UtilityExperience data={data} />;
  if (view === "individual") return <IndividualExperience data={data} />;
  if (view === "collective") return <CollectiveExperience data={data} />;
  if (view === "ruin") return <RuinExperience data={data} />;
  return <MethodologyExperience data={data} />;
}
