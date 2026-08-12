"use client";

import { CheckCircle2, CircleDot, FileCheck2, GitBranch, LockKeyhole, ShieldCheck, Users } from "lucide-react";
import type { PortfolioData } from "../types";
import { Contributor, Notice, PanelCredit, ResultTag, formatMoney } from "../ui";
import { tr, useLanguage } from "../i18n";

const contributors = [
  { names: "علی تیموری، سروش طاهری", files: "insurance_simulated_data.csv · insurance_ruin_analysis.py" },
  { names: "ابوالفضل اقراری، حامد اشراقی", files: "Chapter1.ipynb.json · insurance_ruin_analysis.py" },
  { names: "نجمه زارع", files: "پیچش.R · approximation.R" },
  { names: "محمد مهدوی نسب، علی جهانبان، محمدرضا سعیدخانی، محمد اشکوری", files: "Chapter 3 submissions" },
  { names: "محمدرضا سعیدخانی، محمد مهدوی نسب، علی جهانبان، محمد اشکوری، نجمه زارع", files: "Chapter 2 - Dr. Payandeh submissions" },
];

export function MethodologyExperience({ data }: { data: PortfolioData }) {
  const { language } = useLanguage();
  const t = (en: string, fa: string) => tr(language, en, fa);
  return (
    <div className="experience-stack">
      <section className="method-hero panel">
        <div><ResultTag tone="green">{t("Version 2 validation passed", "اعتبارسنجی نسخه‌ی ۲ تأیید شد")}</ResultTag><h2>{t("1,000 of 1,000 synthetic months validated", "هر ۱۰۰۰ ماه شبیه‌سازی‌شده اعتبارسنجی شدند")}</h2><p>{t("Entity links, policy coverage, component limits, payout identities, deterministic regeneration, and calibration must all pass before calculations are served.", "پیوند موجودیت‌ها، پوشش بیمه‌نامه، حدود اجزا، روابط پرداخت، بازتولید قطعی و کالیبراسیون باید پیش از ارائه‌ی محاسبات همگی تأیید شوند.")}</p></div>
        <dl><div><dt>{t("Generator", "مولد")}</dt><dd>v{data.summary.generator_version}</dd></div><div><dt>{t("Source checksum", "اثر انگشت منبع")}</dt><dd title={data.summary.source_sha256}>{data.summary.source_sha256.slice(0, 12)}…</dd></div><div><dt>{t("Mean monthly loss", "میانگین خسارت ماهانه")}</dt><dd>{formatMoney(data.summary.mean_payout, true, language)}</dd></div></dl>
      </section>

      <div className="panel-grid equal">
        <section className="panel methodology-card">
          <div className="panel-heading"><div><ResultTag tone="slate">{t("Entity-first contract", "قرارداد مبتنی بر موجودیت")}</ResultTag><h2>{t("How a result is produced", "نتیجه چگونه تولید می‌شود")}</h2><p>{t("Monthly aggregates are derived from coherent vehicle, policy, accident, claim, and payment entities.", "مقادیر تجمیعی ماهانه برابر موجودیت‌های سازگار خودرو، بیمه‌نامه، حادثه، پرونده‌ی خسارت و پرداخت استخراج می‌شوند.")}</p></div></div>
          <ol className="method-list">
            <li><span><Users /></span><div><strong>{t("Create the portfolio", "ساخت پرتفوی")}</strong><p>{t("Generate 10,000 vehicles, one liability policy each, and 7,000 separate own-damage policies.", "۱۰٬۰۰۰ خودرو، برای هر خودرو یک بیمه‌نامه‌ی شخص ثالث و ۷٬۰۰۰ بیمه‌نامه‌ی جداگانه‌ی بدنه تولید می‌شود.")}</p></div></li>
            <li><span><CircleDot /></span><div><strong>{t("Generate physical accidents", "تولید حوادث فیزیکی")}</strong><p>{t("Each row is a synthetic monthly observation. M identifiers preserve its order, but do not claim real calendar dates or seasonality.", "هر ردیف یک مشاهده‌ی ماهانه‌ی شبیه‌سازی‌شده است. شناسه‌های M ترتیب را حفظ می‌کنند، اما تاریخ تقویمی واقعی یا فصل‌پذیری را ادعا نمی‌کنند.")}</p></div></li>
            <li><span><GitBranch /></span><div><strong>{t("Create compatible claims", "ساخت خسارت‌های سازگار")}</strong><p>{t("One accident may invoke separate own-damage and liability policies; every claim references exactly one matching policy.", "یک حادثه می‌تواند بیمه‌نامه‌های جداگانه‌ی بدنه و شخص ثالث را فعال کند؛ هر خسارت دقیقاً به یک بیمه‌نامه‌ی متناظر پیوند دارد.")}</p></div></li>
            <li><span><ShieldCheck /></span><div><strong>{t("Apply terms and limits", "اعمال شرایط و حدود")}</strong><p>{t("Property, bodily, deductibles, limits, eligible own-damage excess, and final uncovered amounts remain explicit.", "مالی، جانی، فرانشیز، حدود تعهد، مازاد واجد شرایط بدنه و مبلغ نهایی پوشش‌داده‌نشده صریح تشریح شده‌اند.")}</p></div></li>
            <li><span><CheckCircle2 /></span><div><strong>{t("Derive and gate aggregates", "استخراج و کنترل تجمیع")}</strong><p>{t("Month rows are summed from paid claim components and are refused if any entity or amount identity fails.", "ردیف‌های ماه از اجزای خسارت پرداختی جمع می‌شوند و در صورت شکست هر هویت موجودیتی یا مبلغی رد می‌شوند.")}</p></div></li>
          </ol>
          <PanelCredit names="علی تیموری، سروش طاهری" />
        </section>

        <section className="panel methodology-card">
          <div className="panel-heading"><div><ResultTag tone="amber">{t("Model contract", "قرارداد مدل")}</ResultTag><h2>{t("Core semantic rules", "قواعد معنایی اصلی")}</h2><p>{t("These rules keep policies, physical events, claim files, and insurer payments distinct throughout the laboratory.", "این قواعد بیمه‌نامه‌ها، رویدادهای فیزیکی، پرونده‌های خسارت و پرداخت‌های بیمه‌گر را در سراسر داشبورد از هم متمایز نگه می‌دارند.")}</p></div></div>
          <div className="limitation-list"><article><strong>{t("Claims and payments", "پرونده و پرداخت")}</strong><p>{t("Every claim count corresponds to a compatible policy and an explicit insurer-paid amount.", "هر پرونده‌ی خسارت به یک بیمه‌نامه‌ی سازگار و مبلغ پرداختی صریح بیمه‌گر مربوط است.")}</p></article><article><strong>{t("Separate policy contracts", "قراردادهای بیمه‌ای جدا")}</strong><p>{t("Own-damage and third-party liability are separate contracts, even when one accident triggers both.", "بدنه و شخص ثالث قراردادهای جدا هستند، حتی اگر یک حادثه هر دو را فعال کند.")}</p></article><article><strong>{t("Matching collective units", "واحدهای متناظر مدل جمعی")}</strong><p>{t("Claim frequency is paired with claim severity; accident count remains a physical-event measure.", "فراوانی خسارت با شدت خسارت متناظر می‌شود؛ تعداد حادثه معیار رویداد فیزیکی باقی می‌ماند.")}</p></article><article><strong>{t("Monthly observations", "مشاهدات ماهانه")}</strong><p>{t("Every row is one synthetic month used consistently by all chapters; month identifiers are ordered but not real dates.", "هر ردیف یک ماه شبیه‌سازی‌شده است که همه‌ی فصل‌ها به‌طور یکسان استفاده می‌کنند؛ شناسه‌های ماه مرتب‌اند اما تاریخ واقعی نیستند.")}</p></article></div>
        </section>
      </div>

      <section className="panel">
        <div className="panel-heading"><div><ResultTag tone="blue">{t("Academic provenance", "مشارکت‌کنندگان")}</ResultTag><h2>{t("Course contributions and production assumptions", "مشارکت‌های درسی و فرض‌های تولید")}</h2><p>{t("Frequency and severity calibration, conceptual references, and calculation contributions are documented with attribution.", "کالیبراسیون فراوانی و شدت، منابع مفهومی و مشارکت‌های محاسباتی با ذکر نام مستند شده‌اند.")}</p></div></div>
        <div className="contributor-grid">{contributors.map((entry) => <Contributor key={entry.names} names={entry.names} summary={t("Submitted course material retained as an attributed conceptual or calibration reference.", "محتوای درسی ارائه‌شده با ذکر نام به‌عنوان مرجع مفهومی یا کالیبراسیون آورده شده است.")} />)}</div>
      </section>

      <div className="panel-grid equal">
        <section className="panel"><div className="panel-heading"><div><ResultTag tone="green">{t("Data guarantees", "تضمین‌های داده")}</ResultTag><h2>{t("What readiness proves", "آمادگی چه چیزی را اثبات می‌کند")}</h2></div></div><div className="assumption-list"><p><FileCheck2 />{t("No combined policy and one liability policy per vehicle.", "نبود بیمه‌نامه‌ی ترکیبی و یک بیمه‌نامه‌ی شخص ثالث برای هر خودرو.")}</p><p><FileCheck2 />{t("Every claim links to a compatible policy and physical accident.", "هر خسارت به بیمه‌نامه‌ی سازگار و حادثه‌ی فیزیکی پیوند دارد.")}</p><p><FileCheck2 />{t("Paid components respect deductibles and policy limits.", "اجزای پرداختی فرانشیز و حدود تعهد را رعایت می‌کنند.")}</p><p><FileCheck2 />{t("Monthly amounts reconcile exactly and calibration remains within 5%.", "مبالغ ماهانه دقیقاً تطبیق و کالیبراسیون در محدوده‌ی ۵٪ باقی می‌ماند.")}</p></div></section>
        <section className="panel"><div className="panel-heading"><div><ResultTag tone="slate">{t("Interpretation limits", "محدودیت‌های تفسیر")}</ResultTag><h2>{t("Synthetic, not market evidence", "شبیه‌سازی‌شده، نه شواهد بازار")}</h2></div></div><div className="assumption-list"><p><LockKeyhole />{t("Amounts are synthetic Spring 1405 million tomans, not calibrated prices or tariffs.", "مبالغ میلیون تومان شبیه‌سازی‌شده بهار ۱۴۰۵ هستند، نه قیمت یا تعرفه‌ی کالیبره‌شده.")}</p><p><LockKeyhole />{t("The 20% in-portfolio injured-party assumption is a teaching parameter.", "فرض ۲۰٪ زیان‌دیده‌ی داخل پرتفوی یک پارامتر آموزشی است.")}</p><p><LockKeyhole />{t("Heavy-tail theorems remain disabled where a positive MGF does not exist.", "قضایای دنباله‌سنگین در نبود تابع مولد گشتاور مثبت همچنان غیرفعال‌اند.")}</p></div></section>
      </div>

      <Notice kind="info" title={t("Course context", "زمینه‌ی درس")}>{t("Final project for Risk Theory in the Master's of Actuarial Sciences program at Shahid Beheshti University, Spring Semester 1405. The site demonstrates representative principles and explicitly links each view to its course reference.", "پروژه‌ی پایانی درس نظریه ریسک در دوره‌ی کارشناسی ارشد علوم بیم‌سنجی دانشگاه شهید بهشتی، نیمسال بهار ۱۴۰۵. سایت اصول منتخب را نمایش می‌دهد و هر نما را صریحاً به منبع درسی آن پیوند می‌دهد.")}</Notice>
    </div>
  );
}
