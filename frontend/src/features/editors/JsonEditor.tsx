import React, { useState } from "react";
import { Save, Search, Check } from "lucide-react";
import { DataService } from "../../../bindings/redisian/backend/services/index.js";

interface JsonEditorProps {
  connId: string;
  db: number;
  keyName: string;
  initialJson: string;
  readOnly?: boolean;
  onRefresh: () => void;
}

export const JsonEditor: React.FC<JsonEditorProps> = ({
  connId,
  db,
  keyName,
  initialJson,
  readOnly = false,
  onRefresh,
}) => {
  const [jsonStr, setJsonStr] = useState(() => {
    try {
      const parsed = typeof initialJson === "string" ? JSON.parse(initialJson) : initialJson;
      return JSON.stringify(parsed, null, 2);
    } catch {
      return String(initialJson);
    }
  });

  const [path, setPath] = useState("$");
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleQueryPath = async () => {
    try {
      const res = await DataService.JSONGet(connId, db, keyName, path);
      try {
        const parsed = JSON.parse(res);
        setJsonStr(JSON.stringify(parsed, null, 2));
      } catch {
        setJsonStr(res);
      }
    } catch (err: any) {
      alert("JSONPath query failed: " + (err?.message || err));
    }
  };

  const handleSave = async () => {
    if (readOnly) return;
    setSaving(true);
    try {
      await DataService.JSONSet(connId, db, keyName, path, jsonStr);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2000);
      onRefresh();
    } catch (err: any) {
      alert("Failed to save JSON: " + (err?.message || err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: "0.5rem" }}>
      {/* JSONPath bar */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0.5rem 0",
        borderBottom: "1px solid #1f2937",
        gap: "0.5rem",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flex: 1 }}>
          <span style={{ fontSize: "0.75rem", color: "#9ca3af", fontWeight: 600 }}>JSONPath:</span>
          <input
            type="text"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            className="input-dark font-mono"
            style={{ width: "160px", fontSize: "0.8125rem", padding: "0.25rem 0.5rem" }}
            placeholder="$"
          />
          <button onClick={handleQueryPath} className="btn-secondary" style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem" }}>
            <Search size={13} />
            <span>Evaluate</span>
          </button>
        </div>

        {!readOnly && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary"
            style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem" }}
          >
            {savedSuccess ? <Check size={14} color="#10b981" /> : <Save size={14} />}
            <span>{savedSuccess ? "Saved!" : saving ? "Saving..." : "Save JSON"}</span>
          </button>
        )}
      </div>

      {/* Editor */}
      <textarea
        value={jsonStr}
        onChange={(e) => setJsonStr(e.target.value)}
        readOnly={readOnly}
        className="input-dark font-mono"
        style={{
          flex: 1,
          width: "100%",
          resize: "none",
          fontSize: "0.85rem",
          lineHeight: "1.5",
          padding: "0.75rem",
          backgroundColor: "#0d131f",
          border: "1px solid #1f2937",
          color: "#fed7aa",
        }}
      />
    </div>
  );
};
