"use client";

import { useMemo, useState } from "react";
import { EChart } from "../EChart";
import { Formula, InlineMath } from "../Formula";
import { tr, useLanguage } from "../i18n";
import type { PortfolioData } from "../types";
import { Contributor, MetricCard, Notice, PanelCredit, ReferenceBand, ResultTag, formatMoney } from "../ui";
import { useActuarialApi } from "../useActuarialApi";

type RuinApiResult = { mean_retained_loss: number; premium_per_period: number; finite_horizon_ruin_probability: number; monte_carlo_standard_error: number; loss_basis: string };

function seededWave(seed: number, index: number, path: number) {
  const value = Math.sin(seed * 12.9898 + index * 78.233 + path * 41.17) * 43758.5453;
  return value - Math.floor(value);
}

function empiricalRuinProbability(losses: number[], premium: number, initialCapital: number, horizon: number, paths: number, seed: number) {
  if (!losses.length || paths <= 0) return 0;
  let ruined = 0;
  for (let path = 0; path < paths; path += 1) {
    let surplus = initialCapital;
    for (let period = 1; period <= horizon; period += 1) {
      const index = Math.min(losses.length - 1, Math.floor(seededWave(seed, period, path) * losses.length));
      surplus += premium - losses[index];
      if (surplus < 0) {
        ruined += 1;
        break;
      }
    }
  }
  return ruined / paths;
}

export function RuinExperience({ data }: { data: PortfolioData }) {
  const { language } = useLanguage();
  const t = (en: string, fa: string) => tr(language, en, fa);
  const money = (value: number) => formatMoney(value, true, language);
  const [capital, setCapital] = useState(data.summary.mean_payout * 3);
  const [loading, setLoading] = useState(0.2);
  const [horizon, setHorizon] = useState(24);
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
  const previewRuinProbability = useMemo(
    () => empiricalRuinProbability(retainedLosses, previewPremium, capital, horizon, paths, seed),
    [capital, horizon, paths, previewPremium, retainedLosses, seed],
  );
  const retainedMean = apiResult?.mean_retained_loss ?? previewRetainedMean;
  const premium = apiResult?.premium_per_period ?? previewPremium;
  const ruinProbability = apiResult?.finite_horizon_ruin_probability ?? previewRuinProbability;
  const standardError = apiResult?.monte_carlo_standard_error ?? Math.sqrt(ruinProbability * (1 - ruinProbability) / paths);
  const bounded = retention < data.summary.max_payout * 0.999;
  const samplePaths = useMemo(() => Array.from({ length: 8 }, (_, path) => {
    let surplus = capital;
    return Array.from({ length: horizon + 1 }, (_, period) => {
      if (period > 0) {
        const index = Math.min(retainedLosses.length - 1, Math.floor(seededWave(seed, period, path) * retainedLosses.length));
        surplus += premium - retainedLosses[index];
      }
      return [period, surplus];
    });
  }), [capital, horizon, premium, retainedLosses, seed]);
  const capitalCurve = useMemo(() => Array.from({ length: 16 }, (_, index) => {
    const initialCapital = data.summary.mean_payout * index * 0.5;
    return [initialCapital, empiricalRuinProbability(retainedLosses, premium, initialCapital, horizon, Math.min(paths, 2000), seed)];
  }), [data.summary.mean_payout, horizon, paths, premium, retainedLosses, seed]);
  const contributors = "ابوالفضل اقراری، حامد اشراقی";

  return (
    <div className="experience-stack">
      <ReferenceBand source={t("Modern Actuarial Risk Theory · Chapter 4 · Ruin theory", "Modern Actuarial Risk Theory · فصل ۴ · نظریه‌ی ورشکستگی")} formula={String.raw`U_n=u+\sum_{i=1}^{n}(c-S_i),\quad c=(1+\theta)E[S]`}>
        {t("Each future period resamples one retained aggregate loss from the same monthly distribution used by reinsurance. No disconnected severity proxy or invented adjustment coefficient is used.", "در هر دوره‌ی آینده، یک خسارت کل نگهداری‌شده از همان توزیع ماهانه‌ی مورد استفاده در اتکایی بازنمونه‌گیری می‌شود. هیچ نماینده‌ی شدت جدا یا ضریب تعدیل ساختگی استفاده نمی‌شود.")}
      </ReferenceBand>

      <section className="control-strip" aria-label={t("Solvency controls", "کنترل‌های توانگری")}>
        <label className="range-control wide"><span>{t("Initial capital", "سرمایه‌ی اولیه")} <strong>{money(capital)}</strong></span><input type="range" min="0" max={data.summary.mean_payout * 10} step={100} value={capital} onChange={(event) => setCapital(Number(event.target.value))} /></label>
        <label className="range-control"><span>{t("Safety loading", "ضریب اطمینان")} <strong>{(loading * 100).toFixed(0)}%</strong></span><input type="range" min="0.01" max="0.75" step="0.01" value={loading} onChange={(event) => setLoading(Number(event.target.value))} /></label>
        <label className="range-control"><span>{t("Time horizon", "افق زمانی")} <strong>{t(`${horizon} months`, `${horizon.toLocaleString("fa-IR")} ماه`)}</strong></span><input type="range" min="6" max="120" step="6" value={horizon} onChange={(event) => setHorizon(Number(event.target.value))} /></label>
        <label className="range-control"><span>{t("Simulation paths", "تعداد مسیر شبیه‌سازی")} <strong>{paths.toLocaleString(language === "fa" ? "fa-IR" : "en-US")}</strong></span><input type="range" min="1000" max="50000" step="1000" value={paths} onChange={(event) => setPaths(Number(event.target.value))} /></label>
        <label className="range-control wide"><span>{t("Per-period stop-loss retention", "حد نگهداری توقف‌خسارت هر دوره")} <strong>{money(retention)}</strong></span><input type="range" min={data.summary.mean_payout * 0.35} max={data.summary.max_payout} step={50} value={retention} onChange={(event) => setRetention(Number(event.target.value))} /></label>
        <label><span>{t("Random seed", "بذر تصادفی")}</span><input type="number" value={seed} min="1" max="999999" onChange={(event) => setSeed(Number(event.target.value))} /></label>
      </section>

      <div className="metric-grid four">
        <MetricCard label={<InlineMath equation={String.raw`\widehat\psi_n(u)`} />} value={`${(ruinProbability * 100).toFixed(1)}%`} detail={t(`± ${(1.96 * standardError * 100).toFixed(1)} percentage points, Monte Carlo`, `± ${(1.96 * standardError * 100).toFixed(1)} واحد درصد، مونت‌کارلو`)} tone="red" />
        <MetricCard label={<InlineMath equation={String.raw`c=(1+\theta)E[S]`} />} value={money(premium)} detail={t("Premium basis per future portfolio-month", "مبنای حق‌بیمه در هر ماه آینده‌ی پرتفوی")} tone="teal" />
        <MetricCard label={<InlineMath equation={String.raw`E[S]`} />} value={money(retainedMean)} detail={bounded ? t("Empirical retained monthly loss", "خسارت ماهانه‌ی نگهداری‌شده‌ی تجربی") : t("Empirical gross monthly loss", "خسارت ناخالص ماهانه‌ی تجربی")} tone="blue" />
        <MetricCard label={t("Loss basis", "مبنای خسارت")} value={t("Same months", "همان ماه‌ها")} detail={t("Shared with reinsurance; insurer-paid loss only", "مشترک با اتکایی؛ فقط خسارت پرداختی بیمه‌گر")} tone="amber" />
      </div>

      <div className="panel-grid two-thirds">
        <section className="panel">
          <div className="panel-heading"><div><ResultTag tone="red">{t("Empirical simulation", "شبیه‌سازی تجربی")}</ResultTag><h2>{t("Sample paths of the surplus process", "مسیرهای نمونه‌ی فرایند مازاد")}</h2><p>{t("Each future month resamples one retained monthly portfolio loss. Crossing zero is ruin within the selected finite horizon.", "هر ماه آینده یک خسارت ماهانه‌ی نگهداری‌شده‌ی پرتفوی را بازنمونه‌گیری می‌کند. عبور از صفر به معنی ورشکستگی در افق محدود انتخاب‌شده است.")}</p></div></div>
          <EChart label={t("Sample insurer surplus paths over the selected horizon", "مسیرهای نمونه‌ی مازاد بیمه‌گر در افق انتخاب‌شده")} option={{ animation: false, grid: { left: 66, right: 20, top: 20, bottom: 46 }, tooltip: { trigger: "axis" }, xAxis: { type: "value", name: t("future month", "ماه آینده"), nameLocation: "middle", nameGap: 28, min: 0, max: horizon }, yAxis: { type: "value", axisLabel: { formatter: (value: number) => language === "fa" ? `${Math.round(value).toLocaleString("fa-IR")} م.ت` : `${Math.round(value)}m` }, splitLine: { lineStyle: { color: "#e8edf3" } } }, series: [...samplePaths.map((series, index) => ({ type: "line" as const, data: series, showSymbol: false, lineStyle: { width: index === 0 ? 2.3 : 1, opacity: index === 0 ? 1 : 0.42, color: index === 0 ? "#2868d8" : "#86a8dc" } })), { type: "line", data: [[0, 0], [horizon, 0]], showSymbol: false, lineStyle: { color: "#c63f49", width: 2, type: "dashed" } }] }} />
          <PanelCredit names={contributors} role={t("Finite-horizon ruin simulation using retained monthly losses.", "شبیه‌سازی ورشکستگی افق محدود با خسارت‌های ماهانه‌ی نگهداری‌شده.")} />
        </section>
        <section className="panel">
          <div className="panel-heading"><div><ResultTag tone="slate">{t("Capital sensitivity", "حساسیت به سرمایه")}</ResultTag><h2>{t("Ruin probability as initial capital changes", "تغییر احتمال ورشکستگی با سرمایه‌ی اولیه")}</h2><p>{t("Every point reruns the same empirical finite-horizon simulation at a different initial capital.", "هر نقطه همان شبیه‌سازی تجربی افق محدود را با سرمایه‌ی اولیه‌ی متفاوت اجرا می‌کند.")}</p></div></div>
          <EChart height={275} label={t("Finite-horizon ruin probability by initial capital", "احتمال ورشکستگی افق محدود بر حسب سرمایه‌ی اولیه")} option={{ animation: false, grid: { left: 58, right: 16, top: 16, bottom: 48 }, tooltip: { trigger: "axis", valueFormatter: (value: unknown) => `${(Number(value) * 100).toFixed(1)}%` }, xAxis: { type: "category", data: capitalCurve.map((row) => language === "fa" ? `${Math.round(row[0]).toLocaleString("fa-IR")} م.ت` : `${Math.round(row[0])}m`), axisLabel: { interval: 2 }, name: t("initial capital", "سرمایه‌ی اولیه"), nameLocation: "middle", nameGap: 30 }, yAxis: { type: "value", min: 0, max: 1, axisLabel: { formatter: (value: number) => `${Math.round(value * 100)}%` }, splitLine: { lineStyle: { color: "#e8edf3" } } }, series: [{ type: "line", smooth: true, symbolSize: 5, data: capitalCurve.map((row) => row[1]), lineStyle: { color: "#c63f49", width: 2.3 }, itemStyle: { color: "#c63f49" }, areaStyle: { color: "rgba(198,63,73,.09)" } }] }} />
          <PanelCredit names={contributors} />
        </section>
      </div>

      <div className="formula-grid"><Formula equation={String.raw`U_n=u+\sum_{i=1}^{n}(c-S_i)`} label={t("Discrete surplus equals initial capital plus accumulated premium less retained aggregate losses.", "مازاد گسسته برابر سرمایه‌ی اولیه به‌علاوه‌ی حق‌بیمه‌ی انباشته منهای خسارت‌های کل نگهداری‌شده است.")} hint={t("Ruin", "ورشکستگی")} /><Formula equation={String.raw`c=(1+\theta)E[S]`} label={t("Premium per period uses the same retained-loss basis as the reinsurance page.", "حق‌بیمه‌ی هر دوره از همان مبنای خسارت نگهداری‌شده‌ی صفحه‌ی اتکایی استفاده می‌کند.")} hint={t("Safety loading", "ضریب اطمینان")} /><Formula equation={String.raw`\widehat\psi_n(u)=M^{-1}\sum_{j=1}^{M}1\{\min_k U_k^{(j)}<0\}`} label={t("Finite-horizon ruin is the fraction of simulated paths that cross zero.", "ورشکستگی افق محدود سهم مسیرهای شبیه‌سازی‌شده‌ای است که از صفر عبور می‌کنند.")} /></div>
      <Notice kind="info" title={t("Finite-horizon estimate, not an invented ultimate-ruin bound", "برآورد افق محدود، نه کران ساختگی ورشکستگی نهایی")}>{t("The monthly distribution is empirical and may be heavy-tailed. This page therefore reports reproducible finite-horizon Monte Carlo results and does not manufacture a moment-generating function or Lundberg coefficient.", "توزیع ماهانه تجربی است و می‌تواند دنباله‌سنگین باشد. بنابراین این صفحه نتایج بازتولیدپذیر مونت‌کارلوی افق محدود را گزارش می‌کند و تابع مولد گشتاور یا ضریب لوندبرگ ساختگی نمی‌سازد.")}</Notice>
      {apiError ? <Notice kind="warning" title={t("Authoritative API unavailable", "API مرجع در دسترس نیست")}>{t("A deterministic browser preview is visible, but the reported ruin metric becomes authoritative only when the Python service responds.", "پیش‌نمایش قطعی مرورگر قابل مشاهده است، اما سنجه‌ی ورشکستگی فقط با پاسخ سرویس پایتون مرجع می‌شود.")}</Notice> : null}
      <Contributor names={contributors} files="insurance_ruin_analysis.py" summary={t("The ruin exercise consumes the same retained monthly losses and premium basis as reinsurance, with deterministic empirical resampling and Monte Carlo uncertainty.", "تمرین ورشکستگی از همان خسارت‌های ماهانه‌ی نگهداری‌شده و مبنای حق‌بیمه‌ی اتکایی استفاده می‌کند و بازنمونه‌گیری تجربی قطعی و عدم‌قطعیت مونت‌کارلو را نشان می‌دهد.")} />
    </div>
  );
}
