"use client";

import { CheckCircle2, CircleDot, FileCheck2, GitBranch, LockKeyhole, Users } from "lucide-react";
import { tr, useLanguage } from "../i18n";
import type { PortfolioData } from "../types";
import { Notice, PanelCredit, ReferenceBand, ResultTag, formatMoney } from "../ui";

export function MethodologyExperience({ data }: { data: PortfolioData }) {
  const { language } = useLanguage();
  const t = (en: string, fa: string) => tr(language, en, fa);
  const resultTypes = [
    [t("Source data", "داده‌ی منبع"), t("Direct calculation from the immutable supplied CSV.", "محاسبه‌ی مستقیم از CSV منبع که تغییر نمی‌کند."), "blue"],
    [t("Reconstructed", "بازسازی‌شده"), t("Deterministic companion accidents, claims, policies, or exposures.", "رکوردهای همراهِ قطعی برای حادثه، خسارت، بیمه‌نامه یا مواجهه."), "green"],
    [t("Empirical", "تجربی"), t("A statistic calculated from the supplied or reconstructed sample.", "آماره‌ای که از نمونه‌ی منبع یا بازسازی‌شده محاسبه می‌شود."), "blue"],
    [t("Fitted", "برازش‌شده"), t("A parametric model estimated from a clearly identified sample.", "مدل پارامتری برآوردشده از نمونه‌ای که صریحاً مشخص شده است."), "green"],
    [t("Approximate", "تقریبی"), t("A moment approximation, numerical inversion, recursion, or theoretical bound.", "تقریب گشتاوری، وارون‌سازی عددی، بازگشت یا کران نظری."), "amber"],
    [t("Simulated", "شبیه‌سازی‌شده"), t("A fixed-seed Monte Carlo calculation with sampling uncertainty.", "محاسبه‌ی مونت‌کارلو با بذر ثابت و عدم‌قطعیت نمونه‌گیری."), "red"],
    [t("Textbook scenario", "سناریوی کتاب"), t("A controlled example used when raw portfolio assumptions do not satisfy a theorem.", "مثال کنترل‌شده برای زمانی که فرض‌های پرتفوی خام شرایط یک قضیه را برآورده نمی‌کنند."), "slate"],
  ] as const;
  const contributors = [
    { chapter: t("Source portfolio", "پرتفوی منبع"), names: "علی تیموری", files: "insurance_simulated_data.csv", work: t("Synthetic aggregate motor-insurance data", "داده‌های مصنوعی تجمیعی بیمه‌ی خودرو") },
    { chapter: t("Chapter 2 - Dr. Payandeh", "فصل ۲ - دکتر پاینده"), names: "محمدرضا سعیدخانی، محمد مهدوی نسب، علی جهانبان، محمد اشکوری، نجمه زارع", files: "Risk_Measures_and_Risk_Comparison.py · دلتا گاما.R", work: t("VaR, risk comparison, and delta–gamma concepts", "VaR، مقایسه‌ی ریسک و مفاهیم دلتا–گاما") },
    { chapter: t("Modern Ch. 1 · Utility", "فصل ۱ مدرن · مطلوبیت"), names: "ابوالفضل اقراری، حامد اشراقی", files: "Chapter1.ipynb.json", work: t("Utility, certainty equivalents, and acceptable premiums", "مطلوبیت، معادل قطعی و حق‌بیمه‌ی قابل‌قبول") },
    { chapter: t("Modern Ch. 2 · Individual risk", "فصل ۲ مدرن · ریسک انفرادی"), names: "نجمه زارع", files: "پیچش.R · approximation.R", work: t("Convolution and moment approximations", "پیچش و تقریب‌های گشتاوری") },
    { chapter: t("Modern Ch. 3 · Collective risk", "فصل ۳ مدرن · ریسک جمعی"), names: "محمد مهدوی نسب، علی جهانبان، محمدرضا سعیدخانی، محمد اشکوری", files: "Sections 3.5–3.10", work: t("Panjer, FFT, fitting, approximations, and stop-loss", "پانژر، FFT، برازش، تقریب‌ها و مازاد خسارت") },
    { chapter: t("Modern Ch. 4 · Ruin", "فصل ۴ مدرن · ورشکستگی"), names: "ابوالفضل اقراری، حامد اشراقی", files: "insurance_ruin_analysis.py", work: t("Finite-horizon ruin analysis", "تحلیل ورشکستگی در افق محدود") },
  ];

  return (
    <div className="experience-stack methodology">
      <ReferenceBand source={t("Course books, student submissions, and immutable portfolio data", "کتاب‌های درس، کارهای دانشجویان و داده‌های تغییرناپذیر پرتفوی")} formula="source → reconstruction → model → labeled result">
        {t("Every displayed number should identify its data origin, the chapter formula or numerical method used, the assumptions required, and the contributors whose work entered the calculation.", "هر عدد نمایش‌داده‌شده باید منشأ داده، فرمول فصل یا روش عددی، فرض‌های لازم و افرادی را مشخص کند که کارشان در محاسبه وارد شده است.")}
      </ReferenceBand>

      <div className="audit-banner">
        <div className="audit-icon"><FileCheck2 size={28} /></div>
        <div><ResultTag tone="green">{t("Reconciliation passed", "تطبیق داده‌ها تأیید شد")}</ResultTag><h2>{t("1,000 of 1,000 source months validated", "هر ۱۰۰۰ ماه مرجع اعتبارسنجی شدند")}</h2><p>{t(`The largest relative reconciliation difference is ${data.summary.max_relative_difference.toExponential(2)}. Derived data are checked before any chapter calculation uses them.`, `بیشترین اختلاف نسبی تطبیق ${data.summary.max_relative_difference.toExponential(2)} است. داده‌های مشتق‌شده پیش از استفاده در محاسبات هر فصل کنترل می‌شوند.`)}</p></div>
        <dl><div><dt>{t("Generator", "مولد")}</dt><dd>v{data.summary.generator_version}</dd></div><div><dt>{t("Source checksum", "اثر انگشت منبع")}</dt><dd title={data.summary.source_sha256}>{data.summary.source_sha256.slice(0, 12)}…</dd></div><div><dt>{t("Portfolio payout", "پرداخت پرتفوی")}</dt><dd>{formatMoney(data.summary.total_payout, true, language)}</dd></div></dl>
        <PanelCredit names="علی تیموری" role={t("Source portfolio used by the reconciliation report.", "پرتفوی منبع مورد استفاده در گزارش تطبیق.")} />
      </div>

      <div className="panel-grid equal">
        <section className="panel methodology-card">
          <div className="panel-heading"><div><ResultTag tone="slate">{t("Data integrity contract", "قرارداد یکپارچگی داده")}</ResultTag><h2>{t("From a source row to chapter inputs", "از ردیف منبع تا ورودی فصل‌ها")}</h2><p>{t("No calendar dates are invented and no source value is overwritten.", "هیچ تاریخ تقویمی ساخته و هیچ مقدار منبع بازنویسی نمی‌شود.")}</p></div></div>
          <ol className="method-list">
            <li><span><LockKeyhole /></span><div><strong>{t("Lock the source", "قفل‌کردن منبع")}</strong><p>{t("Read-only ingestion records a SHA-256 checksum and the exact nine-column schema.", "ورود فقط‌خواندنی، اثر انگشت SHA-256 و ساختار دقیق نه‌ستونی را ثبت می‌کند.")}</p></div></li>
            <li><span><CircleDot /></span><div><strong>{t("Allocate accidents", "تخصیص حادثه‌ها")}</strong><p>{t("A seeded feasible overlap reproduces own-damage and third-party counts exactly.", "هم‌پوشانی شدنی با بذر ثابت، تعداد بدنه و شخص ثالث را دقیقاً بازتولید می‌کند.")}</p></div></li>
            <li><span><GitBranch /></span><div><strong>{t("Normalize claim severities", "نرمال‌سازی شدت خسارت")}</strong><p>{t("Lognormal-shaped own-damage and Pareto-shaped third-party weights reconcile to source totals.", "وزن‌های لگ‌نرمال‌مانند بدنه و پارتومانند شخص ثالث با جمع منبع تطبیق می‌یابند.")}</p></div></li>
            <li><span><Users /></span><div><strong>{t("Link synthetic policies", "پیوند بیمه‌نامه‌های مصنوعی")}</strong><p>{t("Risk weights allocate events without changing the conditioned counts or amounts.", "وزن‌های ریسک رویدادها را بدون تغییر تعداد و مبلغ شرط‌شده تخصیص می‌دهند.")}</p></div></li>
            <li><span><CheckCircle2 /></span><div><strong>{t("Gate every month", "کنترل هر ماه")}</strong><p>{t("Counts, means, totals, payout identities, seeds, and policy links must all pass.", "تعدادها، میانگین‌ها، جمع‌ها، اتحادهای پرداخت، بذرها و پیوند بیمه‌نامه باید همگی تأیید شوند.")}</p></div></li>
          </ol>
          <PanelCredit names="علی تیموری" />
        </section>
        <section className="panel methodology-card">
          <div className="panel-heading"><div><ResultTag tone="amber">{t("Known limitations", "محدودیت‌های شناخته‌شده")}</ResultTag><h2>{t("What the data support—and what they do not", "داده‌ها چه چیزی را پشتیبانی می‌کنند و چه چیزی را نه")}</h2><p>{t("These qualifications apply before interpreting any chart.", "این ملاحظات پیش از تفسیر هر نمودار اعمال می‌شوند.")}</p></div></div>
          <div className="limitation-list"><article><strong>{t("Independent synthetic months", "ماه‌های مصنوعی مستقل")}</strong><p>{t("Row order supports identifiers and classroom experiments, not seasonality or historical forecasting.", "ترتیب ردیف‌ها برای شناسه و آزمایش درسی است، نه فصلی‌بودن یا پیش‌بینی تاریخی.")}</p></article><article><strong>{t("Reconstructed microdata", "ریز‌داده‌ی بازسازی‌شده")}</strong><p>{t("Accident, claim, and policy rows are deterministic companions, not observed records.", "ردیف‌های حادثه، خسارت و بیمه‌نامه همراهان قطعی‌اند، نه رکوردهای مشاهده‌شده.")}</p></article><article><strong>{t("Provisional total-loss link", "پیوند موقت خسارت کلی")}</strong><p>{t("Total_Loss_Cases is assigned as a seeded subset because its coverage relationship is undocumented.", "به دلیل مستندنبودن رابطه‌ی پوشش، Total_Loss_Cases به‌صورت زیرمجموعه‌ای با بذر ثابت تخصیص یافته است.")}</p></article><article><strong>{t("Heavy tails restrict theorems", "دنباله‌ی سنگین قضایا را محدود می‌کند")}</strong><p>{t("Positive-MGF methods are disabled for raw unbounded Pareto scenarios; finite-horizon simulation remains available.", "روش‌های نیازمند تابع مولد گشتاور مثبت برای پارتوی نامحدود خام غیرفعال‌اند؛ شبیه‌سازی افق محدود در دسترس می‌ماند.")}</p></article></div>
        </section>
      </div>

      <section className="panel">
        <div className="panel-heading"><div><ResultTag tone="slate">{t("Reading key", "راهنمای خواندن")}</ResultTag><h2>{t("Result types used throughout the site", "نوع نتایج در سراسر سایت")}</h2><p>{t("Results with different evidential status are not presented as interchangeable.", "نتایج با وضعیت شواهد متفاوت به‌عنوان نتیجه‌ی قابل‌جایگزین ارائه نمی‌شوند.")}</p></div></div>
        <div className="result-type-grid">{resultTypes.map(([name, description, tone]) => <article key={name}><ResultTag tone={tone}>{name}</ResultTag><p>{description}</p></article>)}</div>
      </section>

      <section className="panel credits-panel">
        <div className="panel-heading"><div><ResultTag tone="blue">{t("Academic credit", "اعتبار علمی")}</ResultTag><h2>{t("Contributors by calculation area", "مشارکت‌کنندگان به تفکیک حوزه‌ی محاسبه")}</h2><p>{t("Original submissions remain unchanged. Integrated modules preserve matching source evidence and adaptation notes.", "کارهای اصلی بدون تغییر باقی مانده‌اند. ماژول‌های یکپارچه شواهد منبع و یادداشت‌های تطبیق متناظر را حفظ می‌کنند.")}</p></div></div>
        <div className="credits-table" role="table" aria-label={t("Student contributions", "مشارکت دانشجویان")}>
          <div className="credits-head" role="row"><span>{t("Reference area", "حوزه‌ی منبع")}</span><span>{t("Contributors", "مشارکت‌کنندگان")}</span><span>{t("Source files", "فایل‌های منبع")}</span><span>{t("Calculation contribution", "مشارکت محاسباتی")}</span></div>
          {contributors.map((item) => <div className="credits-row" role="row" key={item.chapter}><strong>{item.chapter}</strong><span lang="fa" dir="rtl">{item.names}</span><code>{item.files}</code><span>{item.work}</span></div>)}
        </div>
      </section>
      <Notice kind="info" title={t("Course context", "زمینه‌ی درس")}>{t("Final project for Risk Theory in the Master's of Actuarial Sciences program at Shahid Beheshti University, Spring Semester 1405. The site demonstrates representative principles and explicitly links each view to its course reference.", "پروژه‌ی پایانی درس نظریه ریسک در دوره‌ی کارشناسی ارشد علوم بیم‌سنجی دانشگاه شهید بهشتی، نیمسال بهار ۱۴۰۵. سایت اصول منتخب را نمایش می‌دهد و هر نما را صریحاً به منبع درسی آن پیوند می‌دهد.")}</Notice>
    </div>
  );
}
