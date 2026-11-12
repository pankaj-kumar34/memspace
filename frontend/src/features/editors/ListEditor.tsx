import React, { useState } from "react";
import { ArrowDown, ArrowUp, Trash2, Edit2, Check, X } from "lucide-react";
import { DataService } from "../../../bindings/redisian/backend/services/index.js";

interface ListEditorProps {
  connId: string;
  db: number;
  keyName: string;
  initialItems: string[];
  readOnly?: boolean;
  onRefresh: () => void;
}

export const ListEditor: React.FC<ListEditorProps> = ({
  connId,
  db,
  keyName,
  initialItems,
  readOnly = false,
}) => {
  const [items, setItems] = useState<string[]>(initialItems);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [newItem, setNewItem] = useState("");

  const handlePushHead = async () => {
    if (!newItem.trim() || readOnly) return;
    try {
      await DataService.LPush(connId, db, keyName, [newItem.trim()]);
      setItems((prev) => [newItem.trim(), ...prev]);
      setNewItem("");
    } catch (err: any) {
      alert("Push failed: " + (err?.message || err));
    }
  };

  const handlePushTail = async () => {
    if (!newItem.trim() || readOnly) return;
    try {
      await DataService.RPush(connId, db, keyName, [newItem.trim()]);
      setItems((prev) => [...prev, newItem.trim()]);
      setNewItem("");
    } catch (err: any) {
      alert("Push failed: " + (err?.message || err));
    }
  };

  const handlePopHead = async () => {
    if (readOnly) return;
    try {
      await DataService.LPop(connId, db, keyName);
      setItems((prev) => prev.slice(1));
    } catch (err: any) {
      alert("Pop failed: " + (err?.message || err));
    }
  };

  const handlePopTail = async () => {
    if (readOnly) return;
    try {
      await DataService.RPop(connId, db, keyName);
      setItems((prev) => prev.slice(0, -1));
    } catch (err: any) {
      alert("Pop failed: " + (err?.message || err));
    }
  };

  const handleSaveItem = async (index: number) => {
    if (readOnly) return;
    try {
      await DataService.LSet(connId, db, keyName, index, editingValue);
      setItems((prev) => {
        const next = [...prev];
        next[index] = editingValue;
        return next;
      });
      setEditingIndex(null);
    } catch (err: any) {
      alert("Save failed: " + (err?.message || err));
    }
  };

  const handleDeleteItem = async (val: string) => {
    if (readOnly) return;
    try {
      await DataService.LRem(connId, db, keyName, 1, val);
      setItems((prev) => {
        const idx = prev.indexOf(val);
        if (idx !== -1) {
          const next = [...prev];
          next.splice(idx, 1);
          return next;
        }
        return prev;
      });
    } catch (err: any) {
      alert("Delete failed: " + (err?.message || err));
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: "0.5rem" }}>
      {/* List Operations Bar */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0.5rem 0",
        borderBottom: "1px solid #1f2937",
        gap: "0.5rem",
      }}>
        {!readOnly && (
          <div style={{ display: "flex", gap: "0.5rem", flex: 1 }}>
            <input
              type="text"
              placeholder="New element value..."
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              className="input-dark font-mono"
              style={{ flex: 1, fontSize: "0.8125rem", padding: "0.25rem 0.5rem" }}
            />
            <button onClick={handlePushHead} className="btn-secondary" style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem" }}>
              <ArrowUp size={13} />
              <span>Push Head</span>
            </button>
            <button onClick={handlePushTail} className="btn-primary" style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem" }}>
              <ArrowDown size={13} />
              <span>Push Tail</span>
            </button>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {!readOnly && (
            <>
              <button onClick={handlePopHead} className="btn-secondary" style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem" }}>
                Pop Head
              </button>
              <button onClick={handlePopTail} className="btn-secondary" style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem" }}>
                Pop Tail
              </button>
            </>
          )}
          <span style={{ fontSize: "0.75rem", color: "#6b7280" }}>
            {items.length} items
          </span>
        </div>
      </div>

      {/* List Table */}
      <div style={{ flex: 1, overflowY: "auto", border: "1px solid #1f2937", borderRadius: "0.375rem" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
          <thead>
            <tr style={{ backgroundColor: "#111827", borderBottom: "1px solid #1f2937", textAlign: "left", color: "#9ca3af" }}>
              <th style={{ padding: "0.5rem 0.75rem", width: "70px" }}>Index</th>
              <th style={{ padding: "0.5rem 0.75rem" }}>Value</th>
              <th style={{ padding: "0.5rem 0.75rem", width: "80px", textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => {
              const isEditing = editingIndex === index;
              return (
                <tr
                  key={index}
                  style={{
                    borderBottom: "1px solid rgba(255, 255, 255, 0.04)",
                    backgroundColor: isEditing ? "rgba(59, 130, 246, 0.08)" : "transparent",
                  }}
                >
                  <td style={{ padding: "0.5rem 0.75rem", color: "#60a5fa" }} className="font-mono">
                    [{index}]
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
                      <div style={{ wordBreak: "break-all" }}>{item}</div>
                    )}
                  </td>
                  <td style={{ padding: "0.5rem 0.75rem", textAlign: "right" }}>
                    {!readOnly && (
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.3rem" }}>
                        {isEditing ? (
                          <>
                            <button
                              onClick={() => handleSaveItem(index)}
                              style={{ background: "none", border: "none", color: "#10b981", cursor: "pointer" }}
                            >
                              <Check size={14} />
                            </button>
                            <button
                              onClick={() => setEditingIndex(null)}
                              style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer" }}
                            >
                              <X size={14} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => {
                                setEditingIndex(index);
                                setEditingValue(item);
                              }}
                              style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer" }}
                            >
                              <Edit2 size={13} />
                            </button>
                            <button
                              onClick={() => handleDeleteItem(item)}
                              style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer" }}
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
