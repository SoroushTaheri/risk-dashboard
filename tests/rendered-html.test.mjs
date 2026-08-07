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

test("server-renders the finished actuarial laboratory shell", async () => {
  const response = await render("/");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>Risk Theory Lab<\/title>/i);
  assert.match(html, /Portfolio data and the five course models/);
  assert.match(html, /Risk Measures/);
  assert.match(html, /Utility &amp; Reinsurance/);
  assert.match(html, /Methodology &amp; Credits/);
  assert.match(html, /Chapter 2 - Dr\. Payandeh/);
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
    ["/methodology", /How each result is produced and credited/],
  ];
  for (const [pathname, expected] of routes) {
    const response = await render(pathname);
    assert.equal(response.status, 200, pathname);
    assert.match(await response.text(), expected, pathname);
  }
});

test("ships local fonts, social card, and reconciled browser data", async () => {
  await Promise.all([
    access(new URL("../public/fonts/NotoSans-Variable.ttf", import.meta.url)),
    access(new URL("../public/fonts/Sahel.woff2", import.meta.url)),
    access(new URL("../public/og-bilingual-v2.png", import.meta.url)),
    access(new URL("../public/data/monthly.json", import.meta.url)),
  ]);
  const summary = JSON.parse(await readFile(new URL("../public/data/summary.json", import.meta.url), "utf8"));
  const months = JSON.parse(await readFile(new URL("../public/data/monthly.json", import.meta.url), "utf8"));
  assert.equal(summary.months, 1000);
  assert.equal(summary.reconciliation_status, "pass");
  assert.equal(summary.source_sha256.length, 64);
  assert.equal(months[0].total_loss_cases, 3);
  assert.equal(months[0].overlap_accidents, 10);
  const uiSource = await readFile(new URL("../app/components/ui.tsx", import.meta.url), "utf8");
  assert.match(uiSource, /ماه \$\{monthNumber\.toLocaleString\("fa-IR"\)\} ام/);
  assert.match(uiSource, /تومان/);
});
