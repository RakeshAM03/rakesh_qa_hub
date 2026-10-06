import "server-only";

import type { ListItem } from "@prisma/client";

import { db } from "@/lib/db";

import { Lists, type ListItemDto } from "./model";

export const listDto = (i: ListItem): ListItemDto => ({
  id: i.id,
  list: i.list,
  key: i.key,
  name: i.name,
  description: i.description,
  parentId: i.parentId,
  defaultCatchable: i.defaultCatchable,
  defaultOwnerId: i.defaultOwnerId,
  sortOrder: i.sortOrder,
  active: i.active,
});

export async function loadLists(): Promise<Lists> {
  const items = await db.listItem.findMany({ orderBy: [{ list: "asc" }, { sortOrder: "asc" }, { name: "asc" }] });
  return new Lists(items.map(listDto));
}

/** Issue columns that point at a list item, for "is this item in use?" checks. */
export const LIST_REF_FIELDS = ["productId", "dispositionId", "rcaCategoryId", "rcaSubcategoryId", "caughtAtId", "whyEscapedId", "detectedById", "scopeId", "impactId", "ownerTeamId"] as const;

export async function listItemUsage(id: string) {
  const issues = await db.customerIssue.count({ where: { OR: LIST_REF_FIELDS.map((f) => ({ [f]: id })) } });
  const children = await db.listItem.count({ where: { parentId: id } });
  const cases = await db.regressionCase.count({ where: { productId: id } });
  return { issues, children, cases };
}
