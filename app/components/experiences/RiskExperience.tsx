"use client";

import { useState } from "react";
import { EChart } from "../EChart";
import { Formula, InlineMath } from "../Formula";
import { tr, useLanguage } from "../i18n";
import type { PortfolioData } from "../types";
import { Contributor, MetricCard, Notice, PanelCredit, ReferenceBand, ResultTag, formatMoney } from "../ui";
import { apiCoverage, useActuarialApi } from "../useActuarialApi";
import { histogram, mean, quantile, updateMonth, valuesFor, variance, type Coverage } from "./helpers";

type Method = "empirical" | "normal" | "evt";
type RiskApiResult = { values: { var?: number; tvar?: number; tail_count?: number }; applicable: boolean; message: string | null; bootstrap: { values: { lower: number; upper: number } } };

function normalQuantile(p: number) {
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  const low = 0.02425;
  if (p < low) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - low) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = p - 0.5;
  const r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

export function RiskExperience({ data }: { data: PortfolioData }) {
  const { language } = useLanguage();
  const t = (en: string, fa: string) => tr(language, en, fa);
  const money = (value: number, compact = true) => formatMoney(value, compact, language);
  const chartMoney = (value: number) => value >= 1000 ? `${(value / 1000).toFixed(2)}bn` : `${Math.round(value)}m`;
  const [confidence, setConfidence] = useState(0.95);
  const [coverage, setCoverage] = useState<Coverage>("total");
  const [method, setMethod] = useState<Method>("empirical");
  const [retained, setRetained] = useState(false);
  const [retention, setRetention] = useState(data.summary.p95_payout);
  const [threshold, setThreshold] = useState(0.9);
  const { data: apiResult, error: apiError } = useActuarialApi<RiskApiResult>("/api/risk-measures", {
    coverage: apiCoverage(coverage), confidence, method, threshold_quantile: threshold,
    retention: retained ? retention : null, bootstrap_replications: 400, seed: 1405,
  });
  const gross = valuesFor(data.months, coverage);
  const losses = retained ? gross.map((value) => Math.min(value, retention)) : gross;
  const empiricalVar = quantile(losses, confidence);
  const empiricalTail = losses.filter((value) => value >= empiricalVar);
  const empiricalTvar = mean(empiricalTail);
  const lossMean = mean(losses);
  const sd = Math.sqrt(variance(losses));
  const normalZ = normalQuantile(confidence);
  const normalVar = lossMean + normalZ * sd;
  const normalPdf = Math.exp(-0.5 * normalZ ** 2) / Math.sqrt(2 * Math.PI);
  const normalTvar = lossMean + sd * normalPdf / (1 - confidence);
  const evtThreshold = quantile(losses, threshold);
  const exceedances = losses.filter((value) => value > evtThreshold).map((value) => value - evtThreshold);
  const excessMean = exceedances.length ? mean(exceedances) : 0;
  const excessVariance = exceedances.length > 1 ? variance(exceedances) : 0;
  const rawXi = excessVariance > 0 ? 0.5 * (1 - excessMean ** 2 / excessVariance) : 0;
  const xi = Math.max(-0.4, Math.min(0.9, rawXi));
  const beta = Math.max(1e-9, excessMean * (1 - xi));
  const tailRatio = Math.max(1e-9, (1 - confidence) / (1 - threshold));
  const evtVar = confidence <= threshold || exceedances.length < 20 ? empiricalVar : Math.abs(xi) < 1e-6 ? evtThreshold - beta * Math.log(tailRatio) : evtThreshold + beta / xi * (tailRatio ** (-xi) - 1);
  const evtTvar = xi < 1 ? evtVar + (beta + xi * (evtVar - evtThreshold)) / (1 - xi) : Number.NaN;
  const localVar = method === "normal" ? normalVar : method === "evt" ? evtVar : empiricalVar;
  const localTvar = method === "normal" ? normalTvar : method === "evt" ? evtTvar : empiricalTvar;
  const displayedVar = apiResult?.values.var ?? localVar;
  const displayedTvar = apiResult?.values.tvar ?? localTvar;
  const distribution = histogram(losses, 28);
  const methodRows = [
    { name: t("Empirical", "تجربی"), value: empiricalVar },
    { name: t("Normal", "نرمال"), value: normalVar },
    { name: t("EVT tail fit", "برازش دنباله‌ی EVT"), value: evtVar },
  ];
  const comparisonValues = methodRows.map((row) => row.value);
  const comparisonLow = Math.min(...comparisonValues);
  const comparisonHigh = Math.max(...comparisonValues);
  const comparisonSpread = comparisonHigh - comparisonLow;
  const comparisonPadding = Math.max(comparisonSpread * 0.35, comparisonHigh * 0.002);
  const comparisonAxisMin = Math.max(0, comparisonLow - comparisonPadding);
  const comparisonAxisMax = comparisonHigh + comparisonPadding;
  const histogramBinWidth = distribution.length > 1 ? distribution[1][0] - distribution[0][0] : 1;
  const histogramAxisMin = distribution[0][0] - histogramBinWidth / 2;
  const histogramAxisMax = distribution.at(-1)![0] + histogramBinWidth / 2;
  const hypotheticalClaimCount = 100;
  const hypotheticalMeanSeverity = 60;
  const hypotheticalCountShock = 10;
  const hypotheticalSeverityShock = 5;
  const hypotheticalBaseLoss = hypotheticalClaimCount * hypotheticalMeanSeverity;
  const hypotheticalDeltaContribution = hypotheticalMeanSeverity * hypotheticalCountShock + hypotheticalClaimCount * hypotheticalSeverityShock;
  const hypotheticalGammaContribution = hypotheticalCountShock * hypotheticalSeverityShock;
  const hypotheticalDeltaGammaLoss = hypotheticalBaseLoss + hypotheticalDeltaContribution + hypotheticalGammaContribution;
  const methodName = method === "empirical" ? t("Empirical", "تجربی") : method === "normal" ? t("Normal", "نرمال") : t("EVT", "مقادیر حدی");
  const contributors = "محمدرضا سعیدخانی، محمد مهدوی نسب، علی جهانبان، محمد اشکوری، نجمه زارع";

  return (
    <div className="experience-stack">
      <ReferenceBand source={t("Chapter 2 - Dr. Payandeh · Risk measures and risk comparison", "فصل ۲ - دکتر پاینده · سنجه‌های ریسک و مقایسه‌ی ریسک")} formula={String.raw`\operatorname{VaR}_p(X),\quad \operatorname{TVaR}_p(X),\quad X_R=\min(X,d)`}>
        {t("The chart locates Value at Risk on the monthly portfolio-loss distribution. “Retained loss” is the part kept by the insurer after aggregate stop-loss reinsurance: for every synthetic month, the page replaces X by min(X,d), while max(X−d,0) is ceded to the reinsurer.", "نمودار، ارزش در معرض ریسک را روی توزیع خسارت ماهانه‌ی پرتفوی مشخص می‌کند. «خسارت نگهداری‌شده» سهمی است که پس از اتکایی توقف خسارت نزد بیمه‌گر می‌ماند: صفحه برای هر ماه شبیه‌سازی‌شده X را با min(X,d) جایگزین می‌کند و max(X−d,0) سهم واگذارشده به بیمه‌گر اتکایی است.")}
      </ReferenceBand>

      <section className="control-strip" aria-label={t("Risk measure controls", "کنترل‌های سنجه‌ی ریسک")}>
        <label><span>{t("Loss variable", "متغیر خسارت")}</span><select value={coverage} onChange={(event) => setCoverage(event.target.value as Coverage)}><option value="total">{t("Total insurer-paid loss", "کل خسارت پرداختی بیمه‌گر")}</option><option value="own">{t("Own-damage paid loss", "خسارت پرداختی بدنه")}</option><option value="third">{t("Liability paid loss", "خسارت پرداختی شخص ثالث")}</option></select></label>
        <label><span>{t("Estimator", "روش برآورد")}</span><select value={method} onChange={(event) => setMethod(event.target.value as Method)}><option value="empirical">{t("Empirical", "تجربی")}</option><option value="normal">{t("Normal approximation", "تقریب نرمال")}</option><option value="evt">{t("EVT / GPD", "مقادیر حدی / GPD")}</option></select></label>
        <label className="range-control"><span>{t("Confidence level", "سطح اطمینان")} <strong>{(confidence * 100).toFixed(1)}%</strong></span><input type="range" min="0.8" max="0.995" step="0.005" value={confidence} onChange={(event) => { const value = Number(event.target.value); setConfidence(value); updateMonth("confidence", value); }} /></label>
        {method === "evt" ? <label className="range-control"><span>{t("EVT threshold", "آستانه‌ی مقادیر حدی")} <strong>{(threshold * 100).toFixed(0)}%</strong></span><input type="range" min="0.8" max="0.97" step="0.01" value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} /></label> : null}
        <label className="switch-control"><input type="checkbox" checked={retained} onChange={(event) => setRetained(event.target.checked)} /><span>{t("Use retained loss", "سناریوی حد نگه‌داری خسارت")}</span></label>
        {retained ? <label className="range-control"><span>{t("Retention", "حد نگهداری")} <strong>{money(retention)}</strong></span><input type="range" min={data.summary.mean_payout * 0.35} max={data.summary.max_payout} step={50} value={retention} onChange={(event) => setRetention(Number(event.target.value))} /></label> : null}
      </section>

      <div className="metric-grid three">
        <MetricCard label={<>{methodName} · <InlineMath equation={String.raw`\operatorname{VaR}_p(X)`} /></>} value={money(displayedVar)} detail={t(`${(confidence * 100).toFixed(1)}% quantile of loss`, `چندک ${(confidence * 100).toFixed(1)}٪ خسارت`)} tone="blue" />
        <MetricCard label={<InlineMath equation={String.raw`\operatorname{TVaR}_p(X)`} />} value={money(displayedTvar)} detail={apiResult ? t("Mean of quantiles in the remaining upper tail", "میانگین چندک‌های دنباله‌ی بالایی فراتر از آستانه‌ی VaR") : t("Loading authoritative calculation…", "در حال بارگذاری محاسبه‌ی مرجع…")} tone="red" />
        <MetricCard label={t("Tail mean minus VaR", "فاصله‌ی میانگین دنباله تا VaR")} value={money(displayedTvar - displayedVar)} detail={t("Average excess beyond the VaR threshold", "میانگین مازاد فراتر از آستانه‌ی VaR")} tone="amber" />
      </div>

      <div className="panel-grid two-thirds">
        <section className="panel">
          <div className="panel-heading"><div><ResultTag tone={method === "empirical" ? "blue" : method === "normal" ? "amber" : "green"}>{method === "empirical" ? t("Empirical", "تجربی") : method === "normal" ? t("Approximate", "تقریبی") : t("Fitted", "برازش‌شده")}</ResultTag><h2>{t("Value at Risk threshold and tail mean", "آستانه‌ی ارزش در معرض ریسک و میانگین دنباله")}</h2><p>{t("The vertical line is the selected loss quantile. Red bars are the observations whose average defines the displayed empirical tail mean.", "خط عمودی چندک انتخاب‌شده‌ی خسارت است. ستون‌های قرمز مشاهداتی هستند که میانگین آن‌ها، میانگین تجربی دنباله را می‌سازد.")}</p></div></div>
          <EChart label={t("Loss histogram with Value at Risk threshold and tail", "هیستوگرام خسارت همراه با آستانه‌ی ارزش در معرض ریسک و دنباله")} option={{ animation: false, grid: { left: 54, right: 18, top: 30, bottom: 45 }, tooltip: { trigger: "axis" }, xAxis: { type: "value", min: histogramAxisMin, max: histogramAxisMax, axisLabel: { formatter: (value: number) => value >= 1000 ? `${(value / 1000).toFixed(1)}bn` : `${Math.round(value)}m` }, name: t("insurer-paid loss", "خسارت پرداختی بیمه‌گر"), nameLocation: "middle", nameGap: 30 }, yAxis: { type: "value", name: t("months", "ماه‌ها"), splitLine: { lineStyle: { color: "#e8edf3" } } }, series: [{ type: "bar", barWidth: "92%", data: distribution.map(([mid, count]) => ({ value: [mid, count], itemStyle: { color: mid >= displayedVar ? "#d85b61" : "#79a5ef" } })), markLine: { symbol: "none", label: { formatter: "VaR", color: "#a12c34" }, lineStyle: { color: "#c63f49", width: 2 }, data: [{ xAxis: displayedVar }] } }] }} />
          <PanelCredit names={contributors} role={t("VaR, risk comparison, and tail-measure calculations.", "محاسبات VaR، مقایسه‌ی ریسک و سنجه‌های دنباله‌ای.")} />
        </section>
        <section className="panel">
          <div className="panel-heading"><div><ResultTag tone="slate">{t("Estimator comparison", "مقایسه‌ی برآوردگرها")}</ResultTag><h2>{t("Value at Risk under three assumptions", "ارزش در معرض ریسک تحت سه فرض")}</h2><p>{t("The axis zooms dynamically to the three estimates and therefore does not start at zero; value labels preserve their absolute levels.", "محور برای مقایسه‌ی اختلاف سه برآورد، به‌صورت پویا روی همان سه مقدار زوم می‌شود و از صفر شروع نمی‌شود؛ برچسب هر ستون مقدار مطلق را نشان می‌دهد.")}</p></div></div>
          <EChart height={275} label={t("VaR comparison across empirical, normal and EVT methods", "مقایسه‌ی VaR در روش‌های تجربی، نرمال و مقادیر حدی")} option={{ animation: false, grid: { left: 86, right: 54, top: 12, bottom: 34 }, tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (value: number) => money(value) }, xAxis: { type: "value", min: comparisonAxisMin, max: comparisonAxisMax, splitNumber: 3, axisLabel: { hideOverlap: true, formatter: (value: number) => chartMoney(value) }, splitLine: { lineStyle: { color: "#e8edf3" } } }, yAxis: { type: "category", data: methodRows.map((row) => row.name) }, series: [{ type: "bar", label: { show: true, position: "right", formatter: ({ value }: { value: number }) => chartMoney(value) }, data: methodRows.map((row, index) => ({ value: row.value, itemStyle: { color: ["#2868d8", "#d49a28", "#29957c"][index], borderRadius: [0, 4, 4, 0] } })) }] }} />
          <PanelCredit names={contributors} />
        </section>
      </div>

      <Notice kind="warning" title={t("Few portfolio months remain in the upper-loss tail", "توضیحات کیفی و شهودی VaR")}>{t(`Here “tail” means the synthetic months with portfolio loss at or above VaR—not the end of the calendar. At the current ${(confidence * 100).toFixed(1)}% confidence level, the empirical TVaR averages only ${empiricalTail.length} of ${losses.length} months, so moving p can select a different small set and make VaR or TVaR jump. For EVT, the separate threshold u currently leaves ${exceedances.length} excesses for fitting; raising u gives more extreme but fewer data points, while lowering it gives more data but may no longer describe only the tail.`, `در سطح اطمینان فعلی ${(confidence * 100).toFixed(1)}٪، TVaR تجربی فقط میانگین ${empiricalTail.length.toLocaleString("fa-IR")} ماه از ${losses.length.toLocaleString("fa-IR")} ماه را می‌گیرد؛ بنابراین تغییر p ممکن است مجموعه‌ی کوچک دیگری را انتخاب کند و VaR یا TVaR تغییر کنند. در EVT، آستانه‌ی u اکنون ${exceedances.length.toLocaleString("fa-IR")} مازاد برای برازش باقی می‌گذارد؛ u بالاتر داده‌های شدیدتر اما کمتری می‌دهد و u پایین‌تر داده‌های بیشتری می‌دهد که شاید دیگر فقط نماینده‌ی دنباله نباشند.`)}</Notice>

      <section className="panel estimator-guide" aria-labelledby="estimator-guide-title">
        <div className="panel-heading"><div><ResultTag tone="blue">{t("Method guide", "راهنمای روش‌ها")}</ResultTag><h2 id="estimator-guide-title">{t("How the same portfolio sample enters each calculation", "نمونه‌ی یکسان پرتفوی چگونه وارد هر محاسبه می‌شود؟")}</h2><p>{t(`The sample contains ${losses.length} synthetic portfolio-month outcomes—not ${losses.length} individual accidents or claim files. Each observation X is one month's aggregate insurer-paid loss, obtained by summing all payments generated by that month's many accidents and coverage-compatible claims.`, `نمونه شامل ${losses.length.toLocaleString("fa-IR")} مشاهده از «خسارت تجمیعی ماهانه‌ی پرتفوی» است، نه ${losses.length.toLocaleString("fa-IR")} حادثه یا پرونده‌ی خسارت منفرد. هر مشاهده‌ی X مجموع تمام پرداخت‌های بیمه‌گر بابت حادثه‌ها و پرونده‌های خسارت سازگارِ همان ماه شبیه‌سازی‌شده است.`)}</p></div></div>
        <div className="method-cards">
          <article><span>1</span><div><strong>{t("Empirical", "تجربی")}</strong><div className="method-equation"><InlineMath equation={String.raw`\widehat{\operatorname{VaR}}_p=X_{(\lceil np\rceil)}`} /></div><p><b>{t("Mathematically:", "از نظر ریاضی:")}</b> {t("Sort the 1,000 monthly aggregate-loss observations and select order statistic ⌈np⌉. Empirical TVaR averages the observations at or above that value.", "۱٬۰۰۰ مشاهده‌ی خسارت تجمیعی ماهانه مرتب می‌شوند و مشاهده‌ی رتبه‌ی ⌈np⌉ انتخاب می‌شود. TVaR تجربی میانگین مشاهده‌های مساوی یا بزرگ‌تر از آن مقدار است.")}</p><p><b>{t("Actuarially:", "از نظر بیم‌سنجی:")}</b> {t("It lets the simulated portfolio experience speak directly, without assuming a probability distribution.", "داده‌ی شبیه‌سازی‌شده‌ی پرتفوی مستقیماً استفاده می‌شود و شکل توزیع از پیش فرض نمی‌شود.")}</p></div></article>
          <article><span>2</span><div><strong>{t("Normal approximation", "تقریب نرمال")}</strong><div className="method-equation"><InlineMath equation={String.raw`\widehat{\operatorname{VaR}}_p=\bar X+s\Phi^{-1}(p)`} /></div><p><b>{t("Mathematically:", "از نظر ریاضی:")}</b> {t("Estimate the mean and sample standard deviation from all 1,000 monthly aggregate outcomes, then apply the standard-normal quantile.", "میانگین و انحراف معیار نمونه‌ای از همه‌ی ۱٬۰۰۰ پیامد تجمیعی ماهانه برآورد و سپس چندک نرمال استاندارد اعمال می‌شود.")}</p><p><b>{t("Actuarially:", "از نظر بیم‌سنجی:")}</b> {t("It approximates the entire monthly portfolio-loss distribution as symmetric and light-tailed, which may understate unusually severe months.", "کل توزیع خسارت ماهانه‌ی پرتفوی متقارن و دم‌سبک فرض می‌شود؛ بنابراین ممکن است ماه‌های بسیار پرخسارت را کمتر برآورد کند.")}</p></div></article>
          <article><span>3</span><div><strong>{t("EVT / Generalized Pareto", "EVT / پارتوی تعمیم‌یافته")}</strong><div className="method-equation"><InlineMath equation={String.raw`Y=X-u\mid X>u,\quad Y\sim\operatorname{GPD}(\xi,\beta)`} /></div><p><b>{t("Mathematically:", "از نظر ریاضی:")}</b> {t("Choose threshold u, fit a GPD to monthly excesses X−u only, and extrapolate the requested high quantile.", "آستانه‌ی u انتخاب می‌شود، GPD فقط بر مازادهای ماهانه‌ی X−u برازش می‌شود و چندک بالای موردنظر برون‌یابی می‌گردد.")}</p><p><b>{t("Actuarially:", "از نظر بیم‌سنجی:")}</b> {t("It models rare, severe portfolio months separately from ordinary months and is sensitive to how much tail data u leaves.", "ماه‌های نادر و بسیار پرخسارت پرتفوی جدا از ماه‌های عادی مدل می‌شوند و نتیجه به تعداد داده‌هایی که u در دنباله باقی می‌گذارد حساس است.")}</p></div></article>
        </div>
        <div className="delta-gamma-note">
          <div><ResultTag tone="slate">{t("Separate concept", "مفهوم جداگانه")}</ResultTag><h3>{t("Where delta–gamma would fit", "دلتا–گاما کجا کاربرد دارد؟")}</h3></div>
          <div className="method-equation"><InlineMath equation={String.raw`\Delta g\approx \nabla g(z_0)^{\mathsf T}\Delta z+\tfrac12\Delta z^{\mathsf T}H_g(z_0)\Delta z`} /></div>
          <p>{t("Delta–gamma is valid when a differentiable portfolio value or loss function g is driven by an explicit vector of shocks z. The current page instead starts with already-simulated monthly aggregate losses. We could write each coverage total as claim count × mean paid severity, but its second-order count–severity term would algebraically reconstruct that same total exactly; presenting its VaR as a fourth independent estimator would therefore be circular, not new evidence. A genuine delta–gamma experiment becomes useful only after defining independent shock factors—such as frequency, severity inflation, limits, or deductibles—and their covariance. For that reason it is documented here, but not forced into the three-estimator comparison.", "دلتا–گاما زمانی معتبر است که ارزش یا خسارت پرتفوی به‌صورت تابع مشتق‌پذیر g از بردار شوک‌های z تعریف شده باشد. این صفحه در عوض از خسارت‌های تجمیعی ماهانه‌ای استفاده می‌کند که قبلاً شبیه‌سازی شده‌اند. می‌توان جمع هر پوشش را به‌صورت «تعداد پرونده × میانگین پرداخت» نوشت، اما جمله‌ی مرتبه‌دومِ تعامل تعداد و شدت از نظر جبری دقیقاً همان جمع اولیه را بازسازی می‌کند؛ بنابراین نمایش VaR آن به‌عنوان برآوردگر چهارم، یک حلقه تکراری تشکیل می‌دهد و آورده جدیدی ندارد.")}<br/>
          آزمایش واقعی دلتا–گاما زمانی مفید خواهد بود که عوامل شوک مانند فراوانی و تورم شدت خسارت تعریف شده باشند؛ به همین دلیل این مفهوم در محاسبات بالا در نظر گرفته نشده و صرفاً در یک سناریوی فرضی در قسمت زیر محاسبه شده است.</p>
          <section className="delta-gamma-example" aria-labelledby="delta-gamma-example-title">
            <div className="delta-gamma-example-copy"><ResultTag tone="amber">{t("Hypothetical only", "مثال فرضی")}</ResultTag><h4 id="delta-gamma-example-title">{t("If frequency and mean severity were assumed risk factors", "اگر فراوانی و میانگین شدت را عامل ریسک فرض کنیم")}</h4><p>{t("Suppose N₀ = 100 claim files and M₀ = 60 million tomans per claim, then impose hypothetical shocks ΔN = +10 claims and ΔM = +5 million tomans. These four inputs are textbook assumptions: they are neither estimated from nor written back to the synthetic portfolio.", "فرض کنید N₀ = ۱۰۰ پرونده‌ی خسارت و M₀ = ۶۰ میلیون تومان به‌ازای هر پرونده باشد، سپس شوک‌های فرضی ΔN = ‎+۱۰ پرونده و ΔM = ‎+۵ میلیون تومان اعمال شوند. نکته بسیار مهم اینکه این چهار ورودی صرفاً فرض هستند و  از پرتفوی شبیه‌سازی‌شده برآورد نشده‌اند.")}</p></div>
            <div className="delta-gamma-work"><div className="method-equation"><InlineMath equation={String.raw`g(N,M)=NM,\quad \Delta g_{\delta}=M_0\Delta N+N_0\Delta M,\quad \Delta g_{\gamma}=\Delta N\Delta M`} /></div><dl><div><dt>{t("Starting aggregate loss", "خسارت تجمیعی اولیه")}</dt><dd>{money(hypotheticalBaseLoss, false)}</dd></div><div><dt>{t("Delta contribution", "سهم دلتا")}</dt><dd>+{money(hypotheticalDeltaContribution, false)}</dd></div><div><dt>{t("Gamma interaction", "تعامل گاما")}</dt><dd>+{money(hypotheticalGammaContribution, false)}</dd></div><div><dt>{t("Delta–gamma result", "نتیجه‌ی دلتا–گاما")}</dt><dd>{money(hypotheticalDeltaGammaLoss, false)}</dd></div></dl><p>{t("Exact check: (100 + 10)(60 + 5) = 7,150 million tomans. Because g(N,M)=NM is bilinear, the second-order delta–gamma expansion is exact in this teaching example.", "کنترل دقیق: ‎(۱۰۰ + ۱۰)(۶۰ + ۵) = ۷٬۱۵۰ میلیون تومان. چون g(N,M)=NM یک تابع دوخطی است، بسط مرتبه‌دوم دلتا–گاما در این مثال آموزشی دقیقاً با مقدار واقعی برابر می‌شود.")}</p></div>
          </section>
        </div>
      </section>

      <div className="formula-grid">
        <Formula equation={String.raw`\operatorname{VaR}_p(X)=\inf\{x:F_X(x)\ge p\}`} label={t("The smallest loss x whose cumulative probability reaches p.", "کوچک‌ترین خسارت x که احتمال تجمعی در آن به p می‌رسد.")} hint={t("Risk measure · value at risk", "سنجه‌ی ریسک · ارزش در معرض ریسک")} />
        <Formula equation={String.raw`\operatorname{TVaR}_p(X)=\frac{1}{1-p}\int_p^1\operatorname{VaR}_q(X)\,dq`} label={t("The mean of quantiles in the remaining upper tail; the sample calculation includes the threshold observation.", "میانگین چندک‌های دنباله‌ی بالایی باقی‌مانده؛ محاسبه‌ی نمونه مشاهده‌ی روی آستانه را نیز شامل می‌کند.")} hint={t("Mean loss in the upper tail", "میانگین خسارت در دنباله‌ی بالا")} />
      </div>
      {apiError ? <Notice kind="warning" title={t("Authoritative API unavailable", "API مرجع در دسترس نیست")}>{t("The page is showing a transparent browser preview until the Python calculation service is restored.", "تا زمان بازگشت سرویس محاسبات پایتون، صفحه پیش‌نمایش شفاف مرورگر را نشان می‌دهد.")}</Notice> : null}
      <Contributor names={contributors} files="Risk_Measures_and_Risk_Comparison.py · دلتا گاما.R" summary={t("The submitted VaR work informs the three estimators. The delta–gamma submission is preserved as a nonlinear-risk-factor reference, but its constructed function of mean severities is not the insurer-paid portfolio-loss variable used by the final entity-first model.", "کار ارائه‌شده درباره‌ی VaR مبنای سه برآوردگر است. فایل دلتا–گاما به‌عنوان مرجع عوامل ریسک غیرخطی حفظ شده، اما تابع ساخته‌شده‌ی آن از میانگین شدت‌ها همان متغیر خسارت پرداختی پرتفوی در مدل نهایی مبتنی بر موجودیت نیست.")} />
    </div>
  );
}
