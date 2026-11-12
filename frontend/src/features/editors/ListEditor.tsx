import React, { useState } from "react";
import { ArrowDown, ArrowUp, Trash2, Edit2, Check, X, Copy, Maximize2 } from "lucide-react";
import { DataService } from "../../../bindings/memspace/backend/services/index.js";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { ValueDetailModal } from "./ValueDetailModal";
import { JsonSyntaxHighlighter } from "./JsonSyntaxHighlighter";
import { ConfirmModal } from "../../components/ui/ConfirmModal";
import { useToast } from "../../components/ui/Toast";
import { getErrorMessage } from "../../lib/utils";

interface ListEditorProps {
  connId: string;
  db: number;
  keyName: string;
  initialItems: string[];
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

export const ListEditor: React.FC<ListEditorProps> = ({
  connId,
  db,
  keyName,
  initialItems,
  readOnly = false,
}) => {
  const { success: toastSuccess, error: toastError } = useToast();
  const [items, setItems] = useState<string[]>(initialItems);
  const [newItem, setNewItem] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [inspectingItem, setInspectingItem] = useState<{
    index: number;
    value: string;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const handleCopy = (idx: number, val: string) => {
    navigator.clipboard.writeText(val);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 1500);
  };

  const handlePushHead = async () => {
    if (!newItem.trim() || readOnly) return;
    try {
      await DataService.LPush(connId, db, keyName, [newItem.trim()]);
      setItems((prev) => [newItem.trim(), ...prev]);
      setNewItem("");
      toastSuccess("Element Pushed", "Added element to list head.");
    } catch (err: unknown) {
      toastError("Failed to push element", getErrorMessage(err));
    }
  };

  const handlePushTail = async () => {
    if (!newItem.trim() || readOnly) return;
    try {
      await DataService.RPush(connId, db, keyName, [newItem.trim()]);
      setItems((prev) => [...prev, newItem.trim()]);
      setNewItem("");
      toastSuccess("Element Pushed", "Added element to list tail.");
    } catch (err: unknown) {
      toastError("Failed to push element", getErrorMessage(err));
    }
  };

  const handlePopHead = async () => {
    if (readOnly) return;
    try {
      await DataService.LPop(connId, db, keyName);
      setItems((prev) => prev.slice(1));
      toastSuccess("Element Popped", "Popped element from list head.");
    } catch (err: unknown) {
      toastError("Failed to pop head", getErrorMessage(err));
    }
  };

  const handlePopTail = async () => {
    if (readOnly) return;
    try {
      await DataService.RPop(connId, db, keyName);
      setItems((prev) => prev.slice(0, -1));
      toastSuccess("Element Popped", "Popped element from list tail.");
    } catch (err: unknown) {
      toastError("Failed to pop tail", getErrorMessage(err));
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
      toastSuccess("Element Saved", `Element [${index}] updated.`);
    } catch (err: unknown) {
      toastError("Failed to update item", getErrorMessage(err));
    }
  };

  const handleConfirmDeleteItem = async () => {
    if (!deleteTarget || readOnly) return;
    const value = deleteTarget;
    setDeleteTarget(null);
    try {
      await DataService.LRem(connId, db, keyName, 1, value);
      setItems((prev) => {
        const idx = prev.indexOf(value);
        if (idx !== -1) {
          const next = [...prev];
          next.splice(idx, 1);
          return next;
        }
        return prev;
      });
      toastSuccess("Element Removed", "Removed element from list.");
    } catch (err: unknown) {
      toastError("Failed to delete item", getErrorMessage(err));
    }
  };

  const isItemJson = (val: string) => {
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
      {/* List Action Bar */}
      <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-zinc-200/80 bg-zinc-50/70 px-3.5">
        <div className="flex max-w-md flex-1 items-center gap-2">
          <Input
            type="text"
            placeholder="Add new item to list..."
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handlePushTail();
            }}
            className="h-8 border-zinc-200 bg-white font-mono text-xs text-zinc-800 placeholder:font-sans placeholder:text-zinc-400"
          />
          {!readOnly && (
            <div className="flex shrink-0 items-center gap-1">
              <Button
                onClick={handlePushHead}
                variant="outline"
                size="sm"
                className="h-8 cursor-pointer gap-1 bg-white text-xs"
                title="LPUSH (Push to start of list)"
              >
                <ArrowUp size={12} />
                <span>Head</span>
              </Button>
              <Button
                onClick={handlePushTail}
                variant="default"
                size="sm"
                className="h-8 cursor-pointer gap-1 text-xs font-semibold"
                title="RPUSH (Push to end of list)"
              >
                <ArrowDown size={12} />
                <span>Tail</span>
              </Button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!readOnly && items.length > 0 && (
            <div className="flex items-center gap-1">
              <Button
                onClick={handlePopHead}
                variant="outline"
                size="sm"
                className="h-7 cursor-pointer border-rose-200 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                title="LPOP: Remove first element"
              >
                Pop Head
              </Button>
              <Button
                onClick={handlePopTail}
                variant="outline"
                size="sm"
                className="h-7 cursor-pointer border-rose-200 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                title="RPOP: Remove last element"
              >
                Pop Tail
              </Button>
            </div>
          )}
          <span className="font-mono text-[11px] text-zinc-400">
            {items.length} {items.length === 1 ? "item" : "items"}
          </span>
        </div>
      </div>

      {/* List Table */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 border-b border-zinc-200 bg-zinc-50 text-left text-zinc-600 select-none">
            <tr>
              <th className="w-20 px-3.5 py-2 font-semibold">Index</th>
              <th className="px-3.5 py-2 font-semibold">Value</th>
              <th className="w-28 px-3.5 py-2 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 select-text">
            {items.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-8 text-center text-xs text-zinc-500">
                  Empty list (no items).
                </td>
              </tr>
            ) : (
              items.map((item, index) => {
                const isEditing = editingIndex === index;
                const isCopied = copiedIndex === index;
                const hasJson = isItemJson(item);

                return (
                  <tr
                    key={index}
                    className={`transition-colors ${
                      isEditing ? "bg-rose-50/60" : "hover:bg-zinc-50/80"
                    }`}
                  >
                    <td className="px-3.5 py-2.5 align-top font-mono font-semibold text-emerald-700 select-none">
                      [{index}]
                    </td>
                    <td className="px-3.5 py-2.5 align-top font-mono break-all text-zinc-800">
                      {isEditing ? (
                        <div className="flex items-center gap-1.5">
                          <Input
                            type="text"
                            value={editingValue}
                            onChange={(e) => setEditingValue(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleSaveItem(index)}
                            className="h-7 w-full border-rose-500 bg-white font-mono text-xs text-zinc-900"
                            autoFocus
                          />
                          <button
                            onClick={() => handleSaveItem(index)}
                            className="cursor-pointer p-1 text-emerald-600 hover:text-emerald-700"
                            title="Save"
                          >
                            <Check size={13} />
                          </button>
                          <button
                            onClick={() => setEditingIndex(null)}
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
                              setInspectingItem({ index, value: item });
                            }}
                            className="absolute top-0 right-0 z-10 flex cursor-pointer items-center gap-1 rounded-md border border-zinc-200 bg-white/95 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 opacity-0 shadow-2xs backdrop-blur-xs transition-opacity select-none group-hover:opacity-100 hover:bg-white hover:text-indigo-600"
                            title="Expand & Edit JSON"
                          >
                            <span className="text-[9px] font-bold text-indigo-600">JSON</span>
                            <Maximize2 size={10} />
                          </button>

                          <div
                            onClick={() => setInspectingItem({ index, value: item })}
                            className="cursor-pointer"
                          >
                            <JsonSyntaxHighlighter
                              value={formatIfJson(item)}
                              isJson={true}
                              showLineNumbers={false}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="py-0.5 leading-relaxed whitespace-pre-wrap">{item}</div>
                      )}
                    </td>
                    <td className="px-3.5 py-2.5 text-right align-top select-none">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleCopy(index, item)}
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
                                  setInspectingItem({ index, value: item });
                                } else {
                                  setEditingIndex(index);
                                  setEditingValue(item);
                                }
                              }}
                              className="cursor-pointer rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
                              title="Edit Item"
                            >
                              <Edit2 size={12} />
                            </button>
                            <button
                              onClick={() => setDeleteTarget(item)}
                              className="cursor-pointer rounded p-1 text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                              title="Remove Item"
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
      {inspectingItem && (
        <ValueDetailModal
          isOpen={true}
          onClose={() => setInspectingItem(null)}
          title={`List Item [${inspectingItem.index}]`}
          subtitle={`Key: ${keyName}`}
          value={inspectingItem.value}
          readOnly={readOnly}
          onSave={async (newVal) => {
            await DataService.LSet(connId, db, keyName, inspectingItem.index, newVal);
            setItems((prev) => {
              const next = [...prev];
              next[inspectingItem.index] = newVal;
              return next;
            });
            setInspectingItem(null);
          }}
        />
      )}

      {/* Delete Item Confirmation Modal */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Remove List Element"
        description={`Are you sure you want to remove element "${deleteTarget}" from list?`}
        confirmText="Remove Element"
        cancelText="Cancel"
        variant="danger"
        onConfirm={handleConfirmDeleteItem}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
