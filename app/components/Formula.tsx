"use client";

import katex from "katex";
import { tr, useLanguage } from "./i18n";

export function Formula({ equation, label, hint }: { equation: string; label: string; hint?: string }) {
  const { language } = useLanguage();
  const html = katex.renderToString(equation, { throwOnError: false, output: "htmlAndMathml" });
  return (
    <details className="formula-card">
      <summary>
        <span dangerouslySetInnerHTML={{ __html: html }} aria-label={label} />
        <span className="formula-open">{tr(language, "Theory & assumptions", "نظریه و فرض‌ها")}</span>
      </summary>
      <p>{label}</p>
      {hint ? <p className="persian-hint" lang="fa" dir="rtl">{hint}</p> : null}
    </details>
  );
}
