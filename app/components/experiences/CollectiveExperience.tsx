"use client";

import { useState } from "react";
import { EChart } from "../EChart";
import { Formula, InlineMath } from "../Formula";
import { tr, useLanguage } from "../i18n";
import type { PortfolioData } from "../types";
import { Contributor, MetricCard, Notice, PanelCredit, ReferenceBand, ResultTag, formatMoney } from "../ui";
import { useActuarialApi, useActuarialGet } from "../useActuarialApi";
import { histogram, mean, variance } from "./helpers";

type CollectiveCoverage = "total" | "own_damage" | "third_party_liability";
type CollectiveApiResult = { mean_frequency: number; mean_severity: number; empirical_mean_aggregate_loss: number; component_expected_aggregate_loss: number; identity_relative_error: number; p95_aggregate_loss: number; components: { coverage: string; expected_aggregate_loss: number }[] };
type FrequencyApiResult = { values: { mean: number; variance: number; dispersion_index: number }; unit: string; coverage: string };

export function CollectiveExperience({ data }: { data: PortfolioData }) {
  const { language } = useLanguage();
  const t = (en: string, fa: string) => tr(language, en, fa);
  const money = (value: number) => formatMoney(value, true, language);
  const [coverage, setCoverage] = useState<CollectiveCoverage>("total");
  const [frequency, setFrequency] = useState("poisson");
  const [frequencyUnit, setFrequencyUnit] = useState<"claim" | "accident">("claim");
  const [method, setMethod] = useState("monte-carlo");
  const [confidence, setConfidence] = useState(0.95);
  const { data: apiResult, error: apiError } = useActuarialApi<CollectiveApiResult>("/api/collective-risk", { coverage, confidence });
  const frequencyCoverage = frequencyUnit === "accident" ? "total" : coverage;
  const { data: frequencyResult } = useActuarialGet<FrequencyApiResult>(`/api/frequency-fit?model=${frequency}&unit=${frequencyUnit}&coverage=${frequencyCoverage}`);
  const ownCounts = data.months.map((row) => row.own_claims);
  const liabilityCounts = data.months.map((row) => row.liability_claims);
  const counts = data.months.map((row) => coverage === "own_damage" ? row.own_claims : coverage === "third_party_liability" ? row.liability_claims : row.total_claims);
  const frequencyCounts = frequencyUnit === "accident" ? data.months.map((row) => row.accidents) : counts;
  const aggregateLosses = data.months.map((row) => coverage === "own_damage" ? row.own_amount : coverage === "third_party_liability" ? row.third_amount : row.payout);
  const countMean = apiResult?.mean_frequency ?? mean(counts);
  const frequencyMean = frequencyResult?.values.mean ?? mean(frequencyCounts);
  const frequencyVariance = frequencyResult?.values.variance ?? variance(frequencyCounts);
  const dispersion = frequencyResult?.values.dispersion_index ?? frequencyVariance / frequencyMean;
  const totalClaims = counts.reduce((sum, value) => sum + value, 0);
  const totalPaid = aggregateLosses.reduce((sum, value) => sum + value, 0);
  const claimMean = apiResult?.mean_severity ?? totalPaid / totalClaims;
  const aggregateMean = apiResult?.empirical_mean_aggregate_loss ?? mean(aggregateLosses);
  const identityMean = apiResult?.component_expected_aggregate_loss ?? countMean * claimMean;
  const identityError = apiResult?.identity_relative_error ?? Math.abs(identityMean / aggregateMean - 1);
  const countHist = histogram(frequencyCounts, 18);
  const aggregateHist = histogram(aggregateLosses, 26);
  const ordered = [...aggregateLosses].sort((a, b) => a - b);
  const pIndex = Math.max(0, Math.ceil(confidence * ordered.length) - 1);
  const pLoss = apiResult?.p95_aggregate_loss ?? ordered[pIndex];
  const ownSeverity = data.months.reduce((sum, row) => sum + row.own_amount, 0) / ownCounts.reduce((sum, value) => sum + value, 0);
  const liabilitySeverity = data.months.reduce((sum, row) => sum + row.third_amount, 0) / liabilityCounts.reduce((sum, value) => sum + value, 0);
  const ownExpected = apiResult?.components.find((item) => item.coverage === "own_damage")?.expected_aggregate_loss ?? mean(ownCounts) * ownSeverity;
  const liabilityExpected = apiResult?.components.find((item) => item.coverage === "third_party_liability")?.expected_aggregate_loss ?? mean(liabilityCounts) * liabilitySeverity;
  const methodLabel = method === "panjer" ? t("Panjer recursion", "بازگشت پانژر") : method === "fft" ? t("FFT inversion", "وارون‌سازی FFT") : t("Entity-first Monte Carlo", "مونت‌کارلوی مبتنی بر موجودیت");
  const contributors = "محمد مهدوی نسب، علی جهانبان، محمدرضا سعیدخانی، محمد اشکوری";

  return (
    <div className="experience-stack">
      <ReferenceBand source={t("Modern Actuarial Risk Theory · Chapter 3 · Collective risk model", "Modern Actuarial Risk Theory · فصل ۳ · مدل ریسک جمعی")} formula={String.raw`S=\sum_{i=1}^{N}X_i,\quad E[S]=E[N]E[X]`}>
        {t("N is a claim count and X is the matching policy-claim severity. Physical accident count is shown elsewhere and is never multiplied by a blended claim severity.", "N تعداد پرونده‌های خسارت و X شدت همان خسارت بیمه‌نامه‌ای است. تعداد حادثه‌ی فیزیکی در جای دیگری نمایش داده می‌شود و هرگز در شدت ترکیبی خسارت ضرب نمی‌شود.")}
      </ReferenceBand>

      <section className="control-strip" aria-label={t("Collective risk controls", "کنترل‌های مدل ریسک جمعی")}>
        <label><span>{t("Claim portfolio", "پرتفوی خسارت")}</span><select value={coverage} onChange={(event) => setCoverage(event.target.value as CollectiveCoverage)}><option value="total">{t("Stratified combined book", "پرتفوی ترکیبی لایه‌بندی‌شده")}</option><option value="own_damage">{t("Own-damage claims", "خسارت‌های بدنه")}</option><option value="third_party_liability">{t("Liability claims", "خسارت‌های شخص ثالث")}</option></select></label>
        <label><span>{t("Frequency fit", "برازش فراوانی")}</span><select value={frequency} onChange={(event) => setFrequency(event.target.value)}><option value="poisson">{t("Poisson", "پواسون")}</option><option value="negative_binomial">{t("Negative binomial", "دوجمله‌ای منفی")}</option></select></label>
        <label><span>{t("Frequency unit", "واحد فراوانی")}</span><select value={frequencyUnit} onChange={(event) => setFrequencyUnit(event.target.value as "claim" | "accident")}><option value="claim">{t("Policy claims · collective N", "پرونده خسارت · N جمعی")}</option><option value="accident">{t("Physical accidents · comparison only", "حوادث فیزیکی · فقط مقایسه")}</option></select></label>
        <label><span>{t("Calculation route", "مسیر محاسباتی")}</span><select value={method} onChange={(event) => setMethod(event.target.value)}><option value="monte-carlo">{t("Entity-first Monte Carlo", "مونت‌کارلوی مبتنی بر موجودیت")}</option><option value="panjer">{t("Panjer textbook route", "مسیر کتابی پانژر")}</option><option value="fft">{t("FFT textbook route", "مسیر کتابی FFT")}</option></select></label>
        <label className="range-control"><span>{t("Upper quantile", "چندک بالا")} <strong>{(confidence * 100).toFixed(0)}%</strong></span><input type="range" min="0.8" max="0.99" step="0.01" value={confidence} onChange={(event) => setConfidence(Number(event.target.value))} /></label>
      </section>

      <div className="metric-grid four">
        <MetricCard label={<InlineMath equation={String.raw`E[N]`} />} value={countMean.toFixed(2)} detail={t("Mean policy-claim count per month", "میانگین تعداد پرونده‌ی خسارت در هر ماه")} tone="blue" />
        <MetricCard label={<InlineMath equation={String.raw`E[X]`} />} value={money(claimMean)} detail={t("Mean paid severity for the same claims", "میانگین شدت پرداختی همان خسارت‌ها")} tone="teal" />
        <MetricCard label={<InlineMath equation={String.raw`E[S]=E[N]E[X]`} />} value={money(identityMean)} detail={t(`Identity error ${(identityError * 100).toExponential(1)}%`, `خطای اتحاد ${(identityError * 100).toExponential(1)}٪`)} tone="green" />
        <MetricCard label={<InlineMath equation={String.raw`Q_{${(confidence * 100).toFixed(0)}\%}(S)`} />} value={money(pLoss)} detail={t("Empirical aggregate paid loss", "خسارت پرداختی کل تجربی")} tone="amber" />
      </div>

      <div className="panel-grid equal">
        <section className="panel">
          <div className="panel-heading"><div><ResultTag tone="green">{t("API-fitted frequency", "فراوانی برازش‌شده با API")}</ResultTag><h2>{t("Frequency distribution across synthetic months", "توزیع فراوانی در ماه‌های شبیه‌سازی‌شده")}</h2><p>{frequencyUnit === "claim" ? t(`The Python-fitted ${frequency === "poisson" ? "Poisson" : "negative-binomial"} family uses the same policy-claim count as the collective model.`, `خانواده‌ی ${frequency === "poisson" ? "پواسون" : "دوجمله‌ای منفی"} در پایتون از همان تعداد پرونده‌ی خسارت مدل جمعی استفاده می‌کند.`) : t("This is a separate physical-accident frequency comparison. It never replaces claim count in the collective expected-loss identity.", "این مقایسه‌ی جداگانه‌ی فراوانی حادثه‌ی فیزیکی است و هرگز جای تعداد خسارت را در اتحاد امید خسارت جمعی نمی‌گیرد.")}</p></div></div>
          <EChart label={frequencyUnit === "claim" ? t("Claim-count distribution", "توزیع تعداد خسارت") : t("Physical-accident distribution", "توزیع تعداد حادثه‌ی فیزیکی")} option={{ animation: false, grid: { left: 52, right: 18, top: 24, bottom: 44 }, tooltip: { trigger: "axis" }, xAxis: { type: "category", data: countHist.map(([mid]) => Math.round(mid)), name: frequencyUnit === "claim" ? t("policy-claim count", "تعداد پرونده‌ی خسارت") : t("physical-accident count", "تعداد حادثه‌ی فیزیکی"), nameLocation: "middle", nameGap: 28 }, yAxis: { type: "value", name: t("months", "ماه‌ها"), splitLine: { lineStyle: { color: "#e8edf3" } } }, series: [{ type: "bar", data: countHist.map(([, count]) => count), itemStyle: { color: "#79a5ef", borderRadius: [3, 3, 0, 0] } }] }} />
          <dl className="compact-dl"><div><dt><InlineMath equation={String.raw`E[F]`} /></dt><dd>{frequencyMean.toFixed(2)}</dd></div><div><dt><InlineMath equation={String.raw`\operatorname{Var}(F)`} /></dt><dd>{frequencyVariance.toFixed(2)}</dd></div><div><dt>{t("Dispersion index", "شاخص پراکندگی")}</dt><dd>{dispersion.toFixed(3)}</dd></div><div><dt>{t("Frequency unit", "واحد فراوانی")}</dt><dd>{frequencyUnit === "claim" ? t("claims", "پرونده خسارت") : t("accidents", "حادثه")}</dd></div></dl>
        </section>
        <section className="panel">
          <div className="panel-heading"><div><ResultTag tone="blue">{t("Simulated aggregate loss", "خسارت کل شبیه‌سازی‌شده")}</ResultTag><h2>{t("Aggregate-loss distribution from matched claims", "توزیع خسارت کل از پرونده‌های متناظر")}</h2><p>{t(`${methodLabel} is the selected teaching route. The displayed portfolio result remains the reconciled entity-first empirical distribution.`, `${methodLabel} مسیر آموزشی انتخاب‌شده است. نتیجه‌ی پرتفوی نمایش‌داده‌شده همان توزیع تجربی تطبیق‌یافته‌ی مبتنی بر موجودیت است.`)}</p></div></div>
          <EChart label={t("Aggregate insurer-paid loss distribution", "توزیع خسارت کل پرداختی بیمه‌گر")} option={{ animation: false, grid: { left: 52, right: 18, top: 24, bottom: 46 }, tooltip: { trigger: "axis" }, xAxis: { type: "category", data: aggregateHist.map(([mid]) => mid >= 1000 ? `${(mid / 1000).toFixed(1)}bn` : `${Math.round(mid)}m`), axisLabel: { interval: 4 }, name: t("aggregate loss", "خسارت کل"), nameLocation: "middle", nameGap: 30 }, yAxis: { type: "value", name: t("months", "ماه‌ها"), splitLine: { lineStyle: { color: "#e8edf3" } } }, series: [{ type: "bar", data: aggregateHist.map(([, count]) => count), itemStyle: { color: "#4f8ddf", borderRadius: [3, 3, 0, 0] } }] }} />
          <PanelCredit names={contributors} role={t("Frequency, severity, Panjer, FFT, and collective-risk methods.", "روش‌های فراوانی، شدت، پانژر، FFT و ریسک جمعی.")} />
        </section>
      </div>

      {coverage === "total" ? <section className="panel">
        <div className="panel-heading"><div><ResultTag tone="slate">{t("Stratified combined book", "پرتفوی ترکیبی لایه‌بندی‌شده")}</ResultTag><h2>{t("Add coverage aggregates, not unlike event counts", "جمع خسارت‌های پوششی، نه شمارش رویدادهای ناهمگون")}</h2><p>{t("Own-damage and liability retain separate frequencies and severities before their aggregate losses are added.", "بدنه و شخص ثالث پیش از جمع خسارت کل، فراوانی و شدت جداگانه‌ی خود را حفظ می‌کنند.")}</p></div></div>
        <div className="reconciliation-table" role="table" aria-label="collective component identity">
          <div role="row"><span>{t("Own damage", "بدنه")} · <InlineMath equation={String.raw`E[N]E[X]`} /></span><strong>{money(ownExpected)}</strong></div>
          <div role="row"><span>{t("Third-party liability", "شخص ثالث")} · <InlineMath equation={String.raw`E[N]E[X]`} /></span><strong>{money(liabilityExpected)}</strong></div>
          <div role="row"><span>{t("Component sum", "جمع اجزا")}</span><strong>{money(ownExpected + liabilityExpected)}</strong></div>
          <div role="row"><span>{t("Empirical aggregate-loss mean", "میانگین تجربی خسارت کل")}</span><strong>{money(data.summary.mean_payout)}</strong></div>
        </div>
      </section> : null}

      <div className="formula-grid"><Formula equation={String.raw`S=\sum_{i=1}^{N}X_i`} label={t("The count is the number of policy claims, and each severity belongs to that same claim population.", "تعداد، شمار پرونده‌های خسارت بیمه‌نامه‌ای است و هر شدت پرداختی به همان جامعه‌ی خسارت تعلق دارد.")} /><Formula equation={String.raw`S_{\mathrm{total}}=S_{\mathrm{OD}}+S_{\mathrm{TPL}}`} label={t("The combined portfolio adds separately modeled own-damage and liability aggregate losses.", "پرتفوی ترکیبی خسارت‌های کل بدنه و شخص ثالث را که جدا مدل شده‌اند جمع می‌کند.")} hint={t("Stratified aggregation", "تجمیع لایه‌بندی‌شده")} /></div>
      <Notice kind="success" title={t("Frequency and severity use matching units", "فراوانی و شدت از واحدهای متناظر استفاده می‌کنند")}>{t("For each selected claim population, claim frequency and matching claim severity reconcile the collective expected-loss identity to the empirical mean aggregate paid loss.", "برای هر جامعه‌ی خسارت انتخاب‌شده، فراوانی خسارت و شدت متناظر آن، اتحاد امید خسارت جمعی را با میانگین تجربی خسارت کل پرداختی تطبیق می‌دهند.")}</Notice>
      {apiError ? <Notice kind="warning" title={t("Authoritative API unavailable", "API مرجع در دسترس نیست")}>{t("The histograms remain direct data views, but fitted and reconciled metrics require the Python service.", "هیستوگرام‌ها همچنان نمایش مستقیم داده‌اند، اما سنجه‌های برازش‌شده و تطبیق‌یافته به سرویس پایتون نیاز دارند.")}</Notice> : null}
      <Contributor names={contributors} files="3.5.ipynb · 3.6.ipynb · 3.7.ipynb · Section_3.8.py · Section_3.10.py" summary={t("The chapter methods now operate on matching coverage-specific claim counts and severities; textbook numerical routes remain explicitly separate from the empirical portfolio result.", "روش‌های فصل اکنون روی تعداد و شدت متناظر خسارت‌های مختص پوشش کار می‌کنند؛ مسیرهای عددی کتابی نیز صریحاً از نتیجه‌ی تجربی پرتفوی جدا هستند.")} />
    </div>
  );
}
