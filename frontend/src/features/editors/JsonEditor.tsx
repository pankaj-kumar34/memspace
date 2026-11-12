import React, { useState, useMemo } from "react";
import {
  Save,
  Search,
  Check,
  Copy,
  Code,
  FolderTree,
  AlertCircle,
} from "lucide-react";
import { DataService } from "../../../bindings/memspace/backend/services/index.js";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { JsonTreeView } from "./JsonTreeView";
import { CodeEditorWithGutter } from "./CodeEditorWithGutter";
import { useToast } from "../../components/ui/Toast";
import { getErrorMessage, getModSymbol } from "../../lib/utils";

interface JsonEditorProps {
  connId: string;
  db: number;
  keyName: string;
  initialJson: string;
  readOnly?: boolean;
  onRefresh: () => void;
}

const formatIfJson = (str: string): string => {
  try {
    const parsed = typeof str === "string" ? JSON.parse(str) : str;
    return JSON.stringify(parsed, null, 2);
  } catch {
    return String(str);
  }
};

export const JsonEditor: React.FC<JsonEditorProps> = ({
  connId,
  db,
  keyName,
  initialJson,
  readOnly = false,
  onRefresh,
}) => {
  const { error: toastError, success: toastSuccess } = useToast();
  const modSymbol = getModSymbol();
  const [jsonStr, setJsonStr] = useState(() => formatIfJson(initialJson));
  const [viewMode, setViewMode] = useState<"code" | "tree">("code");
  const [path, setPath] = useState("$");
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [copied, setCopied] = useState(false);

  const { isJson, parsedJson, jsonError } = useMemo(() => {
    try {
      const parsed = JSON.parse(jsonStr);
      return {
        isJson: true,
        parsedJson: parsed,
        jsonError: null,
      };
    } catch (err: unknown) {
      return {
        isJson: false,
        parsedJson: null,
        jsonError: getErrorMessage(err) || "Invalid JSON",
      };
    }
  }, [jsonStr]);

  const handleQueryPath = async () => {
    try {
      const res = await DataService.JSONGet(connId, db, keyName, path);
      try {
        const parsed = JSON.parse(res);
        setJsonStr(JSON.stringify(parsed, null, 2));
      } catch {
        setJsonStr(res);
      }
    } catch (err: unknown) {
      toastError("JSONPath Query Failed", getErrorMessage(err));
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonStr);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleSave = async () => {
    if (readOnly) return;
    setSaving(true);
    try {
      await DataService.JSONSet(connId, db, keyName, path, jsonStr);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2000);
      toastSuccess("JSON Saved", `Saved JSON document for "${keyName}".`);
      onRefresh();
    } catch (err: unknown) {
      toastError("Failed to save JSON", getErrorMessage(err));
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
      {/* JSONPath bar & Actions */}
      <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-zinc-200/80 bg-zinc-50/70 px-3.5">
        <div className="flex items-center gap-2">
          {/* View mode toggle: Code / Tree */}
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

          {/* Copy Button */}
          <Button
            onClick={handleCopy}
            variant="outline"
            size="sm"
            className="h-7 cursor-pointer gap-1 bg-white text-xs"
            title="Copy JSON"
          >
            {copied ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
            <span>{copied ? "Copied" : "Copy"}</span>
          </Button>
        </div>

        {/* Right side: JSONPath query & Save */}
        <div className="flex items-center gap-2">
          {/* JSONPath Query Bar */}
          <div className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white p-0.5 shadow-2xs">
            <span className="pl-1.5 font-mono text-[11px] font-semibold text-zinc-400">Path:</span>
            <Input
              type="text"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleQueryPath()}
              className="h-6 w-24 border-0 bg-transparent px-1 font-mono text-xs text-zinc-800 shadow-none focus-visible:ring-0 sm:w-28"
              placeholder="$"
            />
            <Button
              onClick={handleQueryPath}
              variant="secondary"
              size="sm"
              className="h-6 cursor-pointer gap-1 px-2 text-[11px]"
            >
              <Search size={10} />
              <span>Query</span>
            </Button>
          </div>

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

      {/* Editor Content Area */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
        {viewMode === "tree" && parsedJson ? (
          <JsonTreeView data={parsedJson} />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <CodeEditorWithGutter
              value={jsonStr}
              onChange={setJsonStr}
              onKeyDown={handleKeyDown}
              readOnly={readOnly}
              placeholder="Enter JSON payload..."
              isJson={isJson}
            />

            {/* Status Bar */}
            <div className="flex h-7 shrink-0 items-center justify-between border-t border-zinc-200 bg-zinc-50 px-3 text-[11px] select-none">
              <div className="flex items-center gap-2">
                {isJson ? (
                  <span className="flex items-center gap-1 font-sans font-medium text-emerald-700">
                    <Check size={11} className="text-emerald-600" />
                    <span>Valid JSON</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1 font-sans font-medium text-amber-700">
                    <AlertCircle size={11} className="text-amber-600" />
                    <span className="max-w-sm truncate">{jsonError}</span>
                  </span>
                )}
              </div>

              <div className="font-mono text-zinc-400">
                {jsonStr.split("\n").length} lines
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
