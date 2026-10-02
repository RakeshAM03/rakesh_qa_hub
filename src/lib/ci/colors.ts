import type { CiColor } from "./schema";

/** Static class names per suite colour (kept literal so Tailwind generates them). */
export const CI_COLOR_STYLES: Record<
  CiColor,
  { label: string; border: string; header: string; chip: string; chipActive: string; swatch: string }
> = {
  blue: { label: "Blue", border: "border-t-blue-600", header: "bg-blue-50", chip: "border-blue-300 text-blue-700 hover:bg-blue-50", chipActive: "border-blue-600 bg-blue-600 text-white", swatch: "bg-blue-600" },
  orange: { label: "Orange", border: "border-t-orange-500", header: "bg-orange-50", chip: "border-orange-300 text-orange-700 hover:bg-orange-50", chipActive: "border-orange-500 bg-orange-500 text-white", swatch: "bg-orange-500" },
  teal: { label: "Teal", border: "border-t-teal-600", header: "bg-teal-50", chip: "border-teal-300 text-teal-700 hover:bg-teal-50", chipActive: "border-teal-600 bg-teal-600 text-white", swatch: "bg-teal-600" },
  purple: { label: "Purple", border: "border-t-purple-600", header: "bg-purple-50", chip: "border-purple-300 text-purple-700 hover:bg-purple-50", chipActive: "border-purple-600 bg-purple-600 text-white", swatch: "bg-purple-600" },
  "light blue": { label: "Light blue", border: "border-t-sky-400", header: "bg-sky-50", chip: "border-sky-300 text-sky-700 hover:bg-sky-50", chipActive: "border-sky-500 bg-sky-500 text-white", swatch: "bg-sky-400" },
  green: { label: "Green", border: "border-t-green-600", header: "bg-green-50", chip: "border-green-300 text-green-700 hover:bg-green-50", chipActive: "border-green-600 bg-green-600 text-white", swatch: "bg-green-600" },
  red: { label: "Red", border: "border-t-red-600", header: "bg-red-50", chip: "border-red-300 text-red-700 hover:bg-red-50", chipActive: "border-red-600 bg-red-600 text-white", swatch: "bg-red-600" },
  grey: { label: "Grey", border: "border-t-neutral-500", header: "bg-neutral-100", chip: "border-neutral-300 text-neutral-700 hover:bg-neutral-100", chipActive: "border-neutral-600 bg-neutral-600 text-white", swatch: "bg-neutral-500" },
};

export const colorStyles = (c: string) => CI_COLOR_STYLES[(c in CI_COLOR_STYLES ? c : "blue") as CiColor];
