"use client";

import { useState } from "react";
import { EChart } from "../EChart";
import { Formula, InlineMath } from "../Formula";
import { tr, useLanguage } from "../i18n";
import type { PortfolioData } from "../types";
import { Contributor, MetricCard, Notice, PanelCredit, ReferenceBand, ResultTag, formatMoney } from "../ui";
import { useActuarialApi } from "../useActuarialApi";
import { histogram } from "./helpers";

type PolicyCoverage = "all" | "own_damage" | "third_party_liability";
type IndividualApiResult = {
  policy_count: number;
  independent_moments: { values: { mean: number; standard_deviation: number } };
  independent_approximations: { values: { normal: number } };
  shared_accident_empirical: { mean: number; standard_deviation: number; quantile: number; month_losses: number[] };
};

export function IndividualExperience({ data }: { data: PortfolioData }) {
  const { language } = useLanguage();
  const t = (en: string, fa: string) => tr(language, en, fa);
  const money = (value: number) => formatMoney(value, true, language);
  const [portfolioSize, setPortfolioSize] = useState(500);
  const [confidence, setConfidence] = useState(0.95);
  const [segment, setSegment] = useState("all");
  const [coverage, setCoverage] = useState<PolicyCoverage>("all");
  const [dependence, setDependence] = useState("independent");
  const model = data.summary.policy_models[`${coverage}:${segment}`];
  const selectedSize = Math.min(portfolioSize, model.policy_count);
  const q = model.mean_claim_probability;
  const { data: apiResult, error: apiError } = useActuarialApi<IndividualApiResult>("/api/individual-risk", {
    portfolio_size: selectedSize, coverage, segment, confidence,
  });
  const previewMean = selectedSize * q * model.mean_paid_loss;
  const independentMean = apiResult?.independent_moments.values.mean ?? previewMean;
  const independentSd = apiResult?.independent_moments.values.standard_deviation ?? 0;
  const independentQuantile = apiResult?.independent_approximations.values.normal ?? previewMean;
  const sharedLosses = apiResult?.shared_accident_empirical.month_losses ?? [0];
  const sharedMean = apiResult?.shared_accident_empirical.mean ?? previewMean;
  const sharedSd = apiResult?.shared_accident_empirical.standard_deviation ?? 0;
  const sharedQuantile = apiResult?.shared_accident_empirical.quantile ?? previewMean;
  const displayedMean = dependence === "independent" ? independentMean : sharedMean;
  const displayedSd = dependence === "independent" ? independentSd : sharedSd;
  const displayedQuantile = dependence === "independent" ? independentQuantile : sharedQuantile;
  const sharedHistogram = histogram(sharedLosses, 24);
  const comparison = [
    { name: t("Independent Bernoulli", "برنولی مستقل"), mean: independentMean, quantile: independentQuantile },
    { name: t("Shared-accident empirical", "تجربی با حادثه‌ی مشترک"), mean: sharedMean, quantile: sharedQuantile },
  ];
  const contributor = "نجمه زارع";

  return (
    <div className="experience-stack">
      <ReferenceBand source={t("Modern Actuarial Risk Theory · Chapter 2 · Individual risk model", "Modern Actuarial Risk Theory · فصل ۲ · مدل ریسک انفرادی")} formula={String.raw`S=\sum_i X_i,\quad E[S]=\sum_i q_i b_i`}>
        {t("Each loss variable belongs to one coverage-specific policy. Probabilities and conditional paid benefits come from generated policy outcomes; a vehicle may own two separate policies whose losses remain dependent through the same accident.", "هر متغیر خسارت به یک بیمه‌نامه‌ی مختص پوشش تعلق دارد. احتمال‌ها و مبالغ پرداختی شرطی از پیامدهای شبیه‌سازی‌شده‌ی بیمه‌نامه به دست می‌آیند؛ یک خودرو می‌تواند دو بیمه‌نامه‌ی جدا داشته باشد که خسارت‌هایشان از طریق همان حادثه وابسته‌اند.")}
      </ReferenceBand>

      <section className="control-strip" aria-label={t("Individual risk controls", "کنترل‌های مدل ریسک انفرادی")}>
        <label className="range-control wide"><span>{t("Number of policies", "تعداد بیمه‌نامه‌ها")} <strong>{t(`${selectedSize} policies`, `${selectedSize.toLocaleString("fa-IR")} بیمه‌نامه`)}</strong></span><input type="range" min="20" max={Math.min(5000, model.policy_count)} step="20" value={selectedSize} onChange={(event) => setPortfolioSize(Number(event.target.value))} /></label>
        <label><span>{t("Coverage-specific policies", "بیمه‌نامه‌های مختص پوشش")}</span><select value={coverage} onChange={(event) => setCoverage(event.target.value as PolicyCoverage)}><option value="all">{t("All separate policies", "همه‌ی بیمه‌نامه‌های جدا")}</option><option value="own_damage">{t("Own damage", "بدنه")}</option><option value="third_party_liability">{t("Third-party liability", "شخص ثالث")}</option></select></label>
        <label><span>{t("Policy segment", "گروه بیمه‌نامه")}</span><select value={segment} onChange={(event) => setSegment(event.target.value)}><option value="all">{t("All segments", "همه‌ی گروه‌ها")}</option><option value="preferred">{t("Preferred", "کم‌ریسک")}</option><option value="standard">{t("Standard", "استاندارد")}</option><option value="commercial">{t("Commercial", "تجاری")}</option></select></label>
        <label><span>{t("Dependence model", "مدل وابستگی")}</span><select value={dependence} onChange={(event) => setDependence(event.target.value)}><option value="independent">{t("Independent policy approximation", "تقریب بیمه‌نامه‌های مستقل")}</option><option value="shared">{t("Shared-accident empirical", "تجربی با حادثه‌ی مشترک")}</option></select></label>
        <label className="range-control"><span>{t("Quantile level", "سطح چندک")} <strong>{(confidence * 100).toFixed(1)}%</strong></span><input type="range" min="0.8" max="0.99" step="0.01" value={confidence} onChange={(event) => setConfidence(Number(event.target.value))} /></label>
      </section>

      <div className="metric-grid four">
        <MetricCard label={<InlineMath equation={String.raw`E[S]`} />} value={money(displayedMean)} detail={dependence === "independent" ? t("Sum of policy-level expected losses", "جمع امید خسارت‌های سطح بیمه‌نامه") : t("Mean selected share of monthly loss", "میانگین سهم انتخاب‌شده از خسارت ماهانه")} tone="blue" />
        <MetricCard label={<InlineMath equation={String.raw`\operatorname{SD}(S)`} />} value={money(displayedSd)} detail={t("Under the selected dependence model", "تحت مدل وابستگی انتخاب‌شده")} tone="teal" />
        <MetricCard label={<InlineMath equation={String.raw`Q_p(S)`} />} value={money(displayedQuantile)} detail={t(`${(confidence * 100).toFixed(0)}% aggregate-loss quantile`, `چندک ${(confidence * 100).toFixed(0)}٪ خسارت کل`)} tone="amber" />
        <MetricCard label={t("Mean policy claim probability", "میانگین احتمال خسارت بیمه‌نامه")} value={`${(q * 100).toFixed(2)}%`} detail={apiResult ? t(`${apiResult.policy_count.toLocaleString()} exact policy rows calculated by Python`, `${apiResult.policy_count.toLocaleString("fa-IR")} ردیف دقیق بیمه‌نامه محاسبه‌شده توسط پایتون`) : t("Loading exact policy rows…", "در حال بارگذاری ردیف‌های دقیق بیمه‌نامه…")} tone="green" />
      </div>

      <div className="panel-grid two-thirds">
        <section className="panel">
          <div className="panel-heading"><div><ResultTag tone="green">{t("Simulated", "شبیه‌سازی‌شده")}</ResultTag><h2>{t("Shared-accident aggregate-loss distribution", "توزیع خسارت کل با حادثه‌ی مشترک")}</h2><p>{t("This empirical distribution retains dependence caused when separate policies respond to the same physical accident.", "این توزیع تجربی وابستگی ناشی از واکنش بیمه‌نامه‌های جدا به یک حادثه‌ی فیزیکی را حفظ می‌کند.")}</p></div></div>
          <EChart label={t("Empirical policy-set aggregate loss", "خسارت کل تجربی مجموعه بیمه‌نامه")} option={{ animation: false, grid: { left: 58, right: 16, top: 24, bottom: 48 }, tooltip: { trigger: "axis" }, xAxis: { type: "category", data: sharedHistogram.map(([mid]) => mid >= 1000 ? `${(mid / 1000).toFixed(1)}bn` : `${Math.round(mid)}m`), axisLabel: { interval: 4 }, name: t("aggregate paid loss S", "خسارت پرداختی کل S"), nameLocation: "middle", nameGap: 30 }, yAxis: { type: "value", name: t("months", "ماه‌ها"), splitLine: { lineStyle: { color: "#e8edf3" } } }, series: [{ type: "bar", data: sharedHistogram.map(([, count]) => count), itemStyle: { color: "#75a3ee", borderRadius: [3, 3, 0, 0] } }] }} />
          <PanelCredit names={contributor} role={t("Convolution and individual-risk calculations.", "محاسبات پیچش و ریسک انفرادی.")} />
        </section>
        <section className="panel">
          <div className="panel-heading"><div><ResultTag tone="slate">{t("Assumption comparison", "مقایسه‌ی فرض‌ها")}</ResultTag><h2>{t("Independence versus shared accidents", "استقلال در برابر حادثه‌ی مشترک")}</h2><p>{t("The independent result is a Bernoulli moment approximation; the shared result is read from the same 1,000 entity-first months used elsewhere.", "نتیجه‌ی مستقل تقریب گشتاوری برنولی است؛ نتیجه‌ی مشترک از همان ۱۰۰۰ ماه مبتنی بر موجودیت خوانده می‌شود.")}</p></div></div>
          <EChart height={275} label={t("Mean and upper quantile under two dependence assumptions", "میانگین و چندک بالا تحت دو فرض وابستگی")} option={{ animation: false, color: ["#2868d8", "#c95c65"], grid: { left: 88, right: 18, top: 38, bottom: 34 }, legend: { top: 0 }, tooltip: { trigger: "axis", axisPointer: { type: "shadow" } }, xAxis: { type: "value", axisLabel: { formatter: (value: number) => value >= 1000 ? `${(value / 1000).toFixed(1)}bn` : `${Math.round(value)}m` }, splitLine: { lineStyle: { color: "#e8edf3" } } }, yAxis: { type: "category", data: comparison.map((row) => row.name) }, series: [{ name: t("Mean", "میانگین"), type: "bar", data: comparison.map((row) => row.mean) }, { name: t("Upper quantile", "چندک بالا"), type: "bar", data: comparison.map((row) => row.quantile) }] }} />
          <PanelCredit names={contributor} />
        </section>
      </div>

      <div className="formula-grid"><Formula equation={String.raw`X_i=I_iY_i,\qquad S=\sum_{i=1}^{n}X_i`} label={t("Each policy contributes zero or one coverage-specific paid-loss variable in the independent model.", "هر بیمه‌نامه در مدل مستقل یک متغیر خسارت پرداختی مختص پوشش یا صفر ایجاد می‌کند.")} /><Formula equation={String.raw`E[S]=\sum_i q_i b_i`} label={t("Policy claim probabilities and conditional benefits are estimated from generated policy outcomes, not from accident counts divided by an arbitrary portfolio size.", "احتمال خسارت بیمه‌نامه و مبلغ پرداختی شرطی از پیامدهای تولیدشده‌ی بیمه‌نامه برآورد می‌شوند، نه از تقسیم تعداد حادثه بر اندازه‌ی دلخواه پرتفوی.")} hint={t("Policy-level aggregation", "تجمیع در سطح بیمه‌نامه")} /></div>
      {dependence === "independent" ? <Notice kind="info" title={t("Independence is an explicit approximation", "استقلال یک تقریب صریح است")}>{t("Separate policies on the same vehicle can respond to one accident, so the empirical shared-accident mode is the data-faithful comparison. Independence remains useful for the chapter formula.", "بیمه‌نامه‌های جدا روی یک خودرو می‌توانند به یک حادثه پاسخ دهند؛ بنابراین حالت تجربی حادثه‌ی مشترک مقایسه‌ی وفادار به داده است. استقلال برای فرمول فصل همچنان مفید است.")}</Notice> : <Notice kind="success" title={t("Shared accident dependence retained", "وابستگی حادثه‌ی مشترک حفظ شد")}>{t("This mode uses monthly paid losses and therefore preserves cross-policy dependence without pretending the contracts are combined.", "این حالت از خسارت‌های پرداختی ماهانه استفاده می‌کند و وابستگی میان بیمه‌نامه‌ها را بدون ترکیب قراردادی آن‌ها حفظ می‌کند.")}</Notice>}
      {apiError ? <Notice kind="warning" title={t("Authoritative API unavailable", "API مرجع در دسترس نیست")}>{t("Exact policy selection and shared-accident outcomes require the Python service; preview values remain visibly provisional.", "انتخاب دقیق بیمه‌نامه و پیامدهای حادثه‌ی مشترک به سرویس پایتون نیاز دارد؛ مقادیر پیش‌نمایش موقت باقی می‌مانند.")}</Notice> : null}
      <Contributor names={contributor} files="پیچش.R · approximation.R" summary={t("The chapter methods now consume compatible monthly policy outcomes and compare independence with entity-first shared-accident observations.", "روش‌های فصل اکنون پیامدهای ماهانه‌ی سازگار بیمه‌نامه را مصرف و استقلال را با مشاهدات مبتنی بر حادثه‌ی مشترک مقایسه می‌کنند.")} />
    </div>
  );
}
