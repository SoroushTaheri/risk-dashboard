"use client";

import { useMemo, useState } from "react";
import { EChart } from "../EChart";
import { Formula, InlineMath } from "../Formula";
import { tr, useLanguage } from "../i18n";
import type { PortfolioData } from "../types";
import { Contributor, MetricCard, Notice, PanelCredit, ReferenceBand, ResultTag, formatMoney } from "../ui";
import { useActuarialApi } from "../useActuarialApi";

type RuinApiResult = {
  mean_retained_loss: number;
  premium_per_period: number;
  finite_horizon_ruin_probability: number;
  monte_carlo_standard_error: number;
  ruined_paths: number;
  mean_first_ruin_month: number | null;
  loss_basis: string;
};

type RuinEstimate = { probability: number; ruinedPaths: number };

function seededWave(seed: number, index: number, path: number) {
  const value = Math.sin(seed * 12.9898 + index * 78.233 + path * 41.17) * 43758.5453;
  return value - Math.floor(value);
}

function empiricalRuinEstimate(losses: number[], premium: number, initialCapital: number, horizon: number, paths: number, seed: number): RuinEstimate {
  if (!losses.length || paths <= 0) return { probability: 0, ruinedPaths: 0 };
  let ruinedPaths = 0;
  for (let path = 0; path < paths; path += 1) {
    let surplus = initialCapital;
    for (let period = 1; period <= horizon; period += 1) {
      const index = Math.min(losses.length - 1, Math.floor(seededWave(seed, period, path) * losses.length));
      surplus += premium - losses[index];
      if (surplus < 0) {
        ruinedPaths += 1;
        break;
      }
    }
  }
  return { probability: ruinedPaths / paths, ruinedPaths };
}

function probabilityLabel(value: number, language: "en" | "fa") {
  const digits = value > 0 && value < 0.001 ? 3 : value < 0.01 ? 2 : 1;
  return `${(value * 100).toLocaleString(language === "fa" ? "fa-IR" : "en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

export function RuinExperience({ data }: { data: PortfolioData }) {
  const { language } = useLanguage();
  const t = (en: string, fa: string) => tr(language, en, fa);
  const money = (value: number) => formatMoney(value, true, language);
  const number = (value: number) => Math.round(value).toLocaleString(language === "fa" ? "fa-IR" : "en-US");
  const [capital, setCapital] = useState(Math.round(data.summary.mean_payout * 0.2 / 100) * 100);
  const [loading, setLoading] = useState(0.15);
  const [horizon, setHorizon] = useState(120);
  const [paths, setPaths] = useState(10000);
  const [retention, setRetention] = useState(data.summary.max_payout);
  const [seed, setSeed] = useState(1405);
  const { data: apiResult, error: apiError } = useActuarialApi<RuinApiResult>("/api/ruin", {
    coverage: "total", initial_capital: capital, safety_loading: loading, horizon, paths, retention, seed,
  });

  const retainedLosses = useMemo(
    () => data.months.map((row) => Math.min(row.payout, retention)),
    [data.months, retention],
  );
  const previewRetainedMean = retainedLosses.reduce((sum, value) => sum + value, 0) / retainedLosses.length;
  const previewPremium = previewRetainedMean * (1 + loading);
  const previewEstimate = useMemo(
    () => empiricalRuinEstimate(retainedLosses, previewPremium, capital, horizon, paths, seed),
    [capital, horizon, paths, previewPremium, retainedLosses, seed],
  );
  const retainedMean = apiResult?.mean_retained_loss ?? previewRetainedMean;
  const premium = apiResult?.premium_per_period ?? previewPremium;
  const ruinProbability = apiResult?.finite_horizon_ruin_probability ?? previewEstimate.probability;
  const ruinedPaths = apiResult?.ruined_paths ?? previewEstimate.ruinedPaths;
  const meanFirstRuinMonth = apiResult?.mean_first_ruin_month ?? null;
  const bounded = retention < data.summary.max_payout * 0.999;
  const meanCededLoss = Math.max(0, data.summary.mean_payout - retainedMean);
  const maximumRetainedLoss = Math.min(data.summary.max_payout, retention);
  const maximumOneMonthDrop = Math.max(0, maximumRetainedLoss - premium);
  const zeroIsForced = premium >= maximumRetainedLoss;
  const zeroEventUpper95 = 1 - Math.pow(0.05, 1 / paths);

  const samplePaths = useMemo(() => {
    const makePath = (path: number) => {
      let surplus = capital;
      const points = Array.from({ length: horizon + 1 }, (_, period) => {
        if (period > 0) {
          const index = Math.min(retainedLosses.length - 1, Math.floor(seededWave(seed, period, path) * retainedLosses.length));
          surplus += premium - retainedLosses[index];
        }
        return [period, surplus];
      });
      return { points, ruined: points.some((point) => point[1] < 0) };
    };
    const selected = Array.from({ length: 8 }, (_, path) => makePath(path));
    if (!selected.some((path) => path.ruined)) {
      for (let path = 8; path < Math.min(paths, 500); path += 1) {
        const candidate = makePath(path);
        if (candidate.ruined) {
          selected[7] = candidate;
          break;
        }
      }
    }
    return selected;
  }, [capital, horizon, paths, premium, retainedLosses, seed]);

  const capitalCurve = useMemo(() => {
    const maximumCapital = Math.max(data.summary.mean_payout * 2, capital * 1.25);
    const capitalValues = Array.from(new Set([
      ...Array.from({ length: 21 }, (_, index) => maximumCapital * index / 20),
      capital,
    ])).sort((left, right) => left - right);
    return capitalValues.map((initialCapital) => {
      const estimate = empiricalRuinEstimate(retainedLosses, premium, initialCapital, horizon, Math.min(paths, 4000), seed);
      return [initialCapital, estimate.probability];
    });
  }, [capital, data.summary.mean_payout, horizon, paths, premium, retainedLosses, seed]);
  const selectedCurveProbability = capitalCurve.find((row) => row[0] === capital)?.[1] ?? ruinProbability;
  const curveMaximumProbability = Math.max(...capitalCurve.map((row) => row[1]), ruinProbability);
  const probabilityAxisMaximum = Math.min(1, Math.max(0.05, Math.ceil(curveMaximumProbability * 20 * 1.12) / 20));
  const contributors = "ابوالفضل اقراری، حامد اشراقی";

  return (
    <div className="experience-stack">
      <ReferenceBand source={t("Modern Actuarial Risk Theory · Chapter 4.5 · Discrete-time model", "Modern Actuarial Risk Theory · فصل ۴ · نظریه ورشکستگی")} formula={String.raw`G_k=c-S_k,\quad U_k=u+\sum_{i=1}^{k}G_i`}>
        {t("This page implements the chapter's period-by-period profit model with one portfolio month as one period. It estimates ruin before a chosen month; it does not calculate the chapter's ultimate ruin probability.", "این صفحه مدل سود دوره‌به‌دوره‌ی فصل را با درنظرگرفتن هر ماه پرتفوی به‌عنوان یک دوره پیاده می‌کند. خروجی، احتمال ورشکستگی تا ماه انتخاب‌شده است؛ نه احتمال ورشکستگی نهایی فصل.")}
      </ReferenceBand>

      <section className="panel ruin-model-panel" aria-labelledby="ruin-model-title">
        <div className="panel-heading"><div><ResultTag tone="blue">{t("Simulation map", "روش شبیه‌سازی")}</ResultTag><h2 id="ruin-model-title">{t("What exactly is being simulated?", "دقیقاً چه چیزی شبیه‌سازی می‌شود؟")}</h2><p>{t("These are synthetic portfolio-month outcomes, not individual claim severities and not a chronological forecast.", "داده‌ها پیامدهای مصنوعیِ ماهانه‌ی کل پرتفوی هستند؛ نه شدت خسارت یک پرونده و نه پیش‌بینی تقویمی آینده.")}</p></div></div>
        <div className="method-cards ruin-steps">
          <article><span>1</span><div><strong>{t("Start with 1,000 months", "شروع از ۱٬۰۰۰ ماه")}</strong><p>{t("Each X is the total amount paid for all covered claims in one synthetic portfolio-month.", "هر X کل مبلغ پرداختی همه‌ی پرونده‌های تحت پوشش در یک ماه مصنوعیِ پرتفوی است.")}</p></div></article>
          <article><span>2</span><div><strong>{t("Apply monthly stop-loss", "اعمال حد خسارت ماهانه")}</strong><p><InlineMath equation={String.raw`S=\min(X,d)`} /> {t("is kept by the insurer;", "نزد بیمه‌گر می‌ماند و")} <InlineMath equation={String.raw`(X-d)_+`} /> {t("is ceded to the reinsurer.", "به بیمه‌گر اتکایی واگذار می‌شود.")}</p></div></article>
          <article><span>3</span><div><strong>{t("Build each future path", "ساخت هر مسیر آینده")}</strong><p>{t(`For each of ${number(paths)} paths, every future month independently draws one S from those 1,000 values, with replacement.`, `در هر یک از ${number(paths)} مسیر، هر ماه آینده به‌طور مستقل و با جایگذاری یک S را از همان ۱٬۰۰۰ مقدار برمی‌دارد.`)}</p></div></article>
          <article><span>4</span><div><strong>{t("Count first crossings", "شمارش اولین عبورها")}</strong><p>{t("Premium c is added and sampled loss S is subtracted. A path is ruined once U falls below zero, even if the plotted arithmetic path later recovers.", "حق‌بیمه c اضافه و خسارت نمونه‌گیری‌شده S کم می‌شود. به‌محض منفی‌شدن U مسیر ورشکسته است، حتی اگر ادامه‌ی حسابی نمودار بعداً دوباره مثبت شود.")}</p></div></article>
        </div>
        <div className="ruin-basis-note">
          <strong>{t("Current loss basis:", "مبنای خسارت فعلی:")}</strong>{" "}
          {bounded
            ? t(`The insurer retains at most ${money(retention)} from each portfolio-month; the average ceded part is ${money(meanCededLoss)} per month.`, `بیمه‌گر از هر ماه پرتفوی حداکثر ${money(retention)} را نگه می‌دارد؛ میانگین بخش واگذارشده ${money(meanCededLoss)} در ماه است.`)
            : t("The retention equals the largest loss in the 1,000-month sample, so no sampled loss is ceded: S = X in the current scenario.", "حد نگهداری برابر بزرگ‌ترین خسارت نمونه‌ی ۱٬۰۰۰ماهه است؛ بنابراین در سناریوی فعلی هیچ خسارتی واگذار نمی‌شود و S = X است.")}
        </div>
      </section>

      <section className="control-strip" aria-label={t("Solvency controls", "کنترل‌های توانگری") }>
        <label className="range-control wide"><span>{t("Initial capital u", "سرمایه‌ی اولیه u")} <strong>{money(capital)}</strong></span><input type="range" min="0" max={data.summary.mean_payout * 10} step={100} value={capital} onChange={(event) => setCapital(Number(event.target.value))} /></label>
        <label className="range-control"><span>{t("Safety loading θ", "ضریب اطمینان θ")} <strong>{(loading * 100).toFixed(0)}%</strong></span><input type="range" min="0.01" max="0.75" step="0.01" value={loading} onChange={(event) => setLoading(Number(event.target.value))} /></label>
        <label className="range-control"><span>{t("Finite horizon n", "افق محدود n")} <strong>{t(`${horizon} months`, `${horizon.toLocaleString("fa-IR")} ماه`)}</strong></span><input type="range" min="6" max="120" step="6" value={horizon} onChange={(event) => setHorizon(Number(event.target.value))} /></label>
        <label className="range-control"><span>{t("Monte Carlo paths M", "تعداد مسیر مونت‌کارلو M")} <strong>{number(paths)}</strong></span><input type="range" min="1000" max="50000" step="1000" value={paths} onChange={(event) => setPaths(Number(event.target.value))} /></label>
        <label className="range-control wide"><span>{t("Monthly retention d", "حد نگهداری ماهانه d")} <strong>{money(retention)}</strong></span><input type="range" min={data.summary.mean_payout * 0.35} max={data.summary.max_payout} step="any" value={retention} onChange={(event) => setRetention(Number(event.target.value))} /></label>
        <label><span>{t("Random seed", "بذر (seed) تصادفی")}</span><input type="number" value={seed} min="1" max="999999" onChange={(event) => setSeed(Number(event.target.value))} /></label>
      </section>

      <div className="metric-grid four">
        <MetricCard label={<><InlineMath equation={String.raw`\widehat\psi_n(u)`} /> {t("by month n", "تا ماه n")}</>} value={probabilityLabel(ruinProbability, language)} detail={ruinedPaths === 0 ? t(`0 of ${number(paths)} paths crossed zero`, `صفر مسیر از ${number(paths)} مسیر از صفر عبور کرده‌اند`) : t(`${number(ruinedPaths)} of ${number(paths)} paths crossed zero`, `${number(ruinedPaths)} مسیر از ${number(paths)} مسیر از صفر عبور کرده‌اند`)} tone="red" />
        <MetricCard label={t("Observed ruined paths", "مسیرهای ورشکسته‌ی مشاهده‌شده")} value={<bdi className="metric-fraction" dir="ltr">{number(ruinedPaths)} / {number(paths)}</bdi>} detail={meanFirstRuinMonth === null ? t("No estimated mean ruin month", "ماه میانگین ورشکستگی برآورد نشد") : t(`Mean first crossing: month ${meanFirstRuinMonth.toFixed(1)}`, `میانگین اولین عبور: ماه ${meanFirstRuinMonth.toLocaleString("fa-IR", { maximumFractionDigits: 1 })} ام`)} tone="amber" />
        <MetricCard label={<InlineMath equation={String.raw`c=(1+\theta)E[S]`} />} value={money(premium)} detail={t("Premium income added at the start of every simulated month", "درآمد حق‌بیمه‌ای که ابتدای هر ماه شبیه‌سازی‌شده اضافه می‌شود")} tone="teal" />
        <MetricCard label={<InlineMath equation={String.raw`E[S]`} />} value={money(retainedMean)} detail={bounded ? t("Mean monthly loss retained after reinsurance", "میانگین خسارت ماهانه‌ی نگهداری‌شده پس از اتکایی") : t("Mean gross monthly loss; no sampled loss is ceded", "میانگین خسارت ناخالص ماهانه؛ در حال حاضر هیچ خسارتی واگذار نشده است")} tone="blue" />
      </div>

      {ruinedPaths === 0 ? (
        <Notice kind={zeroIsForced ? "warning" : "info"} title={t("Why is the estimate zero?", "چرا برآورد صفر است؟")}>
          {zeroIsForced
            ? t(`With these settings, premium c (${money(premium)}) is at least the largest possible retained sampled loss (${money(maximumRetainedLoss)}). Every monthly increment c-S is non-negative, so ruin is impossible inside this finite empirical model.`, `با تنظیمات فعلی، حق‌بیمه c (${money(premium)}) بزرگ‌تر از اندازه‌ی بزرگ‌ترین خسارت نگهداری‌شده (${money(maximumRetainedLoss)}) است. بنابراین تمام تغییرات ماهانه‌ی c-S نامنفی‌اند و ورشکستگی در این مدل تجربی متناهی ناممکن است.`)
            : t(`None of the ${number(paths)} simulated paths crossed zero. That is a Monte Carlo result, not proof of impossibility: with zero observed events, probabilities below ${probabilityLabel(1 / paths, language)} cannot be resolved, and the approximate one-sided 95% upper limit is ${probabilityLabel(zeroEventUpper95, language)}. The largest one-month drop available in the sample is ${money(maximumOneMonthDrop)}, compared with initial capital ${money(capital)}.`, `هیچ‌یک از ${number(paths)} مسیر شبیه‌سازی‌شده از صفر عبور نکرد. این نتیجه‌ی مونت‌کارلو است، نه اثبات ناممکن‌بودن: با صفر رخداد مشاهده‌شده، احتمال‌های کمتر از ${probabilityLabel(1 / paths, language)} قابل تفکیک نیستند و حد بالای یک‌طرفه‌ی تقریبی ۹۵٪ برابر ${probabilityLabel(zeroEventUpper95, language)} است. بزرگ‌ترین افت یک‌ماهه‌ی موجود در نمونه ${money(maximumOneMonthDrop)} و سرمایه‌ی اولیه ${money(capital)} است.`)}
        </Notice>
      ) : (
        <Notice kind="info" title={t("How to read the estimate", "نحوه‌ی خواندن برآورد")}>
          {t(`${number(ruinedPaths)} of ${number(paths)} paths crossed below zero at least once during the first ${number(horizon)} months. The estimate is their fraction.`, `${number(ruinedPaths)} مسیر از ${number(paths)} مسیر، ام دست‌کم یک‌بار در ${number(horizon)} ماه نخست زیر صفر رفتند. مقدار برآورد بالا، برابر نسبت تعداد این مسیرها به کل مسیرهاست.`)}
        </Notice>
      )}

      <div className="panel-grid two-thirds">
        <section className="panel">
          <div className="panel-heading"><div><ResultTag tone="red">{t("Eight illustrative paths", "هشت مسیر نمایشی")}</ResultTag><h2>{t("How the insurer's surplus changes month by month", "تغییر ماه‌به‌ماه مازاد بیمه‌گر")}</h2><p>{t("Vertical axis: surplus U_k in million tomans. Every solvent path uses the same thin blue style. Every path that crosses the dashed zero threshold is emphasized with a thicker red line. When available, the set includes a ruined path so the event is visible; the probability still uses all M paths.", "محور عمودی مازاد U_k بر حسب میلیون تومان است. همه‌ی مسیرهای بدون ورشکستگی با خط آبی نازک و هر مسیری که از آستانه‌ی صفرِ خط‌چین عبور کند با خط قرمزِ برجسته نمایش داده می‌شود. در صورت وجود، یک مسیر ورشکسته گلچین شده نمایش داده می‌شود تا رخداد ورشکستگی دیده شود.")}</p></div></div>
          <EChart label={t("Eight sample insurer surplus paths; horizontal axis future month and vertical axis surplus in million tomans", "هشت مسیر نمونه‌ی مازاد بیمه‌گر؛ محور افقی ماه آینده و محور عمودی مازاد بر حسب میلیون تومان")} option={{ animation: false, grid: { left: 82, right: 20, top: 28, bottom: 50 }, tooltip: { trigger: "axis", valueFormatter: (value: unknown) => money(Number(Array.isArray(value) ? value[1] : value)) }, xAxis: { type: "value", name: t("Future month k", "ماه آینده k"), nameLocation: "middle", nameGap: 30, min: 0, max: horizon }, yAxis: { type: "value", name: t("Surplus Uₖ (million tomans)", "مازاد Uₖ (میلیون تومان)"), nameLocation: "middle", nameGap: 64, axisLabel: { formatter: (value: number) => number(value) }, splitLine: { lineStyle: { color: "#e8edf3" } } }, series: samplePaths.map((series, index) => ({ name: series.ruined ? t(`Ruined path ${index + 1}`, `مسیر ورشکسته ${(index + 1).toLocaleString("fa-IR")}`) : t(`Solvent path ${index + 1}`, `مسیر بدون ورشکستگی ${(index + 1).toLocaleString("fa-IR")}`), type: "line" as const, data: series.points, showSymbol: false, z: series.ruined ? 5 : 2, lineStyle: { width: series.ruined ? 3.2 : 1.25, opacity: series.ruined ? 1 : 0.52, color: series.ruined ? "#c92f3b" : "#7ea6df" }, markLine: index === 0 ? { silent: true, symbol: "none", label: { formatter: t("Ruin threshold U=0", "آستانه‌ی ورشکستگی U=0") }, lineStyle: { color: "#c63f49", width: 2, type: "dashed" }, data: [{ yAxis: 0 }] } : undefined })) }} />
          <PanelCredit names={contributors} role={t("Finite-horizon direct simulation of the Chapter 4.5 surplus recursion.", "شبیه‌سازی مستقیم افق محدودِ رابطه‌ی بازگشتی مازاد در بخش ۴٫۵.")} />
        </section>
        <section className="panel">
          <div className="panel-heading"><div><ResultTag tone="slate">{t("Capital sensitivity", "حساسیت به سرمایه")}</ResultTag><h2>{t("What changes when only initial capital changes?", "بررسی حساسیت (فقط) به سرمایه اولیه")}</h2><p>{t(`All settings and sampled loss values stay fixed; only u changes along this curve. T is the first ruin month: T=min{k≥1: U_k<0}. Therefore Pr(T≤n) is the chance that surplus crosses below zero at least once by month n. The vertical axis ends just above the largest estimated probability on this curve—currently ${probabilityLabel(probabilityAxisMaximum, language)}—only to make differences readable.`, `در طول این منحنی همه‌ی مقادیر قابل تنظیم بالا (ضریب اطمینان و ...) ثابت‌اند و فقط u تغییر می‌کند. T ماهِ اولین ورشکستگی است: T=min{k≥1: U_k<0} و  Pr(T≤n) یعنی احتمال اینکه مازاد تا پایان ماه n ام دست‌کم یک‌بار زیر صفر برود. سقف محور عمودی فقط برای خواناترشدن تفاوت‌ها کمی بالاتر از بیشترین احتمال این منحنی قرار می‌گیرد (در حال حاضر ${probabilityLabel(probabilityAxisMaximum, language)})`)}</p></div></div>
          <EChart height={310} label={t("Finite-horizon ruin probability by initial capital; horizontal axis capital in million tomans and vertical axis probability in percent", "احتمال ورشکستگی افق محدود بر حسب سرمایه‌ی اولیه؛ محور افقی میلیون تومان و محور عمودی درصد احتمال")} option={{ animation: false, grid: { left: 72, right: 20, top: 34, bottom: 56 }, tooltip: { trigger: "axis", formatter: (params: unknown) => { const rows = params as Array<{ value: [number, number] }>; const value = rows[0]?.value; return value ? `${t("Initial capital", "سرمایه‌ی اولیه")}: ${money(value[0])}<br/>${t("Estimated ruin probability", "احتمال برآوردی ورشکستگی")}: ${probabilityLabel(value[1], language)}` : ""; } }, xAxis: { type: "value", name: t("Initial capital u (million tomans)", "سرمایه‌ی اولیه u (میلیون تومان)"), nameLocation: "middle", nameGap: 36, axisLabel: { formatter: (value: number) => number(value) } }, yAxis: { type: "value", min: 0, max: probabilityAxisMaximum, name: t("Pr(first ruin by month n)", "احتمال ورشکستگی تا ماه n"), nameLocation: "middle", nameGap: 48, axisLabel: { formatter: (value: number) => `${Math.round(value * 100)}%` }, splitLine: { lineStyle: { color: "#e8edf3" } } }, series: [{ name: t("Capital curve", "منحنی سرمایه"), type: "line", smooth: true, symbolSize: 5, data: capitalCurve, lineStyle: { color: "#c63f49", width: 2.3 }, itemStyle: { color: "#c63f49" }, areaStyle: { color: "rgba(198,63,73,.09)" }, markLine: { silent: true, symbol: "none", label: { show: false }, lineStyle: { color: "#65758a", type: "dashed" }, data: [{ xAxis: capital }] } }, { name: t("Selected capital", "سرمایه‌ی انتخابی"), type: "scatter", symbolSize: 11, data: [[capital, selectedCurveProbability]], label: { show: true, formatter: t("Selected u", "u انتخابی"), position: "right", distance: 7, color: "#33455f", fontSize: 10, backgroundColor: "rgba(255,255,255,.88)", padding: [2, 4] }, itemStyle: { color: "#233d63", borderColor: "#fff", borderWidth: 2 }, z: 8 }] }} />
          <PanelCredit names={contributors} />
        </section>
      </div>

      <div className="formula-grid">
        <Formula equation={String.raw`S_k=\min(X_{I_k},d),\quad I_k\sim\operatorname{Uniform}\{1,\ldots,1000\}`} label={t("X is one synthetic month's total paid loss; S is the part retained by the insurer after monthly aggregate stop-loss.", "X کل خسارت پرداختی یک ماه مصنوعی و S سهم نگهداری‌شده‌ی بیمه‌گر پس از حد خسارت تجمیعی ماهانه است.")} hint={t("Loss input", "ورودی خسارت")} />
        <Formula equation={String.raw`G_k=c-S_k,\quad U_k=U_{k-1}+G_k,\quad U_0=u`} label={t("Each month adds premium income and subtracts that month's retained aggregate loss. Positive expected profit follows from θ>0.", "در هر ماه درآمد حق‌بیمه اضافه و خسارت تجمیعی نگهداری‌شده‌ی همان ماه کم می‌شود. با θ>0 امید سود مثبت است.")} hint={t("Chapter 4.5 recursion", "رابطه‌ی بازگشتی بخش ۴٫۵")} />
        <Formula equation={String.raw`\widehat\psi_n(u)=\frac{1}{M}\sum_{j=1}^{M}\mathbf{1}\!\left\{\min_{1\le k\le n}U_k^{(j)}<0\right\}`} label={t("This dashboard's finite-horizon estimate is the fraction of M simulated paths ruined on or before month n.", "برآورد افق محدود این داشبورد سهم مسیرهای شبیه‌سازی‌شده‌ای است که تا پایان ماه n ام دست‌کم یک‌بار ورشکسته شده‌اند.")} hint={t("Dashboard estimate", "برآورد داشبورد")} />
      </div>
      {/* <Notice kind="info" title={t("Why there is no Lundberg bound on this page", "چرا کران لوندبرگ در این صفحه نیست؟")}>{t("The source model includes a Pareto heavy-tail component. A finite sample is mechanically bounded, but it does not justify assuming that the underlying loss distribution has a finite positive moment-generating function. Direct finite-horizon resampling is therefore reported without inventing an adjustment coefficient or an ultimate-ruin result.", "مدل منبع شامل مؤلفه‌ی پارتوی دنباله‌سنگین است. نمونه‌ی متناهی به‌طور مکانیکی کراندار است، اما این موضوع فرض وجود تابع مولد گشتاور مثبت و متناهی برای توزیع زیربنایی را توجیه نمی‌کند. بنابراین بازنمونه‌گیری مستقیم افق محدود گزارش می‌شود و ضریب تعدیل یا نتیجه‌ی ورشکستگی نهایی ساخته نمی‌شود.")}</Notice> */}
      {apiError ? <Notice kind="warning" title={t("Authoritative API unavailable", "API مرجع در دسترس نیست")}>{t("A deterministic browser preview is visible, but the reported ruin metric becomes authoritative only when the Python service responds.", "پیش‌نمایش قطعی مرورگر قابل مشاهده است، اما سنجه‌ی ورشکستگی فقط با پاسخ سرویس پایتون مرجع می‌شود.")}</Notice> : null}
      <Contributor names={contributors} summary={t("The submitted Chapter 4 heavy-tail, discrete-time ruin model is connected to the reconciled 1,000-month loss sample and S=min(X,d). Seeded empirical resampling estimates finite-horizon first ruin under c=(1+theta)E[S], reports Monte Carlo uncertainty and first-ruin timing, and supports surplus-path and initial-capital sensitivity views. No ultimate-ruin probability or Lundberg bound is reported because the Pareto component does not justify a finite positive moment-generating function.", "مدل ارائه‌شده‌ی ورشکستگی زمان‌گسسته و دنباله‌سنگین فصل ۴ به نمونه‌ی تطبیق‌یافته‌ی ۱٬۰۰۰ماهه و رابطه‌ی S=min(X,d) متصل شده است. بازنمونه‌گیری تجربی با بذر ثابت، اولین ورشکستگی در افق محدود را تحت c=(1+theta)E[S] برآورد می‌کند، عدم‌قطعیت مونت‌کارلو و زمان اولین ورشکستگی را گزارش می‌دهد و نمودار مسیر مازاد و حساسیت به سرمایه‌ی اولیه را می‌سازد. چون مؤلفه‌ی پارتو وجود تابع مولد گشتاور مثبت و متناهی را توجیه نمی‌کند، احتمال ورشکستگی نهایی یا کران لوندبرگ گزارش نمی‌شود.")} />
    </div>
  );
}
