"use client";

import katex from "katex";
import type { ReactNode } from "react";

function renderMath(equation: string, displayMode: boolean) {
  return katex.renderToString(equation, {
    displayMode,
    output: "htmlAndMathml",
    throwOnError: true,
  });
}

export function InlineMath({ equation, className = "" }: { equation: string; className?: string }) {
  return (
    <span
      className={`inline-math ${className}`.trim()}
      dir="ltr"
      dangerouslySetInnerHTML={{ __html: renderMath(equation, false) }}
    />
  );
}

export function Formula({ equation, label, hint }: { equation: string; label: ReactNode; hint?: string }) {
  const html = renderMath(equation, true);
  return (
    <article className="formula-card">
      <div className="formula-expression" dir="ltr" dangerouslySetInnerHTML={{ __html: html }} />
      {hint ? <p className="formula-title">{hint}</p> : null}
      <p className="formula-description">{label}</p>
    </article>
  );
}
