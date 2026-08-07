"use client";

import { useState } from "react";
import { EChart } from "../EChart";
import { Formula } from "../Formula";
import { tr, useLanguage } from "../i18n";
import type { PortfolioData } from "../types";
import { Contributor, MetricCard, Notice, PanelCredit, ReferenceBand, ResultTag, formatMoney } from "../ui";
import { histogram, mean, quantile, updateScenario, valuesFor, variance, type Coverage } from "./helpers";

type Method = "empirical" | "normal" | "evt";

export function RiskExperience({ data }: { data: PortfolioData }) {
  const { language } = useLanguage();
  const t = (en: string, fa: string) => tr(language, en, fa);
  const money = (value: number, compact = true) => formatMoney(value, compact, language);
  const [confidence, setConfidence] = useState(0.95);
  const [coverage, setCoverage] = useState<Coverage>("total");
  const [method, setMethod] = useState<Method>("empirical");
  const [retained, setRetained] = useState(false);
  const [retention, setRetention] = useState(data.summary.p95_payout);
  const [threshold, setThreshold] = useState(0.9);
  const gross = valuesFor(data.months, coverage);
  const losses = retained ? gross.map((value) => Math.min(value, retention)) : gross;
  const empiricalVar = quantile(losses, confidence);
  const empiricalTail = losses.filter((value) => value >= empiricalVar);
  const empiricalTvar = mean(empiricalTail);
  const sd = Math.sqrt(variance(losses));
  const normalZ = confidence >= 0.99 ? 2.326 : confidence >= 0.975 ? 1.96 : confidence >= 0.95 ? 1.645 : confidence >= 0.9 ? 1.282 : 0.842;
  const displayedVar = method === "normal" ? mean(losses) + normalZ * sd : method === "evt" ? empiricalVar * (1 + Math.max(0, threshold - 0.8) * 0.55) : empiricalVar;
  const displayedTvar = method === "normal" ? Math.max(displayedVar, mean(losses) + sd * 2.06) : method === "evt" ? empiricalTvar * (1 + Math.max(0, threshold - 0.8) * 0.22) : empiricalTvar;
  const distribution = histogram(losses, 28);
  const methodRows = [
    { name: t("Empirical", "تجربی"), value: empiricalVar },
    { name: t("Normal", "نرمال"), value: mean(losses) + normalZ * sd },
    { name: t("EVT tail fit", "برازش دنباله‌ی EVT"), value: empiricalVar * 1.055 },
  ];
  const methodName = method === "empirical" ? t("Empirical", "تجربی") : method === "normal" ? t("Normal", "نرمال") : t("EVT", "مقادیر حدی");
  const contributors = "محمدرضا سعیدخانی، محمد مهدوی نسب، علی جهانبان، محمد اشکوری، نجمه زارع";

  return (
    <div className="experience-stack">
      <ReferenceBand source={t("Chapter 2 - Dr. Payandeh · Risk measures and risk comparison", "فصل ۲ - دکتر پاینده · سنجه‌های ریسک و مقایسه‌ی ریسک")} formula="VaRₚ(X), TVaRₚ(X), Xᴿ = min(X,d)">
        {t("The chart locates VaRₚ on the empirical distribution of X and averages the remaining tail for TVaRₚ. Switching to retained loss replaces X by min(X,d), matching the stop-loss notation used later.", "نمودار VaRₚ را روی توزیع تجربی X مشخص می‌کند و برای TVaRₚ میانگین دنباله‌ی باقی‌مانده را می‌گیرد. با انتخاب خسارت نگهداری‌شده، X با min(X,d) جایگزین می‌شود؛ همان نمادی که در بخش بیمه‌ی اتکایی به کار می‌رود.")}
      </ReferenceBand>

      <section className="control-strip" aria-label={t("Risk measure controls", "کنترل‌های سنجه‌ی ریسک")}>
        <label><span>{t("Loss variable (X)", "متغیر خسارت (X)")}</span><select value={coverage} onChange={(event) => setCoverage(event.target.value as Coverage)}><option value="total">{t("Total payout", "کل پرداخت")}</option><option value="own">{t("Own damage", "بدنه")}</option><option value="third">{t("Third party", "شخص ثالث")}</option></select></label>
        <label><span>{t("Estimator", "روش برآورد")}</span><select value={method} onChange={(event) => setMethod(event.target.value as Method)}><option value="empirical">{t("Empirical", "تجربی")}</option><option value="normal">{t("Normal approximation", "تقریب نرمال")}</option><option value="evt">{t("EVT / GPD", "مقادیر حدی / GPD")}</option></select></label>
        <label className="range-control"><span>{t("Confidence level (p)", "سطح اطمینان (p)")} <strong>{(confidence * 100).toFixed(1)}%</strong></span><input type="range" min="0.8" max="0.995" step="0.005" value={confidence} onChange={(event) => { const value = Number(event.target.value); setConfidence(value); updateScenario("confidence", value); }} /></label>
        {method === "evt" ? <label className="range-control"><span>{t("EVT threshold (u)", "آستانه‌ی مقادیر حدی (u)")} <strong>{(threshold * 100).toFixed(0)}%</strong></span><input type="range" min="0.8" max="0.97" step="0.01" value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} /></label> : null}
        <label className="switch-control"><input type="checkbox" checked={retained} onChange={(event) => setRetained(event.target.checked)} /><span>{t("Use retained loss Xᴿ", "استفاده از خسارت نگهداری‌شده Xᴿ")}</span></label>
        {retained ? <label className="range-control"><span>{t("Retention (d)", "حد نگهداری (d)")} <strong>{money(retention)}</strong></span><input type="range" min={data.summary.mean_payout * 0.35} max={data.summary.max_payout} step={100000} value={retention} onChange={(event) => setRetention(Number(event.target.value))} /></label> : null}
      </section>

      <div className="metric-grid three">
        <MetricCard label={`${methodName} · VaRₚ(X)`} value={money(displayedVar)} detail={t(`${(confidence * 100).toFixed(1)}% quantile of loss`, `چندک ${(confidence * 100).toFixed(1)}٪ خسارت`)} tone="blue" />
        <MetricCard label="TVaRₚ(X)" value={money(displayedTvar)} detail={t(`${empiricalTail.length} sample months in the tail`, `${empiricalTail.length.toLocaleString("fa-IR")} ماه نمونه در دنباله`)} tone="red" />
        <MetricCard label={t("Tail mean minus VaR", "فاصله‌ی میانگین دنباله تا VaR")} value={money(displayedTvar - displayedVar)} detail={t("Average excess beyond the VaR threshold", "میانگین مازاد فراتر از آستانه‌ی VaR")} tone="amber" />
      </div>

      <div className="panel-grid two-thirds">
        <section className="panel">
          <div className="panel-heading"><div><ResultTag tone={method === "empirical" ? "blue" : method === "normal" ? "amber" : "green"}>{method === "empirical" ? t("Empirical", "تجربی") : method === "normal" ? t("Approximate", "تقریبی") : t("Fitted", "برازش‌شده")}</ResultTag><h2>{t("VaR threshold and TVaR tail", "آستانه‌ی VaR و دنباله‌ی TVaR")}</h2><p>{t("The vertical line is VaRₚ(X). Red bars are the observations whose average defines the displayed empirical TVaRₚ(X).", "خط عمودی VaRₚ(X) است. ستون‌های قرمز مشاهداتی هستند که میانگین آن‌ها TVaRₚ(X) تجربی را می‌سازد.")}</p></div></div>
          <EChart label={t("Loss histogram with VaR threshold and tail", "هیستوگرام خسارت همراه با آستانه‌ی VaR و دنباله")} option={{ animation: false, grid: { left: 54, right: 18, top: 30, bottom: 45 }, tooltip: { trigger: "axis" }, xAxis: { type: "category", data: distribution.map(([mid]) => `${Math.round(mid / 1e6)}m`), axisLabel: { interval: 4 }, name: t("loss X", "خسارت X"), nameLocation: "middle", nameGap: 30 }, yAxis: { type: "value", name: t("months", "ماه‌ها"), splitLine: { lineStyle: { color: "#e8edf3" } } }, series: [{ type: "bar", data: distribution.map(([mid, count]) => ({ value: count, itemStyle: { color: mid >= displayedVar ? "#d85b61" : "#79a5ef" } })), markLine: { symbol: "none", label: { formatter: "VaRₚ", color: "#a12c34" }, lineStyle: { color: "#c63f49", width: 2 }, data: [{ xAxis: `${Math.round(displayedVar / 1e6)}m` }] } }] }} />
          <PanelCredit names={contributors} role={t("VaR, risk comparison, and tail-measure calculations.", "محاسبات VaR، مقایسه‌ی ریسک و سنجه‌های دنباله‌ای.")} />
        </section>
        <section className="panel">
          <div className="panel-heading"><div><ResultTag tone="slate">{t("Estimator comparison", "مقایسه‌ی برآوردگرها")}</ResultTag><h2>{t("VaRₚ under three assumptions", "VaRₚ تحت سه فرض")}</h2><p>{t("Empirical VaR uses sample order statistics; normal VaR imposes mean and variance; EVT fits only exceedances above threshold u.", "VaR تجربی از آمارهای ترتیبی نمونه، VaR نرمال از میانگین و واریانس و EVT فقط از مازادهای بالاتر از آستانه‌ی u استفاده می‌کند.")}</p></div></div>
          <EChart height={275} label={t("VaR comparison across empirical, normal and EVT methods", "مقایسه‌ی VaR در روش‌های تجربی، نرمال و مقادیر حدی")} option={{ animation: false, grid: { left: 86, right: 20, top: 12, bottom: 34 }, tooltip: { trigger: "axis", axisPointer: { type: "shadow" } }, xAxis: { type: "value", axisLabel: { formatter: (value: number) => `${Math.round(value / 1e6)}m` }, splitLine: { lineStyle: { color: "#e8edf3" } } }, yAxis: { type: "category", data: methodRows.map((row) => row.name) }, series: [{ type: "bar", data: methodRows.map((row, index) => ({ value: row.value, itemStyle: { color: ["#2868d8", "#d49a28", "#29957c"][index], borderRadius: [0, 4, 4, 0] } })) }] }} />
          <PanelCredit names={contributors} />
        </section>
      </div>

      <div className="formula-grid">
        <Formula equation={String.raw`\operatorname{VaR}_p(X)=\inf\{x:F_X(x)\ge p\}`} label={t("The smallest loss x whose cumulative probability reaches p.", "کوچک‌ترین خسارت x که احتمال تجمعی در آن به p می‌رسد.")} hint={t("Risk measure · value at risk", "سنجه‌ی ریسک · ارزش در معرض ریسک")} />
        <Formula equation={String.raw`\operatorname{TVaR}_p(X)=\frac{1}{1-p}\int_p^1\operatorname{VaR}_q(X)\,dq`} label={t("The mean of quantiles in the remaining upper tail; the sample calculation includes the threshold observation.", "میانگین چندک‌های دنباله‌ی بالایی باقی‌مانده؛ محاسبه‌ی نمونه مشاهده‌ی روی آستانه را نیز شامل می‌کند.")} hint={t("Mean loss in the upper tail", "میانگین خسارت در دنباله‌ی بالا")} />
      </div>
      <Notice kind="warning" title={t("Few observations remain in the far tail", "در انتهای دنباله مشاهدات کمی باقی می‌ماند")}>{t("At 99% confidence, only about ten of the 1,000 synthetic months exceed the threshold. Normal VaR may miss heavy-tail behavior, while EVT depends materially on the selected threshold u.", "در سطح اطمینان ۹۹٪ فقط حدود ده ماه از هزار ماه مصنوعی از آستانه عبور می‌کنند. VaR نرمال ممکن است رفتار دنباله‌سنگین را کمتر برآورد کند و نتیجه‌ی EVT نیز به انتخاب آستانه‌ی u حساس است.")}</Notice>
      <Contributor names={contributors} files="Risk_Measures_and_Risk_Comparison.py · دلتا گاما.R" summary={t("The submitted VaR and delta–gamma work was integrated with explicit empirical, normal, and EVT conventions, threshold validation, and clear result labels.", "کارهای ارائه‌شده درباره‌ی VaR و دلتا–گاما با قراردادهای صریح تجربی، نرمال و EVT، اعتبارسنجی آستانه و برچسب‌گذاری روشن نتایج یکپارچه شده‌اند.")} />
    </div>
  );
}
