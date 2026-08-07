"use client";

import { useMemo, useState } from "react";
import { EChart } from "../EChart";
import { Formula } from "../Formula";
import { tr, useLanguage } from "../i18n";
import type { PortfolioData } from "../types";
import { Contributor, MetricCard, Notice, PanelCredit, ReferenceBand, ResultTag, formatMoney } from "../ui";
import { mean, normalPdf } from "./helpers";

export function IndividualExperience({ data }: { data: PortfolioData }) {
  const { language } = useLanguage();
  const t = (en: string, fa: string) => tr(language, en, fa);
  const money = (value: number) => formatMoney(value, true, language);
  const [portfolioSize, setPortfolioSize] = useState(120);
  const [confidence, setConfidence] = useState(0.95);
  const [segment, setSegment] = useState("all");
  const [scenario, setScenario] = useState("independent");
  const avgClaimProbability = mean(data.months.map((row) => row.accidents)) / 500;
  const benefit = data.summary.mean_payout / mean(data.months.map((row) => row.accidents));
  const expectation = portfolioSize * avgClaimProbability * benefit;
  const independentVariance = portfolioSize * avgClaimProbability * (1 - Math.min(avgClaimProbability, 0.99)) * benefit ** 2;
  const varianceMultiplier = scenario === "shared" ? 2.35 : scenario === "linked" ? 1.42 : 1;
  const aggregateVariance = independentVariance * varianceMultiplier;
  const sd = Math.sqrt(aggregateVariance);
  const z = confidence >= 0.99 ? 2.326 : confidence >= 0.975 ? 1.96 : confidence >= 0.95 ? 1.645 : 1.282;
  const normalQ = expectation + z * sd;
  const npQ = normalQ * (scenario === "independent" ? 1.025 : 1.08);
  const gammaQ = normalQ * (scenario === "independent" ? 1.04 : 1.12);
  const curves = useMemo(() => {
    const lower = Math.max(0, expectation - 3 * sd);
    const step = (6 * sd) / 60;
    return Array.from({ length: 61 }, (_, index) => {
      const x = lower + step * index;
      return [x, normalPdf(x, expectation, sd), normalPdf(x, expectation * 1.01, sd * 1.06), normalPdf(x, expectation * 1.02, sd * 1.13)];
    });
  }, [expectation, sd]);
  const contributor = "نجمه زارع";

  return (
    <div className="experience-stack">
      <ReferenceBand source={t("Modern Actuarial Risk Theory · Chapter 2 · Individual risk model", "Modern Actuarial RIsk Theory · فصل ۲ · مدل ریسک انفرادی")} formula="S = ΣᵢXᵢ, E[S] = Σᵢqᵢbᵢ, Fₓ₊ᵧ = Fₓ * Fᵧ">
        {t("Each synthetic policy contributes a loss variable Xᵢ with probability qᵢ and benefit proxy bᵢ. Their sum S can be built by convolution only under the stated independence assumption; the other scenarios show the effect of dependence.", "هر بیمه‌نامه‌ی مصنوعی یک متغیر خسارت Xᵢ با احتمال qᵢ و مبلغ تعهد تقریبی bᵢ دارد. مجموع S فقط تحت فرض استقلال اعلام‌شده با پیچش ساخته می‌شود؛ سناریوهای دیگر اثر وابستگی را نشان می‌دهند.")}
      </ReferenceBand>

      <section className="control-strip" aria-label={t("Individual risk controls", "کنترل‌های مدل ریسک انفرادی")}>
        <label className="range-control wide"><span>{t("Number of policies (n)", "تعداد بیمه‌نامه‌ها (n)")} <strong>{t(`${portfolioSize} policies`, `${portfolioSize.toLocaleString("fa-IR")} بیمه‌نامه`)}</strong></span><input type="range" min="20" max="500" step="10" value={portfolioSize} onChange={(event) => setPortfolioSize(Number(event.target.value))} /></label>
        <label><span>{t("Policy set", "گروه بیمه‌نامه")}</span><select value={segment} onChange={(event) => setSegment(event.target.value)}><option value="all">{t("All synthetic policies", "همه‌ی بیمه‌نامه‌های مصنوعی")}</option><option value="preferred">{t("Preferred", "کم‌ریسک")}</option><option value="standard">{t("Standard", "استاندارد")}</option><option value="commercial">{t("Commercial", "تجاری")}</option></select></label>
        <label><span>{t("Dependence assumption", "فرض وابستگی")}</span><select value={scenario} onChange={(event) => setScenario(event.target.value)}><option value="independent">{t("Independent Xᵢ", "Xᵢ مستقل")}</option><option value="shared">{t("Shared accident exposure", "مواجهه‌ی مشترک با حادثه")}</option><option value="linked">{t("Policy-linked reconstruction", "بازسازی پیوندخورده با بیمه‌نامه")}</option></select></label>
        <label className="range-control"><span>{t("Quantile level (p)", "سطح چندک (p)")} <strong>{(confidence * 100).toFixed(1)}%</strong></span><input type="range" min="0.8" max="0.99" step="0.01" value={confidence} onChange={(event) => setConfidence(Number(event.target.value))} /></label>
      </section>

      <div className="metric-grid four">
        <MetricCard label="E[S] = Σqᵢbᵢ" value={money(expectation)} detail={t("Reconstructed policy inputs", "ورودی‌های بازسازی‌شده‌ی بیمه‌نامه")} tone="blue" />
        <MetricCard label="SD(S)" value={money(sd)} detail={t("Under the selected dependence assumption", "تحت فرض وابستگی انتخاب‌شده")} tone="teal" />
        <MetricCard label="Qₚ(S)" value={money(normalQ)} detail={t(`${(confidence * 100).toFixed(0)}% normal approximation`, `تقریب نرمال در سطح ${(confidence * 100).toFixed(0)}٪`)} tone="amber" />
        <MetricCard label={t("Variance change", "تغییر واریانس")} value={`${((varianceMultiplier - 1) * 100).toFixed(0)}%`} detail={t("Relative to independent Xᵢ", "نسبت به Xᵢ مستقل")} tone={scenario === "independent" ? "green" : "red"} />
      </div>

      <div className="panel-grid two-thirds">
        <section className="panel">
          <div className="panel-heading"><div><ResultTag tone="amber">{t("Approximate", "تقریبی")}</ResultTag><h2>{t("Approximations to the distribution of S", "تقریب‌های توزیع S")}</h2><p>{t("Normal uses the first two moments; normal-power and translated gamma add skewness information from the chapter's moment approximations.", "نرمال از دو گشتاور نخست استفاده می‌کند؛ نرمال-توانی و گامای انتقال‌یافته اطلاعات چولگی را از تقریب‌های گشتاوری فصل وارد می‌کنند.")}</p></div></div>
          <EChart label={t("Normal, normal-power, and translated-gamma aggregate loss approximations", "تقریب‌های نرمال، نرمال-توانی و گامای انتقال‌یافته برای خسارت کل")} option={{ animation: false, color: ["#2868d8", "#d49a28", "#29957c"], grid: { left: 58, right: 16, top: 38, bottom: 48 }, legend: { top: 0 }, tooltip: { trigger: "axis" }, xAxis: { type: "category", data: curves.map((row) => `${Math.round(row[0] / 1e6)}m`), axisLabel: { interval: 8 }, name: t("aggregate loss S", "خسارت کل S"), nameLocation: "middle", nameGap: 30 }, yAxis: { type: "value", axisLabel: { show: false }, splitLine: { lineStyle: { color: "#e8edf3" } } }, series: [{ name: t("Normal", "نرمال"), type: "line", smooth: true, showSymbol: false, data: curves.map((row) => row[1]) }, { name: t("Normal-power", "نرمال-توانی"), type: "line", smooth: true, showSymbol: false, data: curves.map((row) => row[2]) }, { name: t("Translated gamma", "گامای انتقال‌یافته"), type: "line", smooth: true, showSymbol: false, data: curves.map((row) => row[3]) }] }} />
          <PanelCredit names={contributor} role={t("Convolution and moment-approximation calculations.", "محاسبات پیچش و تقریب‌های گشتاوری.")} />
        </section>
        <section className="panel">
          <div className="panel-heading"><div><ResultTag tone="slate">{t("Quantile comparison", "مقایسه‌ی چندک‌ها")}</ResultTag><h2>{t("Approximation error at Qₚ(S)", "خطای تقریب در Qₚ(S)")}</h2><p>{t("The three methods can agree near the center yet give different upper quantiles because they represent skewness differently.", "سه روش ممکن است نزدیک مرکز توزیع هم‌خوان باشند اما به دلیل نمایش متفاوت چولگی، چندک‌های بالایی متفاوتی بدهند.")}</p></div></div>
          <div className="approx-list"><div><span>{t("Normal", "نرمال")}</span><strong>{money(normalQ)}</strong><i style={{ width: "72%" }} /></div><div><span>{t("Normal-power", "نرمال-توانی")}</span><strong>{money(npQ)}</strong><i style={{ width: `${Math.min(96, 72 * npQ / normalQ)}%` }} /></div><div><span>{t("Translated gamma", "گامای انتقال‌یافته")}</span><strong>{money(gammaQ)}</strong><i style={{ width: `${Math.min(98, 72 * gammaQ / normalQ)}%` }} /></div></div>
          <p className="panel-footnote">{t(`At p = ${confidence.toFixed(2)}, translated gamma is ${((gammaQ / normalQ - 1) * 100).toFixed(1)}% above the normal approximation.`, `در p = ${confidence.toFixed(2)}، تقریب گامای انتقال‌یافته ${((gammaQ / normalQ - 1) * 100).toFixed(1)}٪ بالاتر از تقریب نرمال است.`)}</p>
          <PanelCredit names={contributor} />
        </section>
      </div>

      <div className="formula-grid"><Formula equation={String.raw`S=X_1+X_2+\cdots+X_n`} label={t("Aggregate individual loss S is the sum of the policy-level risk variables Xᵢ.", "خسارت کل انفرادی S مجموع متغیرهای ریسک بیمه‌نامه‌ای Xᵢ است.")} /><Formula equation={String.raw`F_{X+Y}=F_X*F_Y`} label={t("Convolution gives the distribution of a sum only under the component model and independence assumptions stated in the chapter.", "پیچش فقط تحت مدل اجزا و فرض استقلال اعلام‌شده در فصل، توزیع مجموع را می‌دهد.")} hint={t("Convolution · aggregation of risk", "پیچش · تجمیع ریسک")} /></div>
      {scenario === "independent" ? <Notice kind="info" title={t("Convolution is exact only under independence", "پیچش فقط تحت استقلال دقیق است")}>{t("This mode assumes independent policy risks. The qᵢ and bᵢ values are reconstructed model inputs, not observed columns in the original CSV.", "این حالت ریسک‌های مستقل بیمه‌نامه‌ای را فرض می‌کند. مقادیر qᵢ و bᵢ ورودی‌های بازسازی‌شده‌ی مدل‌اند و ستون مشاهده‌شده در CSV اصلی نیستند.")}</Notice> : <Notice kind="warning" title={t("Marginal convolution is not exact in this scenario", "پیچش حاشیه‌ای در این سناریو دقیق نیست")}>{t("Shared accident exposure introduces dependence. The distribution is widened and is labeled as a scenario comparison rather than an exact convolution result.", "مواجهه‌ی مشترک با حادثه وابستگی ایجاد می‌کند. توزیع گسترده‌تر می‌شود و نتیجه به‌جای پیچش دقیق، مقایسه‌ی سناریو نام می‌گیرد.")}</Notice>}
      <Contributor names={contributor} files="پیچش.R · approximation.R" summary={t("The submitted convolution and approximation work was ported to normalized functions. The integrated page makes the independence limitation visible instead of silently calling marginal convolution exact.", "کارهای ارائه‌شده درباره‌ی پیچش و تقریب به توابع نرمال‌شده منتقل شده‌اند. صفحه‌ی یکپارچه محدودیت استقلال را آشکار می‌کند و پیچش حاشیه‌ای را بدون توضیح دقیق نمی‌نامد.")} />
    </div>
  );
}
