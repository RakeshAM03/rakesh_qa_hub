import { z } from "zod";

import { METHODS } from "./request";

const kv = z.object({ id: z.string().max(100), key: z.string().max(1000), value: z.string().max(100_000), enabled: z.boolean() });
const kvList = z.array(kv).max(200);

export const authSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("none") }),
  z.object({ type: z.literal("bearer"), token: z.string().max(10_000) }),
  z.object({ type: z.literal("basic"), username: z.string().max(1000), password: z.string().max(1000) }),
  z.object({ type: z.literal("apikey"), key: z.string().max(1000), value: z.string().max(10_000), in: z.enum(["header", "query"]) }),
]);

export const bodySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("none") }),
  z.object({ type: z.literal("json"), text: z.string().max(1024 * 1024) }),
  z.object({ type: z.literal("form"), fields: kvList }),
  z.object({ type: z.literal("raw"), text: z.string().max(1024 * 1024), contentType: z.string().max(200) }),
]);

export const assertionSchema = z.object({
  id: z.string().max(100),
  type: z.enum(["status", "time", "header", "jsonpath", "body"]),
  target: z.string().max(1000),
  operator: z.enum(["equals", "notEquals", "contains", "notContains", "lessThan", "greaterThan", "exists", "notExists", "isType"]),
  expected: z.string().max(10_000),
});

export const requestFields = {
  name: z.string().trim().min(1, "Name is required").max(200),
  method: z.enum(METHODS),
  url: z.string().max(8000),
  params: kvList,
  headers: kvList,
  auth: authSchema,
  body: bodySchema,
  assertions: z.array(assertionSchema).max(100),
};

export const requestCreateSchema = z.object({ collectionId: z.string().min(1), ...requestFields });
export const requestPatchSchema = z
  .object({
    collectionId: z.string().min(1),
    name: requestFields.name,
    method: requestFields.method,
    url: requestFields.url,
    params: requestFields.params,
    headers: requestFields.headers,
    auth: requestFields.auth,
    body: requestFields.body,
    assertions: requestFields.assertions,
    sortOrder: z.number().int(),
  })
  .partial();

export const collectionCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  /** Import: requests to create inside the new collection. */
  requests: z.array(z.object(requestFields)).max(500).optional(),
});
export const collectionPatchSchema = z.object({ name: z.string().trim().min(1, "Name is required").max(200) });

export const environmentSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  variables: z.array(z.object({ key: z.string().trim().max(200), value: z.string().max(10_000) })).max(200),
});

export const sendSchema = z.object({
  method: z.enum(METHODS),
  url: z.string().min(1, "Enter a URL").max(8000),
  headers: z.array(z.object({ key: z.string().max(1000), value: z.string().max(100_000) })).max(200),
  body: z.string().optional(),
});
