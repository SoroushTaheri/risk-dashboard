"use client";

import { useEffect, useRef } from "react";
import type { EChartsCoreOption } from "echarts/core";

export function EChart({ option, label, height = 310 }: { option: EChartsCoreOption; label: string; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let chart: import("echarts/core").ECharts | undefined;
    let observer: ResizeObserver | undefined;
    let cancelled = false;
    Promise.all([
      import("echarts/core"),
      import("echarts/charts"),
      import("echarts/components"),
      import("echarts/renderers"),
    ]).then(([echarts, charts, components, renderers]) => {
      if (cancelled || !ref.current) return;
      echarts.use([
        charts.BarChart,
        charts.LineChart,
        charts.PieChart,
        components.GridComponent,
        components.LegendComponent,
        components.MarkLineComponent,
        components.TooltipComponent,
        renderers.CanvasRenderer,
      ]);
      chart = echarts.init(ref.current, undefined, { renderer: "canvas" });
      chart.setOption(option, { notMerge: true });
      observer = new ResizeObserver(() => chart?.resize());
      observer.observe(ref.current);
    });
    return () => {
      cancelled = true;
      observer?.disconnect();
      chart?.dispose();
    };
  }, [option]);

  return <div ref={ref} className="chart" style={{ height }} role="img" aria-label={label} />;
}
