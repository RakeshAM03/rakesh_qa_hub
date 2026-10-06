"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Lists, type ListItemDto } from "@/lib/customer-issues/model";

/** Loads the classification lists once per page; `reload()` after edits. */
export function useLists() {
  const [items, setItems] = useState<ListItemDto[] | null>(null);
  const [error, setError] = useState(false);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/customer-issues/lists", { cache: "no-store", signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((json) => {
        setItems(json.items);
        setError(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [version]);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const lists = useMemo(() => (items ? new Lists(items) : null), [items]);
  return { lists, error, reload };
}
