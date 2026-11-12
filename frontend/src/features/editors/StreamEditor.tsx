import React, { useState } from "react";
import { Plus, Trash2, Layers, Copy, Check, Maximize2 } from "lucide-react";
import type { StreamMessage } from "../../../bindings/memspace/backend/services/index.js";
import { DataService } from "../../../bindings/memspace/backend/services/index.js";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { JsonSyntaxHighlighter } from "./JsonSyntaxHighlighter";
import { ValueDetailModal } from "./ValueDetailModal";
import { ConfirmModal } from "../../components/ui/ConfirmModal";
import { useToast } from "../../components/ui/Toast";
import { getErrorMessage } from "../../lib/utils";

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
  const { success: toastSuccess, error: toastError } = useToast();
  const [entries, setEntries] = useState<StreamMessage[]>(initialEntries);
  const [newFieldsJson, setNewFieldsJson] = useState('{"sensor":"temp","val": 24.5}');
  const [showAdd, setShowAdd] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [inspectingEntry, setInspectingEntry] = useState<{
    id: string;
    value: string;
  } | null>(null);
  const [deleteIdTarget, setDeleteIdTarget] = useState<string | null>(null);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleAddMessage = async () => {
    if (readOnly) return;
    try {
      const parsed = JSON.parse(newFieldsJson);
      const newId = await DataService.XAdd(connId, db, keyName, parsed);
      setEntries((prev) => [{ id: newId, values: parsed }, ...prev]);
      setShowAdd(false);
      toastSuccess("Message Appended", `Appended message ${newId} to stream.`);
    } catch (err: unknown) {
      toastError("Failed to append to stream", getErrorMessage(err));
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteIdTarget || readOnly) return;
    const id = deleteIdTarget;
    setDeleteIdTarget(null);
    try {
      await DataService.XDel(connId, db, keyName, [id]);
      setEntries((prev) => prev.filter((e) => e.id !== id));
      toastSuccess("Message Deleted", `Deleted message ${id}.`);
    } catch (err: unknown) {
      toastError("Failed to delete message", getErrorMessage(err));
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white">
      {/* Stream Action Bar */}
      <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-zinc-200/80 bg-zinc-50/70 px-3.5">
        <div className="flex items-center gap-2">
          <Layers size={14} className="text-cyan-600" />
          <span className="text-xs font-semibold text-zinc-700">Stream Entries</span>
          <span className="font-mono text-[11px] text-zinc-400">
            ({entries.length} {entries.length === 1 ? "entry" : "entries"})
          </span>
        </div>

        {!readOnly && (
          <Button
            onClick={() => setShowAdd(!showAdd)}
            size="sm"
            variant={showAdd ? "secondary" : "default"}
            className="h-8 cursor-pointer gap-1 text-xs font-semibold"
          >
            <Plus size={13} />
            <span>Append Entry</span>
          </Button>
        )}
      </div>

      {/* Add Entry Drawer */}
      {showAdd && (
        <div className="flex flex-col gap-2 border-b border-zinc-200 bg-zinc-50 p-3">
          <div className="text-[11px] font-medium text-zinc-500">Entry fields (JSON object):</div>
          <div className="flex items-center gap-2">
            <Input
              type="text"
              value={newFieldsJson}
              onChange={(e) => setNewFieldsJson(e.target.value)}
              className="h-8 border-zinc-200 bg-white font-mono text-xs text-zinc-800 placeholder:text-zinc-400"
              placeholder='{"key":"value"}'
            />
            <Button
              onClick={handleAddMessage}
              size="sm"
              variant="default"
              className="h-8 shrink-0 cursor-pointer text-xs font-semibold"
            >
              Append (XADD)
            </Button>
            <Button
              onClick={() => setShowAdd(false)}
              size="sm"
              variant="outline"
              className="h-8 shrink-0 cursor-pointer text-xs"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Stream Message List */}
      <div className="flex-1 space-y-2.5 overflow-y-auto p-3">
        {entries.length === 0 ? (
          <div className="py-12 text-center text-xs text-zinc-500">
            Empty stream (no messages).
          </div>
        ) : (
          entries.map((entry) => {
            const isCopied = copiedId === entry.id;
            const formattedPayload =
              typeof entry.values === "object"
                ? JSON.stringify(entry.values, null, 2)
                : String(entry.values);

            return (
              <div
                key={entry.id}
                className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-3 shadow-2xs transition-all hover:border-zinc-300"
              >
                <div className="flex items-center justify-between border-b border-zinc-100 pb-1.5 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="rounded border border-cyan-200 bg-cyan-50 px-2 py-0.5 font-mono text-[11px] font-bold text-cyan-700">
                      ID: {entry.id}
                    </span>
                    <button
                      onClick={() => handleCopy(entry.id, entry.id)}
                      className="cursor-pointer p-0.5 text-zinc-400 hover:text-zinc-700"
                      title="Copy Entry ID"
                    >
                      {isCopied ? (
                        <Check size={11} className="text-emerald-600" />
                      ) : (
                        <Copy size={11} />
                      )}
                    </button>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() =>
                        setInspectingEntry({ id: entry.id, value: formattedPayload })
                      }
                      className="cursor-pointer rounded p-1 text-zinc-400 transition-colors hover:bg-indigo-50 hover:text-indigo-600"
                      title="Inspect & Format Payload"
                    >
                      <Maximize2 size={12} />
                    </button>

                    <button
                      onClick={() => handleCopy(`val-${entry.id}`, formattedPayload)}
                      className="cursor-pointer rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
                      title="Copy Payload"
                    >
                      {copiedId === `val-${entry.id}` ? (
                        <Check size={12} className="text-emerald-600" />
                      ) : (
                        <Copy size={12} />
                      )}
                    </button>

                    {!readOnly && (
                      <button
                        onClick={() => setDeleteIdTarget(entry.id)}
                        className="cursor-pointer rounded p-1 text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                        title="Delete Stream Message"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Formatted Syntax Highlighted Payload */}
                <div className="overflow-hidden rounded-lg border border-zinc-200/80 bg-zinc-50/50">
                  <JsonSyntaxHighlighter
                    value={formattedPayload}
                    isJson={typeof entry.values === "object"}
                    showLineNumbers={false}
                    className="p-2"
                  />
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Value Inspector Modal */}
      {inspectingEntry && (
        <ValueDetailModal
          isOpen={true}
          onClose={() => setInspectingEntry(null)}
          title={`Stream Entry: ${inspectingEntry.id}`}
          subtitle={`Key: ${keyName}`}
          value={inspectingEntry.value}
        />
      )}

      {/* Delete Stream Message Confirmation Modal */}
      <ConfirmModal
        isOpen={!!deleteIdTarget}
        title="Delete Stream Message"
        description={`Are you sure you want to delete stream message ${deleteIdTarget}?`}
        confirmText="Delete Message"
        cancelText="Cancel"
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteIdTarget(null)}
      />
    </div>
  );
};
