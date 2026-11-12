import React, { useState } from "react";
import { Plus, Trash2, Layers } from "lucide-react";
import type { StreamMessage } from "../../../bindings/redisian/backend/services/index.js";
import { DataService } from "../../../bindings/redisian/backend/services/index.js";

interface StreamEditorProps {
  connId: string;
  db: number;
  keyName: string;
  initialEntries: StreamMessage[];
  readOnly?: boolean;
  onRefresh: () => void;
}

export const StreamEditor: React.FC<StreamEditorProps> = ({
  connId,
  db,
  keyName,
  initialEntries,
  readOnly = false,
}) => {
  const [entries, setEntries] = useState<StreamMessage[]>(initialEntries);
  const [newFieldsJson, setNewFieldsJson] = useState('{"sensor": "temp", "val": 24.5}');
  const [showAdd, setShowAdd] = useState(false);

  const handleAddMessage = async () => {
    if (readOnly) return;
    try {
      const parsed = JSON.parse(newFieldsJson);
      const newId = await DataService.XAdd(connId, db, keyName, parsed);
      setEntries((prev) => [{ id: newId, values: parsed }, ...prev]);
      setShowAdd(false);
    } catch (err: any) {
      alert("Failed to append to stream: " + (err?.message || err));
    }
  };

  const handleDelete = async (id: string) => {
    if (readOnly) return;
    if (confirm(`Delete message ${id}?`)) {
      try {
        await DataService.XDel(connId, db, keyName, [id]);
        setEntries((prev) => prev.filter((m) => m.id !== id));
      } catch (err: any) {
        alert("Failed to delete message: " + (err?.message || err));
      }
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: "0.5rem" }}>
      {/* Stream Controls */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0.5rem 0",
        borderBottom: "1px solid #1f2937",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Layers size={15} color="#06b6d4" />
          <span style={{ fontSize: "0.8125rem", color: "#e2e8f0", fontWeight: 600 }}>Stream Timeline</span>
          <span style={{ fontSize: "0.75rem", color: "#6b7280" }}>({entries.length} entries shown)</span>
        </div>

        {!readOnly && (
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="btn-primary"
            style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem" }}
          >
            <Plus size={14} />
            <span>Add Entry</span>
          </button>
        )}
      </div>

      {showAdd && !readOnly && (
        <div style={{
          padding: "0.75rem",
          backgroundColor: "#111827",
          border: "1px solid #374151",
          borderRadius: "0.375rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
        }}>
          <label style={{ fontSize: "0.75rem", color: "#9ca3af" }}>Values as JSON Object:</label>
          <input
            type="text"
            value={newFieldsJson}
            onChange={(e) => setNewFieldsJson(e.target.value)}
            className="input-dark font-mono"
            style={{ width: "100%", fontSize: "0.8125rem" }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
            <button onClick={() => setShowAdd(false)} className="btn-secondary" style={{ fontSize: "0.75rem" }}>
              Cancel
            </button>
            <button onClick={handleAddMessage} className="btn-primary" style={{ fontSize: "0.75rem" }}>
              XADD to Stream
            </button>
          </div>
        </div>
      )}

      {/* Stream Messages */}
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {entries.map((entry) => (
          <div
            key={entry.id}
            style={{
              padding: "0.6rem 0.85rem",
              backgroundColor: "#111827",
              border: "1px solid #1f2937",
              borderRadius: "0.375rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.35rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="font-mono" style={{ fontSize: "0.75rem", color: "#38bdf8", fontWeight: 600 }}>
                ID: {entry.id}
              </span>
              {!readOnly && (
                <button
                  onClick={() => handleDelete(entry.id)}
                  style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer" }}
                  title="Delete message"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>

            <div style={{
              backgroundColor: "#0d131f",
              padding: "0.4rem 0.6rem",
              borderRadius: "0.25rem",
              fontSize: "0.8125rem",
              fontFamily: "monospace",
              color: "#cbd5e1",
            }}>
              {Object.entries(entry.values || {}).map(([k, v]) => (
                <div key={k} style={{ display: "flex", gap: "0.5rem" }}>
                  <span style={{ color: "#f59e0b" }}>{k}:</span>
                  <span style={{ color: "#e2e8f0" }}>{String(v)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
