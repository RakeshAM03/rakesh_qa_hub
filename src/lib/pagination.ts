export type PageItem = number | "ellipsis-start" | "ellipsis-end";

/**
 * Page numbers to show: always the first and last page, the current page with
 * `siblings` on each side, and ellipses for the gaps.
 */
export function pageItems(current: number, totalPages: number, siblings = 1): PageItem[] {
  if (totalPages <= 0) return [];
  const window = siblings * 2 + 5; // first, last, current, siblings, two ellipses
  if (totalPages <= window) return Array.from({ length: totalPages }, (_, i) => i + 1);

  const start = Math.max(2, current - siblings);
  const end = Math.min(totalPages - 1, current + siblings);
  const items: PageItem[] = [1];
  if (start > 2) items.push("ellipsis-start");
  for (let p = start; p <= end; p++) items.push(p);
  if (end < totalPages - 1) items.push("ellipsis-end");
  items.push(totalPages);
  return items;
}

/** "1–25 of 197" style range; "0–0 of 0" when empty. */
export function rangeLabel(page: number, size: number, total: number) {
  if (total === 0) return "0–0 of 0";
  const from = (page - 1) * size + 1;
  const to = Math.min(page * size, total);
  return `${from}–${to} of ${total}`;
}

export const totalPagesFor = (total: number, size: number) => Math.max(1, Math.ceil(total / size));
