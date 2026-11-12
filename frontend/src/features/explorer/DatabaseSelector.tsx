import React from "react";
import { Database } from "lucide-react";

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
      <div style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.4rem",
        backgroundColor: "#1e293b",
        padding: "0.25rem 0.6rem",
        borderRadius: "0.375rem",
        fontSize: "0.8125rem",
        color: "#94a3b8",
        border: "1px solid #334155",
      }}>
        <Database size={14} color="#38bdf8" />
        <span>Cluster Mode (DB 0)</span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
      <Database size={15} color="#94a3b8" />
      <select
        value={currentDb}
        onChange={(e) => onSelectDb(parseInt(e.target.value, 10))}
        className="input-dark"
        style={{
          padding: "0.25rem 0.5rem",
          fontSize: "0.8125rem",
          fontWeight: 600,
          color: "#e2e8f0",
          backgroundColor: "#1e293b",
          borderColor: "#334155",
          cursor: "pointer",
        }}
      >
        {Array.from({ length: 16 }).map((_, i) => (
          <option key={i} value={i}>
            DB {i}
          </option>
        ))}
      </select>
    </div>
  );
};
