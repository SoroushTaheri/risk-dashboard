"use client";

import { useState, type CSSProperties } from "react";
import { EChart } from "../EChart";
import { Formula, InlineMath } from "../Formula";
import { tr, useLanguage } from "../i18n";
import type { PortfolioData } from "../types";
import { Contributor, MetricCard, Notice, PanelCredit, ReferenceBand, ResultTag, formatMoney } from "../ui";
import { apiCoverage, useActuarialApi } from "../useActuarialApi";
import { mean, updateMonth, valuesFor, variance, type Coverage } from "./helpers";

type UtilityApiResult = {
  certainty_equivalent: { values: { maximum_acceptable_premium: number; expected_loss: number; absolute_risk_aversion_after_expected_loss: number } };
  reinsurance: { values: { retained_mean: number; retained_variance: number; retained_sd: number; net_stop_loss_premium: number; identity_max_error: number } };
  reinsurance_budget: { values: { maximum_acceptable_premium: number; absolute_risk_aversion_after_expected_loss: number } };
  comparison: UtilityComparison[];
};

type UtilityName = "exponential" | "logarithmic" | "power";

type UtilityComparison = {
  utility: UtilityName;
  maximum_acceptable_premium: number;
  expected_ceded_loss: number;
  absolute_risk_aversion_at_wealth: number;
  absolute_risk_aversion_after_expected_loss: number;
};

const WEALTH = 10_000;
const UTILITY_NAMES: UtilityName[] = ["exponential", "logarithmic", "power"];

function utilityParameters(utility: UtilityName, riskAversion: number) {
  if (utility === "exponential") return { alpha: riskAversion };
  if (utility === "logarithmic") return { alpha: (1 / riskAversion) - WEALTH };
  return { c: 1 - riskAversion * WEALTH };
}

function utilityValue(utility: UtilityName, terminalWealth: number, riskAversion: number) {
  const parameters = utilityParameters(utility, riskAversion);
  if (utility === "exponential") return -parameters.alpha! * Math.exp(-parameters.alpha! * terminalWealth);
  if (utility === "logarithmic") return Math.log(parameters.alpha! + terminalWealth);
  return terminalWealth ** parameters.c!;
}

function riskAversionAt(utility: UtilityName, terminalWealth: number, riskAversion: number) {
  const parameters = utilityParameters(utility, riskAversion);
  if (utility === "exponential") return parameters.alpha!;
  if (utility === "logarithmic") return 1 / (parameters.alpha! + terminalWealth);
  return (1 - parameters.c!) / terminalWealth;
}

function browserReinsurancePremium(
  utility: UtilityName,
  gross: number[],
  retained: number[],
  riskAversion: number,
) {
  if (utility === "exponential") {
    const entropicPremium = (values: number[]) => {
      const scaled = values.map((value) => riskAversion * value);
      const pivot = Math.max(...scaled);
      return (pivot + Math.log(mean(scaled.map((value) => Math.exp(value - pivot))))) / riskAversion;
    };
    return entropicPremium(gross) - entropicPremium(retained);
  }
  if (gross.every((loss, index) => Math.abs(loss - retained[index]) < 1e-9)) return 0;
  const parameters = utilityParameters(utility, riskAversion);
  const target = mean(gross.map((loss) => utilityValue(utility, WEALTH - loss, riskAversion)));
  let low = 0;
  let high = utility === "logarithmic"
    ? WEALTH + parameters.alpha! - Math.max(...retained)
    : WEALTH - Math.max(...retained);
  high *= 1 - Number.EPSILON;
  for (let index = 0; index < 100; index += 1) {
    const midpoint = (low + high) / 2;
    const candidate = mean(retained.map((loss) => utilityValue(utility, WEALTH - midpoint - loss, riskAversion)));
    if (candidate > target) low = midpoint;
    else high = midpoint;
  }
  return (low + high) / 2;
}

export function UtilityExperience({ data }: { data: PortfolioData }) {
  const { language } = useLanguage();
  const t = (en: string, fa: string) => tr(language, en, fa);
  const money = (value: number, compact = true) => formatMoney(value, compact, language);
  const [coverage, setCoverage] = useState<Coverage>("total");
  const [retention, setRetention] = useState(data.summary.p95_payout);
  const [riskAversion, setRiskAversion] = useState(5);
  const [utility, setUtility] = useState<UtilityName>("exponential");
  const localRiskAversion = riskAversion / (WEALTH * 11);
  const { data: apiResult } = useActuarialApi<UtilityApiResult>("/api/utility-reinsurance", {
    coverage: apiCoverage(coverage), wealth: WEALTH, risk_aversion: localRiskAversion, utility, retention, severity_model: "empirical",
  });
  const gross = valuesFor(data.months, coverage);
  const retained = gross.map((loss) => Math.min(loss, retention));
  const ceded = gross.map((loss, index) => loss - retained[index]);
  const browserComparison = UTILITY_NAMES.map((name): UtilityComparison => ({
    utility: name,
    maximum_acceptable_premium: browserReinsurancePremium(name, gross, retained, localRiskAversion),
    expected_ceded_loss: mean(ceded),
    absolute_risk_aversion_at_wealth: riskAversionAt(name, WEALTH, localRiskAversion),
    absolute_risk_aversion_after_expected_loss: riskAversionAt(name, WEALTH - mean(gross), localRiskAversion),
  }));
  const comparison = apiResult?.comparison ?? browserComparison;
  const selectedComparison = comparison.find((row) => row.utility === utility) ?? browserComparison[0];
  const grossMean = apiResult?.certainty_equivalent.values.expected_loss ?? mean(gross);
  const retainedMean = apiResult?.reinsurance.values.retained_mean ?? mean(retained);
  const retainedSd = apiResult?.reinsurance.values.retained_sd ?? Math.sqrt(variance(retained));
  const stopLoss = apiResult?.reinsurance.values.net_stop_loss_premium ?? mean(ceded);
  const maximumPremium = apiResult?.reinsurance_budget.values.maximum_acceptable_premium ?? selectedComparison.maximum_acceptable_premium;
  const minimumObservedLoss = Math.min(...gross);
  const utilityLoading = Math.max(0, maximumPremium - stopLoss);
  const utilityLoadingRate = stopLoss > 0 ? utilityLoading / stopLoss : 0;
  const zeroRetainedVolatility = retention <= minimumObservedLoss + 1e-9;
  const preciseMoney = (value: number) => {
    const locale = language === "fa" ? "fa-IR" : "en-US";
    if (Math.abs(value) >= 1000) {
      const formatted = new Intl.NumberFormat(locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(value / 1000);
      return `${formatted} ${t("billion tomans", "میلیارد تومان")}`;
    }
    return money(value, false);
  };
  const riskEquation = String.raw`r(w)=${(localRiskAversion / 0.00001).toFixed(2)}\times 10^{-5}`;
  const lowerPriceBoundary = Math.min(stopLoss, maximumPremium);
  const upperPriceBoundary = Math.max(stopLoss, maximumPremium);
  const priceBoundaryGap = upperPriceBoundary - lowerPriceBoundary;
  const priceScalePadding = Math.max(priceBoundaryGap * 0.25, upperPriceBoundary * 0.025, 1);
  const priceScaleMin = Math.max(0, lowerPriceBoundary - priceScalePadding);
  const priceScaleMax = Math.max(priceScaleMin + 1, upperPriceBoundary + priceScalePadding);
  const priceScaleSpan = priceScaleMax - priceScaleMin;
  const pricePosition = (value: number) => Math.min(100, Math.max(0, ((value - priceScaleMin) / priceScaleSpan) * 100));
  const netPremiumPosition = pricePosition(stopLoss);
  const maximumPremiumPosition = pricePosition(maximumPremium);
  const agreementStart = Math.min(netPremiumPosition, maximumPremiumPosition);
  const agreementWidth = Math.abs(maximumPremiumPosition - netPremiumPosition);
  const agreementPossible = stopLoss <= maximumPremium + 1e-9;
  const curve = Array.from({ length: 24 }, (_, index) => {
    const level = data.summary.max_payout * (index + 1) / 25;
    const retainedLosses = gross.map((loss) => Math.min(loss, level));
    return { retention: level, retained: mean(retainedLosses), ceded: mean(gross.map((loss, i) => loss - retainedLosses[i])) };
  });
  const contributors = "ابوالفضل اقراری، حامد اشراقی";
  const utilityLabels: Record<UtilityName, string> = {
    exponential: t("Exponential / CARA", "نمایی / CARA"),
    logarithmic: t("Logarithmic", "لگاریتمی"),
    power: t("Power", "توانی"),
  };
  const utilityDetails = {
    exponential: {
      expression: String.raw`u(z)=-\alpha e^{-\alpha z}`,
      risk: String.raw`r(z)=-\frac{u''(z)}{u'(z)}=\alpha`,
      parameter: String.raw`\alpha=${(localRiskAversion / 0.00001).toFixed(2)}\times 10^{-5}`,
      property: t("Constant absolute risk aversion (CARA): the coefficient does not change with wealth.", "ریسک‌گریزی مطلق ثابت (CARA): ضریب با تغییر ثروت عوض نمی‌شود."),
      domain: t("All real wealth outcomes", "همه مقادیر"),
    },
    logarithmic: {
      expression: String.raw`u(z)=\log(a+z)`,
      risk: String.raw`r(z)=\frac{1}{a+z}`,
      parameter: String.raw`a=${((1 / localRiskAversion) - WEALTH).toFixed(2)}`,
      property: t("Decreasing absolute risk aversion: risk aversion rises when wealth falls.", "ریسک‌گریزی مطلق کاهنده: با کاهش ثروت، ریسک‌گریزی بیشتر می‌شود."),
      domain: String.raw`a+z>0`,
    },
    power: {
      expression: String.raw`u(z)=z^c`,
      risk: String.raw`r(z)=\frac{1-c}{z}`,
      parameter: String.raw`c=${(1 - localRiskAversion * WEALTH).toFixed(3)}`,
      property: t("Constant relative risk aversion (CRRA); absolute risk aversion rises when wealth falls.", "ریسک‌گریزی نسبی ثابت (CRRA)؛ با کاهش ثروت، ریسک‌گریزی مطلق بیشتر می‌شود."),
      domain: String.raw`z>0,\quad 0<c\leq1`,
    },
  }[utility];
  const formatRiskAversion = (value: number) => {
    const scaled = new Intl.NumberFormat(language === "fa" ? "fa-IR" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value * 100_000);
    return <span className="localized-scientific"><bdi>{scaled}</bdi><span>×</span><bdi>{language === "fa" ? "۱۰" : "10"}</bdi><sup>{language === "fa" ? "−۵" : "−5"}</sup></span>;
  };
  const formatPercent = (value: number, digits: number) => {
    const formatted = new Intl.NumberFormat(language === "fa" ? "fa-IR" : "en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
    return `${formatted}${language === "fa" ? "٪" : "%"}`;
  };
  const riskLevelLabel = new Intl.NumberFormat(language === "fa" ? "fa-IR" : "en-US").format(riskAversion);
  const riskLevelMaximum = new Intl.NumberFormat(language === "fa" ? "fa-IR" : "en-US").format(10);

  return (
    <div className="experience-stack">
      <ReferenceBand source={t("Modern Actuarial Risk Theory · Chapter 1 · Utility and insurance", "Modern Actuarial Risk Theory · فصل ۱ · تابع مطلوبیت")} formula={String.raw`${utilityDetails.expression},\quad E[u(w-X)]=E[u(w-P_C^+-X_R)]`}>
        {t("Compare three textbook utility functions on the same 1,000-month empirical loss sample. Retention splits every loss into retained and ceded layers.", "سه تابع مطلوبیت کتاب را روی همان نمونه تجربی ۱٬۰۰۰ ماهه مقایسه کنید. حد نگهداری هر خسارت را به لایه نگهداری‌شده و واگذارشده تقسیم می‌کند.")}
      </ReferenceBand>
      <Notice kind="info" title={t("What this page is for", "هدف این صفحه چیست؟")}>
        {t("Choose a utility function, then compare the ceded layer's expected cost with the insurer's maximum acceptable premium. For a fair comparison, the slider gives all three functions the same absolute risk aversion at starting wealth", "تابع مطلوبیت را انتخاب کنید و سپس هزینه مورد انتظار لایه واگذارشده را با حداکثر حق‌بیمه قابل‌قبول بیمه‌گر مقایسه کنید. برای مقایسه منصفانه، با حرکت دادن اسلایدرها، ضریب ریسک‌گریزی مطلق هر سه تابع در ثروت اولیه یکسان می‌ماند:")}{" "}
        <InlineMath equation={String.raw`w=10{,}000`} />, <InlineMath equation={riskEquation} />.
      </Notice>
      <section className="control-strip" aria-label={t("Utility and reinsurance controls", "کنترل‌های مطلوبیت و بیمه اتکایی")}>
        <label><span>{t("Utility function", "تابع مطلوبیت")}</span><select value={utility} onChange={(event) => setUtility(event.target.value as UtilityName)}><option value="exponential">{utilityLabels.exponential}</option><option value="logarithmic">{utilityLabels.logarithmic}</option><option value="power">{utilityLabels.power}</option></select></label>
        <label><span>{t("Loss variable", "متغیر خسارت")}</span><select value={coverage} onChange={(event) => setCoverage(event.target.value as Coverage)}><option value="total">{t("Total insurer-paid loss", "کل خسارت پرداختی بیمه‌گر")}</option><option value="own">{t("Own-damage paid loss", "خسارت پرداختی بدنه")}</option><option value="third">{t("Liability paid loss", "خسارت پرداختی شخص ثالث")}</option></select></label>
        {/* The loss basis is intentionally fixed to the full empirical monthly sample, so its read-only dropdown is not rendered. */}
        {/* <label><span>{t("Loss basis", "مبنای خسارت")}</span><select value="empirical" disabled><option value="empirical">{t("Full monthly empirical sample (fixed)", "نمونه کامل تجربی ماهانه (ثابت)")}</option></select></label> */}
        <label className="range-control"><span>{t("Comparable risk aversion", "ریسک‌گریزی")} <strong>{riskLevelLabel}/{riskLevelMaximum}</strong></span><input type="range" min="1" max="10" value={riskAversion} onChange={(event) => { const value = Number(event.target.value); setRiskAversion(value); updateMonth("riskAversion", value); }} /></label>
        <label className="range-control wide"><span>{t("Retention", "حد نگهداری")} <strong>{money(retention)}</strong></span><input type="range" min={Math.max(100, data.summary.mean_payout * 0.15)} max={data.summary.max_payout} step={50} value={retention} onChange={(event) => { const value = Number(event.target.value); setRetention(value); updateMonth("retention", value); }} /></label>
      </section>
      <div className="utility-explainer-grid">
        <section className="panel utility-function-card">
          <div className="panel-heading"><div><ResultTag tone="blue">{t("Selected function", "تابع انتخاب‌شده")}</ResultTag><h2>{utilityLabels[utility]}</h2><p>{utilityDetails.property}</p></div></div>
          <div className="utility-expression"><InlineMath equation={utilityDetails.expression} /></div>
          <dl className="compact-dl">
            <div><dt>{t("Absolute risk aversion", "ریسک‌گریزی مطلق")}</dt><dd><InlineMath equation={utilityDetails.risk} /></dd></div>
            <div><dt>{t("Current parameter", "پارامتر فعلی")}</dt><dd><InlineMath equation={utilityDetails.parameter} /></dd></div>
            <div><dt>{t("Domain", "دامنه")}</dt><dd>{utility === "exponential" ? utilityDetails.domain : <InlineMath equation={utilityDetails.domain} />}</dd></div>
          </dl>
        </section>
        <section className="panel utility-calculation-card">
          <div className="panel-heading"><div><ResultTag tone="green">{t("Where utility enters", "نقش مطلوبیت")}</ResultTag><h2>{t("From monthly losses to the premium", "از خسارت ماهانه تا حق‌بیمه")}</h2></div></div>
          <ol className="utility-steps">
            <li><span>1</span><p>{t("Turn each gross loss into terminal wealth and score it with the selected function:", "هر خسارت ناخالص را به ثروت نهایی تبدیل و با تابع انتخاب‌شده امتیازدهی می‌کنیم:")} <InlineMath equation={String.raw`u(w-X_i)`} />.</p></li>
            <li><span>2</span><p>{t("Average those 1,000 utility scores:", "میانگین ۱٬۰۰۰ امتیاز مطلوبیت را می‌گیریم:")} <InlineMath equation={String.raw`\frac1n\sum_i u(w-X_i)`} />.</p></li>
            <li><span>3</span><p>{t("Find the largest reinsurance premium that gives the same average utility after retaining", "بزرگ‌ترین حق‌بیمه اتکایی را پیدا می‌کنیم که پس از نگهداری خسارت، همان میانگین مطلوبیت را بدهد:")} <InlineMath equation={String.raw`X_R`} />: <InlineMath equation={String.raw`E[u(w-X)]=E[u(w-P_C^+-X_R)]`} />.</p></li>
          </ol>
        </section>
      </div>
      <div className="metric-grid four">
        <MetricCard label={<InlineMath equation={String.raw`E[X]`} />} value={money(grossMean)} detail={<>{t("Mean insurer-paid loss across all 1,000 months for the selected coverage", "میانگین خسارت پرداختی بیمه‌گر در کل ۱٬۰۰۰ ماه برای پوشش انتخاب‌شده")}</>} tone="blue" />
        <MetricCard label={<InlineMath equation={String.raw`E[X_R]`} />} value={money(retainedMean)} detail={<>{t("Mean retained loss", "میانگین خسارت نگهداری‌شده")}{" "}<InlineMath equation={String.raw`E[\min(X,d)]`} />{" "}{t("across all 1,000 months", "در کل ۱٬۰۰۰ ماه")}</>} tone="teal" />
        <MetricCard label={<InlineMath equation={String.raw`\pi_X(d)`} />} value={preciseMoney(stopLoss)} detail={<>{t("Minimum net premium", "حداقل حق‌بیمه خالص")}{" "}<InlineMath equation={String.raw`E[X_C]`} />{" "}{t("before expenses or a risk margin", "پیش از هزینه و حاشیه ریسک")}</>} tone="amber" />
        <MetricCard label={<InlineMath equation={String.raw`P_C^+`} />} value={preciseMoney(maximumPremium)} detail={<>{t("Maximum acceptable premium for the ceded layer under", "حداکثر حق‌بیمه قابل‌قبول برای لایه واگذارشده با مطلوبیت")}{" "}<InlineMath equation={utilityDetails.expression} /></>} tone="green" />
      </div>
      <section className="panel utility-comparison-panel">
        <div className="panel-heading"><div><ResultTag tone="slate">{t("Direct comparison", "مقایسه مستقیم")}</ResultTag><h2>{t("Same starting risk aversion, different premium outcomes", "ریسک‌گریزی اولیه یکسان، نتایج متفاوت حق‌بیمه")}</h2><p>{t("All rows start at the same r(w). Logarithmic and power utility become more risk averse after wealth falls, but at different rates. Therefore, stronger post-loss risk aversion produces both a higher maximum acceptable premium and a larger risk margin above expected ceded loss.", "همه ردیف‌ها از r(w) یکسان شروع می‌شوند. مطلوبیت لگاریتمی و توانی پس از کاهش ثروت با نرخ‌های متفاوت ریسک‌گریزتر می‌شوند. در نتیجه، هرچه ریسک‌گریزی پس از خسارت بیشتر باشد، هم حداکثر حق‌بیمه قابل‌قبول و هم حاشیه ریسک نسبت به امید خسارت واگذارشده بیشتر می‌شود.")}</p></div></div>
        <div className="utility-comparison-table" aria-label={t("Utility function premium comparison", "مقایسه حق‌بیمه توابع مطلوبیت")}>
          <div className="utility-comparison-row utility-comparison-head"><span>{t("Utility", "مطلوبیت")}</span><span>{t("r at starting wealth", "r در ثروت اولیه")}</span><span>{t("r after average loss", "r پس از خسارت میانگین")}</span><span>{t("Maximum premium", "حداکثر حق‌بیمه")}</span><span>{t("Risk margin", "حاشیه ریسک")}</span></div>
          {comparison.map((row) => (
            <button className={`utility-comparison-row ${row.utility === utility ? "selected" : ""}`} type="button" key={row.utility} onClick={() => setUtility(row.utility)} aria-pressed={row.utility === utility}>
              <strong>{utilityLabels[row.utility]}</strong>
              <span>{formatRiskAversion(row.absolute_risk_aversion_at_wealth)}</span>
              <span>{formatRiskAversion(row.absolute_risk_aversion_after_expected_loss)}</span>
              <span>{preciseMoney(row.maximum_acceptable_premium)}</span>
              <span>{preciseMoney(Math.max(0, row.maximum_acceptable_premium - stopLoss))}</span>
            </button>
          ))}
        </div>
        <small className="utility-comparison-note">{t("Select a row or use the dropdown to apply that utility function to the premium interval below.", "برای اعمال تابع مطلوبیت در بازه حق‌بیمه پایین، یک ردیف یا گزینه فهرست را انتخاب کنید.")}</small>
      </section>
      <div className="panel-grid two-thirds utility-analysis-grid">
        <section className="panel">
          <div className="panel-heading"><div><ResultTag tone="green">{t("Empirical", "تجربی")}</ResultTag><h2>{t("How retention splits expected loss", "حد نگهداری چگونه امید خسارت را تقسیم می‌کند")}</h2><p>{t("For every retention,", "برای هر حد نگهداری،")}{" "}<InlineMath equation={String.raw`E[X]=E[X_R]+E[X_C]`} />{" "}{t("holds. A lower retention transfers more expected loss and reduces retained volatility", "برقرار است. حد نگهداری کمتر، امید خسارت بیشتری را منتقل می‌کند و نوسان خسارت نگهداری‌شده را کاهش می‌دهد:")}{" "}<InlineMath equation={String.raw`\operatorname{SD}(X_R)`} />.</p></div></div>
          <EChart label={t("Expected retained and ceded loss over retention", "امید خسارت نگهداری‌شده و واگذارشده بر حسب حد نگهداری")} option={{ animation: false, color: ["#29957c", "#d49a28"], grid: { left: 62, right: 20, top: 36, bottom: 48 }, legend: { top: 0 }, tooltip: { trigger: "axis", valueFormatter: (value: unknown) => money(Number(value), false) }, xAxis: { type: "category", data: curve.map((point) => point.retention >= 1000 ? `${(point.retention / 1000).toFixed(1)}bn` : `${Math.round(point.retention)}m`), axisLabel: { interval: 3 }, name: t("retention", "حد نگهداری"), nameLocation: "middle", nameGap: 30 }, yAxis: { type: "value", axisLabel: { formatter: (value: number) => value >= 1000 ? `${(value / 1000).toFixed(1)}bn` : `${Math.round(value)}m` }, splitLine: { lineStyle: { color: "#e8edf3" } } }, series: [{ name: t("Expected retained loss", "امید خسارت نگهداری‌شده"), type: "line", smooth: true, showSymbol: false, data: curve.map((point) => point.retained) }, { name: t("Expected ceded loss", "امید خسارت واگذارشده"), type: "line", smooth: true, showSymbol: false, data: curve.map((point) => point.ceded) }] }} />
          <PanelCredit names={contributors} role={t("Utility, certainty-equivalent, and stop-loss calculations.", "محاسبات مطلوبیت، معادل قطعی و اتکایی مازاد خسارت.")} />
        </section>
        <section className="panel decision-panel">
          <div className="panel-heading"><div><ResultTag tone="amber">{t("Premium interval", "بازه حق‌بیمه")}</ResultTag><h2>{t("A practical reinsurance price window", "بازه عملی قیمت بیمه اتکایی")}</h2><p>{t("The zoomed scale compares the reinsurer's minimum net price with the insurer's maximum acceptable price. A mutually acceptable contract satisfies", "مقیاس بزرگ‌نمایی‌شده، حداقل قیمت خالص بیمه‌گر اتکایی را با حداکثر قیمت قابل‌قبول بیمه‌گر مقایسه می‌کند. قیمت مورد قبول هر دو طرف باید شرط زیر را داشته باشد:")}{" "}<InlineMath equation={String.raw`E[X_C]\leq P\leq P_C^+`} />.</p></div></div>
          <div className="deal-interval">
            <div className="price-scale-heading"><strong>{t("Zoomed negotiation scale", "مقیاس بزرگ‌نمایی‌شده مذاکره")}</strong><span>{t("The axis does not start at zero", "محور از صفر آغاز نمی‌شود")}</span></div>
            <div className="price-legend" aria-label={t("Price chart legend", "راهنمای نمودار قیمت")}>
              <span><i className="legend-net-marker" aria-hidden="true" /><span>{t("Black line: reinsurer's net break-even price", "خط سیاه: قیمت خالص سربه‌سر بیمه‌گر اتکایی")}{" "}<InlineMath equation={String.raw`E[X_C]`} /></span></span>
              <span><i className="legend-agreement-window" aria-hidden="true" /><span>{t("Green segment: mutually acceptable negotiation interval", "پاره‌خط سبز: بازه قیمت قابل‌قبول برای هر دو طرف")}{" "}<InlineMath equation={String.raw`E[X_C]\leq P\leq P_C^+`} /></span></span>
            </div>
            <div
              className={`price-range-plot ${agreementPossible ? "price-range-possible" : "price-range-blocked"}`}
              style={{
                "--net-premium-position": `${netPremiumPosition}%`,
                "--maximum-premium-position": `${maximumPremiumPosition}%`,
                "--agreement-start": `${agreementStart}%`,
                "--agreement-width": `${agreementWidth}%`,
              } as CSSProperties}
              aria-label={t("Zoomed reinsurance negotiation price scale", "مقیاس بزرگ‌نمایی‌شده قیمت مذاکره بیمه اتکایی")}
            >
              <div className="price-track" dir="ltr"><span className="price-agreement-window" /><i className="price-net-marker" aria-hidden="true" /><b className="price-maximum-marker" aria-hidden="true" /></div>
              <div className="price-scale-limits" dir="ltr"><span>{preciseMoney(priceScaleMin)}</span><span>{preciseMoney(priceScaleMax)}</span></div>
            </div>
            <div className="price-boundary-cards">
              <div className="price-boundary-net"><span>{t("Black threshold", "مرز سیاه")} · <InlineMath equation={String.raw`E[X_C]`} /></span><strong>{preciseMoney(stopLoss)}</strong><small>{t("Reinsurer's minimum net price", "حداقل قیمت خالص بیمه‌گر اتکایی")}</small></div>
              <div className="price-boundary-maximum"><span>{t("Green endpoint", "نقطه سبز")} · <InlineMath equation={String.raw`P_C^+`} /></span><strong>{preciseMoney(maximumPremium)}</strong><small>{t("Insurer's maximum acceptable price", "حداکثر قیمت قابل‌قبول بیمه‌گر")}</small></div>
            </div>
            <p className={`deal-status ${agreementPossible ? "deal-possible" : "deal-blocked"}`}>{agreementPossible ? t("Possible price interval: the insurer's limit is above the minimum net premium.", "بازه قیمت معقول و دست‌یافتنی‌ست چرا که سقف بیمه‌گر بالاتر از حداقل حق‌بیمه خالص است.") : t("No feasible price interval: the minimum net premium is above the insurer's limit.", "بازه قیمت امکان‌پذیر نیست: حداقل حق‌بیمه خالص از سقف بیمه‌گر بیشتر است.")}</p>
          </div>
          {zeroRetainedVolatility ? (
            <Notice kind="info" title={t("Why retained volatility is zero", "چرا نوسان خسارت نگهداری‌شده صفر است؟")}>
              {t("The selected retention is at or below the smallest observed monthly loss", "حد نگهداری انتخاب‌شده کوچک‌تر یا مساوی کمترین خسارت ماهانه مشاهده‌شده است:")}{" "}
              <InlineMath equation={String.raw`d\leq\min_i X_i`} />. {t("Therefore every month is capped at exactly the same retained amount", "پس خسارت نگهداری‌شده همه ماه‌ها دقیقاً یک مقدار ثابت دارد:")}{" "}
              <InlineMath equation={String.raw`X_{R,i}=d`} />, {t("so", "بنابراین")}{" "}<InlineMath equation={String.raw`\operatorname{SD}(X_R)=0`} />. {t("The observed threshold is", "آستانه مشاهده‌شده برابر است با")}{" "}<strong>{preciseMoney(minimumObservedLoss)}</strong>.
            </Notice>
          ) : null}
          {/* <Notice kind="info" title={t("Why the two prices are close", "چرا دو قیمت به هم نزدیک‌اند؟")}>
            {noCededLayer ? (
              <>{t("At this endpoint the retention reaches the largest observed loss, so", "در این نقطه حد نگهداری به بزرگ‌ترین خسارت مشاهده‌شده می‌رسد، بنابراین")}{" "}<InlineMath equation={String.raw`d\geq\max_i X_i`} />, <InlineMath equation={String.raw`X_R=X`} />{" "}{t("and", "و")}{" "}<InlineMath equation={String.raw`X_C=0`} />. {t("There is no reinsurance layer to buy, hence", "لایه‌ای برای واگذاری باقی نمی‌ماند، پس")}{" "}<InlineMath equation={String.raw`E[X_C]=P_C^+=0`} />.</>
            ) : (
              <>{t("With low absolute risk aversion, the certainty-equivalent risk margin is small and", "با ریسک‌گریزی مطلق کم، حاشیه ریسک‌گریزی معادل قطعی کوچک است و")}{" "}<InlineMath equation={String.raw`P_C^+\approx E[X_C]`} />. {t("Their displayed difference is the insurer's risk-aversion margin", "اختلاف دقیق نمایش‌داده‌شده، حاشیه ریسک‌گریزی بیمه‌گر است:")}{" "}<InlineMath equation={String.raw`P_C^+-E[X_C]`} />.</>
            )}
          </Notice> */}
          <dl className="compact-dl"><div><dt>{t("Retained-loss variability", "نوسان خسارت نگهداری‌شده")}{" "}<InlineMath equation={String.raw`\operatorname{SD}(X_R)`} /></dt><dd>{money(retainedSd)}</dd></div><div><dt>{t("Insurer's risk-aversion margin", "حاشیه ریسک‌گریزی بیمه‌گر")}{" "}<InlineMath equation={String.raw`P_C^+-E[X_C]`} /></dt><dd>{preciseMoney(utilityLoading)}{stopLoss > 0 ? <> (<bdi>{formatPercent(utilityLoadingRate * 100, 2)}</bdi>)</> : null}</dd></div><div><dt>{t("Ceded share of expected loss", "سهم واگذارشده از امید خسارت")}</dt><dd><bdi>{grossMean > 0 ? formatPercent((stopLoss / grossMean) * 100, 1) : formatPercent(0, 1)}</bdi></dd></div><div><dt>{t("Loss split", "تفکیک خسارت")}{" "}<InlineMath equation={String.raw`X=X_R+X_C`} /></dt><dd>{t("Exact for every month", "کنترل‌شده برای هر ماه")}</dd></div></dl>
          <PanelCredit names={contributors} />
        </section>
      </div>
      <div className="formula-grid">
        <Formula equation={String.raw`${utilityDetails.expression},\qquad E[u(w-X)]=E[u(w-P_C^+-X_R)]`} label={<>{t("The selected utility turns wealth outcomes into scores. The maximum premium is the value that leaves the insurer indifferent between the gross loss and retained loss plus reinsurance.", "تابع مطلوبیت انتخاب‌شده پیامدهای ثروت را به امتیاز تبدیل می‌کند. حداکثر حق‌بیمه مقداری است که بیمه‌گر را میان خسارت ناخالص و خسارت نگهداری‌شده به‌علاوه بیمه اتکایی بی‌تفاوت می‌گذارد.")}</>} hint={t(`${utilityLabels[utility]} · reinsurance budget`, `${utilityLabels[utility]} · بودجه بیمه اتکایی`)} />
        <Formula equation={String.raw`X_R=\min(X,d),\qquad X_C=(X-d)_+,\qquad X=X_R+X_C`} label={<>{t("Every monthly loss is split at", "هر خسارت ماهانه در")}{" "}<InlineMath equation={String.raw`d`} />{" "}{t("into the amount retained by the insurer and the amount transferred to the reinsurer.", "به مبلغ نگهداری‌شده نزد بیمه‌گر و مبلغ واگذارشده به بیمه‌گر اتکایی تقسیم می‌شود.")}</>} hint={t("Retention and loss identity", "حد نگهداری و تساوی خسارت")} />
        <Formula equation={String.raw`\pi_X(d)=E[X_C]=E[(X-d)_+]`} label={<>{t("The net stop-loss premium is expected ceded loss before expenses, capital cost, profit, or a risk margin.", "حق‌بیمه خالص مازاد خسارت، امید خسارت واگذارشده پیش از هزینه، هزینه سرمایه، سود و حاشیه ریسک است.")}</>} hint={t("Net stop-loss premium", "حق‌بیمه خالص مازاد خسارت")} />
      </div>
      {/* <Notice kind={apiError ? "warning" : "info"} title={apiError ? t("Authoritative API unavailable", "API مرجع در دسترس نیست") : t("Finite-sample calculation", "محاسبه بر پایه نمونه متناهی")}>{apiError ? t("The page is showing an exact browser preview until the Python service is restored.", "تا زمان بازگشت سرویس پایتون، صفحه پیش‌نمایش دقیق مرورگر را نشان می‌دهد.") : t("The utility budget, expected loss, retained standard deviation, and stop-loss premium are calculated by Python from all 1,000 synthetic months.", "بودجه مطلوبیت، امید خسارت، انحراف معیار خسارت نگهداری‌شده و حق‌بیمه مازاد خسارت توسط پایتون از کل ۱٬۰۰۰ ماه محاسبه می‌شوند.")}</Notice> */}
      <Contributor names={contributors} summary={t("The submitted utility, risk-aversion, maximum-premium, and stop-loss functions were rebuilt as validated calculations over all 1,000 monthly paid losses. Exponential (CARA), logarithmic, and power utility are compared at the same local absolute risk aversion; wealth domains are enforced, the expected-utility premium is solved exactly, and the retained and ceded layers are used to compare the insurer's maximum ceded-layer price with the reinsurer's net minimum E[X_C].", "توابع ارائه‌شده‌ی مطلوبیت، ریسک‌گریزی، حداکثر حق‌بیمه و اتکایی حد خسارت به‌صورت محاسبات اعتبارسنجی‌شده روی تمام ۱٬۰۰۰ خسارت پرداختی ماهانه اعمال شده‌اند. مطلوبیت نمایی (CARA)، لگاریتمی و توانی در سطح یکسان ریسک‌گریزی مطلق محلی مقایسه می‌شوند؛ دامنه‌ی ثروت کنترل، معادله‌ی حق‌بیمه بر پایه‌ی امید مطلوبیت به‌طور دقیق حل و لایه‌های نگهداری‌شده و واگذارشده برای مقایسه‌ی حداکثر قیمت بیمه‌گر با حداقل قیمت خالص بیمه‌گر اتکایی E[X_C] استفاده می‌شوند.")} />
    </div>
  );
}
