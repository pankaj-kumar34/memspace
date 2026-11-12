import React, { useState } from "react";
import { Save, Code, Check } from "lucide-react";
import { DataService } from "../../../bindings/redisian/backend/services/index.js";

interface StringEditorProps {
  connId: string;
  db: number;
  keyName: string;
  initialValue: string;
  readOnly?: boolean;
  onSaved?: () => void;
}

export const StringEditor: React.FC<StringEditorProps> = ({
  connId,
  db,
  keyName,
  initialValue,
  readOnly = false,
  onSaved,
}) => {
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const isJson = (() => {
    try {
      JSON.parse(value);
      return true;
    } catch {
      return false;
    }
  })();

  const handleFormatJson = () => {
    try {
      const parsed = JSON.parse(value);
      setValue(JSON.stringify(parsed, null, 2));
    } catch (err) {
      alert("Value is not valid JSON");
    }
  };

  const handleSave = async () => {
    if (readOnly) return;
    setSaving(true);
    try {
      await DataService.SetString(connId, db, keyName, value, 0);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2000);
      onSaved?.();
    } catch (err: any) {
      alert("Failed to save string: " + (err?.message || err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: "0.5rem" }}>
      {/* Action Toolbar */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0.5rem 0",
        borderBottom: "1px solid #1f2937",
      }}>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {isJson && (
            <button
              onClick={handleFormatJson}
              className="btn-secondary"
              style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem" }}
              title="Prettify JSON"
            >
              <Code size={13} />
              <span>Format JSON</span>
            </button>
          )}
          <span style={{ fontSize: "0.75rem", color: "#6b7280", alignSelf: "center" }}>
            {value.length} characters ({new Blob([value]).size} bytes)
          </span>
        </div>

        {!readOnly && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary"
            style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem" }}
          >
            {savedSuccess ? <Check size={14} color="#10b981" /> : <Save size={14} />}
            <span>{savedSuccess ? "Saved!" : saving ? "Saving..." : "Save Changes"}</span>
          </button>
        )}
      </div>

      {/* Text Area */}
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
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
        }}
      />
    </div>
  );
};
