import React, { useState, useMemo } from "react";
import {
  Save,
  Code,
  Check,
  Copy,
  FolderTree,
  AlertCircle,
  Calendar,
  KeyRound,
} from "lucide-react";
import { DataService } from "../../../bindings/memspace/backend/services/index.js";
import { Button } from "../../components/ui/button";
import { JsonTreeView } from "./JsonTreeView";
import { CodeEditorWithGutter } from "./CodeEditorWithGutter";
import { useToast } from "../../components/ui/Toast";
import { getErrorMessage, getModSymbol } from "../../lib/utils";

interface StringEditorProps {
  connId: string;
  db: number;
  keyName: string;
  initialValue: string;
  readOnly?: boolean;
  onSaved?: () => void;
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

export const StringEditor: React.FC<StringEditorProps> = ({
  connId,
  db,
  keyName,
  initialValue,
  readOnly = false,
  onSaved,
}) => {
  const { error: toastError, success: toastSuccess } = useToast();
  const modSymbol = getModSymbol();
  const [prevInitialValue, setPrevInitialValue] = useState(initialValue);
  const [value, setValue] = useState(() => formatIfJson(initialValue));
  const [viewMode, setViewMode] = useState<"code" | "tree">("code");
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [copied, setCopied] = useState(false);

  if (initialValue !== prevInitialValue) {
    setPrevInitialValue(initialValue);
    setValue(formatIfJson(initialValue));
  }

  // JSON detection & parsing
  const { isJson, parsedJson, jsonError } = useMemo(() => {
    try {
      const parsed = JSON.parse(value);
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
  }, [value]);

  // Timestamp detection
  const detectedTimestamp = useMemo(() => {
    const trimmed = value.trim();
    if (/^\d{10}$/.test(trimmed)) {
      const sec = parseInt(trimmed, 10);
      const d = new Date(sec * 1000);
      if (!isNaN(d.getTime()) && d.getFullYear() >= 2000 && d.getFullYear() <= 2100) {
        return d.toUTCString();
      }
    } else if (/^\d{13}$/.test(trimmed)) {
      const ms = parseInt(trimmed, 10);
      const d = new Date(ms);
      if (!isNaN(d.getTime()) && d.getFullYear() >= 2000 && d.getFullYear() <= 2100) {
        return d.toUTCString();
      }
    }
    return null;
  }, [value]);

  // JWT detection
  const detectedJwt = useMemo(() => {
    const trimmed = value.trim();
    if (trimmed.startsWith("ey") && trimmed.split(".").length === 3) {
      try {
        const parts = trimmed.split(".");
        const payloadBase64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        const jsonPayload = decodeURIComponent(
          atob(payloadBase64)
            .split("")
            .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
            .join("")
        );
        return JSON.parse(jsonPayload);
      } catch {
        return null;
      }
    }
    return null;
  }, [value]);

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleSave = async () => {
    if (readOnly) return;
    setSaving(true);
    try {
      await DataService.SetString(connId, db, keyName, value, 0);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2000);
      toastSuccess("String Saved", `Saved string value for "${keyName}".`);
      onSaved?.();
    } catch (err: unknown) {
      toastError("Failed to save string", getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      handleSave();
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white">
      {/* Editor Header Bar */}
      <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-zinc-200/80 bg-zinc-50/70 px-3.5">
        <div className="flex items-center gap-2">
          {/* Mode Switcher: Code / Tree (Only shown when content is JSON) */}
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
                title="Code editor"
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
                title="Interactive JSON tree view"
              >
                <FolderTree size={12} />
                <span>Tree</span>
              </button>
            </div>
          )}

          {/* Copy Button */}
          <Button
            onClick={handleCopy}
            variant="outline"
            size="sm"
            className="h-7 cursor-pointer gap-1 bg-white text-xs"
            title="Copy Value to Clipboard"
          >
            {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
            <span>{copied ? "Copied" : "Copy"}</span>
          </Button>
        </div>

        {/* Right side: Char count and Save */}
        <div className="flex items-center gap-2">
          <span className="hidden font-mono text-[11px] text-zinc-400 sm:inline">
            {value.length} chars ({new Blob([value]).size} B)
          </span>

          {!readOnly && (
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
      </div>

      {/* Timestamp or JWT smart helper pill bar */}
      {(detectedTimestamp || detectedJwt) && (
        <div className="flex items-center gap-2 border-b border-amber-200/60 bg-amber-50/60 px-3.5 py-1.5 text-xs text-amber-900 select-text">
          {detectedTimestamp && (
            <div className="flex items-center gap-1.5 font-mono text-[11px]">
              <Calendar size={12} className="shrink-0 text-amber-600" />
              <span className="font-semibold text-amber-800">Detected UTC Timestamp:</span>
              <span className="rounded border border-amber-200 bg-white/80 px-1.5 py-0.5 text-zinc-800">
                {detectedTimestamp}
              </span>
            </div>
          )}

          {detectedJwt && (
            <div className="flex items-center gap-1.5 font-mono text-[11px]">
              <KeyRound size={12} className="shrink-0 text-amber-600" />
              <span className="font-semibold text-amber-800">Detected JWT Payload:</span>
              <span className="max-w-md truncate rounded border border-amber-200 bg-white/80 px-1.5 py-0.5 text-zinc-700">
                {JSON.stringify(detectedJwt)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Editor Content Area */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
        {viewMode === "tree" && isJson ? (
          <JsonTreeView data={parsedJson} />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <CodeEditorWithGutter
              value={value}
              onChange={setValue}
              onKeyDown={handleKeyDown}
              readOnly={readOnly}
              placeholder="Enter string value..."
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
                ) : jsonError && value.trim().startsWith("{") ? (
                  <span className="flex items-center gap-1 font-sans font-medium text-amber-700">
                    <AlertCircle size={11} className="text-amber-600" />
                    <span className="max-w-sm truncate">{jsonError}</span>
                  </span>
                ) : (
                  <span className="font-sans text-zinc-400">Plain Text</span>
                )}
              </div>

              <div className="font-mono text-zinc-400">
                {value.split("\n").length} lines
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
