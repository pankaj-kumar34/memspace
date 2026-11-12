import React from "react";
import { Database, ChevronDown } from "lucide-react";

interface DatabaseSelectorProps {
  currentDb: number;
  onSelectDb: (db: number) => void;
  clusterMode?: boolean;
}

export const DatabaseSelector: React.FC<DatabaseSelectorProps> = ({
  currentDb,
  onSelectDb,
  clusterMode = false,
}) => {
  if (clusterMode) {
    return (
      <div className="flex h-8 w-full items-center justify-between rounded-lg border border-rose-200 bg-rose-50 px-2.5 text-xs font-semibold text-rose-700 shadow-2xs select-none">
        <div className="flex items-center gap-1.5 truncate">
          <Database size={13} className="shrink-0 text-rose-600" />
          <span className="truncate">Cluster (DB 0)</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex w-full items-center">
      <div className="pointer-events-none flex h-8 w-full cursor-pointer items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 text-xs font-semibold text-zinc-800 shadow-2xs transition-colors hover:bg-zinc-100/90">
        <div className="flex min-w-0 items-center gap-1.5 truncate">
          <Database size={13} className="shrink-0 text-rose-600" />
          <span className="truncate">
            Database {currentDb}
          </span>
        </div>
        <ChevronDown size={13} className="ml-1 shrink-0 text-zinc-400" />
      </div>
      <select
        value={currentDb}
        onChange={(e) => onSelectDb(parseInt(e.target.value, 10))}
        className="absolute inset-0 size-full cursor-pointer opacity-0"
        title="Select Database"
      >
        {Array.from({ length: 16 }).map((_, i) => (
          <option key={i} value={i} className="bg-white text-zinc-900">
            Database {i}
          </option>
        ))}
      </select>
    </div>
  );
};
