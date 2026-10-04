"use client";

import { useTheme } from "next-themes";

/**
 * Categorical palette (fixed order, never cycled), validated for colour-vision
 * deficiency in both modes. The last slot is a neutral for "Other/Unknown".
 */
export const CATEGORICAL = {
  light: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"],
  dark: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"],
  neutral: { light: "#8a8a85", dark: "#8f8e88" },
};

/** Chart chrome for the current light/dark mode (SVG attributes can't use CSS variables). */
export function useChartTheme() {
  const dark = useTheme().resolvedTheme === "dark";
  const c = dark
    ? { axis: "#a3a3a3", grid: "#2e2e36", label: "#d4d4d4", cursor: "#26262e", surface: "#1b1b22", border: "#33333d", text: "#f5f5f5" }
    : { axis: "#737373", grid: "#e5e5e5", label: "#404040", cursor: "#f5f5f5", surface: "#ffffff", border: "#e5e5e5", text: "#171717" };
  return {
    ...c,
    dark,
    series: (i: number) => (dark ? CATEGORICAL.dark : CATEGORICAL.light)[i],
    neutral: dark ? CATEGORICAL.neutral.dark : CATEGORICAL.neutral.light,
    tick: { fontSize: 12, fill: c.axis },
    tooltip: {
      contentStyle: { borderRadius: 8, border: `1px solid ${c.border}`, background: c.surface, fontSize: 12, boxShadow: "0 2px 8px rgb(0 0 0 / 0.15)" },
      labelStyle: { color: c.text, fontWeight: 600 },
      itemStyle: { color: c.label },
    },
  };
}
