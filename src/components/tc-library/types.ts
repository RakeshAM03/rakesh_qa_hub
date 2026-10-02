export type EntrySummary = {
  id: string;
  name: string;
  prReference: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  preview: string;
  outputLength: number;
};

export type Entry = Omit<EntrySummary, "preview" | "outputLength"> & { output: string };

export type SortKey = "newest" | "oldest" | "name";

export async function fetchEntry(id: string): Promise<Entry> {
  const res = await fetch(`/api/tc-library/${id}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Couldn't load that entry.");
  return data.entry;
}
