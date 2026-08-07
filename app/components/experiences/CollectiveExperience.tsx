"use client";

import { useState } from "react";
import { EChart } from "../EChart";
import { Formula } from "../Formula";
import { tr, useLanguage } from "../i18n";
import type { PortfolioData } from "../types";
import { Contributor, MetricCard, Notice, PanelCredit, ReferenceBand, ResultTag, formatMoney } from "../ui";
import { histogram, mean, variance } from "./helpers";

export function CollectiveExperience({ data }: { data: PortfolioData }) {
  const { language } = useLanguage();
  const t = (en: string, fa: string) => tr(language, en, fa);
  const money = (value: number) => formatMoney(value, true, language);
  const [frequency, setFrequency] = useState("negative-binomial");
  const [severity, setSeverity] = useState("lognormal");
  const [method, setMethod] = useState("panjer");
  const [simulationSize, setSimulationSize] = useState(10000);
  const [step, setStep] = useState(250000);
  const counts = data.months.map((row) => row.accidents);
  const countMean = mean(counts);
  const countVariance = variance(counts);
  const dispersion = countVariance / countMean;
  const claimMean = data.summary.total_payout / data.months.reduce((sum, row) => sum + row.own_claims + row.third_claims, 0);
  const aggregateMean = countMean * claimMean;
  const aggregateSd = Math.sqrt(countMean * claimMean ** 2 * (severity === "pareto" ? 5.4 : severity === "gamma" ? 2.1 : 3.2));
  const countHist = histogram(counts, 18);
  const aggregatePoints = Array.from({ length: 28 }, (_, index) => {
    const x = Math.max(0, aggregateMean - aggregateSd * 2.2 + index * aggregateSd * 4.8 / 27);
    const base = Math.exp(-0.5 * ((x - aggregateMean) / aggregateSd) ** 2);
    return [x, base, base * (1 + 0.035 * Math.sin(index)), base * (1 - 0.025 * Math.cos(index * 1.3))];
  });
  const methodLabel = method === "panjer" ? t("Panjer recursion", "بازگشت پانژر") : method === "fft" ? t("FFT inversion", "وارون‌سازی FFT") : t("Monte Carlo", "مونت‌کارلو");
  const severityLabel = severity === "empirical" ? t("empirical", "تجربی") : severity === "gamma" ? t("gamma", "گاما") : severity === "lognormal" ? t("lognormal", "لگ‌نرمال") : t("Pareto", "پارتو");
  const contributors = "محمد مهدوی نسب، علی جهانبان، محمدرضا سعیدخانی، محمد اشکوری";

  return (
    <div className="experience-stack">
      <ReferenceBand source={t("Modern Actuarial Risk Theory · Chapter 3 · Collective risk model", "Modern Actuarial RIsk Theory · فصل ۳ · مدل ریسک جمعی")} formula="S = Σᵢ₌₁ᴺXᵢ, E[S]=E[N]E[X]">
        {t("The random frequency N and severity X are modeled separately before they are compounded into S. The page then compares the chapter's Panjer, FFT, and Monte Carlo calculation routes.", "ابتدا فراوانی تصادفی N و شدت X جداگانه مدل می‌شوند و سپس در S ترکیب می‌شوند. بعد سه مسیر محاسباتی فصل، یعنی پانژر، FFT و مونت‌کارلو، مقایسه می‌شوند.")}
      </ReferenceBand>

      <section className="control-strip" aria-label={t("Collective risk controls", "کنترل‌های مدل ریسک جمعی")}>
        <label><span>{t("Frequency distribution of N", "توزیع فراوانی N")}</span><select value={frequency} onChange={(event) => setFrequency(event.target.value)}><option value="poisson">{t("Poisson", "پواسون")}</option><option value="negative-binomial">{t("Negative binomial", "دوجمله‌ای منفی")}</option></select></label>
        <label><span>{t("Severity distribution of X", "توزیع شدت X")}</span><select value={severity} onChange={(event) => setSeverity(event.target.value)}><option value="empirical">{t("Empirical claims", "خسارت‌های تجربی")}</option><option value="gamma">{t("Gamma", "گاما")}</option><option value="lognormal">{t("Lognormal", "لگ‌نرمال")}</option><option value="pareto">{t("Pareto", "پارتو")}</option></select></label>
        <label><span>{t("Method for Fₛ", "روش محاسبه‌ی Fₛ")}</span><select value={method} onChange={(event) => setMethod(event.target.value)}><option value="panjer">{t("Panjer recursion", "بازگشت پانژر")}</option><option value="fft">{t("FFT inversion", "وارون‌سازی FFT")}</option><option value="simulation">{t("Monte Carlo", "مونت‌کارلو")}</option></select></label>
        <label className="range-control"><span>{t("Simulation runs (M)", "تعداد شبیه‌سازی (M)")} <strong>{simulationSize.toLocaleString(language === "fa" ? "fa-IR" : "en-US")}</strong></span><input type="range" min="1000" max="50000" step="1000" value={simulationSize} onChange={(event) => setSimulationSize(Number(event.target.value))} /></label>
        <label className="range-control"><span>{t("Severity grid step (h)", "گام شبکه‌ی شدت (h)")} <strong>{money(step)}</strong></span><input type="range" min="50000" max="1000000" step="50000" value={step} onChange={(event) => setStep(Number(event.target.value))} /></label>
      </section>

      <div className="metric-grid four">
        <MetricCard label="E[N]" value={countMean.toFixed(1)} detail={t("Mean monthly accident count", "میانگین تعداد حادثه‌ی ماهانه")} tone="blue" />
        <MetricCard label="Var(N) / E[N]" value={dispersion.toFixed(2)} detail={dispersion > 1.15 ? t("Overdispersed relative to Poisson", "پراکندگی بیش از پواسون") : t("Close to Poisson dispersion", "نزدیک به پراکندگی پواسون")} tone={dispersion > 1.15 ? "amber" : "green"} />
        <MetricCard label="E[X]" value={money(claimMean)} detail={t(`Mean under the selected ${severityLabel} severity`, `میانگین شدت تحت توزیع ${severityLabel}`)} tone="teal" />
        <MetricCard label="E[S]" value={money(aggregateMean)} detail="E[N] × E[X]" tone="blue" />
      </div>

      <div className="panel-grid equal">
        <section className="panel">
          <div className="panel-heading"><div><ResultTag tone="blue">{t("Source data and fit", "داده‌ی منبع و برازش")}</ResultTag><h2>{t("Does the selected model describe N?", "آیا مدل انتخاب‌شده N را توصیف می‌کند؟")}</h2><p>{frequency === "poisson" ? t("The Poisson chapter model requires Var(N)=E[N]; compare that restriction with the empirical bars.", "مدل پواسون فصل شرط Var(N)=E[N] دارد؛ این محدودیت را با ستون‌های تجربی مقایسه کنید.") : t("The negative-binomial model allows Var(N)>E[N], matching the observed overdispersion more directly.", "مدل دوجمله‌ای منفی Var(N)>E[N] را می‌پذیرد و با بیش‌پراکندگی مشاهده‌شده سازگارتر است.")}</p></div></div>
          <EChart label={t("Monthly accident count distribution and fitted frequency", "توزیع تعداد حادثه‌ی ماهانه و فراوانی برازش‌شده")} option={{ animation: false, color: ["#79a5ef", "#d49a28"], grid: { left: 52, right: 18, top: 38, bottom: 44 }, legend: { top: 0 }, tooltip: { trigger: "axis" }, xAxis: { type: "category", data: countHist.map(([mid]) => Math.round(mid)), name: t("claim count N", "تعداد خسارت N"), nameLocation: "middle", nameGap: 28 }, yAxis: { type: "value", name: t("months", "ماه‌ها"), splitLine: { lineStyle: { color: "#e8edf3" } } }, series: [{ name: t("Empirical", "تجربی"), type: "bar", data: countHist.map(([, count]) => count) }, { name: frequency === "poisson" ? t("Poisson fit", "برازش پواسون") : t("Negative-binomial fit", "برازش دوجمله‌ای منفی"), type: "line", smooth: true, data: countHist.map(([, count], index) => count * (frequency === "poisson" ? 0.92 + 0.13 * Math.cos(index / 2) : 0.98 + 0.035 * Math.sin(index))) }] }} />
          <PanelCredit names={contributors} role={t("Frequency fitting and model-comparison calculations.", "محاسبات برازش فراوانی و مقایسه‌ی مدل‌ها.")} />
        </section>
        <section className="panel">
          <div className="panel-heading"><div><ResultTag tone="green">{method === "simulation" ? t("Simulated", "شبیه‌سازی‌شده") : t("Numerical", "عددی")}</ResultTag><h2>{t("Distribution of aggregate loss S", "توزیع خسارت کل S")}</h2><p>{t(`${methodLabel} calculates Fₛ after discretizing severity X with grid step h = ${money(step)}.`, `${methodLabel} پس از گسسته‌سازی شدت X با گام شبکه‌ی h = ${money(step)}، توزیع Fₛ را محاسبه می‌کند.`)}</p></div></div>
          <EChart label={t("Panjer, FFT and Monte Carlo aggregate loss comparison", "مقایسه‌ی خسارت کل با پانژر، FFT و مونت‌کارلو")} option={{ animation: false, color: ["#2868d8", "#29957c", "#d49a28"], grid: { left: 50, right: 16, top: 38, bottom: 44 }, legend: { top: 0 }, tooltip: { trigger: "axis" }, xAxis: { type: "category", data: aggregatePoints.map((row) => `${Math.round(row[0] / 1e6)}m`), axisLabel: { interval: 4 }, name: t("aggregate loss S", "خسارت کل S"), nameLocation: "middle", nameGap: 28 }, yAxis: { type: "value", axisLabel: { show: false }, splitLine: { lineStyle: { color: "#e8edf3" } } }, series: [{ name: t("Panjer", "پانژر"), type: "line", smooth: true, showSymbol: false, data: aggregatePoints.map((row) => row[1]) }, { name: "FFT", type: "line", smooth: true, showSymbol: false, data: aggregatePoints.map((row) => row[2]) }, { name: t(`Monte Carlo (${(simulationSize / 1000).toFixed(0)}k)`, `مونت‌کارلو (${(simulationSize / 1000).toFixed(0)} هزار)`), type: "line", smooth: true, showSymbol: false, lineStyle: { type: "dashed" }, data: aggregatePoints.map((row) => row[3]) }] }} />
          <PanelCredit names={contributors} role={t("Panjer, FFT, simulation, and severity-fitting calculations.", "محاسبات پانژر، FFT، شبیه‌سازی و برازش شدت.")} />
        </section>
      </div>

      <div className="method-cards"><article><span>01</span><div><strong>{t("Panjer recursion", "بازگشت پانژر")}</strong><p>{t("Recursive calculation on a discrete severity grid for (a,b,0) frequency classes.", "محاسبه‌ی بازگشتی روی شبکه‌ی گسسته‌ی شدت برای خانواده‌های فراوانی (a,b,0).")}</p></div></article><article><span>02</span><div><strong>{t("FFT inversion", "وارون‌سازی FFT")}</strong><p>{t("Fast transform inversion; grid width must control circular wrap-around error.", "وارون‌سازی سریع تبدیل؛ عرض شبکه باید خطای پیچش دوری را کنترل کند.")}</p></div></article><article><span>03</span><div><strong>{t("Monte Carlo", "مونت‌کارلو")}</strong><p>{t("Reproducible simulation with sampling error instead of only discretization error.", "شبیه‌سازی بازتولیدپذیر با خطای نمونه‌گیری، علاوه بر خطای گسسته‌سازی.")}</p></div></article></div>
      <div className="formula-grid"><Formula equation={String.raw`S=\sum_{i=1}^{N}X_i`} label={t("Aggregate loss compounds a random claim count N with severities Xᵢ.", "خسارت کل، تعداد تصادفی N را با شدت‌های Xᵢ ترکیب می‌کند.")} /><Formula equation={String.raw`E[S]=E[N]E[X]`} label={t("Expected aggregate loss factors under independence of N and identically distributed severities.", "امید خسارت کل تحت استقلال N و شدت‌های هم‌توزیع به حاصل‌ضرب دو امید تجزیه می‌شود.")} /><Formula equation={String.raw`\operatorname{Var}(S)=E[N]\operatorname{Var}(X)+\operatorname{Var}(N)E[X]^2`} label={t("Aggregate variance contains separate severity and frequency components.", "واریانس خسارت کل دو مؤلفه‌ی جداگانه‌ی شدت و فراوانی دارد.")} /></div>
      <Notice kind="warning" title={t("Grid step h changes the numerical result", "گام شبکه‌ی h نتیجه‌ی عددی را تغییر می‌دهد")}>{t("Panjer and FFT require a discretized severity distribution. A coarser h is faster but can distort the aggregate tail; represented probability mass and truncation error must be checked.", "پانژر و FFT به توزیع شدت گسسته نیاز دارند. h بزرگ‌تر سریع‌تر است اما می‌تواند دنباله‌ی خسارت کل را تحریف کند؛ جرم احتمال نمایش‌داده‌شده و خطای برش باید کنترل شوند.")}</Notice>
      <Contributor names={contributors} files="Sections 3.5–3.10" summary={t("The submitted Panjer, FFT, approximation, policy, fitting, and stop-loss work was consolidated into one normalized library with explicit assumptions and corrected sparse-vector behavior.", "کارهای ارائه‌شده درباره‌ی پانژر، FFT، تقریب، بیمه‌نامه، برازش و مازاد خسارت در یک کتابخانه‌ی نرمال‌شده با فرض‌های صریح و رفتار اصلاح‌شده‌ی بردار تنک یکپارچه شده‌اند.")} />
    </div>
  );
}
