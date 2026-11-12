import React, { useState, useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Search,
  Filter,
  RefreshCw,
  Plus,
  Clock,
  Key as KeyIcon
} from "lucide-react";
import type { KeyInfo, ScanResult } from "../../../bindings/redisian/backend/models/index.js";
import { KeyService } from "../../../bindings/redisian/backend/services/index.js";
import { DatabaseSelector } from "./DatabaseSelector";

interface KeyExplorerProps {
  connId: string;
  clusterMode?: boolean;
  readOnly?: boolean;
  selectedKey: string | null;
  onSelectKey: (key: string, db: number) => void;
  onKeyDeleted?: () => void;
}

export const KeyExplorer: React.FC<KeyExplorerProps> = ({
  connId,
  clusterMode = false,
  readOnly = false,
  selectedKey,
  onSelectKey,
}) => {
  const [currentDb, setCurrentDb] = useState(0);
  const [keys, setKeys] = useState<KeyInfo[]>([]);
  const [cursor, setCursor] = useState(0);
  const [pattern, setPattern] = useState("*");
  const [typeFilter, setTypeFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [totalKeys, setTotalKeys] = useState(0);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyType, setNewKeyType] = useState("string");

  const parentRef = useRef<HTMLDivElement>(null);

  const fetchKeys = async (scanCursor = 0, resetList = true) => {
    if (!connId) return;
    setLoading(true);
    try {
      const res = await KeyService.ScanKeys(
        connId,
        currentDb,
        scanCursor,
        pattern || "*",
        typeFilter === "all" ? "" : typeFilter,
        500
      );
      if (res) {
        setCursor(res.cursor || 0);
        setTotalKeys(res.total || 0);
        if (resetList) {
          setKeys(res.keys || []);
        } else {
          setKeys((prev) => [...prev, ...(res.keys || [])]);
        }
      }
    } catch (err: any) {
      console.error("Failed to scan keys:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKeys(0, true);
  }, [connId, currentDb, typeFilter]);

  const rowVirtualizer = useVirtualizer({
    count: keys.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 20,
  });

  const getTypeBadgeClass = (type: string) => {
    switch (type.toLowerCase()) {
      case "string":
        return "badge-string";
      case "hash":
        return "badge-hash";
      case "list":
        return "badge-list";
      case "set":
        return "badge-set";
      case "zset":
        return "badge-zset";
      case "stream":
        return "badge-stream";
      case "rejson-rl":
      case "json":
        return "badge-json";
      default:
        return "badge-string";
    }
  };

  const handleCreateKey = () => {
    if (!newKeyName.trim()) return;
    onSelectKey(newKeyName.trim(), currentDb);
    setShowAddModal(false);
    setNewKeyName("");
  };

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      backgroundColor: "#0d131f",
      borderRight: "1px solid #1f2937",
      width: "360px",
      minWidth: "300px",
    }}>
      {/* Top Bar with DB Selector & Scan Status */}
      <div style={{
        padding: "0.6rem 0.85rem",
        borderBottom: "1px solid #1f2937",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: "#111827",
      }}>
        <DatabaseSelector
          currentDb={currentDb}
          onSelectDb={setCurrentDb}
          clusterMode={clusterMode}
        />

        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          {!readOnly && (
            <button
              onClick={() => setShowAddModal(true)}
              className="btn-primary"
              style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
              title="Add New Key"
            >
              <Plus size={14} />
              <span>Add</span>
            </button>
          )}

          <button
            onClick={() => fetchKeys(0, true)}
            className="btn-secondary"
            style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
            title="Refresh Key Scan"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Search & Type Filter Bar */}
      <div style={{
        padding: "0.6rem 0.85rem",
        borderBottom: "1px solid #1f2937",
        display: "flex",
        flexDirection: "column",
        gap: "0.4rem",
      }}>
        <div style={{ display: "flex", gap: "0.4rem" }}>
          <div style={{ position: "relative", flex: 1 }}>
            <Search size={14} style={{ position: "absolute", left: "8px", top: "8px", color: "#6b7280" }} />
            <input
              type="text"
              placeholder="user:* or key pattern"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetchKeys(0, true)}
              className="input-dark font-mono"
              style={{ width: "100%", paddingLeft: "1.75rem", fontSize: "0.8125rem", padding: "0.3rem 0.5rem 0.3rem 1.75rem" }}
            />
          </div>
          <button
            onClick={() => fetchKeys(0, true)}
            className="btn-secondary"
            style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
          >
            Scan
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
            <Filter size={12} color="#9ca3af" />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="input-dark"
              style={{ padding: "0.2rem 0.4rem", fontSize: "0.75rem", textTransform: "uppercase" }}
            >
              <option value="all">ALL TYPES</option>
              <option value="string">STRING</option>
              <option value="hash">HASH</option>
              <option value="list">LIST</option>
              <option value="set">SET</option>
              <option value="zset">ZSET</option>
              <option value="stream">STREAM</option>
              <option value="json">JSON</option>
            </select>
          </div>

          <span style={{ fontSize: "0.75rem", color: "#6b7280" }}>
            {keys.length} loaded {totalKeys > 0 ? `/ ~${totalKeys}` : ""}
          </span>
        </div>
      </div>

      {/* Virtualized Key List */}
      <div
        ref={parentRef}
        style={{
          flex: 1,
          overflowY: "auto",
          position: "relative",
        }}
      >
        {keys.length === 0 ? (
          <div style={{ textAlign: "center", padding: "3rem 1rem", color: "#6b7280", fontSize: "0.875rem" }}>
            {loading ? (
              <p>Scanning keys...</p>
            ) : (
              <>
                <KeyIcon size={28} style={{ margin: "0 auto 0.5rem auto", opacity: 0.3 }} />
                <p>No keys matching pattern.</p>
              </>
            )}
          </div>
        ) : (
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const item = keys[virtualRow.index];
              const isSelected = selectedKey === item.key;
              return (
                <div
                  key={virtualRow.index}
                  onClick={() => onSelectKey(item.key, currentDb)}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0 0.75rem",
                    backgroundColor: isSelected ? "rgba(59, 130, 246, 0.2)" : "transparent",
                    borderLeft: isSelected ? "3px solid #3b82f6" : "3px solid transparent",
                    cursor: "pointer",
                    fontSize: "0.8125rem",
                    borderBottom: "1px solid rgba(255, 255, 255, 0.03)",
                  }}
                >
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    overflow: "hidden",
                    flex: 1,
                  }}>
                    <span
                      className={`badge ${getTypeBadgeClass(item.type)}`}
                      style={{
                        fontSize: "0.65rem",
                        padding: "0.1rem 0.35rem",
                        borderRadius: "3px",
                        fontWeight: 600,
                        textTransform: "uppercase",
                      }}
                    >
                      {item.type}
                    </span>
                    <span
                      className="font-mono"
                      style={{
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        color: isSelected ? "#93c5fd" : "#e2e8f0",
                      }}
                      title={item.key}
                    >
                      {item.key}
                    </span>
                  </div>

                  {item.ttl >= 0 && (
                    <span style={{
                      fontSize: "0.7rem",
                      color: item.ttl < 300 ? "#f87171" : "#9ca3af",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.15rem",
                    }}>
                      <Clock size={10} />
                      {item.ttl}s
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Scan Next Batch */}
      {cursor > 0 && (
        <div style={{ padding: "0.5rem 0.85rem", borderTop: "1px solid #1f2937", textAlign: "center" }}>
          <button
            onClick={() => fetchKeys(cursor, false)}
            disabled={loading}
            className="btn-secondary"
            style={{ width: "100%", fontSize: "0.75rem", padding: "0.3rem" }}
          >
            {loading ? "Loading..." : "Scan Next Batch"}
          </button>
        </div>
      )}

      {/* Add Key Modal */}
      {showAddModal && (
        <div style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(0,0,0,0.7)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 60,
        }}>
          <div style={{
            backgroundColor: "#111827",
            border: "1px solid #374151",
            borderRadius: "0.5rem",
            padding: "1.25rem",
            width: "360px",
          }}>
            <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "#f3f4f6", marginBottom: "0.75rem" }}>
              Create New Key
            </h3>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div>
                <label style={{ fontSize: "0.75rem", color: "#9ca3af", display: "block", marginBottom: "0.25rem" }}>Key Name</label>
                <input
                  type="text"
                  placeholder="e.g. user:1001"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  className="input-dark font-mono"
                  style={{ width: "100%", fontSize: "0.8125rem" }}
                />
              </div>

              <div>
                <label style={{ fontSize: "0.75rem", color: "#9ca3af", display: "block", marginBottom: "0.25rem" }}>Type</label>
                <select
                  value={newKeyType}
                  onChange={(e) => setNewKeyType(e.target.value)}
                  className="input-dark"
                  style={{ width: "100%", fontSize: "0.8125rem" }}
                >
                  <option value="string">String</option>
                  <option value="hash">Hash</option>
                  <option value="list">List</option>
                  <option value="set">Set</option>
                  <option value="zset">Sorted Set (ZSet)</option>
                  <option value="stream">Stream</option>
                  <option value="json">JSON</option>
                </select>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.5rem" }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowAddModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleCreateKey}
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
