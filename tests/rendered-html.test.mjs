import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the corrected actuarial laboratory shell", async () => {
  const response = await render("/");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>Risk Theory Lab<\/title>/i);
  assert.match(html, /Policies, accidents, claims, and paid loss/);
  assert.match(html, /synthetic monthly observations/);
  assert.match(html, /Risk Measures/);
  assert.match(html, /Utility &amp; Reinsurance/);
  assert.doesNotMatch(html, /Methodology &amp; Credits/);
  assert.match(html, /Final project for Risk Theory/);
  assert.match(html, /Second semester 1404–1405/);
  assert.match(html, /فارسی/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("all chapter routes render their central question", async () => {
  const routes = [
    ["/risk-measures", /VaR, TVaR, and the upper tail of loss/],
    ["/utility-reinsurance", /Utility, acceptable premium, and reinsurance/],
    ["/individual-risk", /From policy risks to aggregate loss/],
    ["/collective-risk", /Claim frequency, severity, and aggregate loss/],
    ["/solvency-ruin", /Surplus, solvency, and finite-horizon ruin/],
  ];
  for (const [pathname, expected] of routes) {
    const response = await render(pathname);
    assert.equal(response.status, 200, pathname);
    assert.match(await response.text(), expected, pathname);
  }
});

test("ships local assets and reconciled v2 month data", async () => {
  await Promise.all([
    access(new URL("../public/fonts/NotoSans-Variable.ttf", import.meta.url)),
    access(new URL("../public/fonts/Sahel.woff2", import.meta.url)),
    access(new URL("../public/og-bilingual-v2.png", import.meta.url)),
    access(new URL("../public/data/months.json", import.meta.url)),
  ]);
  const summary = JSON.parse(await readFile(new URL("../public/data/summary.json", import.meta.url), "utf8"));
  const months = JSON.parse(await readFile(new URL("../public/data/months.json", import.meta.url), "utf8"));
  assert.equal(summary.months, 1000);
  assert.equal(summary.vehicles, 10000);
  assert.equal(summary.total_policies, 17000);
  assert.equal(summary.reconciliation_status, "pass");
  assert.equal(summary.source_sha256.length, 64);
  assert.equal(months.length, 1000);
  assert.equal(months[0].month_id, "M0001");
  assert.equal(
    months[0].total_claims,
    months[0].at_fault_own_claims + months[0].injured_excess_claims + months[0].liability_claims,
  );
  assert.equal(Object.hasOwn(months[0], "total_loss_cases"), false);
  const uiSource = await readFile(new URL("../app/components/ui.tsx", import.meta.url), "utf8");
  assert.match(uiSource, /million tomans/);
  assert.match(uiSource, /میلیون تومان/);
});

test("keeps month labels human-readable and math permanently visible", async () => {
  const [uiSource, formulaSource, css] = await Promise.all([
    readFile(new URL("../app/components/ui.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/Formula.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(uiSource, /ماه \$\{monthNumber\.toLocaleString\("fa-IR"\)\} ام/);
  assert.match(formulaSource, /katex\.renderToString/);
  assert.match(formulaSource, /throwOnError:\s*true/);
  assert.match(formulaSource, /className="formula-expression" dir="ltr"/);
  assert.doesNotMatch(formulaSource, /<details|<summary/);

  const pixelFontSizes = [...css.matchAll(/font-size:\s*([0-9]+(?:\.[0-9]+)?)px/g)].map((match) => Number(match[1]));
  assert.ok(pixelFontSizes.length > 0);
  assert.ok(pixelFontSizes.every((size) => size >= 10), `font size below 10px: ${Math.min(...pixelFontSizes)}px`);
  assert.match(css, /\.inline-math[^}]*direction:\s*ltr/);
  assert.match(css, /\.formula-expression[^}]*direction:\s*ltr/);
});

test("portfolio presents meaningful month metrics and one third-party coverage", async () => {
  const portfolioSource = await readFile(new URL("../app/components/experiences/PortfolioExperience.tsx", import.meta.url), "utf8");
  assert.match(portfolioSource, /Mean paid per claim/);
  assert.match(portfolioSource, /Physical accidents/);
  assert.match(portfolioSource, /Claim files/);
  assert.match(portfolioSource, /month\.third_amount/);
  assert.doesNotMatch(portfolioSource, /month\.third_(?:property|bodily)_amount/);
  assert.match(portfolioSource, /علی تیموری، سروش طاهری/);
  assert.doesNotMatch(portfolioSource, /logScale|مقیاس لگاریتمی|Logarithmic scale/);
  assert.match(portfolioSource, /Scatter chart controls/);
  assert.doesNotMatch(portfolioSource, /مازاد پوشش|Uncovered(?: third-party)? excess/);
  assert.match(portfolioSource, /حادثه یک رویداد فیزیکی است/);
  assert.match(portfolioSource, /تعداد پرونده‌ها می‌تواند از تعداد حادثه‌ها کمتر، برابر یا بیشتر باشد/);
  assert.doesNotMatch(portfolioSource, /ResultTag/);
  assert.match(portfolioSource, /Explanatory definition cards are intentionally hidden/);
  assert.match(portfolioSource, /ساختار داده/);
  assert.match(portfolioSource, /نمای کلی پرتفوی/);
  assert.match(portfolioSource, /ماه انتخاب‌شده/);
  assert.match(portfolioSource, /نماهای خسارت/);
  assert.match(portfolioSource, /month\.at_fault_own_claims/);
  assert.match(portfolioSource, /month\.liability_claims/);
  assert.match(portfolioSource, /month\.injured_excess_claims/);
  assert.match(portfolioSource, /Triggered policy types/);
  assert.match(portfolioSource, /توزیع و زنجیره‌ی موجودیت‌ها/);
  assert.match(portfolioSource, /<h3>/);
});

test("risk measures explain estimators and keep chart comparisons legible", async () => {
  const riskSource = await readFile(new URL("../app/components/experiences/RiskExperience.tsx", import.meta.url), "utf8");
  assert.match(riskSource, /monthly aggregate-loss observations/);
  assert.match(riskSource, /not .* individual accidents or claim files/);
  assert.match(riskSource, /\widehat\{\\operatorname\{VaR\}\}_p=X_/);
  assert.match(riskSource, /presenting its VaR as a fourth independent estimator would therefore be circular/);
  assert.match(riskSource, /not a fourth estimator/);
  assert.match(riskSource, /className="method-cards"/);
  assert.match(riskSource, /className="delta-gamma-note"/);
  assert.match(riskSource, /Hypothetical only/);
  assert.match(riskSource, /hypotheticalClaimCount = 100/);
  assert.match(riskSource, /hypotheticalMeanSeverity = 60/);
  assert.match(riskSource, /hypotheticalGammaContribution = hypotheticalCountShock \* hypotheticalSeverityShock/);
  assert.match(riskSource, /neither estimated from nor written back to the synthetic portfolio/);
  assert.match(riskSource, /Because g\(N,M\)=NM is bilinear/);
  assert.match(riskSource, /type: "value", min: histogramAxisMin, max: histogramAxisMax/);
  assert.match(riskSource, /data: \[\{ xAxis: displayedVar \}\]/);
  assert.match(riskSource, /min: comparisonAxisMin, max: comparisonAxisMax/);
  assert.match(riskSource, /does not start at zero/);
  assert.match(riskSource, /not the end of the calendar/);
  const chartsIndex = riskSource.indexOf('className="panel-grid two-thirds"');
  const qualitativeIndex = riskSource.indexOf('توضیحات کیفی و شهودی VaR');
  const guideIndex = riskSource.indexOf('className="panel estimator-guide"');
  assert.ok(chartsIndex < qualitativeIndex && qualitativeIndex < guideIndex, "risk-page explanation order");
});

test("rendered UI presents only the final data model", async () => {
  const portfolioResponse = await render("/");
  const portfolioHtml = await portfolioResponse.text();
  assert.doesNotMatch(portfolioHtml, /Corrected|اصلاح|Liability · (?:property|bodily)|شخص ثالث · (?:مالی|جانی)/i);
  assert.doesNotMatch(portfolioHtml, /Version 2 reconciliation gate passed|کنترل تطبیق نسخه‌ی ۲ تأیید شد/);
});

test("chapter credits hide filenames and include the integration role", async () => {
  const uiSource = await readFile(new URL("../app/components/ui.tsx", import.meta.url), "utf8");
  assert.match(uiSource, /Soroush Taheri/);
  assert.match(uiSource, /سروش طاهری/);
  assert.match(uiSource, /Python API backend/);
  assert.match(uiSource, /Chapter\/page implementation/);
  assert.match(uiSource, /Validation, fitting & integration/);
  assert.doesNotMatch(uiSource, /files|\/methodology/);
});

test("every page includes its current contribution summary", async () => {
  const sources = [
    ["PortfolioExperience.tsx", /original calibration target/],
    ["RiskExperience.tsx", /not a fourth estimator/],
    ["UtilityExperience.tsx", /same local absolute risk aversion/],
    ["IndividualExperience.tsx", /complete 1,000 monthly paid-loss outcomes/],
    ["CollectiveExperience.tsx", /coverage-stratified compound-loss workflow/],
    ["RuinExperience.tsx", /No ultimate-ruin probability or Lundberg bound/],
  ];
  for (const [filename, expectedSummary] of sources) {
    const source = await readFile(new URL(`../app/components/experiences/${filename}`, import.meta.url), "utf8");
    assert.match(source, /<Contributor\b/, filename);
    assert.match(source, expectedSummary, filename);
  }
});

test("individual-risk page separates book, student, and portfolio scope", async () => {
  const source = await readFile(new URL("../app/components/experiences/IndividualExperience.tsx", import.meta.url), "utf8");
  assert.match(source, /One question, three clearly separated sources/);
  assert.match(source, /Book foundation/);
  assert.match(source, /Student-submitted files/);
  assert.match(source, /Portfolio application/);
  assert.match(source, /Normal Power/);
  assert.match(source, /Translated Gamma/);
  assert.match(source, /No average fixed benefit replaces those observed severities/);
  assert.match(source, /Average monthly payment probability per policy/);
  assert.match(source, /For each policy: paid months ÷/);
  assert.match(source, /میانگین احتمال پرداخت ماهانه‌ی هر بیمه‌نامه/);
  assert.match(source, /Why is the mean fixed while dispersion changes\?/);
  assert.match(source, /The means are always identical by the linearity of expectation/);
  assert.match(source, /Direct model comparison/);
  assert.match(source, /Both models remain visible at the same time/);
  assert.match(source, /money\(independentMean\)/);
  assert.match(source, /money\(sharedMean\)/);
  assert.match(source, /money\(independentSd\)/);
  assert.match(source, /money\(sharedSd\)/);
  assert.doesNotMatch(source, /The two means differ by only|اختلاف میانگین دو روش فقط|meanReconciliationLabel/);
  assert.match(source, /accident-count convolution is recorded as provenance but is not presented as an individual-policy calculation/);
  assert.match(source, /Claim-count fitting and compound frequency-severity models belong to Chapter 3/);
  assert.doesNotMatch(source, /Independent Bernoulli|برنولی مستقل|q_i b_i|q_i\(1-q_i\)b_i\^2/);
  assert.doesNotMatch(source, /تمرین|exercise/i);
});

test("ruin page defines the simulation, zero estimate, and both chart axes", async () => {
  const source = await readFile(new URL("../app/components/experiences/RuinExperience.tsx", import.meta.url), "utf8");
  assert.match(source, /What exactly is being simulated\?/);
  assert.match(source, /Start with 1,000 months/);
  assert.match(source, /S=\\min\(X,d\)/);
  assert.match(source, /Monte Carlo result, not proof of impossibility/);
  assert.match(source, /Surplus Uₖ \(million tomans\)/);
  assert.match(source, /Pr\(first ruin by month n\)/);
  assert.match(source, /probabilityAxisMaximum/);
  assert.match(source, /type: "value", name: t\("Initial capital u/);
  assert.match(source, /T is the first ruin month/);
  assert.match(source, /metric-fraction" dir="ltr"/);
  assert.match(source, /width: series\.ruined \? 3\.2 : 1\.25/);
  assert.match(source, /type: "scatter"/);
  assert.doesNotMatch(source, /index === 0 \? 2\.3/);
  assert.doesNotMatch(source, /value=\{t\("Same months"/);
});
