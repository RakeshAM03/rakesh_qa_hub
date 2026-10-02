/** Colour themes a visitor can pick. Each maps to [data-accent] in globals.css. */
export const ACCENTS = [
  { id: "aurora", name: "Aurora", description: "AI gradient · indigo, violet, cyan", swatch: ["#4f46e5", "#a855f7", "#22d3ee"] },
  { id: "ocean", name: "Ocean", description: "Calm blues and cyan", swatch: ["#2563eb", "#0ea5e9", "#67e8f9"] },
  { id: "emerald", name: "Emerald", description: "Fresh greens and teal", swatch: ["#059669", "#14b8a6", "#a3e635"] },
  { id: "sunset", name: "Sunset", description: "Warm orange and pink", swatch: ["#f97316", "#f43f5e", "#fbbf24"] },
  { id: "mono", name: "Mono", description: "Minimal greyscale", swatch: ["#262626", "#737373", "#d4d4d4"] },
] as const;

export type AccentId = (typeof ACCENTS)[number]["id"];
export const DEFAULT_ACCENT: AccentId = "aurora";
export const ACCENT_STORAGE_KEY = "qa-hub:accent";

export const isAccent = (v: unknown): v is AccentId => ACCENTS.some((a) => a.id === v);

/** Runs before first paint so the saved colour theme never flashes. Static string, no user input. */
export const ACCENT_BOOT_SCRIPT = `try{var a=localStorage.getItem(${JSON.stringify(ACCENT_STORAGE_KEY)});if(${JSON.stringify(
  ACCENTS.map((x) => x.id),
)}.indexOf(a)<0)a=${JSON.stringify(DEFAULT_ACCENT)};document.documentElement.setAttribute("data-accent",a)}catch(e){document.documentElement.setAttribute("data-accent",${JSON.stringify(DEFAULT_ACCENT)})}`;
