"use client";

import { Car, FileText, GitBranch, Users, WalletCards } from "lucide-react";
// import { ShieldCheck } from "lucide-react"; // Used by the commented explanatory cards near the bottom.
import { useState } from "react";
import { EChart } from "../EChart";
import type { PortfolioData } from "../types";
import { MetricCard, Notice, PanelCredit, ReferenceBand, formatMoney, formatNumber, formatMonthLabel } from "../ui";
import { tr, useLanguage } from "../i18n";
import type { Coverage } from "./helpers";
import { histogram, updateMonth, valuesFor } from "./helpers";

function PortfolioSectionHeading({ eyebrow, title, description, first = false }: { eyebrow: string; title: string; description: string; first?: boolean }) {
  return (
    <header className={`portfolio-section-heading${first ? " first" : ""}`}>
      <span>{eyebrow}</span>
      <h2>{title}</h2>
      <p>{description}</p>
    </header>
  );
}

export function PortfolioExperience({ data }: { data: PortfolioData }) {
  const { language } = useLanguage();
  const t = (en: string, fa: string) => tr(language, en, fa);
  const money = (value: number, compact = true) => formatMoney(value, compact, language);
  const [monthIndex, setMonthIndex] = useState(0);
  const [coverage, setCoverage] = useState<Coverage>("total");
  const month = data.months[monthIndex];
  const monthLabel = formatMonthLabel(month.month_id, language);
  const meanPaidPerClaim = month.total_claims > 0 ? month.payout / month.total_claims : 0;
  const claimsPerAccident = month.accidents > 0 ? month.total_claims / month.accidents : 0;
  const values = valuesFor(data.months, "total");
  const distribution = histogram(values, 26);
  const scatter = data.months.filter((_, index) => index % 4 === 0).map((row, index) => [index * 4 + 1, coverage === "own" ? row.own_amount : coverage === "third" ? row.third_amount : row.payout]);
  const composition = [
    { value: month.own_amount, name: t("Own-damage policies", "بیمه‌نامه‌های بدنه") },
    { value: month.third_amount, name: t("Third-party policies", "بیمه‌نامه‌های شخص ثالث") },
  ];
  const triggeredPolicyTypes = [
    { value: month.at_fault_own_claims, name: t("At-fault own damage", "بدنه‌ی مقصر") },
    { value: month.liability_claims, name: t("Third-party liability", "شخص ثالث") },
    { value: month.injured_excess_claims, name: t("Injured-party own damage", "بدنه‌ی زیان‌دیده") },
  ];

  return (
    <div className="experience-stack">
      <PortfolioSectionHeading
        first
        eyebrow={t("Data structure", "ساختار داده")}
        title={t("From vehicles to insurer-paid loss", "از خودرو تا خسارت پرداختی بیمه‌گر")}
        description={t("The entities and their relationships define what each count and amount means throughout the dashboard.", "موجودیت‌ها و رابطه‌ی میان آن‌ها مشخص می‌کنند که هر عدد و مبلغ در سراسر داشبورد چه معنایی دارد.")}
      />
      <ReferenceBand source={t("Entity-first portfolio simulation · data contract v2", "پرتفوی شبیه‌سازی شده بیمه خودرو")} formula={language === "fa" ? String.raw`\text{خودروها}\to\text{بیمه‌نامه‌های جدا}\to\text{حوادث}\to\text{پرونده‌های خسارت}\to\text{خسارت‌های پرداختی}` : String.raw`\text{vehicles}\to\text{separate policies}\to\text{accidents}\to\text{claims}\to\text{paid losses}`}>
        {t("A policy is a contract, an accident is a physical event, a claim invokes exactly one compatible policy, and paid loss is the insurer's monetary outflow. One accident may produce multiple claims, but no policy combines own-damage and third-party liability.", "بیمه‌نامه یک قرارداد، حادثه یک رویداد فیزیکی، خسارت پرونده‌ای تحت دقیقاً یک بیمه‌نامه‌ی سازگار و خسارت پرداختی خروج وجه بیمه‌گر است. یک حادثه می‌تواند چند پرونده‌ی خسارت بسازد، گرچه هیچ بیمه‌نامه‌ای بدنه و شخص ثالث را ترکیب نمی‌کند.")}
      </ReferenceBand>

      <Notice kind="info" title={t("How the chapters use the months", "نحوه استفاده از این داده در محاسبات")}>{t("The month selector controls only this page's drill-down. Risk measures, utility and reinsurance, and collective risk use the full 1,000-month sample. Individual risk estimates selected-policy outcomes across all months. Ruin theory resamples from the same full monthly loss distribution to create future paths.", "متریک‌های ریسک، مطلوبیت و اتکایی و ریسک جمعی از کل نمونه‌ی ۱۰۰۰ ماهه استفاده می‌کنند. ریسک انفرادی پیامد بیمه‌نامه‌های انتخاب‌شده را در همه‌ی ماه‌ها برآورد می‌کند. نظریه‌ی ورشکستگی نیز از همان توزیع کامل خسارت ماهانه برای ساخت مسیرهای آینده بازنمونه‌گیری می‌کند.")}</Notice>

      <PortfolioSectionHeading
        eyebrow={t("Portfolio overview", "نمای کلی پرتفوی")}
        title={t("Portfolio size and average activity", "اندازه‌ی پرتفوی و فعالیت متوسط")}
        description={t("These figures describe the fixed portfolio and its average monthly accident and claim activity across the complete dataset.", "این ارقام اندازه‌ی پرتفوی ثابت و میانگین فعالیت ماهانه‌ی حادثه و خسارت را در کل داده نشان می‌دهند.")}
      />
      <div className="metric-grid four">
        <MetricCard label={t("Insured vehicles", "خودروهای بیمه‌شده")} value={formatNumber(data.summary.vehicles, 0, language)} detail={t("One stationary portfolio", "یک پرتفوی ثابت")} tone="blue" />
        <MetricCard label={t("Separate policies", "بیمه‌نامه‌های جداگانه")} value={formatNumber(data.summary.total_policies, 0, language)} detail={t(`${data.summary.third_party_policies.toLocaleString()} liability · ${data.summary.own_damage_policies.toLocaleString()} own-damage`, `${data.summary.third_party_policies.toLocaleString("fa-IR")} شخص ثالث · ${data.summary.own_damage_policies.toLocaleString("fa-IR")} بدنه`)} tone="teal" />
        <MetricCard label={t("Mean accidents", "میانگین حادثه")} value={formatNumber(data.summary.mean_accidents, 1, language)} detail={t("Per synthetic month", "در هر ماه شبیه‌سازی‌شده")} tone="amber" />
        <MetricCard label={t("Mean claims", "میانگین پرونده خسارت")} value={formatNumber(data.summary.mean_claims, 1, language)} detail={t("Claims can exceed accidents", "تعداد خسارت می‌تواند از حادثه بیشتر باشد")} tone="red" />
      </div>

      <PortfolioSectionHeading
        eyebrow={t("Monthly Analysis", "تحلیل ماهانه")}
        title={t(`${monthLabel} at a glance`, `${monthLabel} در یک نگاه`)}
        description={t("Choose a month and coverage view, then compare its payment, claim, and accident measures before reading the charts.", "ماه مورد نظر خود را انتخاب کنید و پیش از بررسی نمودارها، متریک‌های پرداخت، پرونده‌ی خسارت و حادثه‌ی آن را ببینید.")}
      />
      <section className="control-strip" aria-label={t("Selected month controls", "کنترل‌های ماه انتخاب‌شده")}>
        <label className="range-control wide"><span>{t("Synthetic month", "ماه شبیه‌سازی‌شده")} <strong>{monthLabel}</strong></span><input type="range" min="0" max={data.months.length - 1} value={monthIndex} onChange={(event) => { const value = Number(event.target.value); setMonthIndex(value); updateMonth("month", `M${String(value + 1).padStart(4, "0")}`); }} /></label>
      </section>

      <section className="metric-grid four" aria-label={t(`Metrics for ${monthLabel}`, `متریک‌های ${monthLabel}`)}>
        <MetricCard label={t("Total paid loss", "کل خسارت پرداختی")} value={money(month.payout)} detail={t(`${money(month.own_amount)} own damage · ${money(month.third_amount)} third party`, `${money(month.own_amount)} بدنه · ${money(month.third_amount)} شخص ثالث`)} tone="blue" />
        <MetricCard label={t("Mean paid per claim", "میانگین پرداخت هر خسارت")} value={money(meanPaidPerClaim, false)} detail={t("Total paid loss divided by claim files", "کل خسارت پرداختی تقسیم بر تعداد پرونده‌های خسارت")} tone="teal" />
        <MetricCard label={t("Physical accidents", "حوادث فیزیکی")} value={formatNumber(month.accidents, 0, language)} detail={t("Events, not insurance claims", "رویدادها، نه پرونده‌های خسارت")} tone="amber" />
        <MetricCard label={t("Claim files", "پرونده‌های خسارت")} value={formatNumber(month.total_claims, 0, language)} detail={t(`${claimsPerAccident.toFixed(2)} claims per accident`, `${claimsPerAccident.toLocaleString("fa-IR", { maximumFractionDigits: 2 })} پرونده به‌ازای هر حادثه`)} tone="red" />
      </section>

      <PortfolioSectionHeading
        eyebrow={t("Loss views", "نماهای خسارت")}
        title={t("Monthly pattern and coverage composition", "روند ماهانه و ترکیب پوشش‌ها")}
        description={t("The first chart places monthly paid losses across the dataset; the two selected-month charts summarize payment and the policy types that generated claim files.", "نمودار نخست خسارت‌های پرداختی ماهانه را در کل داده نشان می‌دهد و دو نمودار ماه انتخاب‌شده، پرداخت و انواع بیمه‌نامه‌های ایجادکننده‌ی پرونده‌ی خسارت را خلاصه می‌کنند.")}
      />
      <div className="panel-grid loss-view-grid">
        <section className="panel">
          <div className="panel-heading"><div><h3>{t("Monthly insurer-paid loss", "خسارت پرداختی ماهانه‌ی بیمه‌گر")}</h3><p>{t("Months 1–1,000 are ordered synthetic months. They form the common monthly sample used by every chapter, without claiming real dates or seasonality.", "ماه اول تا 1000 ام، مرتب‌شده در محور افقی. در تمامی محاسبات از همین نمونه‌ی ماهانه استفاده می‌شود.")}</p></div></div>
          <div className="control-strip chart-control-strip" aria-label={t("Scatter chart controls", "کنترل‌های نمودار پراکندگی")}>
            <label><span>{t("Insurer-paid loss", "خسارت پرداختی بیمه‌گر")}</span><select value={coverage} onChange={(event) => { const value = event.target.value as Coverage; setCoverage(value); updateMonth("coverage", value); }}><option value="total">{t("All policies", "همه‌ی بیمه‌نامه‌ها")}</option><option value="own">{t("Own-damage policies", "بیمه‌نامه‌های بدنه")}</option><option value="third">{t("Third-party liability", "بیمه‌نامه‌های شخص ثالث")}</option></select></label>
          </div>
          <EChart label={t(`${coverage} insurer-paid loss by synthetic month`, `خسارت پرداختی ${coverage} بر حسب ماه شبیه‌سازی‌شده`)} option={{ animation: false, grid: { left: 66, right: 18, top: 22, bottom: 46 }, tooltip: { trigger: "item", valueFormatter: (value: unknown) => money(Number(value), false) }, xAxis: { type: "value", name: t("synthetic month index", "شماره‌ی ماه شبیه‌سازی‌شده"), nameLocation: "middle", nameGap: 28 }, yAxis: { type: "value", axisLabel: { formatter: (value: number) => value >= 1000 ? `${(value / 1000).toFixed(0)}bn` : `${Math.round(value)}m` }, splitLine: { lineStyle: { color: "#e8edf3" } } }, series: [{ type: "scatter", data: scatter, symbolSize: 5, itemStyle: { color: "#2868d8", opacity: 0.7 } }] }} />
          <PanelCredit names="علی تیموری، سروش طاهری" role={t("Portfolio simulation, data calibration, and monthly presentation.", "شبیه‌سازی پرتفوی و کالیبراسیون داده.")} />
        </section>
        <section className="panel">
          <div className="panel-heading"><div><h3>{t(`Loss decomposition for ${monthLabel}`, `تجزیه‌ی خسارت ${monthLabel}`)}</h3><p>{t("Paid loss is grouped by policy coverage: own damage or third party.", "خسارت پرداختی بر اساس پوشش بیمه‌نامه در دو گروه بدنه و شخص ثالث نمایش داده می‌شود.")}</p></div></div>
          <EChart height={250} label={t(`${monthLabel} paid-loss composition`, `ترکیب خسارت پرداختی ${monthLabel}`)} option={{ animation: false, tooltip: { trigger: "item", valueFormatter: (value: unknown) => money(Number(value), false) }, legend: { bottom: 0 }, series: [{ type: "pie", radius: ["48%", "73%"], center: ["50%", "44%"], label: { formatter: "{d}%" }, itemStyle: { borderColor: "#fff", borderWidth: 4 }, color: ["#2868d8", "#e0a329", "#c95c65"], data: composition }] }} />
          <PanelCredit names="علی تیموری، سروش طاهری" />
        </section>
        <section className="panel">
          <div className="panel-heading"><div><h3>{t(`Triggered policy types in ${monthLabel}`, `انواع بیمه‌نامه‌های فعال‌شده در ${monthLabel}`)}</h3><p>{t("Each slice is one claim file under a compatible policy: at-fault own damage, third-party liability, or injured-party own damage.", "هر بخش یک پرونده‌ی خسارت تحت بیمه‌نامه‌ی سازگار است: بدنه‌ی مقصر، شخص ثالث یا بدنه‌ی زیان‌دیده.")}</p></div></div>
          <EChart height={250} label={t(`${monthLabel} triggered policy types by claim count`, `انواع بیمه‌نامه‌های فعال‌شده در ${monthLabel} بر اساس تعداد خسارت`)} option={{ animation: false, tooltip: { trigger: "item", valueFormatter: (value: unknown) => `${formatNumber(Number(value), 0, language)} ${t("claim files", "پرونده")}` }, legend: { bottom: 0, type: "scroll", formatter: (name: string) => `${name}: ${formatNumber(triggeredPolicyTypes.find((item) => item.name === name)?.value ?? 0, 0, language)}` }, series: [{ type: "pie", radius: ["42%", "70%"], center: ["50%", "42%"], label: { formatter: "{b}: {c}", fontSize: 10 }, itemStyle: { borderColor: "#fff", borderWidth: 4 }, color: ["#2868d8", "#e0a329", "#29957c"], data: triggeredPolicyTypes }] }} />
          <PanelCredit names="علی تیموری، سروش طاهری" />
        </section>
      </div>

      <PortfolioSectionHeading
        eyebrow={t("Distribution and lineage", "توزیع و زنجیره‌ی موجودیت‌ها")}
        title={t("From the loss distribution back to its entities", "از توزیع خسارت تا موجودیت‌های سازنده‌ی آن")}
        description={t("Read the full monthly loss distribution alongside the selected month's path from policies and accidents to claims and payments.", "توزیع کامل خسارت ماهانه را در کنار مسیر ماه انتخاب‌شده از بیمه‌نامه و حادثه تا پرونده‌ی خسارت و پرداخت بررسی کنید.")}
      />
      <div className="panel-grid equal">
        <section className="panel">
          <div className="panel-heading"><div><h3>{t("Distribution of monthly insurer-paid loss", "توزیع خسارت پرداختی ماهانه")}</h3><p>{t("Risk measures, reinsurance, and ruin calculations all consume this same monthly variable.", "متریک‌های ریسک، اتکایی و ورشکستگی همگی از همین متغیر استفاده می‌کنند.")}</p></div></div>
          <EChart label={t("Histogram of synthetic monthly losses", "هیستوگرام خسارت‌های ماهانه‌ی شبیه‌سازی‌شده")} option={{ animation: false, grid: { left: 56, right: 16, top: 16, bottom: 46 }, tooltip: { trigger: "axis" }, xAxis: { type: "category", data: distribution.map(([mid]) => mid >= 1000 ? `${(mid / 1000).toFixed(1)}bn` : `${Math.round(mid)}m`), axisLabel: { interval: 4 }, name: t("insurer-paid loss", "خسارت پرداختی بیمه‌گر"), nameLocation: "middle", nameGap: 30 }, yAxis: { type: "value", name: t("months", "ماه‌ها"), splitLine: { lineStyle: { color: "#e8edf3" } } }, series: [{ type: "bar", data: distribution.map(([, count]) => count), itemStyle: { color: "#75a3ee", borderRadius: [3, 3, 0, 0] } }] }} />
        </section>

        <section className="panel lineage-panel">
          <div className="panel-heading"><div><h3>{t("From contracts to paid loss", "از قرارداد تا خسارت پرداختی")}</h3><p>{t("The selected month follows separate policy, accident, claim, and payment entities rather than forcing unlike counts to add.", "ماه انتخاب‌شده از موجودیت‌های جداگانه‌ی بیمه‌نامه، حادثه، پرونده‌ی خسارت و پرداخت پیروی می‌کند و شمارش‌های ناهمگون را با هم جمع نمی‌کند.")}</p></div></div>
          <div className="lineage-flow">
            <div><Users /><span><strong>{t(`${data.summary.vehicles.toLocaleString()} vehicles`, `${data.summary.vehicles.toLocaleString("fa-IR")} خودرو`)}</strong><small>{t("stationary portfolio", "پرتفوی ثابت")}</small></span></div>
            <div><FileText /><span><strong>{t(`${data.summary.total_policies.toLocaleString()} separate policies`, `${data.summary.total_policies.toLocaleString("fa-IR")} بیمه‌نامه‌ی جدا`)}</strong><small>{t("one coverage per contract", "یک پوشش در هر قرارداد")}</small></span></div>
            <div><Car /><span><strong>{t(`${month.accidents} physical accidents`, `${month.accidents.toLocaleString("fa-IR")} حادثه‌ی فیزیکی`)}</strong><small>{monthLabel}</small></span></div>
            <div><GitBranch /><span><strong>{t(`${month.total_claims} policy claims`, `${month.total_claims.toLocaleString("fa-IR")} پرونده‌ی خسارت`)}</strong><small>{t("each under one compatible policy", "هر کدام تحت یک بیمه‌نامه‌ی سازگار")}</small></span></div>
            <div><WalletCards /><span><strong>{money(month.payout)}</strong><small>{t("insurer-paid loss", "خسارت پرداختی بیمه‌گر")}</small></span></div>
          </div>
          <Notice kind="info" title={t("Claims do not have to equal accidents", "تعداد خسارت‌ها الزاماً برابر حادثه‌ها نیست")}>{t(`This month has ${month.accidents} physical accidents and ${month.total_claims} claims. An accident is one physical event, while a claim is one request for payment under one compatible policy. A single accident may create no claim if it activates no payable coverage, one claim if only one coverage responds, or several claims when separate policies respond: at-fault own damage, third-party liability, and—when an injured portfolio vehicle has applicable own-damage cover—a separate own-damage claim for its eligible damage. Here the claims are ${month.at_fault_own_claims} at-fault own-damage, ${month.injured_excess_claims} injured-vehicle own-damage, and ${month.liability_claims} liability claims, so the claim count can be lower than, equal to, or higher than the accident count.`, `این ماه ${month.accidents.toLocaleString("fa-IR")} حادثه‌ی فیزیکی و ${month.total_claims.toLocaleString("fa-IR")} پرونده‌ی خسارت دارد. حادثه یک رویداد فیزیکی است، اما پرونده‌ی خسارت یک درخواست پرداخت تحت یک بیمه‌نامه‌ی سازگار است. بنابراین یک حادثه ممکن است اگر هیچ پوشش قابل‌پرداختی را فعال نکند، هیچ پرونده‌ای نسازد؛ اگر فقط یک پوشش پاسخ‌گو باشد، یک پرونده بسازد؛ یا اگر چند بیمه‌نامه‌ی جدا پاسخ‌گو باشند، چند پرونده ایجاد کند: بدنه‌ی خودروی مقصر، شخص ثالث و (اگر خودروی زیان‌دیده در همین پرتفوی باشد و پوشش بدنه‌ی قابل‌استفاده داشته باشد) یک پرونده‌ی جداگانه‌ی بدنه برای خسارت او. در این ماه ${month.at_fault_own_claims.toLocaleString("fa-IR")} پرونده‌ی بدنه‌ی خودروی مقصر، ${month.injured_excess_claims.toLocaleString("fa-IR")} پرونده‌ی بدنه‌ی خودروی زیان‌دیده و ${month.liability_claims.toLocaleString("fa-IR")} پرونده‌ی شخص ثالث داریم؛ بنابراین تعداد پرونده‌ها می‌تواند از تعداد حادثه‌ها کمتر، برابر یا بیشتر باشد.`)}</Notice>
          <div className="reconciliation-table" role="table" aria-label={`${monthLabel} reconciliation`}>
            <div role="row"><span>{t("Own-damage paid", "پرداخت بدنه")}</span><strong>{money(month.own_amount, false)}</strong></div>
            <div role="row"><span>{t("Third-party paid", "پرداخت شخص ثالث")}</span><strong>{money(month.third_amount, false)}</strong></div>
          </div>
        </section>
      </div>

      {/* Explanatory definition cards are intentionally hidden from the portfolio page.
      <div className="limitation-list">
        <article><ShieldCheck /><strong>{t("Policy", "بیمه‌نامه")}</strong><p>{t("One coverage-specific legal contract.", "یک قرارداد حقوقی مختص یک پوشش.")}</p></article>
        <article><Car /><strong>{t("Accident", "حادثه")}</strong><p>{t("One physical occurrence involving vehicles or people.", "یک رویداد فیزیکی مربوط به خودرو یا اشخاص.")}</p></article>
        <article><GitBranch /><strong>{t("Claim", "پرونده‌ی خسارت")}</strong><p>{t("A request for payment under exactly one compatible policy.", "درخواست پرداخت تحت دقیقاً یک بیمه‌نامه‌ی سازگار.")}</p></article>
        <article><FileText /><strong>{t("Claim component", "جزء خسارت")}</strong><p>{t("A property, bodily, or eligible excess portion with its own gross amount, limit, deductible, and paid loss.", "بخش مالی، جانی یا مازاد واجد شرایط با مبلغ ناخالص، حد، فرانشیز و پرداخت خود.")}</p></article>
        <article><WalletCards /><strong>{t("Paid loss", "خسارت پرداختی")}</strong><p>{t("The amount actually paid by this insurer after limits and deductibles.", "مبلغی که این بیمه‌گر پس از حدود تعهد و فرانشیز می‌پردازد.")}</p></article>
      </div>

      <Notice kind="success" title={t("Version 2 reconciliation gate passed", "کنترل تطبیق نسخه‌ی ۲ تأیید شد")}>{t("All 1,000 months pass policy-coverage compatibility, component-limit, payout, lineage, deterministic-generation, and calibration checks. Analytical results are unavailable if any critical check fails.", "هر ۱۰۰۰ ماه کنترل سازگاری پوشش بیمه‌نامه، حدود اجزا، پرداخت، زنجیره‌ی ردیابی، تولید قطعی و کالیبراسیون را گذرانده‌اند. در صورت رد هر کنترل بحرانی، نتایج تحلیلی ارائه نمی‌شوند.")}</Notice>
      */}
    </div>
  );
}
