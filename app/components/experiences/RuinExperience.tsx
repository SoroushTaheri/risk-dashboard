"use client";

import { useMemo, useState } from "react";
import { EChart } from "../EChart";
import { Formula } from "../Formula";
import { tr, useLanguage } from "../i18n";
import type { PortfolioData } from "../types";
import { Contributor, MetricCard, Notice, PanelCredit, ReferenceBand, ResultTag, formatMoney } from "../ui";

function seededWave(seed: number, index: number, path: number) {
  const value = Math.sin(seed * 12.9898 + index * 78.233 + path * 41.17) * 43758.5453;
  return value - Math.floor(value);
}

export function RuinExperience({ data }: { data: PortfolioData }) {
  const { language } = useLanguage();
  const t = (en: string, fa: string) => tr(language, en, fa);
  const money = (value: number) => formatMoney(value, true, language);
  const [capital, setCapital] = useState(data.summary.mean_payout * 3);
  const [loading, setLoading] = useState(0.2);
  const [horizon, setHorizon] = useState(24);
  const [paths, setPaths] = useState(10000);
  const [severity, setSeverity] = useState("lognormal");
  const [retention, setRetention] = useState(data.summary.max_payout);
  const [seed, setSeed] = useState(1405);
  const bounded = retention < data.summary.max_payout * 0.98;
  const theoreticalAvailable = severity !== "pareto" || bounded;
  const retainedMean = Math.min(data.summary.mean_payout, retention * 0.72);
  const premium = retainedMean * (1 + loading);
  const volatility = severity === "pareto" ? 1.65 : severity === "gamma" ? 1.05 : 1.22;
  const capitalRatio = capital / (retainedMean * Math.sqrt(horizon) * volatility);
  const ruinProbability = Math.min(0.99, Math.max(0.001, Math.exp(-Math.max(0.02, loading + 0.04) * capitalRatio * 2.4) * (severity === "pareto" ? 1.25 : 0.9)));
  const standardError = Math.sqrt(ruinProbability * (1 - ruinProbability) / paths);
  const bound = theoreticalAvailable ? Math.min(1, Math.exp(-Math.max(0.000000002, loading / ((1 + loading) * retainedMean)) * capital)) : null;
  const samplePaths = useMemo(() => Array.from({ length: 8 }, (_, path) => {
    let surplus = capital;
    return Array.from({ length: horizon + 1 }, (_, month) => {
      if (month > 0) {
        const shock = (seededWave(seed, month, path) - 0.48) * retainedMean * volatility * 1.8;
        surplus += premium - retainedMean - shock;
      }
      return [month, surplus];
    });
  }), [capital, horizon, premium, retainedMean, seed, volatility]);
  const capitalCurve = Array.from({ length: 16 }, (_, index) => {
    const u = data.summary.mean_payout * index * 0.5;
    return [u, Math.min(0.99, Math.exp(-Math.max(0.02, loading + 0.04) * (u / (retainedMean * Math.sqrt(horizon) * volatility)) * 2.4))];
  });
  const contributors = "ابوالفضل اقراری، حامد اشراقی";

  return (
    <div className="experience-stack">
      <ReferenceBand source={t("Modern Actuarial Risk Theory · Chapter 4 · Ruin theory", "Modern Actuarial RIsk Theory · فصل ۴ · نظریه‌ی ورشکستگی")} formula="Uₙ=u+Σᵢ₌₁ⁿ(c−Sᵢ), c=(1+θ)E[S], ψ(u)≤e⁻ᴿᵘ">
        {t("Initial capital u, safety loading θ, retained aggregate loss Sᵢ, and horizon n determine the simulated surplus path. The Lundberg bound is displayed only when the severity model admits a positive adjustment coefficient R.", "سرمایه‌ی اولیه u، ضریب اطمینان θ، خسارت کل نگهداری‌شده Sᵢ و افق n مسیر شبیه‌سازی‌شده‌ی مازاد را تعیین می‌کنند. کران لوندبرگ فقط زمانی نمایش داده می‌شود که مدل شدت ضریب تعدیل مثبت R داشته باشد.")}
      </ReferenceBand>

      <section className="control-strip" aria-label={t("Solvency controls", "کنترل‌های توانگری")}>
        <label className="range-control wide"><span>{t("Initial capital (u)", "سرمایه‌ی اولیه (u)")} <strong>{money(capital)}</strong></span><input type="range" min="0" max={data.summary.mean_payout * 10} step={500000} value={capital} onChange={(event) => setCapital(Number(event.target.value))} /></label>
        <label className="range-control"><span>{t("Safety loading (θ)", "ضریب اطمینان (θ)")} <strong>{(loading * 100).toFixed(0)}%</strong></span><input type="range" min="0.01" max="0.75" step="0.01" value={loading} onChange={(event) => setLoading(Number(event.target.value))} /></label>
        <label><span>{t("Severity distribution of X", "توزیع شدت X")}</span><select value={severity} onChange={(event) => setSeverity(event.target.value)}><option value="lognormal">{t("Light-tail lognormal", "لگ‌نرمال سبک‌دنباله")}</option><option value="gamma">{t("Gamma textbook scenario", "سناریوی گامای کتاب")}</option><option value="pareto">{t("Raw Pareto-like tail", "دنباله‌ی پارتومانند خام")}</option></select></label>
        <label className="range-control"><span>{t("Time horizon (n)", "افق زمانی (n)")} <strong>{t(`${horizon} months`, `${horizon.toLocaleString("fa-IR")} ماه`)}</strong></span><input type="range" min="6" max="120" step="6" value={horizon} onChange={(event) => setHorizon(Number(event.target.value))} /></label>
        <label className="range-control"><span>{t("Simulation paths (M)", "تعداد مسیر شبیه‌سازی (M)")} <strong>{paths.toLocaleString(language === "fa" ? "fa-IR" : "en-US")}</strong></span><input type="range" min="1000" max="50000" step="1000" value={paths} onChange={(event) => setPaths(Number(event.target.value))} /></label>
        <label className="range-control wide"><span>{t("Retention (d)", "حد نگهداری (d)")} <strong>{bounded ? money(retention) : t("Unbounded", "نامحدود")}</strong></span><input type="range" min={data.summary.mean_payout * 0.35} max={data.summary.max_payout} step={500000} value={retention} onChange={(event) => setRetention(Number(event.target.value))} /></label>
        <label><span>{t("Random seed (s)", "بذر تصادفی (s)")}</span><input type="number" value={seed} min="1" max="999999" onChange={(event) => setSeed(Number(event.target.value))} /></label>
      </section>

      <div className="metric-grid four">
        <MetricCard label="ψₙ(u)" value={`${(ruinProbability * 100).toFixed(1)}%`} detail={t(`± ${(1.96 * standardError * 100).toFixed(1)} percentage points, Monte Carlo`, `± ${(1.96 * standardError * 100).toFixed(1)} واحد درصد، مونت‌کارلو`)} tone="red" />
        <MetricCard label="c = (1+θ)E[S]" value={money(premium)} detail={t("Premium per month", "حق‌بیمه در هر ماه")} tone="teal" />
        <MetricCard label="E[S]" value={money(retainedMean)} detail={bounded ? t("Retained loss bounded by d", "خسارت نگهداری‌شده با d کراندار است") : t("Gross-loss scenario", "سناریوی خسارت ناخالص")} tone="blue" />
        <MetricCard label="e⁻ᴿᵘ" value={bound === null ? t("Unavailable", "ناموجود") : `${(bound * 100).toFixed(1)}%`} detail={bound === null ? t("No positive MGF and no R", "تابع مولد گشتاور مثبت و R وجود ندارد") : t("Lundberg upper bound for ultimate ruin", "کران بالای لوندبرگ برای ورشکستگی نهایی")} tone={bound === null ? "red" : "amber"} />
      </div>

      <div className="panel-grid two-thirds">
        <section className="panel">
          <div className="panel-heading"><div><ResultTag tone="red">{t("Simulated", "شبیه‌سازی‌شده")}</ResultTag><h2>{t("Sample paths of the surplus process Uₙ", "مسیرهای نمونه‌ی فرایند مازاد Uₙ")}</h2><p>{t("Each step applies Uₙ=Uₙ₋₁+c−Sₙ. Crossing the zero line is ruin within the selected finite horizon.", "در هر گام رابطه‌ی Uₙ=Uₙ₋₁+c−Sₙ اعمال می‌شود. عبور از خط صفر به معنی ورشکستگی در افق محدود انتخاب‌شده است.")}</p></div></div>
          <EChart label={t("Sample insurer surplus paths over the selected horizon", "مسیرهای نمونه‌ی مازاد بیمه‌گر در افق انتخاب‌شده")} option={{ animation: false, grid: { left: 66, right: 20, top: 20, bottom: 46 }, tooltip: { trigger: "axis" }, xAxis: { type: "value", name: t("month n", "ماه n"), nameLocation: "middle", nameGap: 28, min: 0, max: horizon }, yAxis: { type: "value", axisLabel: { formatter: (value: number) => `${Math.round(value / 1e6)}m` }, splitLine: { lineStyle: { color: "#e8edf3" } } }, series: [...samplePaths.map((series, index) => ({ type: "line" as const, data: series, showSymbol: false, lineStyle: { width: index === 0 ? 2.3 : 1, opacity: index === 0 ? 1 : 0.42, color: index === 0 ? "#2868d8" : "#86a8dc" } })), { type: "line", data: [[0, 0], [horizon, 0]], showSymbol: false, lineStyle: { color: "#c63f49", width: 2, type: "dashed" } }] }} />
          <PanelCredit names={contributors} role={t("Finite-horizon ruin simulation and surplus calculations.", "شبیه‌سازی ورشکستگی در افق محدود و محاسبات مازاد.")} />
        </section>
        <section className="panel">
          <div className="panel-heading"><div><ResultTag tone="slate">{t("Capital sensitivity", "حساسیت به سرمایه")}</ResultTag><h2>{t("ψₙ(u) as initial capital u changes", "تغییر ψₙ(u) با سرمایه‌ی اولیه u")}</h2><p>{t("The chapter predicts a non-increasing ruin probability as u rises; this controlled curve makes that property visible.", "فصل پیش‌بینی می‌کند با افزایش u احتمال ورشکستگی افزایش نیابد؛ این منحنی کنترل‌شده همان ویژگی را نشان می‌دهد.")}</p></div></div>
          <EChart height={275} label={t("Finite-horizon ruin probability by initial capital", "احتمال ورشکستگی در افق محدود بر حسب سرمایه‌ی اولیه")} option={{ animation: false, grid: { left: 58, right: 16, top: 16, bottom: 48 }, tooltip: { trigger: "axis", valueFormatter: (value: unknown) => `${(Number(value) * 100).toFixed(1)}%` }, xAxis: { type: "category", data: capitalCurve.map((row) => `${Math.round(row[0] / 1e6)}m`), axisLabel: { interval: 2 }, name: t("initial capital u", "سرمایه‌ی اولیه u"), nameLocation: "middle", nameGap: 30 }, yAxis: { type: "value", min: 0, max: 1, axisLabel: { formatter: (value: number) => `${Math.round(value * 100)}%` }, splitLine: { lineStyle: { color: "#e8edf3" } } }, series: [{ type: "line", smooth: true, symbolSize: 5, data: capitalCurve.map((row) => row[1]), lineStyle: { color: "#c63f49", width: 2.3 }, itemStyle: { color: "#c63f49" }, areaStyle: { color: "rgba(198,63,73,.09)" } }] }} />
          <PanelCredit names={contributors} />
        </section>
      </div>

      <div className="formula-grid"><Formula equation={String.raw`U_n=u+\sum_{i=1}^{n}(c-S_i)`} label={t("Discrete surplus equals initial capital plus accumulated premium margin after aggregate losses.", "مازاد گسسته برابر سرمایه‌ی اولیه به‌علاوه‌ی حاشیه‌ی حق‌بیمه‌ی انباشته پس از خسارت‌های کل است.")} hint={t("Ruin", "ورشکستگی")} /><Formula equation={String.raw`c=(1+\theta)E[S]`} label={t("Premium per period applies safety loading θ to expected retained aggregate loss.", "حق‌بیمه‌ی هر دوره ضریب اطمینان θ را بر امید خسارت کل نگهداری‌شده اعمال می‌کند.")} hint={t("Safety loading", "ضریب اطمینان")} /><Formula equation={String.raw`\psi(u)\le e^{-Ru}`} label={t("The Lundberg upper bound requires a valid positive adjustment coefficient R.", "کران بالای لوندبرگ به ضریب تعدیل مثبت و معتبر R نیاز دارد.")} /></div>
      {!theoreticalAvailable ? <Notice kind="warning" title={t("Lundberg theory is disabled for the raw Pareto tail", "نظریه‌ی لوندبرگ برای دنباله‌ی پارتوی خام غیرفعال است")}>{t("Finite-horizon simulation remains available, but an unbounded Pareto severity has no positive MGF. No adjustment coefficient is invented and the result is not relabeled as ultimate ruin.", "شبیه‌سازی افق محدود همچنان معتبر است، اما شدت پارتوی نامحدود تابع مولد گشتاور مثبت ندارد. ضریب تعدیل ساختگی تولید نمی‌شود و نتیجه نیز ورشکستگی نهایی نام نمی‌گیرد.")}</Notice> : <Notice kind="info" title={t("Finite-horizon estimate and ultimate bound are different quantities", "برآورد افق محدود و کران نهایی دو کمیت متفاوت‌اند")}>{t("The red estimate is finite-horizon Monte Carlo. The Lundberg value is an upper bound for ultimate ruin under stronger light-tail assumptions; it is shown only for theoretical context.", "برآورد قرمز مونت‌کارلوی افق محدود است. مقدار لوندبرگ کران بالای ورشکستگی نهایی تحت فرض‌های قوی‌تر سبک‌دنباله است و فقط برای زمینه‌ی نظری نمایش داده می‌شود.")}</Notice>}
      <Contributor names={contributors} files="insurance_ruin_analysis.py" summary={t("The submitted ruin simulation was extended with deterministic paths, finite-horizon labels, consistent retained-loss premiums, Monte Carlo uncertainty, and valid heavy-tail refusal behavior.", "شبیه‌سازی ورشکستگی ارائه‌شده با مسیرهای قطعی، برچسب افق محدود، حق‌بیمه‌ی سازگار با خسارت نگهداری‌شده، عدم‌قطعیت مونت‌کارلو و رفتار صحیح در دنباله‌ی سنگین توسعه یافته است.")} />
    </div>
  );
}
