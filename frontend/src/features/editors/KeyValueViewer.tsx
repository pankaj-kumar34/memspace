import React, { useState, useEffect, useCallback } from "react";
import {
  Clock,
  HardDrive,
  Trash2,
  RefreshCw,
  Edit2,
  Check,
  X,
  FileCode,
  Copy,
} from "lucide-react";
import type { KeyDetails } from "../../../bindings/memspace/backend/models/index.js";
import { KeyService } from "../../../bindings/memspace/backend/services/index.js";
import { formatBytes, getDataTypeBadgeClass, getErrorMessage } from "../../lib/utils";
import { StringEditor } from "./StringEditor";
import { HashEditor } from "./HashEditor";
import { ListEditor } from "./ListEditor";
import { SetEditor } from "./SetEditor";
import { ZSetEditor } from "./ZSetEditor";
import { StreamEditor } from "./StreamEditor";
import { JsonEditor } from "./JsonEditor";
import { JsonSyntaxHighlighter } from "./JsonSyntaxHighlighter";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { ConfirmModal } from "../../components/ui/ConfirmModal";
import { useToast } from "../../components/ui/Toast";

interface KeyValueViewerProps {
  connId: string;
  db: number;
  keyName: string;
  readOnly?: boolean;
  onKeyDeleted: (keyName: string) => void;
  onKeyRenamed: (newKey: string, oldKey?: string) => void;
}

export const KeyValueViewer: React.FC<KeyValueViewerProps> = ({
  connId,
  db,
  keyName,
  readOnly = false,
  onKeyDeleted,
  onKeyRenamed,
}) => {
  const { success: toastSuccess, error: toastError } = useToast();
  const [details, setDetails] = useState<KeyDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);

  // Rename state
  const [isRenaming, setIsRenaming] = useState(false);
  const [renamedKey, setRenamedKey] = useState(keyName);

  // TTL edit state
  const [isEditingTTL, setIsEditingTTL] = useState(false);
  const [newTTL, setNewTTL] = useState<number>(-1);

  // Breadcrumb expansion state for long keys
  const [expandedBreadcrumbs, setExpandedBreadcrumbs] = useState(false);

  // Delete / Unlink modal state
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    isHard: boolean;
  }>({ isOpen: false, isHard: false });
  const [isDeleting, setIsDeleting] = useState(false);

  const currentIdentity = `${connId}:${db}:${keyName}`;
  const [prevIdentity, setPrevIdentity] = useState(currentIdentity);
  if (currentIdentity !== prevIdentity) {
    setPrevIdentity(currentIdentity);
    setIsRenaming(false);
    setIsEditingTTL(false);
    setCopiedKey(false);
    setExpandedBreadcrumbs(false);
  }

  const loadKeyDetails = useCallback(async () => {
    if (!connId || !keyName) return;
    setLoading(true);
    try {
      const res = await KeyService.GetKeyDetails(connId, db, keyName);
      if (res) {
        setDetails(res);
        setRenamedKey(res.key);
        setNewTTL(res.ttl);
      }
    } catch (err: unknown) {
      console.error("Failed to load key details:", err);
    } finally {
      setLoading(false);
    }
  }, [connId, db, keyName]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadKeyDetails();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadKeyDetails]);

  const handleCopyKey = () => {
    navigator.clipboard.writeText(keyName);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 1500);
  };

  const handleDeleteClick = (hard = false) => {
    if (readOnly) return;
    setDeleteModal({ isOpen: true, isHard: hard });
  };

  const handleConfirmDelete = async () => {
    const isHard = deleteModal.isHard;
    setDeleteModal({ isOpen: false, isHard: false });
    if (readOnly) return;
    setIsDeleting(true);
    try {
      if (isHard) {
        await KeyService.DeleteKey(connId, db, keyName);
        toastSuccess("Key Deleted", `Key "${keyName}" was permanently deleted.`);
      } else {
        await KeyService.UnlinkKey(connId, db, keyName);
        toastSuccess("Key Unlinked", `Key "${keyName}" was unlinked for background deletion.`);
      }
      onKeyDeleted(keyName);
    } catch (err: unknown) {
      toastError("Failed to delete key", getErrorMessage(err));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSaveRename = async () => {
    if (readOnly || !renamedKey.trim() || renamedKey === keyName) return;
    try {
      await KeyService.RenameKey(connId, db, keyName, renamedKey.trim());
      setIsRenaming(false);
      const newK = renamedKey.trim();
      onKeyRenamed(newK, keyName);
      toastSuccess("Key Renamed", `Key "${keyName}" renamed to "${newK}".`);
    } catch (err: unknown) {
      toastError("Failed to rename key", getErrorMessage(err));
    }
  };

  const handleSaveTTL = async () => {
    if (readOnly) return;
    try {
      await KeyService.SetTTL(connId, db, keyName, newTTL);
      setIsEditingTTL(false);
      void loadKeyDetails();
      toastSuccess("TTL Updated", `Expiration updated for key "${keyName}".`);
    } catch (err: unknown) {
      toastError("Failed to update TTL", getErrorMessage(err));
    }
  };

  const getTypeBadgeClass = getDataTypeBadgeClass;

  if (loading && !details) {
    return (
      <div className="flex h-full min-w-0 flex-1 flex-col bg-[#fafafa]">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-4">
          <span className="text-xs font-semibold text-zinc-400">Loading...</span>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-[#fafafa] text-zinc-500">
          <RefreshCw size={22} className="animate-spin text-rose-600" />
          <span className="text-xs font-medium text-zinc-500">Loading key data...</span>
        </div>
      </div>
    );
  }

  if (!details) {
    return (
      <div className="flex h-full min-w-0 flex-1 flex-col items-center justify-center bg-[#fafafa] p-6 text-xs text-zinc-500 select-none">
        <p>Select a key from the explorer to inspect and edit its value.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-white">
      {/* Header Bar - Flush with KeyExplorer h-14 Top Bar */}
      <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 select-none">
        {/* Left: Type badge & Contained Address Bar for Key */}
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase ${getTypeBadgeClass(
              details.type
            )}`}
          >
            {details.type}
          </span>

          {isRenaming ? (
            <div className="flex w-full max-w-md items-center gap-1.5">
              <Input
                type="text"
                value={renamedKey}
                onChange={(e) => setRenamedKey(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSaveRename()}
                className="h-8 flex-1 border-rose-500 bg-white text-xs text-zinc-900"
                autoFocus
              />
              <button
                onClick={handleSaveRename}
                className="cursor-pointer rounded p-1 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
                title="Confirm Rename"
              >
                <Check size={14} />
              </button>
              <button
                onClick={() => setIsRenaming(false)}
                className="cursor-pointer rounded p-1 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                title="Cancel"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            /* Address-Bar Contained Key Box with Capped Max Width */
            <div className="flex h-8 w-auto max-w-70 min-w-0 shrink-0 items-center gap-2 rounded-lg border border-zinc-200/90 bg-zinc-50/80 px-2.5 shadow-2xs transition-colors hover:bg-zinc-100/70 sm:max-w-90 md:max-w-105 lg:max-w-120">
              <div
                className="flex min-w-0 flex-1 flex-nowrap items-center gap-1 overflow-hidden font-mono text-xs select-text"
                title={details.key}
              >
                {(() => {
                  const delimiter = details.key.includes(":")
                    ? ":"
                    : details.key.includes("/")
                    ? "/"
                    : details.key.includes(".")
                    ? "."
                    : null;

                  if (!delimiter) {
                    if (details.key.length > 36 && !expandedBreadcrumbs) {
                      return (
                        <span className="flex min-w-0 items-center gap-0.5 truncate">
                          <button
                            type="button"
                            onClick={() => setExpandedBreadcrumbs(true)}
                            className="shrink-0 cursor-pointer rounded px-1 text-zinc-400 transition-colors hover:bg-zinc-200/60 hover:text-zinc-700"
                            title={`Full Key: ${details.key} (Click to expand)`}
                          >
                            …
                          </button>
                          <span className="truncate font-bold text-zinc-900">
                            {details.key.slice(-32)}
                          </span>
                        </span>
                      );
                    }
                    return (
                      <span className="min-w-0 truncate font-bold text-zinc-900">
                        {details.key}
                      </span>
                    );
                  }

                  const parts = details.key.split(delimiter);

                  // 2 parts: e.g. "users:12345"
                  if (parts.length <= 2) {
                    return (
                      <div className="flex min-w-0 flex-nowrap items-center gap-1 truncate">
                        <span
                          className="max-w-40 shrink-0 truncate font-normal text-zinc-400 transition-colors hover:text-zinc-700"
                          title={parts[0]}
                        >
                          {parts[0]}
                        </span>
                        <span className="shrink-0 font-sans text-xs text-zinc-300">›</span>
                        <span
                          className="min-w-0 truncate font-bold text-zinc-900"
                          title={parts[1]}
                        >
                          {parts[1]}
                        </span>
                      </div>
                    );
                  }

                  // 3 parts: e.g. "users:v1:12345" and fits comfortably
                  if (parts.length === 3 && details.key.length <= 36 && !expandedBreadcrumbs) {
                    return (
                      <div className="flex min-w-0 flex-nowrap items-center gap-1 truncate">
                        <span
                          className="max-w-[130px] shrink-0 truncate font-normal text-zinc-400 transition-colors hover:text-zinc-700"
                          title={parts[0]}
                        >
                          {parts[0]}
                        </span>
                        <span className="shrink-0 font-sans text-xs text-zinc-300">›</span>
                        <span
                          className="max-w-[130px] shrink-0 truncate font-normal text-zinc-400 transition-colors hover:text-zinc-700"
                          title={parts[1]}
                        >
                          {parts[1]}
                        </span>
                        <span className="shrink-0 font-sans text-xs text-zinc-300">›</span>
                        <span
                          className="min-w-0 truncate font-bold text-zinc-900"
                          title={parts[2]}
                        >
                          {parts[2]}
                        </span>
                      </div>
                    );
                  }

                  // Expanded view: show all segments with a collapse button
                  if (expandedBreadcrumbs) {
                    return (
                      <div className="flex min-w-0 flex-nowrap items-center gap-1 overflow-x-auto">
                        {parts.map((p, idx) => {
                          const isLast = idx === parts.length - 1;
                          return (
                            <React.Fragment key={idx}>
                              <span
                                className={
                                  isLast
                                    ? "shrink-0 font-bold text-zinc-900"
                                    : "shrink-0 font-normal text-zinc-400 transition-colors hover:text-zinc-700"
                                }
                              >
                                {p}
                              </span>
                              {!isLast && (
                                <span className="shrink-0 font-sans text-xs text-zinc-300">›</span>
                              )}
                            </React.Fragment>
                          );
                        })}
                        <button
                          type="button"
                          onClick={() => setExpandedBreadcrumbs(false)}
                          className="ml-1 shrink-0 cursor-pointer rounded px-1 py-0.5 font-sans text-[11px] text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                          title="Collapse breadcrumb"
                        >
                          (collapse)
                        </button>
                      </div>
                    );
                  }

                  // Collapsed multi-part key: prefix › … › suffix
                  const firstPart = parts[0];
                  const lastPart = parts[parts.length - 1];
                  const middleSegments = parts.slice(1, -1);
                  const middleTooltip = middleSegments.join(` ${delimiter} `);

                  return (
                    <div className="flex min-w-0 flex-nowrap items-center gap-1 truncate">
                      <span
                        className="max-w-35 shrink-0 truncate font-normal text-zinc-400 transition-colors hover:text-zinc-700"
                        title={firstPart}
                      >
                        {firstPart}
                      </span>
                      <span className="shrink-0 font-sans text-xs text-zinc-300">›</span>
                      <button
                        type="button"
                        onClick={() => setExpandedBreadcrumbs(true)}
                        className="shrink-0 cursor-pointer rounded bg-zinc-200/70 px-1.5 py-0.5 font-mono text-xs text-zinc-600 shadow-2xs transition-colors hover:bg-zinc-200 hover:text-zinc-900"
                        title={`Hidden: ${middleTooltip} (Click to expand)`}
                      >
                        …
                      </button>
                      <span className="shrink-0 font-sans text-xs text-zinc-300">›</span>
                      <span
                        className="min-w-0 truncate font-bold text-zinc-900"
                        title={lastPart}
                      >
                        {lastPart}
                      </span>
                    </div>
                  );
                })()}
              </div>

              {/* Action buttons integrated neatly in the address bar */}
              <div className="flex shrink-0 items-center gap-0.5 border-l border-zinc-200/90 pl-1.5">
                <button
                  onClick={handleCopyKey}
                  className="cursor-pointer rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-200/60 hover:text-zinc-700"
                  title="Copy Key Name"
                >
                  {copiedKey ? (
                    <Check size={11} className="text-emerald-600" />
                  ) : (
                    <Copy size={11} />
                  )}
                </button>

                {!readOnly && (
                  <button
                    onClick={() => setIsRenaming(true)}
                    className="cursor-pointer rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-200/60 hover:text-zinc-700"
                    title="Rename Key"
                  >
                    <Edit2 size={11} />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right: Key Metadata (TTL, Size, Encoding) & Actions */}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {/* Metadata Badges Group */}
          <div className="hidden items-center gap-1.5 text-xs text-zinc-500 sm:flex">
            {/* TTL Badge */}
            {/* TTL Badge */}
            <div className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] shadow-2xs transition-colors hover:bg-zinc-100/80">
              <Clock size={11} className="shrink-0 text-amber-500" />
              {isEditingTTL ? (
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    value={newTTL}
                    onChange={(e) => setNewTTL(parseInt(e.target.value) || -1)}
                    onKeyDown={(e) => e.key === "Enter" && handleSaveTTL()}
                    className="h-5 w-16 bg-white px-1 py-0 text-[11px]"
                    placeholder="-1"
                    autoFocus
                  />
                  <button
                    onClick={handleSaveTTL}
                    className="cursor-pointer p-0.5 text-emerald-600 hover:text-emerald-700"
                    title="Save TTL"
                  >
                    <Check size={11} />
                  </button>
                  <button
                    onClick={() => setIsEditingTTL(false)}
                    className="cursor-pointer p-0.5 text-rose-600 hover:text-rose-700"
                    title="Cancel"
                  >
                    <X size={11} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <span>
                    TTL:{" "}
                    <strong className="font-mono font-semibold text-zinc-800">
                      {details.ttl === -1
                        ? "Persistent"
                        : details.ttl === -2
                        ? "Expired"
                        : `${details.ttl}s`}
                    </strong>
                  </span>
                  {!readOnly && (
                    <button
                      onClick={() => setIsEditingTTL(true)}
                      className="ml-0.5 cursor-pointer p-0.5 text-zinc-400 hover:text-zinc-700"
                      title="Change TTL"
                    >
                      <Edit2 size={10} />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Size Badge */}
            {details.size > 0 && (
              <div className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] shadow-2xs">
                <HardDrive size={11} className="shrink-0 text-sky-500" />
                <span>
                  Size: <strong className="font-mono font-semibold text-zinc-800">{formatBytes(details.size)}</strong>
                </span>
              </div>
            )}

            {/* Encoding Badge */}
            {details.encoding && (
              <div className="hidden items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] shadow-2xs md:flex">
                <FileCode size={11} className="shrink-0 text-purple-500" />
                <code className="text-[10px] font-semibold text-zinc-700">{details.encoding}</code>
              </div>
            )}
          </div>

          <div className="mx-0.5 hidden h-4 w-px bg-zinc-200 sm:block" />

          {/* Action Buttons Right */}
          <Button
            onClick={loadKeyDetails}
            variant="ghost"
            size="icon"
            className="size-8 cursor-pointer rounded-lg text-zinc-500 hover:text-zinc-800"
            title="Reload Key"
          >
            <RefreshCw size={13} className={loading ? "animate-spin text-rose-600" : ""} />
          </Button>

          {!readOnly && (
            <>
              <Button
                onClick={() => handleDeleteClick(false)}
                disabled={isDeleting}
                variant="outline"
                size="sm"
                className="h-8 cursor-pointer border-rose-200 px-2.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
                title="Unlink Key (Asynchronous background deletion)"
              >
                Unlink
              </Button>
              <Button
                onClick={() => handleDeleteClick(true)}
                disabled={isDeleting}
                variant="destructive"
                size="sm"
                className="flex size-8 cursor-pointer items-center justify-center rounded-lg p-0 shadow-xs disabled:opacity-50"
                title="Hard Delete Key"
              >
                <Trash2 size={13} />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Value Editor Surface (Flush, Edge-to-Edge) */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
        {(() => {
          const editorKey = `${connId}-${db}-${details.key}`;
          switch (details.type.toLowerCase()) {
            case "string":
              return (
                <StringEditor
                  key={editorKey}
                  connId={connId}
                  db={db}
                  keyName={details.key}
                  initialValue={
                    typeof details.value === "string"
                      ? details.value
                      : String(details.value ?? "")
                  }
                  readOnly={readOnly}
                  onSaved={loadKeyDetails}
                />
              );
            case "hash":
              return (
                <HashEditor
                  key={editorKey}
                  connId={connId}
                  db={db}
                  keyName={details.key}
                  initialEntries={
                    typeof details.value === "object" && details.value !== null
                      ? details.value
                      : {}
                  }
                  readOnly={readOnly}
                  onRefresh={loadKeyDetails}
                />
              );
            case "list":
              return (
                <ListEditor
                  key={editorKey}
                  connId={connId}
                  db={db}
                  keyName={details.key}
                  initialItems={Array.isArray(details.value) ? details.value : []}
                  readOnly={readOnly}
                  onRefresh={loadKeyDetails}
                />
              );
            case "set":
              return (
                <SetEditor
                  key={editorKey}
                  connId={connId}
                  db={db}
                  keyName={details.key}
                  initialMembers={Array.isArray(details.value) ? details.value : []}
                  readOnly={readOnly}
                  onRefresh={loadKeyDetails}
                />
              );
            case "zset":
              return (
                <ZSetEditor
                  key={editorKey}
                  connId={connId}
                  db={db}
                  keyName={details.key}
                  initialMembers={Array.isArray(details.value) ? details.value : []}
                  readOnly={readOnly}
                  onRefresh={loadKeyDetails}
                />
              );
            case "stream":
              return (
                <StreamEditor
                  key={editorKey}
                  connId={connId}
                  db={db}
                  keyName={details.key}
                  initialEntries={Array.isArray(details.value) ? details.value : []}
                  readOnly={readOnly}
                  onRefresh={loadKeyDetails}
                />
              );
            case "rejson-rl":
            case "json":
              return (
                <JsonEditor
                  key={editorKey}
                  connId={connId}
                  db={db}
                  keyName={details.key}
                  initialJson={
                    typeof details.value === "string"
                      ? details.value
                      : JSON.stringify(details.value, null, 2)
                  }
                  readOnly={readOnly}
                  onRefresh={loadKeyDetails}
                />
              );
            default:
              return (
                <div className="flex flex-1 flex-col gap-3 overflow-hidden bg-white p-4">
                  <div className="text-xs font-semibold text-zinc-500">
                    Unsupported visual editor for type: <span className="font-mono text-rose-600">{details.type}</span> (raw data view)
                  </div>
                  <div className="flex-1 overflow-hidden rounded-lg border border-zinc-200">
                    <JsonSyntaxHighlighter
                      value={JSON.stringify(details.value, null, 2)}
                      isJson={true}
                      showLineNumbers={true}
                    />
                  </div>
                </div>
              );
          }
        })()}
      </div>

      {/* Delete / Unlink Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteModal.isOpen}
        title={deleteModal.isHard ? "Delete Key Permanently" : "Unlink Key"}
        description={
          deleteModal.isHard
            ? `Are you sure you want to permanently delete key "${keyName}"? This synchronous DEL operation cannot be undone.`
            : `Are you sure you want to unlink key "${keyName}"? This will asynchronously reclaim memory in the background using UNLINK.`
        }
        confirmText={deleteModal.isHard ? "Delete Key" : "Unlink Key"}
        cancelText="Cancel"
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteModal({ isOpen: false, isHard: false })}
      />
    </div>
  );
};
