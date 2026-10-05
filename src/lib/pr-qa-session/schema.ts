import { z } from "zod";

import { ALL_STEP_IDS, BUILT_IN_TEMPLATES, FOCUS_AREAS, LOGIN_METHODS } from "@/config/pr-qa-templates";

import { sanitizeLoginUrl } from "./prompt/inputs";

const LOGIN_METHOD_VALUES = LOGIN_METHODS.map((m) => m.value) as [string, ...string[]];

const builtInNames = new Set(BUILT_IN_TEMPLATES.map((t) => t.name.toLowerCase()));

export const templateInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(60, "Name must be 60 characters or fewer")
    .refine((n) => !builtInNames.has(n.toLowerCase()), "That name is used by a built-in template"),
  focusAreas: z.array(z.enum(FOCUS_AREAS)).max(FOCUS_AREAS.length),
  steps: z
    .array(z.number().int().refine((n) => ALL_STEP_IDS.includes(n as never), "Unknown step"))
    .min(1, "Select at least one step")
    .max(ALL_STEP_IDS.length),
  context: z.string().max(10_000).optional().nullable(),
  specRef: z.string().max(50_000).optional().nullable(),
  /** Login page URL only — credentials in it (user:pass@, token/password params) are stripped. */
  loginUrl: z
    .string()
    .max(2000)
    .optional()
    .nullable()
    .transform((v, ctx) => {
      if (!v?.trim()) return null;
      const clean = sanitizeLoginUrl(v);
      if (!clean) {
        ctx.addIssue({ code: "custom", message: "Login URL must be an http(s) URL" });
        return z.NEVER;
      }
      return clean.url;
    }),
  loginMethod: z.enum(LOGIN_METHOD_VALUES).optional().nullable(),
  specFolders: z.string().max(1000).optional().nullable(),
});
export type TemplateInput = z.infer<typeof templateInputSchema>;
