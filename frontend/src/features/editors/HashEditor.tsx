import React, { useState } from "react";
import { Plus, Trash2, Edit2, Check, X, Search, Copy, Maximize2 } from "lucide-react";
import { DataService } from "../../../bindings/memspace/backend/services/index.js";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { ValueDetailModal } from "./ValueDetailModal";
import { JsonSyntaxHighlighter } from "./JsonSyntaxHighlighter";
import { ConfirmModal } from "../../components/ui/ConfirmModal";
import { useToast } from "../../components/ui/Toast";
import { getErrorMessage } from "../../lib/utils";

interface HashEditorProps {
  connId: string;
  db: number;
  keyName: string;
  initialEntries: Record<string, string>;
  readOnly?: boolean;
  onRefresh: () => void;
}

const formatIfJson = (str: string): string => {
  try {
    const parsed = JSON.parse(str);
    if (parsed !== null && typeof parsed === "object") {
      return JSON.stringify(parsed, null, 2);
    }
    return str;
  } catch {
    return str;
  }
};

export const HashEditor: React.FC<HashEditorProps> = ({
  connId,
  db,
  keyName,
  initialEntries,
  readOnly = false,
}) => {
  const { success: toastSuccess, error: toastError } = useToast();
  const [entries, setEntries] = useState<Record<string, string>>(initialEntries);
  const [filter, setFilter] = useState("");
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [inspectingField, setInspectingField] = useState<{
    field: string;
    value: string;
  } | null>(null);

  const [newField, setNewField] = useState("");
  const [newValue, setNewValue] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [deleteFieldTarget, setDeleteFieldTarget] = useState<string | null>(null);

  const filteredFields = Object.keys(entries).filter(
    (f) =>
      f.toLowerCase().includes(filter.toLowerCase()) ||
      entries[f].toLowerCase().includes(filter.toLowerCase())
  );

  const handleCopyValue = (field: string, val: string) => {
    navigator.clipboard.writeText(val);
    setCopiedKey(field);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const handleSaveField = async (field: string) => {
    if (readOnly) return;
    try {
      await DataService.HSet(connId, db, keyName, field, editingValue);
      setEntries((prev) => ({ ...prev, [field]: editingValue }));
      setEditingField(null);
      toastSuccess("Field Saved", `Field "${field}" updated.`);
    } catch (err: unknown) {
      toastError("Failed to save field", getErrorMessage(err));
    }
  };

  const handleConfirmDeleteField = async () => {
    if (!deleteFieldTarget || readOnly) return;
    const field = deleteFieldTarget;
    setDeleteFieldTarget(null);
    try {
      await DataService.HDel(connId, db, keyName, [field]);
      setEntries((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
      toastSuccess("Field Deleted", `Field "${field}" was removed.`);
    } catch (err: unknown) {
      toastError("Failed to delete field", getErrorMessage(err));
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
      toastSuccess("Field Added", `Field "${newField.trim()}" created.`);
    } catch (err: unknown) {
      toastError("Failed to add field", getErrorMessage(err));
    }
  };

  const isFieldJson = (val: string) => {
    const trimmed = val.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return false;
    try {
      const parsed = JSON.parse(trimmed);
      return parsed !== null && typeof parsed === "object";
    } catch {
      return false;
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white">
      {/* Filter and Add Bar */}
      <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-zinc-200/80 bg-zinc-50/70 px-3.5">
        <div className="relative w-64">
          <Search size={13} className="absolute top-2.5 left-2.5 text-zinc-400" />
          <Input
            type="text"
            placeholder="Search fields or values..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-8 border-zinc-200 bg-white pl-8 text-xs text-zinc-800 placeholder:text-zinc-400"
          />
          {filter && (
            <button
              onClick={() => setFilter("")}
              className="absolute top-2 right-2 cursor-pointer text-zinc-400 hover:text-zinc-600"
            >
              <X size={12} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-zinc-400">
            {Object.keys(entries).length} {Object.keys(entries).length === 1 ? "field" : "fields"}
          </span>
          {!readOnly && (
            <Button
              onClick={() => setShowAdd(!showAdd)}
              size="sm"
              variant={showAdd ? "secondary" : "default"}
              className="h-8 cursor-pointer gap-1 text-xs font-semibold"
            >
              <Plus size={13} />
              <span>Add Field</span>
            </Button>
          )}
        </div>
      </div>

      {/* Add Field Inline Drawer */}
      {showAdd && (
        <div className="flex items-center gap-2 border-b border-zinc-200 bg-zinc-50 p-3">
          <Input
            type="text"
            placeholder="Field name"
            value={newField}
            onChange={(e) => setNewField(e.target.value)}
            className="h-8 w-48 border-zinc-200 bg-white font-mono text-xs text-zinc-800"
            autoFocus
          />
          <Input
            type="text"
            placeholder="Value (string, number, or JSON)"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddField()}
            className="h-8 flex-1 border-zinc-200 bg-white font-mono text-xs text-zinc-800"
          />
          <Button
            onClick={handleAddField}
            size="sm"
            variant="default"
            className="h-8 cursor-pointer text-xs font-semibold"
          >
            Save
          </Button>
          <Button
            onClick={() => setShowAdd(false)}
            size="sm"
            variant="outline"
            className="h-8 cursor-pointer text-xs"
          >
            Cancel
          </Button>
        </div>
      )}

      {/* Hash Table */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 border-b border-zinc-200 bg-zinc-50 text-left text-zinc-600 select-none">
            <tr>
              <th className="w-48 px-3.5 py-2 font-semibold">Field</th>
              <th className="px-3.5 py-2 font-semibold">Value</th>
              <th className="w-28 px-3.5 py-2 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 select-text">
            {filteredFields.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-8 text-center text-xs text-zinc-500">
                  {Object.keys(entries).length === 0
                    ? "Empty hash (no fields)."
                    : "No fields matching filter."}
                </td>
              </tr>
            ) : (
              filteredFields.map((field) => {
                const isEditing = editingField === field;
                const isCopied = copiedKey === field;
                const rawVal = entries[field];
                const hasJson = isFieldJson(rawVal);

                return (
                  <tr
                    key={field}
                    className={`transition-colors ${
                      isEditing ? "bg-rose-50/60" : "hover:bg-zinc-50/80"
                    }`}
                  >
                    <td className="px-3.5 py-2.5 align-top font-mono font-semibold break-all text-amber-700">
                      {field}
                    </td>
                    <td className="px-3.5 py-2.5 align-top font-mono break-all text-zinc-800">
                      {isEditing ? (
                        <div className="flex items-center gap-1.5">
                          <Input
                            type="text"
                            value={editingValue}
                            onChange={(e) => setEditingValue(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleSaveField(field)}
                            className="h-7 w-full border-rose-500 bg-white font-mono text-xs text-zinc-900"
                            autoFocus
                          />
                          <button
                            onClick={() => handleSaveField(field)}
                            className="cursor-pointer p-1 text-emerald-600 hover:text-emerald-700"
                            title="Save"
                          >
                            <Check size={13} />
                          </button>
                          <button
                            onClick={() => setEditingField(null)}
                            className="cursor-pointer p-1 text-rose-600 hover:text-rose-700"
                            title="Cancel"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      ) : hasJson ? (
                        /* Formatted, Syntax-Colored In-Cell Preview for JSON with Floating Top-Right Action */
                        <div className="group relative w-full max-w-2xl overflow-x-auto py-0.5 font-mono">
                          {/* Floating Top-Right Action Button */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setInspectingField({ field, value: rawVal });
                            }}
                            className="absolute top-0 right-0 z-10 flex cursor-pointer items-center gap-1 rounded-md border border-zinc-200 bg-white/95 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 opacity-0 shadow-2xs backdrop-blur-xs transition-opacity select-none group-hover:opacity-100 hover:bg-white hover:text-indigo-600"
                            title="Expand & Edit JSON"
                          >
                            <span className="text-[9px] font-bold text-indigo-600">JSON</span>
                            <Maximize2 size={10} />
                          </button>

                          <div
                            onClick={() => setInspectingField({ field, value: rawVal })}
                            className="cursor-pointer"
                          >
                            <JsonSyntaxHighlighter
                              value={formatIfJson(rawVal)}
                              isJson={true}
                              showLineNumbers={false}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="py-0.5 leading-relaxed whitespace-pre-wrap">
                          {rawVal}
                        </div>
                      )}
                    </td>
                    <td className="px-3.5 py-2.5 text-right align-top select-none">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleCopyValue(field, rawVal)}
                          className="cursor-pointer rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
                          title="Copy Value"
                        >
                          {isCopied ? (
                            <Check size={12} className="text-emerald-600" />
                          ) : (
                            <Copy size={12} />
                          )}
                        </button>

                        {!readOnly && !isEditing && (
                          <>
                            <button
                              onClick={() => {
                                if (hasJson) {
                                  setInspectingField({ field, value: rawVal });
                                } else {
                                  setEditingField(field);
                                  setEditingValue(rawVal);
                                }
                              }}
                              className="cursor-pointer rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
                              title="Edit Field"
                            >
                              <Edit2 size={12} />
                            </button>
                            <button
                              onClick={() => setDeleteFieldTarget(field)}
                              className="cursor-pointer rounded p-1 text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                              title="Delete Field"
                            >
                              <Trash2 size={12} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Value Inspector / Editor Modal with Direct Save */}
      {inspectingField && (
        <ValueDetailModal
          isOpen={true}
          onClose={() => setInspectingField(null)}
          title={`Hash Field: ${inspectingField.field}`}
          subtitle={`Key: ${keyName}`}
          value={inspectingField.value}
          readOnly={readOnly}
          onSave={async (newVal) => {
            await DataService.HSet(connId, db, keyName, inspectingField.field, newVal);
            setEntries((prev) => ({ ...prev, [inspectingField.field]: newVal }));
            setInspectingField(null);
          }}
        />
      )}

      {/* Delete Field Confirmation Modal */}
      <ConfirmModal
        isOpen={!!deleteFieldTarget}
        title="Delete Hash Field"
        description={`Are you sure you want to delete field "${deleteFieldTarget}"?`}
        confirmText="Delete Field"
        cancelText="Cancel"
        variant="danger"
        onConfirm={handleConfirmDeleteField}
        onCancel={() => setDeleteFieldTarget(null)}
      />
    </div>
  );
};
