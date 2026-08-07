"use client";

import { GitBranch, ShieldCheck, TableProperties, WalletCards } from "lucide-react";
import { useMemo, useState } from "react";
import { EChart } from "../EChart";
import type { PortfolioData } from "../types";
import { MetricCard, Notice, PanelCredit, ReferenceBand, ResultTag, formatMoney, formatNumber } from "../ui";
import { tr, useLanguage } from "../i18n";
import type { Coverage } from "./helpers";
import { histogram, updateScenario, valuesFor } from "./helpers";

export function PortfolioExperience({ data }: { data: PortfolioData }) {
  const { language } = useLanguage();
  const t = (en: string, fa: string) => tr(language, en, fa);
  const money = (value: number, compact = true) => formatMoney(value, compact, language);
  const [monthIndex, setMonthIndex] = useState(0);
  const [coverage, setCoverage] = useState<Coverage>("total");
  const [logScale, setLogScale] = useState(false);
  const month = data.months[monthIndex];
  const values = valuesFor(data.months, coverage);
  const distribution = useMemo(() => histogram(values, 26), [values]);
  const lineData = data.months.filter((_, index) => index % 4 === 0).map((row) => [row.month_id, coverage === "own" ? row.own_amount : coverage === "third" ? row.third_amount : row.payout]);
  const composition = [
    { value: month.own_amount, name: t("Own damage", "خسارت بدنه") },
    { value: month.third_amount, name: t("Third party", "خسارت شخص ثالث") },
  ];

  return (
    <div className="experience-stack">
      <ReferenceBand source={t("Course dataset · shared input to Chapters 1–4", "دادهٔ پروژه · ورودی مشترک فصل‌های ۱ تا ۴")} formula="X → S → Uₙ">
        {t("The source monthly loss X is the input to risk measures; reconstructed policy and claim records support the individual and collective sums S; retained aggregate loss then enters the surplus process Uₙ.", "خسارت ماهانهٔ منبع X ورودی سنجه‌های ریسک است؛ رکوردهای بازسازی‌شدهٔ بیمه‌نامه و خسارت، مجموع‌های انفرادی و جمعی S را می‌سازند؛ سپس خسارت کل نگهداری‌شده وارد فرایند مازاد Uₙ می‌شود.")}
      </ReferenceBand>
      <div className="metric-grid four">
        <MetricCard label={t("Independent months", "ماه‌های مستقل")} value={formatNumber(data.summary.months, 0, language)} detail={t("Source rows · no calendar dates", "ردیف‌های منبع · بدون تاریخ تقویمی")} tone="blue" />
        <MetricCard label={t("Total portfolio payout", "مجموع پرداخت پرتفوی")} value={money(data.summary.total_payout)} detail={t("Sum of X across the supplied CSV", "جمع X در فایل CSV منبع")} tone="teal" />
        <MetricCard label={t("Empirical 95th percentile", "صدک تجربی ۹۵")} value={money(data.summary.p95_payout)} detail={t("Sample quantile used in tail analysis", "چندک نمونه برای تحلیل دنباله")} tone="amber" />
        <MetricCard label={t("Maximum observed month", "بیشترین ماه مشاهده‌شده")} value={money(data.summary.max_payout)} detail={t("A sample tail observation, not a forecast", "یک مشاهدهٔ دنباله‌ای؛ نه پیش‌بینی")} tone="red" />
      </div>

      <section className="control-strip" aria-label={t("Portfolio controls", "کنترل‌های پرتفوی")}>
        <label><span>{t("Loss variable (X)", "متغیر خسارت (X)")}</span><select value={coverage} onChange={(event) => { const value = event.target.value as Coverage; setCoverage(value); updateScenario("coverage", value); }}><option value="total">{t("Total payout", "کل پرداخت")}</option><option value="own">{t("Own damage", "بدنه")}</option><option value="third">{t("Third party", "شخص ثالث")}</option></select></label>
        <label className="range-control wide"><span>{t("Source month (m)", "ماه منبع (m)")} <strong>{month.month_id}</strong></span><input type="range" min="0" max={data.months.length - 1} value={monthIndex} onChange={(event) => { const value = Number(event.target.value); setMonthIndex(value); updateScenario("month", `M${String(value + 1).padStart(4, "0")}`); }} /></label>
        <label className="switch-control"><input type="checkbox" checked={logScale} onChange={(event) => setLogScale(event.target.checked)} /><span>{t("Logarithmic amount scale", "مقیاس لگاریتمی مبلغ")}</span></label>
      </section>

      <div className="panel-grid two-thirds">
        <section className="panel">
          <div className="panel-heading"><div><ResultTag>{t("Source data", "دادهٔ منبع")}</ResultTag><h2>{t("Observed monthly loss Xₘ", "خسارت ماهانهٔ مشاهده‌شده Xₘ")}</h2><p>{t("This is the loss variable used by Chapter 2 risk measures. Row order identifies months but does not represent calendar time.", "این همان متغیر خسارتی است که در سنجه‌های ریسک فصل ۲ استفاده می‌شود. ترتیب ردیف‌ها شناسهٔ ماه است و زمان تقویمی را نشان نمی‌دهد.")}</p></div></div>
          <EChart label={t(`${coverage} payout by synthetic month`, `پرداخت ${coverage} به تفکیک ماه مصنوعی`)} option={{ animation: false, grid: { left: 66, right: 18, top: 22, bottom: 42 }, tooltip: { trigger: "axis", valueFormatter: (value: unknown) => money(Number(value), false) }, xAxis: { type: "category", data: lineData.map((item) => item[0]), axisLabel: { show: false }, name: t("source month m", "ماه منبع m"), nameLocation: "middle", nameGap: 26 }, yAxis: { type: logScale ? "log" : "value", axisLabel: { formatter: (value: number) => `${Math.round(value / 1e6)}m` }, splitLine: { lineStyle: { color: "#e8edf3" } } }, series: [{ type: "line", data: lineData.map((item) => item[1]), showSymbol: false, smooth: false, lineStyle: { width: 1.6, color: "#2868d8" }, areaStyle: { color: "rgba(40,104,216,.09)" } }] }} />
          <PanelCredit names="علی تیموری" role={t("Supplied the aggregate portfolio data used in this chart.", "داده‌های تجمیعی پرتفوی مورد استفاده در این نمودار را تهیه کرده است.")} />
        </section>
        <section className="panel">
          <div className="panel-heading"><div><ResultTag tone="green">{t("Reconstructed", "بازسازی‌شده")}</ResultTag><h2>{t(`Loss decomposition for ${month.month_id}`, `تجزیهٔ خسارت در ${month.month_id}`)}</h2><p>{t("Own-damage and third-party components sum exactly to the source total Xₘ used downstream.", "اجزای بدنه و شخص ثالث دقیقاً به خسارت کل منبع Xₘ می‌رسند که در فصل‌های بعد استفاده می‌شود.")}</p></div></div>
          <EChart height={250} label={t(`${month.month_id} own-damage and third-party composition`, `ترکیب بدنه و شخص ثالث در ${month.month_id}`)} option={{ animation: false, tooltip: { trigger: "item", valueFormatter: (value: unknown) => money(Number(value), false) }, legend: { bottom: 0 }, series: [{ type: "pie", radius: ["48%", "73%"], center: ["50%", "44%"], label: { formatter: "{d}%" }, itemStyle: { borderColor: "#fff", borderWidth: 4 }, color: ["#2868d8", "#e0a329"], data: composition }] }} />
          <PanelCredit names="علی تیموری" role={t("Source amounts; the project team implemented deterministic reconciliation.", "مبالغ منبع؛ تیم پروژه تطبیق قطعی داده‌ها را پیاده‌سازی کرده است.")} />
        </section>
      </div>

      <div className="panel-grid equal">
        <section className="panel">
          <div className="panel-heading"><div><ResultTag>{t("Empirical", "تجربی")}</ResultTag><h2>{t("Empirical distribution F̂X", "توزیع تجربی F̂X")}</h2><p>{t("Chapter 2 reads VaR from this cumulative distribution and TVaR from observations beyond the selected quantile.", "در فصل ۲، VaR از این توزیع تجمعی و TVaR از مشاهدات فراتر از چندک انتخاب‌شده محاسبه می‌شود.")}</p></div></div>
          <EChart label={t("Histogram of monthly payouts", "هیستوگرام پرداخت‌های ماهانه")} option={{ animation: false, grid: { left: 56, right: 16, top: 16, bottom: 46 }, tooltip: { trigger: "axis" }, xAxis: { type: "category", data: distribution.map(([mid]) => `${Math.round(mid / 1e6)}m`), axisLabel: { interval: 4 }, name: t("monthly loss X", "خسارت ماهانه X"), nameLocation: "middle", nameGap: 30 }, yAxis: { type: "value", name: t("months", "ماه‌ها"), splitLine: { lineStyle: { color: "#e8edf3" } } }, series: [{ type: "bar", data: distribution.map(([, count]) => count), itemStyle: { color: "#75a3ee", borderRadius: [3, 3, 0, 0] } }] }} />
          <PanelCredit names="علی تیموری" />
        </section>
        <section className="panel lineage-panel">
          <div className="panel-heading"><div><ResultTag tone="green">{t("Reconciled", "تطبیق‌شده")}</ResultTag><h2>{t("Lineage for the selected month", "زنجیرهٔ ردیابی ماه انتخاب‌شده")}</h2><p>{t("The individual model uses policy links and the collective model uses claim counts and severities; both trace back to this source row.", "مدل انفرادی از پیوند بیمه‌نامه‌ها و مدل جمعی از تعداد و شدت خسارت‌ها استفاده می‌کند؛ هر دو به این ردیف منبع برمی‌گردند.")}</p></div></div>
          <div className="lineage-flow">
            <div><TableProperties /><span><strong>{t("1 source row", "۱ ردیف منبع")}</strong><small>{month.month_id}</small></span></div>
            <div><GitBranch /><span><strong>{t(`${month.accidents} accidents`, `${month.accidents.toLocaleString("fa-IR")} حادثه`)}</strong><small>{t("exact monthly count", "تعداد دقیق ماهانه")}</small></span></div>
            <div><WalletCards /><span><strong>{t(`${month.own_claims + month.third_claims} coverage claims`, `${(month.own_claims + month.third_claims).toLocaleString("fa-IR")} خسارت پوشش`)}</strong><small>{t("overlap may share accidents", "هم‌پوشانی حادثه ممکن است")}</small></span></div>
            <div><ShieldCheck /><span><strong>{t("Valid policies", "بیمه‌نامه‌های معتبر")}</strong><small>{t("risk-weighted assignment", "تخصیص وزن‌دار بر مبنای ریسک")}</small></span></div>
          </div>
          <div className="reconciliation-table" role="table" aria-label={`${month.month_id} reconciliation`}>
            <div role="row"><span>{t("Source payout", "پرداخت منبع")}</span><strong>{money(month.payout, false)}</strong></div>
            <div role="row"><span>{t("Own damage", "بدنه")}</span><strong>{money(month.own_amount, false)}</strong></div>
            <div role="row"><span>{t("Third party", "شخص ثالث")}</span><strong>{money(month.third_amount, false)}</strong></div>
            <div role="row"><span>{t("Maximum relative error", "بیشترین خطای نسبی")}</span><strong>{data.summary.max_relative_difference.toExponential(2)}</strong></div>
          </div>
          <PanelCredit names="علی تیموری" role={t("Source portfolio; reconstruction and validation were added during integration.", "پرتفوی منبع؛ بازسازی و اعتبارسنجی در مرحلهٔ یکپارچه‌سازی افزوده شده‌اند.")} />
        </section>
      </div>

      <Notice kind="success" title={t("Reconciliation gate passed", "کنترل تطبیق با موفقیت انجام شد")}>{t("All 1,000 months reproduce their accident counts, coverage counts, severity totals, mean severities, and payout totals. Derived calculations are not served if this check fails.", "در هر هزار ماه، تعداد حادثه‌ها، تعداد خسارت‌های هر پوشش، مجموع و میانگین شدت خسارت و کل پرداخت دقیقاً بازتولید شده‌اند. اگر این کنترل رد شود، محاسبات مشتق‌شده ارائه نمی‌شوند.")}</Notice>
    </div>
  );
}
