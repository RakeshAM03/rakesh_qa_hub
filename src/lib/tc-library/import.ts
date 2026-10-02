import { importEntrySchema, IMPORT_MAX_ENTRIES, type ImportEntry } from "./schema";

export type ImportPreview = {
  valid: ImportEntry[];
  invalid: { index: number; name?: string; reason: string }[];
  /** Set when the file itself can't be used. */
  error?: string;
};

/** Validates a TC Library JSON export: one entry or an array of entries. */
export function previewImport(text: string): ImportPreview {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { valid: [], invalid: [], error: "That file isn't valid JSON." };
  }
  // Accept our own export format ({ entries: [...] }) as well.
  if (data && typeof data === "object" && !Array.isArray(data) && Array.isArray((data as { entries?: unknown }).entries)) {
    data = (data as { entries: unknown[] }).entries;
  }
  const items = Array.isArray(data) ? data : [data];
  if (items.length === 0) return { valid: [], invalid: [], error: "The file has no entries." };
  if (items.length > IMPORT_MAX_ENTRIES) {
    return { valid: [], invalid: [], error: `Import at most ${IMPORT_MAX_ENTRIES} entries at a time.` };
  }

  const preview: ImportPreview = { valid: [], invalid: [] };
  items.forEach((item, index) => {
    const result = importEntrySchema.safeParse(item);
    if (result.success) {
      preview.valid.push(result.data);
    } else {
      const name =
        item && typeof item === "object" && typeof (item as { name?: unknown }).name === "string"
          ? (item as { name: string }).name
          : undefined;
      preview.invalid.push({ index, name, reason: result.error.issues[0]?.message ?? "Invalid entry" });
    }
  });
  return preview;
}
