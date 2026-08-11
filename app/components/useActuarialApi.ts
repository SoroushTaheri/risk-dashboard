"use client";

import { useEffect, useMemo, useState } from "react";

export function useActuarialApi<T>(path: string, request: Record<string, unknown>) {
  const body = useMemo(() => JSON.stringify(request), [request]);
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Actuarial API returned ${response.status}`);
        return response.json() as Promise<T>;
      })
      .then((result) => {
        setData(result);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "Actuarial API unavailable");
      });
    return () => controller.abort();
  }, [body, path]);

  return { data, error };
}

export function useActuarialGet<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(path, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Actuarial API returned ${response.status}`);
        return response.json() as Promise<T>;
      })
      .then((result) => { setData(result); setError(null); })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "Actuarial API unavailable");
      });
    return () => controller.abort();
  }, [path]);
  return { data, error };
}

export function apiCoverage(coverage: "total" | "own" | "third") {
  return coverage === "own" ? "own_damage" : coverage === "third" ? "third_party_liability" : "total";
}
