"use client";

import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";

import type { TreeNode } from "@/lib/locators/tree";
import { cn } from "@/lib/utils";

type TreeProps = {
  root: TreeNode;
  selected: string | null;
  onSelect: (path: string) => void;
  /** Paths highlighted by the locator tester. */
  highlighted: Set<string>;
  /** Expand everything (used while filtering). */
  expandAll: boolean;
};

const DEFAULT_DEPTH = 4;
const MAX_ROWS = 1500;

type Row = { node: TreeNode; depth: number; open: boolean };

const isAncestorPath = (path: string, of: string) => of !== path && of.startsWith(`${path}.`);

/** Collapsible DOM tree. Pasted HTML is only ever shown as text here, never rendered. */
export function ElementTree({ root, selected, onSelect, highlighted, expandAll }: TreeProps) {
  const [toggled, setToggled] = useState<Map<string, boolean>>(new Map());

  const { rows, truncated } = useMemo(() => {
    const out: Row[] = [];
    const focus = [...highlighted, ...(selected ? [selected] : [])];
    const walk = (node: TreeNode, depth: number): boolean => {
      if (out.length >= MAX_ROWS) return false;
      const auto = expandAll || depth < DEFAULT_DEPTH || focus.some((p) => isAncestorPath(node.path, p));
      const open = toggled.get(node.path) ?? auto;
      out.push({ node, depth, open });
      if (open) for (const c of node.children) if (!walk(c, depth + 1)) return false;
      return true;
    };
    const complete = walk(root, 0);
    return { rows: out, truncated: !complete };
  }, [root, toggled, expandAll, highlighted, selected]);

  function toggle(path: string, open: boolean) {
    setToggled((m) => new Map(m).set(path, !open));
  }

  return (
    <div className="font-mono text-xs leading-6">
      <ul aria-label="Elements">
        {rows.map(({ node, depth, open }) => {
          const isSelected = selected === node.path;
          const label = [node.tag, node.id && `#${node.id}`, node.name && `name=${node.name}`, node.testAttr, node.text && `"${node.text}"`]
            .filter(Boolean)
            .join(" ");
          return (
            <li key={node.path} className="flex items-center" style={{ paddingLeft: depth * 14 }}>
              {node.children.length > 0 ? (
                <button
                  type="button"
                  aria-label={open ? `Collapse ${node.tag}` : `Expand ${node.tag}`}
                  aria-expanded={open}
                  onClick={() => toggle(node.path, open)}
                  className="flex size-5 shrink-0 items-center justify-center rounded text-neutral-400 hover:text-neutral-700"
                >
                  <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} aria-hidden />
                </button>
              ) : (
                <span className="size-5 shrink-0" />
              )}
              <button
                type="button"
                onClick={() => onSelect(node.path)}
                aria-pressed={isSelected}
                aria-label={label}
                data-path={node.path}
                className={cn(
                  "min-w-0 truncate rounded px-1.5 text-left hover:bg-neutral-100",
                  isSelected && "bg-cyan-100 text-cyan-900 hover:bg-cyan-100",
                  highlighted.has(node.path) && "ring-2 ring-amber-400",
                )}
              >
                <span className={cn("font-semibold", node.interactive ? "text-cyan-700" : "text-neutral-700")}>
                  &lt;{node.tag}&gt;
                </span>
                {node.id && <span className="ml-1.5 text-violet-700">#{node.id}</span>}
                {node.name && <span className="ml-1.5 text-neutral-600">name={node.name}</span>}
                {node.testAttr && <span className="ml-1.5 text-emerald-700">{node.testAttr}</span>}
                {node.text && <span className="ml-1.5 text-neutral-600">“{node.text}”</span>}
              </button>
            </li>
          );
        })}
      </ul>
      {truncated && <p className="mt-2 text-neutral-600">Showing the first {MAX_ROWS} elements — use the filter to narrow down.</p>}
    </div>
  );
}
