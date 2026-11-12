import React, { useState } from "react";
import { Plus, Trash2, Edit2, Check, X, Search } from "lucide-react";
import { DataService } from "../../../bindings/redisian/backend/services/index.js";

interface HashEditorProps {
  connId: string;
  db: number;
  keyName: string;
  initialEntries: Record<string, string>;
  readOnly?: boolean;
  onRefresh: () => void;
}

export const HashEditor: React.FC<HashEditorProps> = ({
  connId,
  db,
  keyName,
  initialEntries,
  readOnly = false,
}) => {
  const [entries, setEntries] = useState<Record<string, string>>(initialEntries);
  const [filter, setFilter] = useState("");
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");

  const [newField, setNewField] = useState("");
  const [newValue, setNewValue] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  const filteredFields = Object.keys(entries).filter(
    (f) => f.toLowerCase().includes(filter.toLowerCase()) || entries[f].toLowerCase().includes(filter.toLowerCase())
  );

  const handleSaveField = async (field: string) => {
    if (readOnly) return;
    try {
      await DataService.HSet(connId, db, keyName, field, editingValue);
      setEntries((prev) => ({ ...prev, [field]: editingValue }));
      setEditingField(null);
    } catch (err: any) {
      alert("Failed to save field: " + (err?.message || err));
    }
  };

  const handleDeleteField = async (field: string) => {
    if (readOnly) return;
    if (confirm(`Delete hash field "${field}"?`)) {
      try {
        await DataService.HDel(connId, db, keyName, [field]);
        setEntries((prev) => {
          const next = { ...prev };
          delete next[field];
          return next;
        });
      } catch (err: any) {
        alert("Failed to delete field: " + (err?.message || err));
      }
    }
  };

  const handleAddField = async () => {
    if (!newField.trim() || readOnly) return;
    try {
      await DataService.HSet(connId, db, keyName, newField.trim(), newValue);
      setEntries((prev) => ({ ...prev, [newField.trim()]: newValue }));
      setNewField("");
      setNewValue("");
      setShowAdd(false);
    } catch (err: any) {
      alert("Failed to add field: " + (err?.message || err));
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: "0.5rem" }}>
      {/* Filter and Add Bar */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0.5rem 0",
        borderBottom: "1px solid #1f2937",
      }}>
        <div style={{ position: "relative", width: "240px" }}>
          <Search size={14} style={{ position: "absolute", left: "8px", top: "8px", color: "#6b7280" }} />
          <input
            type="text"
            placeholder="Filter fields / values..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="input-dark font-mono"
            style={{ width: "100%", paddingLeft: "1.75rem", fontSize: "0.8125rem", padding: "0.3rem 0.5rem 0.3rem 1.75rem" }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontSize: "0.75rem", color: "#6b7280" }}>
            {Object.keys(entries).length} fields total
          </span>

          {!readOnly && (
            <button
              onClick={() => setShowAdd(!showAdd)}
              className="btn-primary"
              style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem" }}
            >
              <Plus size={14} />
              <span>Add Field</span>
            </button>
          )}
        </div>
      </div>

      {/* Add Field Row */}
      {showAdd && !readOnly && (
        <div style={{
          display: "flex",
          gap: "0.5rem",
          padding: "0.75rem",
          backgroundColor: "#111827",
          border: "1px solid #374151",
          borderRadius: "0.375rem",
        }}>
          <input
            type="text"
            placeholder="Field name"
            value={newField}
            onChange={(e) => setNewField(e.target.value)}
            className="input-dark font-mono"
            style={{ width: "200px", fontSize: "0.8125rem" }}
          />
          <input
            type="text"
            placeholder="Value"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            className="input-dark font-mono"
            style={{ flex: 1, fontSize: "0.8125rem" }}
          />
          <button onClick={handleAddField} className="btn-primary" style={{ fontSize: "0.75rem" }}>
            Save
          </button>
          <button onClick={() => setShowAdd(false)} className="btn-secondary" style={{ fontSize: "0.75rem" }}>
            Cancel
          </button>
        </div>
      )}

      {/* Hash Table */}
      <div style={{ flex: 1, overflowY: "auto", border: "1px solid #1f2937", borderRadius: "0.375rem" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
          <thead>
            <tr style={{ backgroundColor: "#111827", borderBottom: "1px solid #1f2937", textAlign: "left", color: "#9ca3af" }}>
              <th style={{ padding: "0.5rem 0.75rem", width: "220px" }}>Field</th>
              <th style={{ padding: "0.5rem 0.75rem" }}>Value</th>
              <th style={{ padding: "0.5rem 0.75rem", width: "80px", textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredFields.map((field) => {
              const isEditing = editingField === field;
              return (
                <tr
                  key={field}
                  style={{
                    borderBottom: "1px solid rgba(255, 255, 255, 0.04)",
                    backgroundColor: isEditing ? "rgba(59, 130, 246, 0.08)" : "transparent",
                  }}
                >
                  <td style={{ padding: "0.5rem 0.75rem", color: "#f59e0b", verticalAlign: "top" }} className="font-mono">
                    {field}
                  </td>
                  <td style={{ padding: "0.5rem 0.75rem", color: "#e2e8f0" }} className="font-mono">
                    {isEditing ? (
                      <input
                        type="text"
                        value={editingValue}
                        onChange={(e) => setEditingValue(e.target.value)}
                        className="input-dark font-mono"
                        style={{ width: "100%", fontSize: "0.8125rem", padding: "0.2rem 0.4rem" }}
                        autoFocus
                      />
                    ) : (
                      <div style={{ wordBreak: "break-all", whiteSpace: "pre-wrap" }}>
                        {entries[field]}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: "0.5rem 0.75rem", textAlign: "right", verticalAlign: "top" }}>
                    {!readOnly && (
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.3rem" }}>
                        {isEditing ? (
                          <>
                            <button
                              onClick={() => handleSaveField(field)}
                              style={{ background: "none", border: "none", color: "#10b981", cursor: "pointer" }}
                              title="Save"
                            >
                              <Check size={14} />
                            </button>
                            <button
                              onClick={() => setEditingField(null)}
                              style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer" }}
                              title="Cancel"
                            >
                              <X size={14} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => {
                                setEditingField(field);
                                setEditingValue(entries[field]);
                              }}
                              style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer" }}
                              title="Edit"
                            >
                              <Edit2 size={13} />
                            </button>
                            <button
                              onClick={() => handleDeleteField(field)}
                              style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer" }}
                              title="Delete Field"
                            >
                              <Trash2 size={13} />
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
