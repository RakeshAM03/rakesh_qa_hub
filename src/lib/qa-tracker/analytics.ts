import { toIsoDate, type TaskStatus } from "./schema";

export type LogRow = { date: Date; hours: number; status: TaskStatus; resourceId: string };

/** Totals, per-resource and per-status hours, and a zero-filled daily series for [from, to]. */
export function computeAnalytics(
  logs: LogRow[],
  resources: { id: string; name: string }[],
  from: Date,
  to: Date,
) {
  const round = (n: number) => Math.round(n * 100) / 100;
  const totalHours = logs.reduce((s, l) => s + l.hours, 0);
  const days = new Map<string, number>();
  for (const l of logs) days.set(toIsoDate(l.date), (days.get(toIsoDate(l.date)) ?? 0) + l.hours);

  const daily: { date: string; hours: number }[] = [];
  for (let d = new Date(from); d <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    const key = toIsoDate(d);
    daily.push({ date: key, hours: round(days.get(key) ?? 0) });
  }

  const byResource = resources
    .map((r) => ({
      id: r.id,
      name: r.name,
      hours: round(logs.filter((l) => l.resourceId === r.id).reduce((s, l) => s + l.hours, 0)),
    }))
    .filter((r) => r.hours > 0)
    .sort((a, b) => b.hours - a.hours);

  const byStatus = (["COMPLETED", "IN_PROGRESS", "NOT_STARTED"] as const).map((status) => {
    const rows = logs.filter((l) => l.status === status);
    return { status, hours: round(rows.reduce((s, l) => s + l.hours, 0)), tasks: rows.length };
  });

  return {
    totals: {
      hours: round(totalHours),
      tasks: logs.length,
      loggedDays: days.size,
      avgHoursPerDay: days.size ? round(totalHours / days.size) : 0,
    },
    byResource,
    byStatus,
    daily,
  };
}
