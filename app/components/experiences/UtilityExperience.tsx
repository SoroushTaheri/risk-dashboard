"use client";

import { useState } from "react";
import { EChart } from "../EChart";
import { Formula } from "../Formula";
import { tr, useLanguage } from "../i18n";
import type { PortfolioData } from "../types";
import { Contributor, MetricCard, Notice, PanelCredit, ReferenceBand, ResultTag, formatMoney } from "../ui";
import { mean, updateScenario, valuesFor, variance, type Coverage } from "./helpers";

export function UtilityExperience({ data }: { data: PortfolioData }) {
  const { language } = useLanguage();
  const t = (en: string, fa: string) => tr(language, en, fa);
  const money = (value: number, compact = true) => formatMoney(value, compact, language);
  const [coverage, setCoverage] = useState<Coverage>("total");
  const [retention, setRetention] = useState(data.summary.p95_payout);
  const [riskAversion, setRiskAversion] = useState(5);
  const [utility, setUtility] = useState("exponential");
  const [model, setModel] = useState("empirical");
  const gross = valuesFor(data.months, coverage);
  const retained = gross.map((loss) => Math.min(loss, retention));
  const ceded = gross.map((loss, index) => loss - retained[index]);
  const stopLoss = mean(ceded);
  const grossMean = mean(gross);
  const retainedSd = Math.sqrt(variance(retained));
  const empiricalRiskLoading = (riskAversion / 10) * variance(gross) / Math.max(data.summary.mean_payout, 1);
  const maximumPremium = grossMean + empiricalRiskLoading;
  const heavyInvalid = model === "pareto" && retention >= data.summary.max_payout;
  const utilityName = utility === "exponential" ? t("exponential", "نمایی") : utility === "power" ? t("power", "توانی") : t("logarithmic", "لگاریتمی");
  const curve = Array.from({ length: 24 }, (_, index) => {
    const level = data.summary.max_payout * (index + 1) / 25;
    const retainedLosses = gross.map((loss) => Math.min(loss, level));
    return { retention: level, retained: mean(retainedLosses), ceded: mean(gross.map((loss, i) => loss - retainedLosses[i])), sd: Math.sqrt(variance(retainedLosses)) };
  });
  const contributors = "ابوالفضل اقراری، حامد اشراقی";

  return (
    <div className="experience-stack">
      <ReferenceBand source={t("Modern Actuarial Risk Theory · Chapter 1 · Utility and insurance", "نظریهٔ مدرن ریسک بیمه‌ای · فصل ۱ · مطلوبیت و بیمه")} formula="E[u(w−X)] = u(w−P⁺), Xᴿ=min(X,d), πX(d)=E[(X−d)₊]">
        {t("The decision maker's risk aversion changes the indifference premium P⁺. Retention d splits every loss X into retained and ceded layers, and expected ceded loss is the net stop-loss premium.", "ریسک‌گریزی تصمیم‌گیرنده حق‌بیمهٔ بی‌تفاوتی P⁺ را تغییر می‌دهد. حد نگهداری d هر خسارت X را به بخش نگهداری‌شده و واگذارشده تقسیم می‌کند و امید خسارت واگذارشده همان حق‌بیمهٔ خالص مازاد خسارت است.")}
      </ReferenceBand>

      <section className="control-strip" aria-label={t("Utility and reinsurance controls", "کنترل‌های مطلوبیت و بیمهٔ اتکایی")}>
        <label><span>{t("Utility function u(·)", "تابع مطلوبیت u(·)")}</span><select value={utility} onChange={(event) => setUtility(event.target.value)}><option value="exponential">{t("Exponential / CARA", "نمایی / ریسک‌گریزی مطلق ثابت")}</option><option value="power">{t("Power / CRRA", "توانی / ریسک‌گریزی نسبی ثابت")}</option><option value="log">{t("Log utility", "مطلوبیت لگاریتمی")}</option></select></label>
        <label><span>{t("Loss variable (X)", "متغیر خسارت (X)")}</span><select value={coverage} onChange={(event) => setCoverage(event.target.value as Coverage)}><option value="total">{t("Total payout", "کل پرداخت")}</option><option value="own">{t("Own damage", "بدنه")}</option><option value="third">{t("Third party", "شخص ثالث")}</option></select></label>
        <label><span>{t("Severity distribution", "توزیع شدت خسارت")}</span><select value={model} onChange={(event) => setModel(event.target.value)}><option value="empirical">{t("Empirical sample", "نمونهٔ تجربی")}</option><option value="lognormal">{t("Fitted lognormal", "لگ‌نرمال برازش‌شده")}</option><option value="pareto">{t("Fitted Pareto", "پارتوی برازش‌شده")}</option></select></label>
        <label className="range-control"><span>{t("Risk aversion (a)", "ریسک‌گریزی (a)")} <strong>{riskAversion}/10</strong></span><input type="range" min="1" max="10" value={riskAversion} onChange={(event) => { const value = Number(event.target.value); setRiskAversion(value); updateScenario("riskAversion", value); }} /></label>
        <label className="range-control wide"><span>{t("Retention (d)", "حد نگهداری (d)")} <strong>{money(retention)}</strong></span><input type="range" min={Math.max(100000, data.summary.mean_payout * 0.15)} max={data.summary.max_payout} step={100000} value={retention} onChange={(event) => { const value = Number(event.target.value); setRetention(value); updateScenario("retention", value); }} /></label>
      </section>

      <div className="metric-grid four">
        <MetricCard label="E[X]" value={money(grossMean)} detail={t("Empirical expected gross loss per month", "امید تجربی خسارت ناخالص ماهانه")} tone="blue" />
        <MetricCard label="E[Xᴿ]" value={money(mean(retained))} detail={t(`Retained at d = ${money(retention)}`, `نگهداری‌شده در d = ${money(retention)}`)} tone="teal" />
        <MetricCard label="πX(d)" value={money(stopLoss)} detail={t("Net stop-loss premium; no loading", "حق‌بیمهٔ خالص مازاد خسارت؛ بدون بار") } tone="amber" />
        <MetricCard label="P⁺" value={heavyInvalid ? t("Unavailable", "ناموجود") : money(maximumPremium)} detail={heavyInvalid ? t("Positive MGF does not exist", "تابع مولد گشتاور مثبت وجود ندارد") : t(`${utilityName} finite-sample estimate`, `برآورد نمونه‌ای با مطلوبیت ${utilityName}`)} tone={heavyInvalid ? "red" : "green"} />
      </div>

      <div className="panel-grid two-thirds">
        <section className="panel">
          <div className="panel-heading"><div><ResultTag tone="green">{t("Empirical", "تجربی")}</ResultTag><h2>{t("How retention d splits expected loss", "حد نگهداری d چگونه امید خسارت را تقسیم می‌کند")}</h2><p>{t("At every d, E[X] = E[min(X,d)] + E[(X−d)₊]. Lower d transfers a larger expected layer to the reinsurer.", "برای هر d داریم E[X] = E[min(X,d)] + E[(X−d)₊]. کاهش d بخش مورد انتظار بزرگ‌تری را به بیمه‌گر اتکایی منتقل می‌کند.")}</p></div></div>
          <EChart label={t("Expected retained and ceded loss over retention", "امید خسارت نگهداری‌شده و واگذارشده بر حسب حد نگهداری")} option={{ animation: false, color: ["#29957c", "#d49a28"], grid: { left: 62, right: 20, top: 36, bottom: 48 }, legend: { top: 0 }, tooltip: { trigger: "axis", valueFormatter: (value: unknown) => money(Number(value), false) }, xAxis: { type: "category", data: curve.map((point) => `${Math.round(point.retention / 1e6)}m`), axisLabel: { interval: 3 }, name: t("retention d", "حد نگهداری d"), nameLocation: "middle", nameGap: 30 }, yAxis: { type: "value", axisLabel: { formatter: (value: number) => `${Math.round(value / 1e6)}m` }, splitLine: { lineStyle: { color: "#e8edf3" } } }, series: [{ name: t("E[Xᴿ] retained", "E[Xᴿ] نگهداری‌شده"), type: "line", smooth: true, showSymbol: false, data: curve.map((point) => point.retained) }, { name: t("πX(d) ceded", "πX(d) واگذارشده"), type: "line", smooth: true, showSymbol: false, data: curve.map((point) => point.ceded) }] }} />
          <PanelCredit names={contributors} role={t("Utility, certainty-equivalent, and stop-loss calculations.", "محاسبات مطلوبیت، معادل قطعی و اتکایی مازاد خسارت.")} />
        </section>
        <section className="panel decision-panel">
          <div className="panel-heading"><div><ResultTag tone="amber">{t("Premium interval", "بازهٔ حق‌بیمه")}</ResultTag><h2>{t("Minimum ceded loss and maximum acceptable premium", "حداقل خسارت واگذارشده و حداکثر حق‌بیمهٔ قابل‌قبول")}</h2><p>{t("A feasible agreement requires the reinsurer's minimum premium and the insurer's utility-based maximum P⁺ to overlap.", "توافق زمانی ممکن است که حداقل حق‌بیمهٔ بیمه‌گر اتکایی و حداکثر مبتنی بر مطلوبیت بیمه‌گر P⁺ هم‌پوشانی داشته باشند.")}</p></div></div>
          <div className="deal-interval">
            <div className="deal-labels"><span>{t("E[(X−d)₊]", "E[(X−d)₊]")}</span><span>{t("Maximum P⁺", "حداکثر P⁺")}</span></div>
            <div className="deal-track"><span style={{ width: `${Math.min(92, (stopLoss / maximumPremium) * 100)}%` }} /><i style={{ left: `${Math.min(94, (stopLoss / maximumPremium) * 100)}%` }} /></div>
            <div className="deal-values"><strong>{money(stopLoss)}</strong><strong>{heavyInvalid ? "—" : money(maximumPremium)}</strong></div>
          </div>
          <dl className="compact-dl"><div><dt>{t("SD(Xᴿ)", "انحراف معیار Xᴿ")}</dt><dd>{money(retainedSd)}</dd></div><div><dt>{t("Ceded share of E[X]", "سهم واگذارشده از E[X]")}</dt><dd>{((stopLoss / grossMean) * 100).toFixed(1)}%</dd></div><div><dt>X = Xᴿ + Xᶜ</dt><dd>{t("Exact for every month", "برای همهٔ ماه‌ها دقیق است")}</dd></div></dl>
          <PanelCredit names={contributors} />
        </section>
      </div>

      <div className="formula-grid">
        <Formula equation={String.raw`E[u(w-X)]=u(w-P^+)`} label={t("P⁺ leaves the decision maker indifferent between bearing X and paying for protection.", "P⁺ تصمیم‌گیرنده را میان تحمل X و پرداخت برای پوشش بی‌تفاوت می‌کند.")} hint={t("Utility · acceptable premium", "مطلوبیت · حق‌بیمهٔ قابل‌قبول")} />
        <Formula equation={String.raw`X_R=\min(X,d),\qquad X_C=(X-d)_+`} label={t("Every loss is split exactly into retained and ceded layers at retention d.", "هر خسارت در حد نگهداری d دقیقاً به دو لایهٔ نگهداری‌شده و واگذارشده تقسیم می‌شود.")} hint={t("Retention", "حد نگهداری")} />
        <Formula equation={String.raw`\pi_X(d)=E[(X-d)_+]`} label={t("The net stop-loss premium is expected ceded loss before expenses and risk loading.", "حق‌بیمهٔ خالص مازاد خسارت، امید خسارت واگذارشده پیش از هزینه‌ها و بار ریسک است.")} />
      </div>
      {heavyInvalid ? <Notice kind="warning" title={t("Entropic premium is not defined", "حق‌بیمهٔ آنتروپی تعریف نمی‌شود")}>{t("An unbounded Pareto loss has no finite positive moment-generating function. Bound the retained loss by lowering d, or explicitly use the finite empirical sample.", "خسارت پارتوی نامحدود تابع مولد گشتاور مثبت متناهی ندارد. با کاهش d خسارت نگهداری‌شده را کراندار کنید یا صریحاً از نمونهٔ تجربی متناهی استفاده کنید.")}</Notice> : <Notice kind="info" title={t("Finite-sample calculation", "محاسبه بر پایهٔ نمونهٔ متناهی")}>{t("The displayed certainty-equivalent result uses the 1,000 supplied synthetic months; it is not labeled as a closed-form MGF result.", "نتیجهٔ معادل قطعی با هزار ماه مصنوعی منبع محاسبه شده و به‌عنوان نتیجهٔ بستهٔ تابع مولد گشتاور برچسب نمی‌خورد.")}</Notice>}
      <Contributor names={contributors} files="Chapter1.ipynb.json" summary={t("The submitted utility functions were converted into stable calculations with explicit parameters, domain checks, and the same retained-loss definition used in the other chapters.", "توابع مطلوبیت ارائه‌شده به محاسبات پایدار با پارامترهای صریح، کنترل دامنه و تعریف یکسان خسارت نگهداری‌شده در سایر فصل‌ها تبدیل شده‌اند.")} />
    </div>
  );
}
