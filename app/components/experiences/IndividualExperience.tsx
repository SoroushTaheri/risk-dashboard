"use client";

import { useState } from "react";
import { EChart } from "../EChart";
import { Formula, InlineMath } from "../Formula";
import { tr, useLanguage } from "../i18n";
import type { PortfolioData } from "../types";
import { Contributor, MetricCard, Notice, PanelCredit, ReferenceBand, ResultTag, formatMoney } from "../ui";
import { useActuarialApi } from "../useActuarialApi";
import { histogram } from "./helpers";

type PolicyCoverage = "all" | "own_damage" | "third_party_liability";
type ApproximationMethod = "normal" | "normal_power" | "translated_gamma";
type IndividualApiResult = {
  policy_count: number;
  months_per_policy: number;
  independent_moments: {
    values: {
      mean: number;
      standard_deviation: number;
      mean_nonzero_probability: number;
      mean_positive_policy_month_loss: number;
    };
  };
  independent_approximations: {
    values: {
      normal: number;
      normal_power: number;
      translated_gamma: number;
      skewness: number;
    };
  };
  shared_accident_empirical: {
    mean: number;
    standard_deviation: number;
    quantile: number;
    month_losses: number[];
  };
  dependence_effect: {
    covariance_contribution_to_variance: number;
    mean_reconciliation_error: number;
  };
};

export function IndividualExperience({ data }: { data: PortfolioData }) {
  const { language } = useLanguage();
  const t = (en: string, fa: string) => tr(language, en, fa);
  const money = (value: number) => formatMoney(value, true, language);
  const [portfolioSize, setPortfolioSize] = useState(500);
  const [confidence, setConfidence] = useState(0.95);
  const [segment, setSegment] = useState("all");
  const [coverage, setCoverage] = useState<PolicyCoverage>("all");
  const [dependence, setDependence] = useState("independent");
  const [approximation, setApproximation] = useState<ApproximationMethod>("normal_power");
  const model = data.summary.policy_models[`${coverage}:${segment}`];
  const selectedSize = Math.min(portfolioSize, model.policy_count, 5_000);
  const fallbackMean = selectedSize * model.mean_claim_probability * model.mean_paid_loss;
  const { data: apiResult, error: apiError } = useActuarialApi<IndividualApiResult>("/api/individual-risk", {
    portfolio_size: selectedSize, coverage, segment, confidence,
  });

  const approximationLabels: Record<ApproximationMethod, string> = {
    normal: t("Normal", "نرمال"),
    normal_power: t("Normal Power", "توان نرمال"),
    translated_gamma: t("Translated Gamma", "گامای انتقال‌یافته"),
  };
  const approximationValues = apiResult?.independent_approximations.values ?? {
    normal: fallbackMean,
    normal_power: fallbackMean,
    translated_gamma: fallbackMean,
    skewness: 0,
  };
  const independentMean = apiResult?.independent_moments.values.mean ?? fallbackMean;
  const independentSd = apiResult?.independent_moments.values.standard_deviation ?? 0;
  const independentQuantile = approximationValues[approximation];
  const sharedLosses = apiResult?.shared_accident_empirical.month_losses ?? [0];
  const sharedMean = apiResult?.shared_accident_empirical.mean ?? fallbackMean;
  const sharedSd = apiResult?.shared_accident_empirical.standard_deviation ?? 0;
  const sharedQuantile = apiResult?.shared_accident_empirical.quantile ?? fallbackMean;
  const displayedMean = dependence === "independent" ? independentMean : sharedMean;
  const displayedSd = dependence === "independent" ? independentSd : sharedSd;
  const displayedQuantile = dependence === "independent" ? independentQuantile : sharedQuantile;
  const nonzeroProbability = apiResult?.independent_moments.values.mean_nonzero_probability ?? model.mean_claim_probability;
  const nonzeroProbabilityLabel = `${new Intl.NumberFormat(language === "fa" ? "fa-IR" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(nonzeroProbability * 100)}${language === "fa" ? "٪" : "%"}`;
  const monthsPerPolicy = apiResult?.months_per_policy ?? data.summary.months;
  const meanPaidMonthsLabel = new Intl.NumberFormat(language === "fa" ? "fa-IR" : "en-US", { maximumFractionDigits: 1 }).format(nonzeroProbability * monthsPerPolicy);
  const sharedHistogram = histogram(sharedLosses, 24);
  const sharedQuantileBinIndex = sharedHistogram.reduce(
    (closestIndex, [midpoint], index) => Math.abs(midpoint - sharedQuantile) < Math.abs(sharedHistogram[closestIndex][0] - sharedQuantile) ? index : closestIndex,
    0,
  );
  const approximationComparison = [
    { name: t("Normal · independent", "نرمال · مستقل"), value: approximationValues.normal, color: "#2868d8" },
    { name: t("Normal Power · independent", "توان نرمال · مستقل"), value: approximationValues.normal_power, color: "#5f8fda" },
    { name: t("Translated Gamma · independent", "گامای انتقال‌یافته · مستقل"), value: approximationValues.translated_gamma, color: "#8aa9d8" },
    { name: t("Same-month empirical", "تجربیِ هم‌ماه"), value: sharedQuantile, color: "#c95c65" },
  ];
  const contributor = "نجمه زارع";

  return (
    <div className="experience-stack">
      <ReferenceBand
        source={t("Modern Actuarial Risk Theory · Chapter 2 · Individual risk model", "Modern Actuarial Risk Theory · فصل ۲ · مدل ریسک انفرادی")}
        formula={String.raw`S=\sum_{i=1}^{n}X_i,\qquad E[S]=\sum_i\mu_i,\qquad \operatorname{Var}_{\mathrm{ind}}(S)=\sum_i\sigma_i^2`}
      >
        {t(
          "Each Xi is one policy's paid loss in one month: zero when that policy has no payment and the actual variable payment otherwise. The book includes a fixed-benefit Bernoulli example, but its general individual-risk model is not limited to that special case.",
          "هر Xi خسارت پرداختی یک بیمه‌نامه در یک ماه است: اگر پرداختی نداشته باشد صفر و در غیر این صورت برابر مبلغ واقعی و متغیر پرداخت است. کتاب یک مثال خاص با مبلغ ثابت برنولی هم دارد، اما مدل عمومی ریسک انفرادی به آن حالت محدود نیست.",
        )}
      </ReferenceBand>

      <section className="panel individual-control-guide" aria-labelledby="individual-scope-title">
        <div className="panel-heading"><div><ResultTag tone="slate">{t("Strict chapter scope", "دامنه‌ی دقیق فصل")}</ResultTag><h2 id="individual-scope-title">{t("One question, three clearly separated sources", "یک پرسش با سه منبع کاملاً تفکیک‌شده")}</h2><p>{t("This page asks only how the losses of a specified set of individual policies combine into the portfolio loss S.", "این صفحه بررسی می‌کند مجموعه‌ای از خسارت‌های مشخص برگرفته از بیمه‌نامه‌های انفرادی، چگونه خسارت کل S را می‌سازند.")}</p></div></div>
        <div className="individual-dropdown-grid">
          <article>
            <h3>{t("Book foundation", "مبنای کتاب")}</h3>
            <div className="method-equation"><InlineMath equation={String.raw`X_1,\ldots,X_n\longrightarrow S=\sum_iX_i`} /></div>
            <p>{t("Chapter 2 supplies the policy-level random variables, the independence assumption for aggregation, and the Normal, Normal Power, and translated-gamma approximations.", "فصل ۲ متغیر تصادفی خسارت هر بیمه‌نامه، فرض استقلال برای تجمیع و تقریب‌های نرمال، توان نرمال و گامای انتقال‌یافته را فراهم می‌کند.")}</p>
          </article>
          <article>
            <h3>{t("Student-submitted files", "فایل‌های تحویلی دانشجو")}</h3>
            <div className="method-equation"><InlineMath equation={String.raw`F_S(s)\approx F_{\mathrm N},\ F_{\mathrm{NP}},\ F_{\mathrm{TG}}`} /></div>
            <p>{t("The student's submitted files contain implementations of these three approximation methods. The separate convolution file adds two aggregate accident-count distributions; because that unit is not an individual policy loss, the file is documented but does not contribute to this page's results.", "فایل‌های تحویلی دانشجو شامل پیاده‌سازی این سه روش تقریب هستند. در فایل جداگانه‌ی پیچش، دو توزیع تعداد حادثه‌ی کل با هم جمع شده‌اند؛ چون واحد این محاسبه خسارت یک بیمه‌نامه نیست، این فایل مستند می‌شود اما در نتایج صفحه نقشی ندارد.")}</p>
          </article>
          <article>
            <h3>{t("Portfolio application", "کاربرد روی پرتفوی")}</h3>
            <div className="method-equation"><InlineMath equation={String.raw`X_{i,t}=\sum_{c\mapsto(i,t)}P_c,\qquad t=1,\ldots,1000`} /></div>
            <p>{t("For every selected policy, the simulated portfolio supplies 1,000 monthly outcomes, including zero months and actual claim payments. No average fixed benefit replaces those observed severities.", "برای هر بیمه‌نامه‌ی انتخاب‌شده، پرتفوی شبیه‌سازی‌شده ۱٬۰۰۰ پیامد ماهانه شامل ماه‌های بدون پرداخت و مبالغ واقعی خسارت را فراهم می‌کند؛ شدت‌های مشاهده‌شده با یک مبلغ متوسط ثابت جایگزین نمی‌شوند.")}</p>
          </article>
        </div>
      </section>

      <section className="control-strip" aria-label={t("Individual risk controls", "کنترل‌های مدل ریسک انفرادی")}>
        <label className="range-control wide"><span>{t("Number of policies", "تعداد بیمه‌نامه‌ها")} <strong>{t(`${selectedSize} policies`, `${selectedSize.toLocaleString("fa-IR")} بیمه‌نامه`)}</strong></span><input type="range" min="20" max={Math.min(5_000, model.policy_count)} step="20" value={selectedSize} onChange={(event) => setPortfolioSize(Number(event.target.value))} /></label>
        <label><span>{t("Coverage-specific policies", "نوع بیمه‌نامه")}</span><select value={coverage} onChange={(event) => setCoverage(event.target.value as PolicyCoverage)}><option value="all">{t("All separate policies", "همه‌ی بیمه‌نامه‌ها")}</option><option value="own_damage">{t("Own damage", "بدنه")}</option><option value="third_party_liability">{t("Third-party liability", "شخص ثالث")}</option></select></label>
        <label><span>{t("Policy segment", "گروه بیمه‌نامه")}</span><select value={segment} onChange={(event) => setSegment(event.target.value)}><option value="all">{t("All segments", "همه‌ی گروه‌ها")}</option><option value="preferred">{t("Preferred", "کم‌ریسک")}</option><option value="standard">{t("Standard", "استاندارد")}</option><option value="commercial">{t("Commercial", "تجاری")}</option></select></label>
        <label><span>{t("Displayed result", "نمایش محاسبات")}</span><select value={dependence} onChange={(event) => setDependence(event.target.value)}><option value="independent">{t("Independent-policy approximation", "تقریب بیمه‌نامه‌های مستقل")}</option><option value="shared">{t("Same-month empirical result", "نتیجه‌ی تجربیِ هم‌ماه")}</option></select></label>
        <label><span>{t("Chapter 2 approximation", "روش تقریب فصل ۲")}</span><select value={approximation} onChange={(event) => setApproximation(event.target.value as ApproximationMethod)}><option value="normal">{approximationLabels.normal}</option><option value="normal_power">{approximationLabels.normal_power}</option><option value="translated_gamma">{approximationLabels.translated_gamma}</option></select></label>
        <label className="range-control"><span>{t("Quantile level", "سطح چندک")} <strong>{(confidence * 100).toFixed(1)}%</strong></span><input type="range" min="0.8" max="0.99" step="0.01" value={confidence} onChange={(event) => setConfidence(Number(event.target.value))} /></label>
      </section>

      <section className="panel individual-control-guide" aria-labelledby="individual-controls-title">
        <div className="panel-heading"><div><ResultTag tone="blue">{t("Calculation map", "روش محاسبه")}</ResultTag><h2 id="individual-controls-title">{t("What changes when you change the controls?", "با تغییر کنترل‌ها دقیقاً چه چیزی عوض می‌شود؟")}</h2></div></div>
        <div className="individual-slider-grid">
          <article>
            <div className="slider-guide-heading"><span>1</span><div><h3>{t("Policy selection", "انتخاب بیمه‌نامه‌ها")} · <InlineMath equation={String.raw`\mathcal P_n(C,G)`} /></h3><p>{t("Coverage and segment form the eligible population; n selects the first exact policy rows from it.", "نوع و گروه بیمه‌نامه، جامعه‌ی واجد شرایط را می‌سازند و n ردیف‌های واقعی نخست را از آن انتخاب می‌کند.")}</p></div></div>
            <div className="method-equation"><InlineMath equation={String.raw`\mu_i=\frac1{1000}\sum_tX_{i,t},\qquad \sigma_i^2=\operatorname{Var}_t(X_{i,t})`} /></div>
            <p><b>{t("Independent result:", "نتیجه‌ی مستقل:")}</b> {t("keeps every selected policy's empirical mean, variance, and skewness, but sets covariance between different policies to zero.", "میانگین، واریانس و چولگی تجربی هر بیمه‌نامه را حفظ می‌کند، اما کوواریانس میان بیمه‌نامه‌های مختلف را صفر می‌گیرد.")}</p>
            <p><b>{t("Same-month result:", "نتیجه‌ی هم‌ماه:")}</b> {t("adds those same policies inside each month, so payments caused by one shared accident stay together.", "همان بیمه‌نامه‌ها را درون هر ماه با هم جمع می‌کند؛ بنابراین پرداخت‌های ناشی از یک حادثه‌ی مشترک کنار هم تشریح شده‌اند.")}</p>
          </article>
          <article>
            <div className="slider-guide-heading"><span>2</span><div><h3>{t("Tail threshold and approximation", "آستانه‌ی دنباله و روش تقریب")} · <InlineMath equation={String.raw`Q_p(S)`} /></h3><p>{t("p chooses the upper-tail probability. The approximation selector affects only the independent-policy quantile; the empirical quantile always comes from sorting the 1,000 same-month totals.", "مقدار p سطح دنباله‌ی بالا را تعیین می‌کند. روش تقریب فقط چندک مدل مستقل را تغییر می‌دهد؛ چندک تجربی همیشه از مرتب‌کردن ۱٬۰۰۰ مجموع هم‌ماه به دست می‌آید.")}</p></div></div>
            <div className="method-equation"><InlineMath equation={String.raw`Q_p^{\mathrm N}=\mu+\Phi^{-1}(p)\sigma,\qquad \widehat Q_p^{\mathrm{same}}=S_{(\lceil1000p\rceil)}`} /></div>
            <p><b>{t("Normal Power and translated Gamma:", "توان نرمال و گامای انتقال‌یافته:")}</b> {t("also use the third central moment, so the independent approximation can reflect right-skewed policy losses instead of forcing symmetry.", "گشتاور مرکزی سوم را نیز به کار می‌گیرند تا تقریب مستقل بتواند چولگی به راست خسارت‌ها را منعکس کند و مجبور به تقارن نباشد.")}</p>
            <p className="slider-insight"><b>{t("What stays fixed:", "چه چیزی ثابت می‌ماند؟")}</b> {t("Changing p or the approximation does not change the selected policies, their monthly observations, E[S], or SD(S).", "تغییر p یا روش تقریب، بیمه‌نامه‌های انتخاب‌شده، مشاهدات ماهانه، E[S] یا SD(S) را تغییر نمی‌دهد.")}</p>
          </article>
        </div>
      </section>

      <div className="metric-grid four">
        <MetricCard label={<InlineMath equation={String.raw`E[S]`} />} value={money(displayedMean)} detail={t("Selected model; both means are compared below", "نتیجه‌ی مدل انتخاب‌شده؛ مقایسه‌ی هر دو میانگین در بخش بعد")} tone="blue" />
        <MetricCard label={<InlineMath equation={String.raw`\operatorname{SD}(S)`} />} value={money(displayedSd)} detail={dependence === "independent" ? t("Policy variances summed; covariance set to zero", "جمع واریانس بیمه‌نامه‌ها؛ کوواریانس صفر") : t("Observed spread of the 1,000 same-month totals", "پراکندگی ۱٬۰۰۰ مجموع هم‌ماه")} tone="teal" />
        <MetricCard label={<InlineMath equation={String.raw`Q_p(S)`} />} value={money(displayedQuantile)} detail={dependence === "independent" ? t(`${approximationLabels[approximation]} approximation`, `تقریب ${approximationLabels[approximation]}`) : t("Empirical order statistic", "آمار ترتیبی تجربی")} tone="amber" />
        <MetricCard label={t("Average monthly payment probability per policy", "میانگین احتمال پرداخت ماهانه‌ی هر بیمه‌نامه")} value={nonzeroProbabilityLabel} detail={apiResult ? t(`For each policy: paid months ÷ ${monthsPerPolicy.toLocaleString()}; on average ${meanPaidMonthsLabel} paid months`, `برای هر بیمه‌نامه: ماه‌های دارای پرداخت ÷ ${monthsPerPolicy.toLocaleString("fa-IR")}؛ به‌طور میانگین ${meanPaidMonthsLabel} ماه دارای پرداخت`) : t("Loading exact policy-month outcomes…", "در حال بارگذاری پیامدهای دقیق بیمه‌نامه-ماه…")} tone="green" />
      </div>

      <section className="panel" aria-labelledby="individual-model-comparison-title">
        <div className="panel-heading"><div><ResultTag tone="blue">{t("Direct model comparison", "مقایسه‌ی مستقیم دو مدل")}</ResultTag><h2 id="individual-model-comparison-title">{t("Both models remain visible at the same time", "نتایج هر دو مدل هم‌زمان نمایش داده می‌شوند")}</h2><p>{t("The two E[S] values intentionally match by the linearity of expectation. Compare SD(S) and Qₚ(S) to see what changes when cross-policy dependence is retained.", "دو مقدار E[S] به‌دلیل جمع‌پذیری امید ریاضی عمداً برابرند. برای دیدن اثر حفظ وابستگی میان بیمه‌نامه‌ها، SD(S) و Qₚ(S) را مقایسه کنید.")}</p></div></div>
        <div className="individual-model-comparison" aria-label={t("Independent and same-month model results", "مقایسه‌ی نتایج مدل مستقل و مدل هم‌ماه")}>
          <article>
            <header><div><h3>{t("Independent-policy approximation", "تقریب بیمه‌نامه‌های مستقل")}</h3><p>{t(`Cross-policy covariance = 0 · ${approximationLabels[approximation]} quantile`, `کوواریانس میان بیمه‌نامه‌ها = صفر · چندک ${approximationLabels[approximation]}`)}</p></div><ResultTag tone="blue">{t("Approximate", "تقریبی")}</ResultTag></header>
            <dl>
              <div className="matched-mean"><dt><InlineMath equation={String.raw`E[S]`} /></dt><dd>{money(independentMean)}</dd><small>{t("Equal in both models", "در هر دو مدل برابر")}</small></div>
              <div><dt><InlineMath equation={String.raw`\operatorname{SD}(S)`} /></dt><dd>{money(independentSd)}</dd></div>
              <div><dt><InlineMath equation={String.raw`Q_p(S)`} /></dt><dd>{money(independentQuantile)}</dd></div>
            </dl>
          </article>
          <article>
            <header><div><h3>{t("Same-month empirical result", "نتیجه‌ی تجربیِ هم‌ماه")}</h3><p>{t("Shared-accident covariance retained · empirical quantile", "کوواریانس حادثه‌ی مشترک حفظ می‌شود · چندک تجربی")}</p></div><ResultTag tone="green">{t("Simulated", "شبیه‌سازی‌شده")}</ResultTag></header>
            <dl>
              <div className="matched-mean"><dt><InlineMath equation={String.raw`E[S]`} /></dt><dd>{money(sharedMean)}</dd><small>{t("Equal in both models", "در هر دو مدل برابر")}</small></div>
              <div><dt><InlineMath equation={String.raw`\operatorname{SD}(S)`} /></dt><dd>{money(sharedSd)}</dd></div>
              <div><dt><InlineMath equation={String.raw`Q_p(S)`} /></dt><dd>{money(sharedQuantile)}</dd></div>
            </dl>
          </article>
        </div>
      </section>

      {apiResult ? <Notice kind="info" title={t("Why is the mean fixed while dispersion changes?", "چرا میانگین ثابت است اما پراکندگی تغییر می‌کند؟")}>{t(
        `The means are always identical by the linearity of expectation: both methods add the same selected policy-month losses, and this identity does not require independence. Independence affects only the cross-policy covariance terms. For the current selection, those terms change aggregate variance by ${apiResult.dependence_effect.covariance_contribution_to_variance.toLocaleString()} squared million tomans, so SD(S) and the upper quantile can change when the controls change.`,
        `برابری میانگین‌ها یک همانی ریاضی و همیشگی است: هر دو روش همان خسارت‌های بیمه‌نامه-ماهِ انتخاب‌شده را جمع می‌کنند و جمع‌پذیری امید ریاضی به استقلال نیاز ندارد. فرض استقلال فقط جمله‌های کوواریانس میان بیمه‌نامه‌ها را از واریانس حذف می‌کند. برای انتخاب فعلی، این جمله‌ها واریانس خسارت کل را به اندازه‌ی ${apiResult.dependence_effect.covariance_contribution_to_variance.toLocaleString("fa-IR")} (میلیون تومان)² تغییر می‌دهند؛ بنابراین با تغییر کنترل‌ها، SD(S) و چندک بالا می‌توانند تغییر کنند.`,
      )}</Notice> : null}

      <div className="panel-grid equal">
        <section className="panel">
          <div className="panel-heading"><div><ResultTag tone="green">{t("Simulated empirical result", "نتیجه‌ی تجربی شبیه‌سازی‌شده")}</ResultTag><h2>{t("Selected-policy loss in the same 1,000 months", "خسارت بیمه‌نامه‌های انتخاب‌شده در همان ۱٬۰۰۰ ماه")}</h2><p>{t("Each bar is built after adding the selected policies within the same month. This preserves shared-accident dependence and is not an independence simulation.", "هر ستون پس از جمع‌کردن بیمه‌نامه‌های انتخاب‌شده درون همان ماه ساخته می‌شود؛ بنابراین وابستگی ناشی از حادثه‌ی مشترک حفظ می‌شود و این نمودار شبیه‌سازی استقلال نیست.")}</p></div></div>
          <EChart label={t("Same-month empirical aggregate loss", "خسارت کل تجربیِ هم‌ماه")} option={{ animation: false, grid: { left: 58, right: 16, top: 24, bottom: 48 }, tooltip: { trigger: "axis" }, xAxis: { type: "category", data: sharedHistogram.map(([mid]) => mid >= 1000 ? `${(mid / 1000).toFixed(1)}bn` : `${Math.round(mid)}m`), axisLabel: { interval: 4 }, name: t("aggregate paid loss S", "خسارت پرداختی کل S"), nameLocation: "middle", nameGap: 30 }, yAxis: { type: "value", name: t("months", "ماه‌ها"), splitLine: { lineStyle: { color: "#e8edf3" } } }, series: [{ type: "bar", data: sharedHistogram.map(([, count]) => count), itemStyle: { color: "#75a3ee", borderRadius: [3, 3, 0, 0] }, markLine: { silent: true, symbol: "none", lineStyle: { color: "#c95c65", width: 2 }, label: { show: true, formatter: t(`Q${(confidence * 100).toFixed(0)}%`, `Q${(confidence * 100).toFixed(0)}٪`), color: "#9f3540" }, data: [{ xAxis: sharedQuantileBinIndex }] } }] }} />
        </section>
        <section className="panel">
          <div className="panel-heading"><div><ResultTag tone="slate">{t("Chapter 2 approximation check", "سنجش تقریب‌های فصل ۲")}</ResultTag><h2>{t("Upper quantile under three approximations", "چندک بالا با سه روش تقریب")}</h2><p>{t("The first three rows use the same independent-policy moments. The final row is the empirical same-month benchmark that retains dependence.", "سه ردیف نخست از گشتاورهای یکسانِ مدل بیمه‌نامه‌های مستقل استفاده می‌کنند. ردیف آخر معیار تجربیِ هم‌ماه است که وابستگی را حفظ می‌کند.")}</p></div></div>
          <EChart height={300} label={t("Independent approximations and empirical upper quantile", "تقریب‌های مستقل و چندک تجربی")} option={{ animation: false, grid: { left: 138, right: 14, top: 18, bottom: 34 }, tooltip: { trigger: "axis", axisPointer: { type: "shadow" } }, xAxis: { type: "value", splitNumber: 3, axisLabel: { hideOverlap: true, formatter: (value: number) => value >= 1000 ? `${(value / 1000).toFixed(1)}bn` : `${Math.round(value)}m` }, splitLine: { lineStyle: { color: "#e8edf3" } } }, yAxis: { type: "category", data: approximationComparison.map((row) => row.name) }, series: [{ type: "bar", data: approximationComparison.map((row) => ({ value: row.value, itemStyle: { color: row.color, borderRadius: [0, 4, 4, 0] } })) }] }} />
          <PanelCredit names={contributor} role={t("Approximation methods implemented in the student's submitted files; reapplied here to policy-level portfolio moments.", "روش‌های تقریب پیاده‌سازی‌شده در فایل‌های تحویلی دانشجو؛ در اینجا بر گشتاورهای سطح بیمه‌نامه‌ی پرتفوی اعمال شده‌اند.")} />
        </section>
      </div>

      <div className="formula-grid">
        <Formula equation={String.raw`X_{i,t}=\sum_{c\mapsto(i,t)}P_c`} label={t("Policy i keeps its complete observed monthly loss: zero, one payment, or the sum of compatible payments in month t.", "برای بیمه‌نامه‌ی i، خسارت کامل ماهانه حفظ می‌شود: صفر، یک پرداخت یا جمع پرداخت‌های سازگار در ماه t.")} hint={t("Portfolio mapping", "اتصال به پرتفوی")} />
        <Formula equation={String.raw`\operatorname{Var}_{\mathrm{ind}}(S)=\sum_i\sigma_i^2`} label={t("The Chapter 2 benchmark removes only cross-policy covariance; it does not remove variation in positive claim amounts.", "معیار فصل ۲ فقط کوواریانس میان بیمه‌نامه‌ها را حذف می‌کند و تغییرپذیری مبالغ مثبت خسارت را از بین نمی‌برد.")} hint={t("Book assumption", "فرض کتاب")} />
        <Formula equation={String.raw`\Delta\operatorname{Var}(S)=2\sum_{i<j}\operatorname{Cov}(X_i,X_j)`} label={t("Adding policies within the same simulated month retains covariance created when one accident activates more than one policy.", "جمع بیمه‌نامه‌ها در همان ماه شبیه‌سازی‌شده، کوواریانس ناشی از فعال‌شدن چند بیمه‌نامه در یک حادثه را حفظ می‌کند.")} hint={t("Dependence check", "سنجش وابستگی")} />
      </div>

      <Notice kind="success" title={t("Boundary of this page", "محدوده دانش این صفحه")}>{t("This page contains policy-level loss aggregation and Chapter 2 distribution approximations only. Claim-count fitting and compound frequency-severity models belong to Chapter 3; VaR/TVaR estimator comparison, utility/reinsurance, and ruin remain on their own pages.", "این صفحه فقط تجمیع خسارت در سطح بیمه‌نامه و تقریب‌های توزیعی فصل ۲ را دربر می‌گیرد. برازش تعداد خسارت و مدل مرکب فراوانی-شدت به فصل ۳ تعلق دارد؛ مقایسه‌ی برآوردگرهای VaR/TVaR، مطلوبیت و ورشکستگی نیز در صفحه‌های مربوط به خود تشریح شده‌اند.")}</Notice>
      {apiError ? <Notice kind="warning" title={t("Authoritative API unavailable", "API مرجع در دسترس نیست")}>{t("Exact policy-month distributions require the Python service; loading values remain provisional.", "توزیع دقیق بیمه‌نامه-ماه به سرویس پایتون نیاز دارد و مقادیر هنگام بارگذاری موقت هستند.")}</Notice> : null}
      <Contributor names={contributor} summary={t("The student's submitted Chapter 2 files implement the Normal, Normal Power, and translated-gamma methods used on this page. Their accident-count convolution is recorded as provenance but is not presented as an individual-policy calculation. The portfolio integration uses the complete 1,000 monthly paid-loss outcomes of every selected policy.", "در فایل‌های تحویلی فصل ۲ ، روش‌های نرمال، توان نرمال و گامای انتقال‌یافته‌ی به‌کاررفته در این صفحه پیاده‌سازی شده‌اند.")} />
    </div>
  );
}
