"use client";

import { useState } from "react";
import { EChart } from "../EChart";
import { Formula, InlineMath } from "../Formula";
import { tr, useLanguage, type Language } from "../i18n";
import type { PortfolioData } from "../types";
import { Contributor, MetricCard, Notice, PanelCredit, ReferenceBand, ResultTag, formatMoney } from "../ui";
import { useActuarialApi, useActuarialGet } from "../useActuarialApi";
import { histogram, mean, variance } from "./helpers";

type CollectiveCoverage = "total" | "own_damage" | "third_party_liability";
type FrequencyModel = "poisson" | "negative_binomial";
type CalculationMethod = "monte_carlo" | "panjer" | "fft";
type SeverityFit = {
  model: string;
  aic: number;
  delta_aic: number;
  parameters: Record<string, number | boolean>;
};
type CollectiveApiResult = {
  mean_frequency: number;
  mean_severity: number;
  empirical_mean_aggregate_loss: number;
  component_expected_aggregate_loss: number;
  identity_relative_error: number;
  model_mean: number;
  model_variance: number;
  model_quantile: number;
  empirical_quantile: number;
  normal_approximation_quantile: number;
  represented_mass: number;
  grid_width: number;
  aggregate_distribution: { losses: number[]; empirical_probability: number[]; model_probability: number[] };
  severity_fits: SeverityFit[];
  components: { coverage: string; expected_aggregate_loss: number; fit_message: string | null }[];
};
type FrequencyApiResult = {
  values: {
    observed_mean: number;
    observed_variance: number;
    observed_dispersion_index: number;
    fitted_mean: number;
    fitted_variance: number;
    fitted_dispersion_index: number;
    mean: number;
    variance: number;
    dispersion_index: number;
    aic: number;
    parameters: Record<string, number>;
    support: number[];
    observed_frequency: number[];
    fitted_expected_frequency: number[];
  };
  message: string | null;
  unit: string;
  coverage: string;
};

const severityLabels: Record<string, [string, string]> = {
  gamma: ["Gamma", "گاما"],
  inverse_gaussian: ["Inverse Gaussian", "گاوس معکوس"],
  exponential_mixture: ["Two-exponential mixture", "آمیخته‌ی دو نمایی"],
  lognormal: ["Lognormal", "لگ‌نرمال"],
  pareto: ["Pareto", "پارتو"],
};

const parameterLabels: Record<string, [string, string]> = {
  shape: ["shape", "شکل"],
  scale: ["scale", "مقیاس"],
  mean: ["mean", "میانگین"],
  sigma: ["sigma", "سیگما"],
  weight: ["weight", "وزن"],
  rate_one: ["rate 1", "نرخ ۱"],
  rate_two: ["rate 2", "نرخ ۲"],
  finite_mean: ["finite mean", "میانگین متناهی"],
};

function formatNumeric(value: number, digits: number, language: Language) {
  return new Intl.NumberFormat(language === "fa" ? "fa-IR" : "en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function formatParameterValue(value: number | boolean, language: Language) {
  if (typeof value === "boolean") return value ? tr(language, "yes", "بله") : tr(language, "no", "خیر");
  return new Intl.NumberFormat(language === "fa" ? "fa-IR" : "en-US", { maximumSignificantDigits: 3 }).format(value);
}

export function CollectiveExperience({ data }: { data: PortfolioData }) {
  const { language } = useLanguage();
  const t = (en: string, fa: string) => tr(language, en, fa);
  const money = (value: number) => formatMoney(value, true, language);
  const preciseQuantileMoney = (value: number) => {
    const locale = language === "fa" ? "fa-IR" : "en-US";
    if (Math.abs(value) >= 1_000) {
      const amount = new Intl.NumberFormat(locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(value / 1_000);
      return language === "fa" ? `${amount} میلیارد تومان` : `${amount} billion tomans`;
    }
    const amount = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
    return language === "fa" ? `${amount} میلیون تومان` : `${amount} million tomans`;
  };
  const [coverage, setCoverage] = useState<CollectiveCoverage>("total");
  const [frequency, setFrequency] = useState<FrequencyModel>("poisson");
  const [frequencyUnit, setFrequencyUnit] = useState<"claim" | "accident">("claim");
  const [method, setMethod] = useState<CalculationMethod>("monte_carlo");
  const [confidence, setConfidence] = useState(0.95);
  const { data: apiResult, error: apiError } = useActuarialApi<CollectiveApiResult>("/api/collective-risk", {
    coverage,
    confidence,
    frequency_model: frequency,
    method,
  });
  const frequencyCoverage = frequencyUnit === "accident" ? "total" : coverage;
  const { data: frequencyResult, error: frequencyError } = useActuarialGet<FrequencyApiResult>(
    `/api/frequency-fit?model=${frequency}&unit=${frequencyUnit}&coverage=${frequencyCoverage}`
  );

  const ownCounts = data.months.map((row) => row.own_claims);
  const liabilityCounts = data.months.map((row) => row.liability_claims);
  const counts = data.months.map((row) => coverage === "own_damage" ? row.own_claims : coverage === "third_party_liability" ? row.liability_claims : row.total_claims);
  const frequencyCounts = frequencyUnit === "accident" ? data.months.map((row) => row.accidents) : counts;
  const aggregateLosses = data.months.map((row) => coverage === "own_damage" ? row.own_amount : coverage === "third_party_liability" ? row.third_amount : row.payout);
  const countMean = apiResult?.mean_frequency ?? mean(counts);
  const observedFrequencyMean = frequencyResult?.values.observed_mean ?? mean(frequencyCounts);
  const observedFrequencyVariance = frequencyResult?.values.observed_variance ?? variance(frequencyCounts);
  const observedDispersion = frequencyResult?.values.observed_dispersion_index ?? observedFrequencyVariance / observedFrequencyMean;
  const fittedFrequencyMean = frequencyResult?.values.fitted_mean ?? observedFrequencyMean;
  const fittedFrequencyVariance = frequencyResult?.values.fitted_variance ?? (frequency === "poisson" ? fittedFrequencyMean : observedFrequencyVariance);
  const totalClaims = counts.reduce((sum, value) => sum + value, 0);
  const totalPaid = aggregateLosses.reduce((sum, value) => sum + value, 0);
  const claimMean = apiResult?.mean_severity ?? totalPaid / totalClaims;
  const identityMean = apiResult?.component_expected_aggregate_loss ?? countMean * claimMean;
  const ordered = [...aggregateLosses].sort((a, b) => a - b);
  const pIndex = Math.max(0, Math.ceil(confidence * ordered.length) - 1);
  const pLoss = apiResult?.model_quantile ?? ordered[pIndex];
  const percentage = (value: number, digits = 0) => `${formatNumeric(value, digits, language)}${language === "fa" ? "٪" : "%"}`;
  const frequencyAxisMax = Math.ceil(Math.max(...data.months.map((row) => Math.max(row.total_claims, row.accidents))) / 20) * 20;
  const aggregateAxisMax = Math.ceil(data.summary.max_payout / 2_000) * 2_000;
  const quantileProbabilityLabel = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(confidence * 100);
  const quantileChartLabel = `Q${quantileProbabilityLabel}%(S)`;
  const ownSeverity = data.months.reduce((sum, row) => sum + row.own_amount, 0) / ownCounts.reduce((sum, value) => sum + value, 0);
  const liabilitySeverity = data.months.reduce((sum, row) => sum + row.third_amount, 0) / liabilityCounts.reduce((sum, value) => sum + value, 0);
  const ownExpected = apiResult?.components.find((item) => item.coverage === "own_damage")?.expected_aggregate_loss ?? mean(ownCounts) * ownSeverity;
  const liabilityExpected = apiResult?.components.find((item) => item.coverage === "third_party_liability")?.expected_aggregate_loss ?? mean(liabilityCounts) * liabilitySeverity;

  const observedCountMap = new Map<number, number>();
  frequencyCounts.forEach((value) => observedCountMap.set(value, (observedCountMap.get(value) ?? 0) + 1));
  const fallbackCountSupport = [...observedCountMap.keys()].sort((a, b) => a - b);
  const frequencySupport = frequencyResult?.values.support ?? fallbackCountSupport;
  const observedFrequency = frequencyResult?.values.observed_frequency ?? frequencySupport.map((value) => observedCountMap.get(value) ?? 0);
  const fittedFrequency = frequencyResult?.values.fitted_expected_frequency ?? [];
  const fallbackAggregate = histogram(aggregateLosses, 56);
  const aggregateDistribution = apiResult?.aggregate_distribution ?? {
    losses: fallbackAggregate.map(([loss]) => loss),
    empirical_probability: fallbackAggregate.map(([, count]) => count / aggregateLosses.length),
    model_probability: [],
  };

  const methodLabel = method === "panjer" ? t("Panjer recursion", "بازگشت پانژر") : method === "fft" ? t("FFT inversion", "وارون‌سازی FFT") : t("Monte Carlo", "مونت‌کارلو");
  const methodColor = method === "panjer" ? "#2b9a7d" : method === "fft" ? "#8b6ccf" : "#e08b3e";
  const frequencyLabel = frequency === "poisson" ? t("Poisson", "پواسون") : t("Negative binomial", "دوجمله‌ای منفی");
  const localizedFitMessage = frequencyResult?.message
    ? frequencyResult.message.includes("not overdispersed")
      ? t(
          "The observed sample is not overdispersed, so the negative-binomial fit is displayed at its Poisson limit.",
          "نمونه‌ی مشاهده‌شده بیش‌پراکنده نیست؛ بنابراین برازش دوجمله‌ای منفی در حد پواسون نمایش داده می‌شود.",
        )
      : t(
          `Observed Var(N) (${formatNumeric(observedFrequencyVariance, 2, language)}) exceeds observed E[N] (${formatNumeric(observedFrequencyMean, 2, language)}), while the fitted Poisson model forces Var(N) = E[N] = ${formatNumeric(fittedFrequencyMean, 2, language)}. The negative-binomial family can represent this observed overdispersion.`,
          `واریانس مشاهده‌شده‌ی N برابر ${formatNumeric(observedFrequencyVariance, 2, language)} و از میانگین مشاهده‌شده‌ی ${formatNumeric(observedFrequencyMean, 2, language)} بیشتر است؛ اما مدل پواسون به‌اجبار واریانس و میانگین برازش‌شده را هر دو برابر ${formatNumeric(fittedFrequencyMean, 2, language)} قرار می‌دهد. خانواده‌ی دوجمله‌ای منفی می‌تواند این پراکندگی بی‌ازحدی که مشاهده شده است را بازنمایی کند.`,
        )
    : null;
  const contributors = "محمد مهدوی نسب، علی جهانبان، محمدرضا سعیدخانی، محمد اشکوری";

  return (
    <div className="experience-stack">
      <ReferenceBand source={t("Modern Actuarial Risk Theory · Chapter 3 · Collective risk model", "Modern Actuarial Risk Theory · فصل ۳ · مدل ریسک جمعی")} formula={String.raw`S=\sum_{i=1}^{N}X_i,\quad E[S]=E[N]E[X]`}>
        {t("N counts policy claims and X is the paid severity of that same claim population. The chapter assumes identically distributed severities, independence among severities, and independence between N and X.", "N تعداد پرونده‌های خسارت بیمه‌نامه‌ای و X شدت پرداختی همان جامعه‌ی خسارت است. فصل فرض می‌کند شدت‌ها هم‌توزیع و مستقل‌اند و N نیز از X مستقل است.")}
      </ReferenceBand>

      <section className="control-strip" aria-label={t("Collective risk controls", "کنترل‌های مدل ریسک جمعی")}>
        <label><span>{t("Claim portfolio", "پرتفوی خسارت")}</span><select value={coverage} onChange={(event) => setCoverage(event.target.value as CollectiveCoverage)}><option value="total">{t("Stratified combined book", "کل پرتفو")}</option><option value="own_damage">{t("Own-damage claims", "خسارت‌های بدنه")}</option><option value="third_party_liability">{t("Liability claims", "خسارت‌های شخص ثالث")}</option></select></label>
        <label><span>{t("Frequency fit", "برازش فراوانی")}</span><select value={frequency} onChange={(event) => setFrequency(event.target.value as FrequencyModel)}><option value="poisson">{t("Poisson", "پواسون")}</option><option value="negative_binomial">{t("Negative binomial", "دوجمله‌ای منفی")}</option></select></label>
        <label><span>{t("Frequency view", "نمای فراوانی")}</span><select value={frequencyUnit} onChange={(event) => setFrequencyUnit(event.target.value as "claim" | "accident")}><option value="claim">{t("Policy claims · collective N", "پرونده خسارت · N جمعی")}</option><option value="accident">{t("Physical accidents · comparison", "حوادث فیزیکی · جهت مقایسه")}</option></select></label>
        <label><span>{t("Calculation route", "مسیر محاسباتی")}</span><select value={method} onChange={(event) => setMethod(event.target.value as CalculationMethod)}><option value="monte_carlo">{t("Monte Carlo resampling", "بازنمونه‌گیری مونت‌کارلو")}</option><option value="panjer">{t("Panjer recursion", "بازگشت پانژر")}</option><option value="fft">{t("FFT inversion", "وارون‌سازی FFT")}</option></select></label>
        <label className="range-control"><span>{t("Upper quantile", "چندک بالا")} <strong>{percentage(confidence * 100)}</strong></span><input type="range" min="0.8" max="0.99" step="0.01" value={confidence} onChange={(event) => setConfidence(Number(event.target.value))} /></label>
      </section>

      <div className="metric-grid four">
        <MetricCard label={<InlineMath equation={String.raw`E[N]`} />} value={formatNumeric(countMean, 2, language)} detail={t("Mean matching policy-claim count per month", "میانگین تعداد پرونده‌ی خسارت متناظر در ماه")} tone="blue" />
        <MetricCard label={<InlineMath equation={String.raw`E[X]`} />} value={money(claimMean)} detail={t("Mean paid severity for the same claims", "میانگین شدت پرداختی خسارت‌ها")} tone="teal" />
        <MetricCard label={<InlineMath equation={String.raw`E[S]=E[N]E[X]`} />} value={money(identityMean)} detail={t("Monthly mean from claim frequency × severity", "میانگین ماهانه برابر حاصل‌ضرب فراوانی و شدت خسارت")} tone="green" />
        <MetricCard label={<InlineMath equation={String.raw`Q_{${quantileProbabilityLabel}\%}(S)`} />} value={preciseQuantileMoney(pLoss)} detail={t(`${methodLabel} with ${frequencyLabel} frequency`, `${methodLabel} با فراوانی ${frequencyLabel}`)} tone="amber" />
      </div>

      <div className="panel-grid equal">
        <section className="panel collective-panel collective-frequency-panel">
          <div className="panel-heading"><div><ResultTag tone="green">{t("Observed + fitted", "مشاهده‌شده + برازش‌شده")}</ResultTag><h2>{t("Does the frequency family fit N?", "آیا خانواده‌ی فراوانی برای N مناسب است؟")}</h2><p>{frequencyUnit === "claim" ? t(`Bars are the 1,000 observed monthly claim counts; the line is the fitted ${frequencyLabel} expected number of months.`, `ستون‌ها تعداد خسارت مشاهده‌شده در ۱٬۰۰۰ ماه و خط، تعداد ماه مورد انتظار تحت برازش ${frequencyLabel} است.`) : t("This separate accident-count diagnostic never replaces policy-claim N in the aggregate-loss calculation.", "این بررسی جداگانه‌ی تعداد حادثه هرگز جای N، یعنی تعداد پرونده‌ی خسارت، را در محاسبه‌ی خسارت کل نمی‌گیرد.")}</p></div></div>
          <EChart label={frequencyUnit === "claim" ? t("Observed and fitted claim-count distribution", "توزیع مشاهده‌شده و برازش‌شده‌ی تعداد خسارت") : t("Observed and fitted accident-count distribution", "توزیع مشاهده‌شده و برازش‌شده‌ی تعداد حادثه")} option={{ animation: false, legend: { bottom: 0, textStyle: { fontSize: 13 } }, grid: { left: 60, right: 20, top: 24, bottom: 66 }, tooltip: { trigger: "axis" }, xAxis: { type: "value", min: 0, max: frequencyAxisMax, interval: 40, name: frequencyUnit === "claim" ? t("policy-claim count", "تعداد پرونده‌ی خسارت") : t("physical-accident count", "تعداد حادثه‌ی فیزیکی"), nameLocation: "middle", nameGap: 31, axisLabel: { fontSize: 13, formatter: (value: number) => formatNumeric(value, 0, language) } }, yAxis: { type: "value", name: t("months", "ماه‌ها"), axisLabel: { fontSize: 13, formatter: (value: number) => formatNumeric(value, 0, language) }, splitLine: { lineStyle: { color: "#e8edf3" } } }, series: [{ name: t("Observed", "مشاهده‌شده"), type: "bar", data: frequencySupport.map((value, index) => [value, observedFrequency[index] ?? 0]), barMaxWidth: 13, itemStyle: { color: "#9bb9ea", borderRadius: [3, 3, 0, 0] } }, ...(fittedFrequency.length ? [{ name: frequencyLabel, type: "line", data: frequencySupport.map((value, index) => [value, fittedFrequency[index] ?? 0]), showSymbol: false, smooth: true, lineStyle: { color: "#245ea8", width: 2.2 } }] : [])] }} />
          <dl className="compact-dl frequency-moment-table">
            <div><dt>{t("Observed", "مشاهده‌شده")} · <InlineMath equation={String.raw`E[N]`} /></dt><dd>{formatNumeric(observedFrequencyMean, 2, language)}</dd></div>
            <div><dt>{t("Observed", "مشاهده‌شده")} · <InlineMath equation={String.raw`\operatorname{Var}(N)`} /></dt><dd>{formatNumeric(observedFrequencyVariance, 2, language)}</dd></div>
            <div><dt>{t("Fitted model", "مدل برازش‌شده")} · <InlineMath equation={String.raw`E[N]`} /></dt><dd>{formatNumeric(fittedFrequencyMean, 2, language)}</dd></div>
            <div><dt>{t("Fitted model", "مدل برازش‌شده")} · <InlineMath equation={String.raw`\operatorname{Var}(N)`} /></dt><dd>{formatNumeric(fittedFrequencyVariance, 2, language)}</dd></div>
            <div><dt>{t("Observed dispersion · Var(N)/E[N]", "پراکندگی مشاهده‌شده · Var(N)/E[N]")}</dt><dd>{formatNumeric(observedDispersion, 3, language)}</dd></div>
            <div><dt>{t("AIC · student section 3.9", "AIC · بخش ۳.۹ ")}</dt><dd>{frequencyResult ? formatNumeric(frequencyResult.values.aic, 1, language) : "—"}</dd></div>
          </dl>
          <Notice kind="info" title={t("What is AIC?", "AIC چیست؟")}>{t("AIC is the Akaike Information Criterion used in the students' Section 3.9 code: AIC = 2k - 2 log(L̂). For models fitted to the same data, a lower AIC means a better likelihood-versus-complexity trade-off. It is a model-comparison diagnostic, not a loss or premium, and it is not introduced in the Chapter 3 textbook PDF.", "AIC معیار اطلاعات آکائیک است که در کد بخش ۳.۹  به‌صورت AIC = ۲k − ۲ log(L̂) آمده است. میان مدل‌هایی که روی داده‌ی یکسان برازش شده‌اند، AIC کمتر یعنی موازنه‌ی بهتر میان درست‌نمایی و پیچیدگی. این عدد فقط ابزار مقایسه‌ی مدل است، نه خسارت یا حق‌بیمه، و در  فصل ۳ معرفی نشده است.")}</Notice>
          {localizedFitMessage ? <Notice kind="warning" title={t("Fit limitation", "محدودیت برازش")}>{localizedFitMessage}</Notice> : null}
          <PanelCredit names={contributors} role={t("Section 3.9: Poisson and negative-binomial frequency fitting and model comparison.", "بخش ۳.۹: برازش فراوانی پواسون و دوجمله‌ای منفی و مقایسه‌ی مدل‌ها.")} />
        </section>

        <section className="panel collective-panel collective-aggregate-panel">
          <div className="panel-heading"><div><ResultTag tone="blue">{methodLabel}</ResultTag><h2>{t("Aggregate-loss distribution produced by the selected route", "توزیع خسارت کل حاصل از مسیر انتخاب‌شده")}</h2><p>{t(`The bars are the empirical 1,000-month distribution. The line is recalculated from the fitted ${frequencyLabel} claim frequency and empirical claim severities by ${methodLabel}.`, `ستون‌ها توزیع تجربی ۱٬۰۰۰ ماه‌اند. خط با فراوانی خسارت برازش‌شده‌ی ${frequencyLabel} و شدت‌های تجربی خسارت، از مسیر ${methodLabel} دوباره محاسبه می‌شود.`)}</p></div></div>
          <EChart label={t("Empirical and modeled aggregate insurer-paid loss", "خسارت کل پرداختی تجربی و مدل‌شده")} option={{ animation: false, legend: { bottom: 0, textStyle: { fontSize: 13 } }, grid: { left: 66, right: 24, top: 24, bottom: 68 }, tooltip: { trigger: "axis" }, xAxis: { type: "value", min: 0, max: aggregateAxisMax, interval: 2_000, name: t("aggregate loss · million tomans", "خسارت کل · میلیون تومان"), nameLocation: "middle", nameGap: 33, axisLabel: { fontSize: 13, formatter: (value: number) => value >= 1000 ? language === "fa" ? `${formatNumeric(value / 1000, 1, language)} میلیارد` : `${formatNumeric(value / 1000, 1, language)}bn` : formatNumeric(value, 0, language) } }, yAxis: { type: "value", name: t("probability per bin", "احتمال هر بازه"), axisLabel: { fontSize: 13, formatter: (value: number) => formatNumeric(value, 2, language) }, splitLine: { lineStyle: { color: "#e8edf3" } } }, series: [{ name: t("Empirical months", "ماه‌های تجربی"), type: "bar", data: aggregateDistribution.losses.map((loss, index) => [loss, aggregateDistribution.empirical_probability[index] ?? 0]), itemStyle: { color: "#a9b8ca", borderRadius: [3, 3, 0, 0] }, markLine: { silent: true, symbol: ["none", "none"], lineStyle: { color: "#d49a28", width: 2 }, label: { show: true, position: "insideEndTop", color: "#8c5a0c", fontSize: 13, fontWeight: 700, formatter: quantileChartLabel }, data: [{ xAxis: pLoss }] } }, ...(aggregateDistribution.model_probability.length ? [{ name: `${methodLabel} · ${frequencyLabel}`, type: "line", data: aggregateDistribution.losses.map((loss, index) => [loss, aggregateDistribution.model_probability[index] ?? 0]), showSymbol: false, smooth: method === "monte_carlo" ? 0.16 : true, lineStyle: { color: methodColor, width: 2.4 }, areaStyle: { color: `${methodColor}20` } }] : [])] }} />
          <dl className="compact-dl"><div><dt>{t("Modeled mean", "میانگین مدل‌شده")}</dt><dd>{apiResult ? money(apiResult.model_mean) : "—"}</dd></div><div><dt>{t("Modeled variance", "واریانس مدل‌شده")}</dt><dd>{apiResult ? formatNumeric(apiResult.model_variance, 0, language) : "—"}</dd></div><div><dt>{t("Empirical quantile", "چندک تجربی")}</dt><dd>{apiResult ? money(apiResult.empirical_quantile) : money(ordered[pIndex])}</dd></div>
          <div><dt>{t("Probability represented on grid", "احتمال پوشش‌داده‌شده روی چارت")}</dt><dd>{apiResult ? percentage(apiResult.represented_mass * 100, 4) : "—"}</dd></div>
          </dl>
          <Notice kind="info" title={t("Why Panjer and FFT can look the same", "چرا خروجی روش‌های پانژر و FFT ممکن است یکسان دیده شوند")}>{t("They are two numerical evaluations of the same fitted compound model, so close agreement is a validation result. Monte Carlo adds reproducible sampling error; changing the frequency family changes the fitted model itself.", "این دو روش عددی، یک مدل مرکب برازش‌شده را محاسبه می‌کنند؛ بنابراین نزدیکی نتایج آن‌ها نشانه‌ی درستی محاسبات است. از آن‌جایی که مونت‌کارلو خطای بازنمونه‌گیری بازتولیدپذیر دارد و تغییر خانواده‌ی فراوانی، خود مدل برازش‌شده را تغییر می‌دهد، نتیجه‌ی آن ممکن است کمی با دو روش قبل تفاوت داشته باشد.")}</Notice>
          <PanelCredit names={contributors} role={t("Sections 3.1–3.7: compound-loss simulation and moments, Panjer recursion, FFT inversion, and approximation checks.", "بخش‌های ۳.۱ تا ۳.۷: شبیه‌سازی و گشتاورهای خسارت مرکب، بازگشت پانژر، وارون‌سازی FFT و بررسی تقریب‌ها.")} />
        </section>
      </div>

      <div className={`panel-grid equal collective-audit-grid${coverage === "total" ? "" : " single"}`}>
        <section className="panel collective-severity-panel">
          <div className="panel-heading"><div><ResultTag tone="green">{t("Section 3.9 · maximum likelihood", "بخش ۳.۹ · درست‌نمایی بیشینه")}</ResultTag><h2>{t("Severity-family audit", "آنالیز خانواده‌های شدت خسارت")}</h2><p>{t("All candidates use the same selected claim-level paid severities. Lower AIC means a better relative likelihood/complexity trade-off on this synthetic sample; it is not proof of the true tail law.", "همه‌ی موارد از شدت پرداختی خسارت‌های انتخاب‌شده استفاده می‌کنند. AIC کمتر، نمایان‌گر موازنه‌ی نسبی بهتر میان درست‌نمایی و پیچیدگی در این نمونه‌ی تصنعی است و اثبات قانون واقعی دم نیست.")}</p></div></div>
          <div className="severity-fit-table" role="table" aria-label="severity fit comparison">
            <div className="severity-fit-head" role="row">
              <span>{t("Model", "مدل")}</span>
              <span>{t("Fitted parameters", "پارامترهای برازش‌شده")}</span>
              <span>{t("AIC comparison", "مقایسه‌ی AIC")}</span>
            </div>
            {(apiResult?.severity_fits ?? []).map((fit) => <div className={`severity-fit-row${fit.delta_aic < 1e-6 ? " best" : ""}`} role="row" key={fit.model}>
              <strong className="severity-fit-name">{t(...(severityLabels[fit.model] ?? [fit.model, fit.model]))}</strong>
              <span className="severity-fit-parameters">
                {Object.entries(fit.parameters).slice(0, 3).map(([key, value]) => <span className="severity-parameter" key={key}>
                  <small>{t(...(parameterLabels[key] ?? [key, key]))}</small>
                  <b>{formatParameterValue(value, language)}</b>
                </span>)}
              </span>
              <strong className={`severity-fit-score${fit.delta_aic < 1e-6 ? " best" : ""}`}>{fit.delta_aic < 1e-6
                ? <><span>{formatNumeric(fit.aic, 1, language)}</span><small>{t("Best AIC", "بهترین AIC")}</small></>
                : `ΔAIC ${formatNumeric(fit.delta_aic, 1, language)}`}</strong>
            </div>)}
          </div>
          {!apiResult ? <p className="panel-footnote">{t("Fit results appear when the Python calculation service responds.", "نتایج برازش پس از پاسخ سرویس محاسبات پایتون نمایش داده می‌شود.")}</p> : null}
          <PanelCredit names={contributors} role={t("Section 3.9: maximum-likelihood severity fitting and AIC comparison.", "بخش ۳.۹: برازش درست‌نمایی بیشینه‌ی شدت خسارت و مقایسه با AIC.")} />
        </section>

        {coverage === "total" ? <section className="panel collective-components-panel">
          <div className="panel-heading"><div><ResultTag tone="slate">{t("Stratified combined book", "کل پرتفو")}</ResultTag><h2>{t("Aggregate loss is the sum of the two coverage losses", "خسارت کل؛ حاصل جمع خسارت‌های بدنه و شخص ثالث")}</h2><p>{t("Own-damage and liability keep separate fitted frequencies and severities. Their modeled aggregate losses are then added; this preserves the coverage-specific identity and avoids multiplying accident counts by a blended severity.", "خسارت‌های بدنه و شخص ثالث فراوانی و شدت برازش‌شده‌ی جداگانه‌ی خود را حفظ می‌کنند و سپس خسارت‌های کل آن‌ها جمع می‌شود؛ در نتیجه انسجام هر پوشش حفظ و از ضرب تعداد حادثه در شدت ترکیبی جلوگیری می‌شود.")}</p></div></div>
          <div className="reconciliation-table collective-components-table" role="table" aria-label="collective component identity">
            <div role="row"><span>{t("Own damage", "بدنه")} · <InlineMath equation={String.raw`E[N]E[X]`} /></span><strong>{money(ownExpected)}</strong></div>
            <div role="row"><span>{t("Third-party liability", "شخص ثالث")} · <InlineMath equation={String.raw`E[N]E[X]`} /></span><strong>{money(liabilityExpected)}</strong></div>
            <div role="row"><span>{t("Component sum", "جمع اجزا")}</span><strong>{money(ownExpected + liabilityExpected)}</strong></div>
            <div role="row"><span>{t("Empirical aggregate-loss mean", "میانگین تجربی خسارت کل")}</span><strong>{money(data.summary.mean_payout)}</strong></div>
          </div>
          <PanelCredit names={contributors} role={t("Section 3.4: the sum of independent compound losses, adapted here to own-damage and liability coverages.", "بخش ۳.۴: جمع خسارت‌های مرکب مستقل، با سازگارسازی برای پوشش‌های بدنه و شخص ثالث.")} />
        </section> : null}
      </div>

      <div className="formula-grid">
        <Formula equation={String.raw`E[S]=E[N]E[X]`} label={t("The mean identity requires N and the severities to be independent and the severities to share one distribution.", "انسجام میانگین نیازمند استقلال N از شدت‌ها و هم‌توزیع بودن شدت‌های خسارت است.")} hint={t("Chapter 3.2", "بخش ۳.۲")} />
        <Formula equation={String.raw`\operatorname{Var}(S)=E[N]\operatorname{Var}(X)+\operatorname{Var}(N)(E[X])^2`} label={t("This is the general compound variance. Only for Poisson N does it reduce to λE[X²].", "واریانس عمومی مدل مرکب که فقط برای N پواسون به λE[X²] ساده می‌شود.")} hint={t("General variance", "واریانس عمومی")} />
        <Formula equation={String.raw`g_s=\frac{1}{1-af_0}\sum_{j=1}^{s}\left(a+\frac{bj}{s}\right)f_jg_{s-j}`} label={t("Panjer recursively builds aggregate probability gₛ from discretized severity probabilities fⱼ for a frequency in the (a,b,0) class.", "پانژر احتمال کل gₛ را از احتمال‌های شدت گسسته‌ی fⱼ و فراوانی عضو کلاس (a,b,0) به‌صورت بازگشتی می‌سازد.")} hint={t("Chapter 3.5", "بخش ۳.۵")} />
        <Formula equation={String.raw`g_S=\mathcal F^{-1}\!\left[P_N\!\left(\mathcal F[f_X]\right)\right]`} label={t("FFT evaluates the frequency pgf on the transformed severity grid and inverts it to aggregate probabilities.", "FFT تابع مولد احتمال فراوانی را روی تبدیل شدت ارزیابی و برای رسیدن به احتمال‌های خسارت کل وارون می‌کند.")} hint={t("Chapter 3.6", "بخش ۳.۶")} />
        <Formula equation={String.raw`Q_p^{\mathrm{Normal}}=E[S]+\sqrt{\operatorname{Var}(S)}\,\Phi^{-1}(p)`}
        label={t(``,``)}
        // label={t(`The current normal moment diagnostic is ${apiResult ? money(apiResult.normal_approximation_quantile) : "available from the API"}; it is an approximation, not a fourth exact route.`, `بررسی گشتاوری نرمال فعلی ${apiResult ? money(apiResult.normal_approximation_quantile) : "از API دریافت می‌شود"} است؛ این یک تقریب است، نه مسیر دقیق چهارم.`)}

        hint={t("Chapter 3.7", "بخش ۳.۷")} />
        <Formula equation={String.raw`\pi_S(d)=E[(S-d)_+]`} label={t("Chapter 3.10 continues from this aggregate distribution to the net stop-loss premium; the linked reinsurance page evaluates it on all 1,000 months.", "بخش ۳.۱۰ از همین توزیع خسارت کل به حق‌بیمه خالص حد خسارت می‌رسد؛ صفحه‌ی اتکایی آن را روی همه‌ی ۱٬۰۰۰ ماه محاسبه می‌کند.")} hint={t("Chapter 3.10", "بخش ۳.۱۰")} />
      </div>

      {/* <Notice kind="success" title={t("Formula and data units reconcile", "فرمول و واحدهای داده تطبیق دارند")}>{t("Every aggregate route uses fitted policy-claim frequency with claim-level paid severity. The combined book adds the own-damage and liability components. Accident frequency remains a diagnostic only.", "هر مسیر تجمیع از فراوانی برازش‌شده‌ی پرونده‌ی خسارت و شدت پرداختی در سطح همان خسارت استفاده می‌کند. کل پرتفو از جمع اجزای بدنه و شخص ثالث ساخته می‌شود و فراوانی حادثه فقط نقش بررسی تشخیصی دارد.")}</Notice> */}
      {apiError || frequencyError ? <Notice kind="warning" title={t("Authoritative API unavailable", "API مرجع در دسترس نیست")}>{t("Direct empirical bars remain visible, but fitted curves, numerical-route results, and fit diagnostics require the Python service.", "ستون‌های تجربی مستقیم همچنان دیده می‌شوند، اما منحنی‌های برازش‌شده، نتیجه‌ی مسیرهای عددی و آنالیز برازش به سرویس پایتون نیاز دارند.")}</Notice> : null}
      <Contributor names={contributors} summary={t("The Chapter 3 submissions were consolidated into a coverage-stratified compound-loss workflow: Poisson and negative-binomial claim-frequency fits; five severity-family fits with AIC comparison; Panjer, FFT, and reproducible Monte Carlo routes; moment and Normal-approximation checks; own-damage plus liability reconciliation; and empirical stop-loss continuation. Invalid sparse-vector normalization and fragile hard-coded paths were not reused, and accident frequency remains diagnostic rather than replacing policy-claim frequency.", "پیاده‌سازی‌های فصل ۳ در یک فرایند خسارت مرکبِ تفکیک‌شده بر اساس پوشش یکپارچه شده‌اند: برازش فراوانی پرونده‌ی خسارت با پواسون و دوجمله‌ای منفی، برازش پنج خانواده‌ی شدت و مقایسه با AIC، مسیرهای پانژر و FFT و مونت‌کارلوی بازتولیدپذیر، کنترل گشتاورها و تقریب نرمال، تطبیق جمع خسارت بدنه و شخص ثالث و ادامه‌ی تجربی حد خسارت.")} />
    </div>
  );
}
