"use client";

import { useEffect, useState } from "react";
import type { PortfolioData } from "./types";

let cache: PortfolioData | null = null;

export function usePortfolio() {
  const [data, setData] = useState<PortfolioData | null>(cache);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cache) return;
    Promise.all([
      fetch("/data/months.json").then((response) => {
        if (!response.ok) throw new Error("Month data are unavailable");
        return response.json();
      }),
      fetch("/data/summary.json").then((response) => {
        if (!response.ok) throw new Error("Portfolio summary is unavailable");
        return response.json();
      }),
    ])
      .then(([months, summary]) => {
        cache = { months, summary };
        setData(cache);
      })
      .catch((reason: Error) => setError(reason.message));
  }, []);

  return { data, error };
}
