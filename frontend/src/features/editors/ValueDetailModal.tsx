import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
  X,
  Copy,
  Check,
  Code,
  FolderTree,
  Save,
  AlertCircle,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { JsonTreeView } from "./JsonTreeView";
import { CodeEditorWithGutter } from "./CodeEditorWithGutter";
import { useToast } from "../../components/ui/Toast";
import { getErrorMessage, getModSymbol } from "../../lib/utils";

interface ValueDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  value: string;
  onSave?: (newValue: string) => Promise<void> | void;
  readOnly?: boolean;
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

export const ValueDetailModal: React.FC<ValueDetailModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  value,
  onSave,
  readOnly = false,
}) => {
  const { error: toastError, success: toastSuccess } = useToast();
  const modSymbol = getModSymbol();
  const [prevValue, setPrevValue] = useState(value);
  const [currentValue, setCurrentValue] = useState(() => formatIfJson(value));
  const [viewMode, setViewMode] = useState<"code" | "tree">("code");
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [copied, setCopied] = useState(false);

  if (value !== prevValue) {
    setPrevValue(value);
    setCurrentValue(formatIfJson(value));
  }

  const handleSave = useCallback(async () => {
    if (readOnly || !onSave) return;
    setSaving(true);
    try {
      await onSave(currentValue);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2000);
      toastSuccess("Saved", "Value successfully updated.");
    } catch (err: unknown) {
      toastError("Failed to save", getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }, [readOnly, onSave, currentValue, toastSuccess, toastError]);

  // Close on Escape key & Save on Cmd+S
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        void handleSave();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, handleSave]);

  // JSON detection & parsing
  const { isJson, parsedJson, jsonError } = useMemo(() => {
    try {
      const parsed = JSON.parse(currentValue);
      if (parsed !== null && typeof parsed === "object") {
        return {
          isJson: true,
          parsedJson: parsed,
          jsonError: null,
        };
      }
      return {
        isJson: false,
        parsedJson: null,
        jsonError: null,
      };
    } catch (err: unknown) {
      return {
        isJson: false,
        parsedJson: null,
        jsonError: getErrorMessage(err) || "Invalid JSON",
      };
    }
  }, [currentValue]);

  const handleCopy = () => {
    navigator.clipboard.writeText(currentValue);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (!isOpen) return null;

  const canEdit = !!onSave && !readOnly;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs duration-150 animate-in select-none fade-in sm:p-6"
      onClick={onClose}
    >
      <div
        className="flex h-[85vh] w-full max-w-4xl transform flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl transition-all duration-150 scale-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-200 bg-zinc-50/70 px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            {isJson && (
              <span className="shrink-0 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700 uppercase">
                JSON
              </span>
            )}
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-zinc-900">{title}</h3>
              {subtitle && (
                <p className="truncate font-mono text-[11px] text-zinc-500">{subtitle}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden font-mono text-[11px] text-zinc-400 sm:inline">
              {currentValue.length} chars ({new Blob([currentValue]).size} bytes)
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="size-8 cursor-pointer rounded-lg text-zinc-400 hover:text-zinc-700"
              title="Close (Esc)"
            >
              <X size={16} />
            </Button>
          </div>
        </div>

        {/* Modal Toolbar */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-zinc-200/80 bg-white px-4 py-2">
          <div className="flex items-center gap-2">
            {/* View Mode Toggle: Only shown when content is JSON */}
            {isJson && (
              <div className="flex items-center rounded-lg border border-zinc-200 bg-zinc-100 p-0.5 shadow-2xs">
                <button
                  type="button"
                  onClick={() => setViewMode("code")}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-all ${
                    viewMode === "code"
                      ? "bg-white text-zinc-900 shadow-2xs"
                      : "text-zinc-500 hover:text-zinc-800"
                  }`}
                >
                  <Code size={12} />
                  <span>Code</span>
                </button>

                <button
                  type="button"
                  onClick={() => setViewMode("tree")}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-all ${
                    viewMode === "tree"
                      ? "bg-white text-zinc-900 shadow-2xs"
                      : "text-zinc-500 hover:text-zinc-800"
                  }`}
                >
                  <FolderTree size={12} />
                  <span>Tree</span>
                </button>
              </div>
            )}

            {/* Copy action */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="h-7 cursor-pointer gap-1 bg-white text-xs"
              title="Copy Value"
            >
              {copied ? (
                <Check size={12} className="text-emerald-600" />
              ) : (
                <Copy size={12} />
              )}
              <span>{copied ? "Copied" : "Copy"}</span>
            </Button>
          </div>

          {/* Right Action: Save Button (if editable) */}
          {canEdit && (
            <Button
              onClick={handleSave}
              disabled={saving}
              variant="default"
              size="sm"
              className="h-7 shrink-0 cursor-pointer gap-1.5 px-3 text-xs font-semibold"
              title={`Save Changes (${modSymbol}S)`}
            >
              {savedSuccess ? <Check size={13} className="text-white" /> : <Save size={13} />}
              <span>{savedSuccess ? "Saved!" : saving ? "Saving..." : `Save (${modSymbol}S)`}</span>
            </Button>
          )}
        </div>

        {/* Modal Body */}
        <div className="flex flex-1 flex-col overflow-hidden bg-white">
          {viewMode === "tree" && isJson ? (
            <JsonTreeView data={parsedJson} />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              <CodeEditorWithGutter
                value={currentValue}
                onChange={setCurrentValue}
                readOnly={!canEdit}
                placeholder="Enter value..."
                isJson={isJson}
              />

              {/* Status Footer */}
              <div className="flex h-7 shrink-0 items-center justify-between border-t border-zinc-200 bg-zinc-50 px-3 text-[11px] select-none">
                <div className="flex items-center gap-2">
                  {isJson ? (
                    <span className="flex items-center gap-1 font-sans font-medium text-emerald-700">
                      <Check size={11} className="text-emerald-600" />
                      <span>Valid JSON</span>
                    </span>
                  ) : jsonError && currentValue.trim().startsWith("{") ? (
                    <span className="flex items-center gap-1 font-sans font-medium text-amber-700">
                      <AlertCircle size={11} className="text-amber-600" />
                      <span className="max-w-sm truncate">{jsonError}</span>
                    </span>
                  ) : (
                    <span className="font-sans text-zinc-400">Plain Text</span>
                  )}
                </div>

                <div className="font-mono text-zinc-400">
                  {currentValue.split("\n").length} lines
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
