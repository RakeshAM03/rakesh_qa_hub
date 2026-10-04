import "server-only";

import type { RiskArea, RiskPlan } from "@prisma/client";

import { computeAreas, mergeSettings, type AreaInput } from "@/lib/risk";

export const fromIsoDate = (v: string) => new Date(`${v}T00:00:00Z`);
export const toIsoDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export const areaInput = (a: RiskArea): AreaInput => ({
  id: a.id,
  name: a.name,
  featurePageId: a.featurePageId,
  changeSize: a.changeSize,
  complexity: a.complexity,
  defectHistory: a.defectHistory,
  dependencies: a.dependencies,
  businessImpact: a.businessImpact,
  usageFrequency: a.usageFrequency,
  depthOverride: a.depthOverride,
  hoursOverride: a.hoursOverride,
  deferred: a.deferred,
  deferReason: a.deferReason,
  sortOrder: a.sortOrder,
});

export function planRow(p: RiskPlan & { areas: RiskArea[]; release: { name: string } | null }) {
  const computed = computeAreas(p.areas.map(areaInput), p.availableHours, mergeSettings(p.settings));
  return {
    id: p.id,
    name: p.name,
    startDate: toIsoDate(p.startDate),
    endDate: toIsoDate(p.endDate),
    availableHours: p.availableHours,
    testers: p.testers,
    releaseName: p.release?.name ?? null,
    areas: p.areas.length,
    highRisk: computed.filter((a) => !a.deferred && (a.level === "Critical" || a.level === "High")).length,
    createdAt: p.createdAt,
  };
}

export function planDto(p: RiskPlan & { areas: RiskArea[]; release: { id: string; name: string; linkedRepos: string[] } | null }) {
  return {
    id: p.id,
    name: p.name,
    startDate: toIsoDate(p.startDate),
    endDate: toIsoDate(p.endDate),
    availableHours: p.availableHours,
    testers: p.testers,
    notes: p.notes,
    releaseId: p.releaseId,
    release: p.release ? { id: p.release.id, name: p.release.name, linkedRepos: p.release.linkedRepos } : null,
    settings: mergeSettings(p.settings),
    areas: [...p.areas].sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime()).map(areaInput),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}
