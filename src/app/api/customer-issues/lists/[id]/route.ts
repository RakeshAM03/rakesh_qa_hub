import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { isNotFound, jsonError, readJson } from "@/lib/api";
import { listItemPatchSchema } from "@/lib/customer-issues/schema";
import { listDto, listItemUsage } from "@/lib/customer-issues/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const notFound = () => jsonError(404, "That list item doesn't exist (it may have been deleted).");

/** Edit (rename, describe, defaults, order, active) — passcode. */
export async function PATCH(req: Request, ctx: RouteContext<"/api/customer-issues/lists/[id]">) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const parsed = await readJson(req, listItemPatchSchema);
  if ("response" in parsed) return parsed.response;
  const current = await db.listItem.findUnique({ where: { id } });
  if (!current) return notFound();
  const data = parsed.data;
  if (data.name && data.name.toLowerCase() !== current.name.toLowerCase()) {
    const clash = await db.listItem.findFirst({ where: { list: current.list, parentId: current.parentId, name: { equals: data.name, mode: "insensitive" }, NOT: { id } } });
    if (clash) return jsonError(409, `"${data.name}" is already in this list.`);
  }
  if (current.list !== "RCA_CATEGORY") {
    delete data.defaultCatchable;
    delete data.defaultOwnerId;
  }
  try {
    const item = await db.listItem.update({ where: { id }, data: { ...data, description: data.description === undefined ? undefined : data.description?.trim() || null } });
    return NextResponse.json({ item: listDto(item) });
  } catch (err) {
    if (isNotFound(err)) return notFound();
    throw err;
  }
}

/** Delete — passcode; refused while issues, cases or sub-categories use it (deactivate instead). */
export async function DELETE(req: Request, ctx: RouteContext<"/api/customer-issues/lists/[id]">) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const item = await db.listItem.findUnique({ where: { id } });
  if (!item) return notFound();
  if (item.key) return jsonError(409, `"${item.name}" is used by the module's rules — rename or deactivate it instead.`);
  const usage = await listItemUsage(id);
  if (usage.issues || usage.children || usage.cases) {
    const parts = [usage.issues && `${usage.issues} issue${usage.issues === 1 ? "" : "s"}`, usage.children && `${usage.children} sub-categor${usage.children === 1 ? "y" : "ies"}`, usage.cases && `${usage.cases} regression case${usage.cases === 1 ? "" : "s"}`].filter(Boolean);
    return jsonError(409, `"${item.name}" is used by ${parts.join(", ")} — deactivate it instead so history stays intact.`);
  }
  await db.listItem.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
