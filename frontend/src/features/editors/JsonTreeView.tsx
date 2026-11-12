import React, { useState, useMemo } from "react";
import {
  ChevronRight,
  ChevronDown,
  Copy,
  Check,
  Search,
  ChevronsDownUp,
  ChevronsUpDown,
} from "lucide-react";

interface JsonTreeViewProps {
  data: unknown;
  initialExpandedDepth?: number;
}

interface TreeNodeProps {
  keyName?: string;
  value: unknown;
  path: string;
  depth: number;
  isLast?: boolean;
  searchTerm: string;
  expandedMap: Record<string, boolean>;
  onToggle: (path: string) => void;
  onCopyPath: (path: string) => void;
  onCopyValue: (value: unknown) => void;
  copiedPath: string | null;
}

const JsonTreeNode: React.FC<TreeNodeProps> = ({
  keyName,
  value,
  path,
  depth,
  searchTerm,
  expandedMap,
  onToggle,
  onCopyPath,
  onCopyValue,
  copiedPath,
}) => {
  const isObject = value !== null && typeof value === "object";
  const isArray = Array.isArray(value);
  const isExpanded = expandedMap[path] ?? depth < 2;

  const matchesSearch = useMemo(() => {
    if (!searchTerm) return false;
    const term = searchTerm.toLowerCase();
    if (keyName && keyName.toLowerCase().includes(term)) return true;
    if (!isObject && String(value).toLowerCase().includes(term)) return true;
    return false;
  }, [searchTerm, keyName, value, isObject]);

  const renderValue = () => {
    if (value === null) {
      return <span className="font-mono font-semibold text-rose-500 italic">null</span>;
    }
    if (value === undefined) {
      return <span className="font-mono text-zinc-400 italic">undefined</span>;
    }
    if (typeof value === "boolean") {
      return (
        <span className="font-mono font-semibold text-purple-600">
          {value ? "true" : "false"}
        </span>
      );
    }
    if (typeof value === "number") {
      return <span className="font-mono font-medium text-amber-600">{value}</span>;
    }
    if (typeof value === "string") {
      return (
        <span className="font-mono break-all text-emerald-600">
          "{value}"
        </span>
      );
    }
    return null;
  };

  const isCopied = copiedPath === path;

  if (isObject) {
    const keys = Object.keys(value);
    const count = keys.length;
    const badgeText = isArray ? `${count} items` : `${count} keys`;

    return (
      <div className="flex flex-col font-mono text-xs select-text">
        <div
          className={`group flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-1 transition-colors hover:bg-zinc-100/80 ${
            matchesSearch ? "bg-amber-100/70" : ""
          }`}
          onClick={() => onToggle(path)}
          style={{ paddingLeft: `${depth * 16 + 4}px` }}
        >
          <button
            type="button"
            className="cursor-pointer rounded p-0.5 text-zinc-400 hover:text-zinc-700"
            onClick={(e) => {
              e.stopPropagation();
              onToggle(path);
            }}
          >
            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>

          {keyName !== undefined && (
            <span className="font-semibold text-indigo-600">
              {keyName}
              <span className="font-normal text-zinc-400">:</span>
            </span>
          )}

          <span className="font-sans text-[11px] text-zinc-400">
            {isArray ? `Array[${count}]` : `{${badgeText}}`}
          </span>

          {/* Quick copy path on hover */}
          <div className="ml-auto flex shrink-0 items-center gap-1 opacity-0 transition-opacity select-none group-hover:opacity-100">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCopyPath(path);
              }}
              className="flex cursor-pointer items-center gap-1 rounded bg-zinc-200/60 px-1.5 py-0.5 font-sans text-[10px] text-zinc-600 hover:bg-zinc-200"
              title="Copy JSON Path"
            >
              {isCopied ? <Check size={10} className="text-emerald-600" /> : <Copy size={10} />}
              <span>{isCopied ? "Copied" : "Path"}</span>
            </button>
          </div>
        </div>

        {isExpanded && (
          <div className="ml-2.5 border-l border-zinc-200/70">
            {keys.map((k) => (
              <JsonTreeNode
                key={k}
                keyName={isArray ? undefined : k}
                value={value[k]}
                path={path ? `${path}.${k}` : k}
                depth={depth + 1}
                searchTerm={searchTerm}
                expandedMap={expandedMap}
                onToggle={onToggle}
                onCopyPath={onCopyPath}
                onCopyValue={onCopyValue}
                copiedPath={copiedPath}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`group flex items-center gap-1.5 rounded px-1.5 py-1 font-mono text-xs select-text hover:bg-zinc-100/80 ${
        matchesSearch ? "bg-amber-100/70" : ""
      }`}
      style={{ paddingLeft: `${depth * 16 + 18}px` }}
    >
      {keyName !== undefined && (
        <span className="shrink-0 font-semibold text-indigo-600">
          {keyName}
          <span className="font-normal text-zinc-400">:</span>
        </span>
      )}

      <div className="min-w-0 flex-1">{renderValue()}</div>

      {/* Copy value on hover */}
      <div className="ml-2 flex shrink-0 items-center gap-1 opacity-0 transition-opacity select-none group-hover:opacity-100">
        <button
          type="button"
          onClick={() => onCopyValue(value)}
          className="flex cursor-pointer items-center gap-1 rounded bg-zinc-200/60 px-1.5 py-0.5 font-sans text-[10px] text-zinc-600 hover:bg-zinc-200"
          title="Copy Value"
        >
          <Copy size={10} />
          <span>Copy</span>
        </button>
      </div>
    </div>
  );
};

export const JsonTreeView: React.FC<JsonTreeViewProps> = ({ data }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  const handleToggle = (path: string) => {
    setExpandedMap((prev) => ({
      ...prev,
      [path]: prev[path] === undefined ? false : !prev[path],
    }));
  };

  const handleExpandAll = () => {
    const next: Record<string, boolean> = {};
    const recurse = (val: unknown, p: string) => {
      if (val !== null && typeof val === "object") {
        next[p] = true;
        Object.entries(val as Record<string, unknown>).forEach(([k, v]) =>
          recurse(v, p ? `${p}.${k}` : k)
        );
      }
    };
    recurse(data, "$");
    setExpandedMap(next);
  };

  const handleCollapseAll = () => {
    const next: Record<string, boolean> = {};
    const recurse = (val: unknown, p: string) => {
      if (val !== null && typeof val === "object") {
        next[p] = false;
        Object.entries(val as Record<string, unknown>).forEach(([k, v]) =>
          recurse(v, p ? `${p}.${k}` : k)
        );
      }
    };
    recurse(data, "$");
    setExpandedMap(next);
  };

  const handleCopyPath = (path: string) => {
    navigator.clipboard.writeText(path);
    setCopiedPath(path);
    setTimeout(() => setCopiedPath(null), 1500);
  };

  const handleCopyValue = (val: unknown) => {
    const text = typeof val === "string" ? val : JSON.stringify(val, null, 2);
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="flex h-full flex-col bg-white select-none">
      {/* Search & Actions Bar */}
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50/50 px-3">
        <div className="relative max-w-xs flex-1">
          <Search size={12} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder="Filter keys or values..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-6 w-full rounded-md border border-zinc-200 bg-white pr-2 pl-7 text-xs text-zinc-800 outline-none placeholder:text-zinc-400 focus:border-rose-500"
          />
        </div>

        <div className="flex items-center gap-1 text-xs">
          <button
            type="button"
            onClick={handleExpandAll}
            className="flex cursor-pointer items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium text-zinc-600 hover:bg-zinc-200/60 hover:text-zinc-900"
            title="Expand All"
          >
            <ChevronsUpDown size={12} />
            <span>Expand All</span>
          </button>
          <button
            type="button"
            onClick={handleCollapseAll}
            className="flex cursor-pointer items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium text-zinc-600 hover:bg-zinc-200/60 hover:text-zinc-900"
            title="Collapse All"
          >
            <ChevronsDownUp size={12} />
            <span>Collapse All</span>
          </button>
        </div>
      </div>

      {/* Tree Content */}
      <div className="flex-1 overflow-auto p-3">
        <JsonTreeNode
          keyName="$"
          value={data}
          path="$"
          depth={0}
          searchTerm={searchTerm}
          expandedMap={expandedMap}
          onToggle={handleToggle}
          onCopyPath={handleCopyPath}
          onCopyValue={handleCopyValue}
          copiedPath={copiedPath}
        />
      </div>
    </div>
  );
};
