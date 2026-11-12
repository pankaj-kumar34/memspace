import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Search,
  Filter,
  RefreshCw,
  Plus,
  Key as KeyIcon,
  X,
  ChevronDown,
  ChevronRight,
  FolderTree,
  List,
  Folder,
  FolderOpen,
  Copy,
  CheckSquare,
  ListChecks,
  Square,
  MinusSquare,
  Trash2,
} from "lucide-react";
import type { KeyInfo } from "../../../bindings/memspace/backend/models/index.js";
import { KeyService, DataService } from "../../../bindings/memspace/backend/services/index.js";
import { DatabaseSelector } from "./DatabaseSelector";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { ConfirmModal } from "../../components/ui/ConfirmModal";
import { useToast } from "../../components/ui/Toast";
import { getDataTypeBadgeClass, getDataTypeShortName, getErrorMessage } from "../../lib/utils";

interface KeyExplorerProps {
  connId: string;
  clusterMode?: boolean;
  readOnly?: boolean;
  selectedKey: string | null;
  currentDb: number;
  onSelectDb: (db: number) => void;
  onSelectKey: (key: string, db: number) => void;
  deletedKeyInfo?: { key: string; id: number } | null;
  renamedKeyInfo?: { oldKey: string; newKey: string; id: number } | null;
  onKeyDeleted?: () => void;
  isActive?: boolean;
}

interface TreeItem {
  id: string;
  type: "folder" | "leaf";
  depth: number;
  name: string;
  fullPath: string;
  count?: number;
  isExpanded?: boolean;
  keyInfo?: KeyInfo;
}

interface FolderNode {
  name: string;
  fullPath: string;
  subFolders: Map<string, FolderNode>;
  leaves: KeyInfo[];
  totalCount: number;
}

export const KeyExplorer: React.FC<KeyExplorerProps> = ({
  connId,
  clusterMode = false,
  readOnly = false,
  selectedKey,
  currentDb,
  onSelectDb,
  onSelectKey,
  deletedKeyInfo,
  renamedKeyInfo,
  onKeyDeleted,
  isActive = true,
}) => {
  const { success: toastSuccess, error: toastError } = useToast();
  const [keys, setKeys] = useState<KeyInfo[]>([]);
  const [cursor, setCursor] = useState(0);
  const [pattern, setPattern] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [totalKeys, setTotalKeys] = useState(0);

  // Multi-select & Bulk Delete State
  const [selectionMode, setSelectionMode] = useState(false);
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(() => new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [bulkDeleteModal, setBulkDeleteModal] = useState<{
    isOpen: boolean;
    isHard: boolean;
  }>({ isOpen: false, isHard: false });

  // Add Key State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyType, setNewKeyType] = useState("string");
  const [newStringValue, setNewStringValue] = useState("");
  const [newHashField, setNewHashField] = useState("field");
  const [newHashValue, setNewHashValue] = useState("value");
  const [newListItem, setNewListItem] = useState("item");
  const [newSetMember, setNewSetMember] = useState("member");
  const [newZSetScore, setNewZSetScore] = useState("1");
  const [newZSetMember, setNewZSetMember] = useState("member");
  const [newStreamPayload, setNewStreamPayload] = useState('{"sensor": "temp", "val": 24.5}');
  const [newJsonValue, setNewJsonValue] = useState("{}");
  const [newKeyTTL, setNewKeyTTL] = useState("");
  const [isCreatingKey, setIsCreatingKey] = useState(false);

  // View Mode: Tree vs Flat List
  const [viewMode, setViewMode] = useState<"tree" | "list">(() => {
    try {
      return localStorage.getItem("memspace:explorer-view-mode") === "list" ? "list" : "tree";
    } catch {
      return "tree";
    }
  });

  // Expanded folders in Tree mode
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set());

  // Resizable sidebar state
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    try {
      const saved = localStorage.getItem("memspace:explorer-width");
      return saved ? Math.max(260, Math.min(640, parseInt(saved, 10))) : 340;
    } catch {
      return 340;
    }
  });
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const widthRef = useRef(sidebarWidth);
  widthRef.current = sidebarWidth;

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newWidth = Math.max(260, Math.min(640, e.clientX - rect.left));
      setSidebarWidth(newWidth);
      widthRef.current = newWidth;
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      try {
        localStorage.setItem("memspace:explorer-width", widthRef.current.toString());
      } catch {
        // ignore storage errors
      }
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  const parentRef = useRef<HTMLDivElement>(null);
  const patternRef = useRef(pattern);
  useEffect(() => {
    patternRef.current = pattern;
  }, [pattern]);

  const fetchKeys = useCallback(
    async (scanCursor = 0, resetList = true, patternOverride?: string) => {
      if (!connId) return;
      if (resetList) {
        setCheckedKeys(new Set());
      }
      setLoading(true);
      const effectivePattern =
        (patternOverride !== undefined ? patternOverride : patternRef.current).trim() || "*";
      try {
        const res = await KeyService.ScanKeys(
          connId,
          currentDb,
          scanCursor,
          effectivePattern,
          typeFilter === "all" ? "" : typeFilter,
          500
        );
        if (res) {
          setCursor(res.cursor || 0);
          setTotalKeys(res.total || 0);
          if (resetList) {
            setKeys(res.keys || []);
          } else {
            setKeys((prev) => [...prev, ...(res.keys || [])]);
          }
        }
      } catch (err: unknown) {
        console.error("Failed to scan keys:", err);
      } finally {
        setLoading(false);
      }
    },
    [connId, currentDb, typeFilter]
  );

  useEffect(() => {
    setSelectionMode(false);
    setCheckedKeys(new Set());
    void fetchKeys(0, true);
  }, [fetchKeys]);

  // Synchronize key list on external deletion
  useEffect(() => {
    if (deletedKeyInfo?.key) {
      setKeys((prev) => prev.filter((k) => k.key !== deletedKeyInfo.key));
      setTotalKeys((prev) => Math.max(0, prev - 1));
      setCheckedKeys((prev) => {
        if (!prev.has(deletedKeyInfo.key)) return prev;
        const next = new Set(prev);
        next.delete(deletedKeyInfo.key);
        return next;
      });
    }
  }, [deletedKeyInfo]);

  // Synchronize key list on external rename
  useEffect(() => {
    if (renamedKeyInfo) {
      setKeys((prev) =>
        prev.map((k) =>
          k.key === renamedKeyInfo.oldKey ? { ...k, key: renamedKeyInfo.newKey } : k
        )
      );
      setCheckedKeys((prev) => {
        if (!prev.has(renamedKeyInfo.oldKey)) return prev;
        const next = new Set(prev);
        next.delete(renamedKeyInfo.oldKey);
        next.add(renamedKeyInfo.newKey);
        return next;
      });
    }
  }, [renamedKeyInfo]);

  // Build the hierarchical tree from keys
  const treeItems = useMemo<TreeItem[]>(() => {
    if (viewMode !== "tree" || keys.length === 0) return [];

    const root: FolderNode = {
      name: "",
      fullPath: "",
      subFolders: new Map(),
      leaves: [],
      totalCount: 0,
    };

    for (const k of keys) {
      const parts = k.key.split(":");
      if (parts.length === 1) {
        root.leaves.push(k);
      } else {
        let current = root;
        let pathAccum = "";
        for (let i = 0; i < parts.length - 1; i++) {
          const seg = parts[i];
          pathAccum = pathAccum ? `${pathAccum}:${seg}` : seg;
          if (!current.subFolders.has(seg)) {
            current.subFolders.set(seg, {
              name: seg,
              fullPath: pathAccum,
              subFolders: new Map(),
              leaves: [],
              totalCount: 0,
            });
          }
          current = current.subFolders.get(seg)!;
        }
        current.leaves.push(k);
      }
    }

    const calcCount = (node: FolderNode): number => {
      let count = node.leaves.length;
      for (const sub of node.subFolders.values()) {
        count += calcCount(sub);
      }
      node.totalCount = count;
      return count;
    };
    calcCount(root);

    const flatten = (node: FolderNode, depth: number): TreeItem[] => {
      const result: TreeItem[] = [];

      const sortedFolders = Array.from(node.subFolders.values()).sort((a, b) =>
        a.name.localeCompare(b.name)
      );

      for (const folder of sortedFolders) {
        const isExp = expandedFolders.has(folder.fullPath);
        result.push({
          id: `folder:${folder.fullPath}`,
          type: "folder",
          depth,
          name: folder.name,
          fullPath: folder.fullPath,
          count: folder.totalCount,
          isExpanded: isExp,
        });

        if (isExp) {
          result.push(...flatten(folder, depth + 1));
        }
      }

      const sortedLeaves = [...node.leaves].sort((a, b) =>
        a.key.localeCompare(b.key)
      );

      for (const leaf of sortedLeaves) {
        const parts = leaf.key.split(":");
        const leafName = parts[parts.length - 1];
        result.push({
          id: `leaf:${leaf.key}`,
          type: "leaf",
          depth,
          name: leafName,
          fullPath: leaf.key,
          keyInfo: leaf,
        });
      }

      return result;
    };

    return flatten(root, 0);
  }, [keys, viewMode, expandedFolders]);

  // Auto-expand top level folders when new keys arrive
  useEffect(() => {
    if (keys.length === 0) return;
    setExpandedFolders((prev) => {
      if (prev.size > 0) return prev;
      const topPaths = new Set<string>();
      for (const k of keys) {
        const parts = k.key.split(":");
        if (parts.length > 1) {
          topPaths.add(parts[0]);
        }
      }
      return topPaths;
    });
  }, [keys]);

  const toggleFolder = (folderPath: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderPath)) {
        next.delete(folderPath);
      } else {
        next.add(folderPath);
      }
      return next;
    });
  };

  // Map each folder fullPath to all loaded keys beneath it for O(1) folder checkbox state
  const folderKeysMap = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!selectionMode || viewMode !== "tree") return map;

    for (const k of keys) {
      const parts = k.key.split(":");
      if (parts.length <= 1) continue;
      let pathAccum = "";
      for (let i = 0; i < parts.length - 1; i++) {
        pathAccum = pathAccum ? `${pathAccum}:${parts[i]}` : parts[i];
        let list = map.get(pathAccum);
        if (!list) {
          list = [];
          map.set(pathAccum, list);
        }
        list.push(k.key);
      }
    }
    return map;
  }, [keys, selectionMode, viewMode]);

  const toggleKeySelection = (key: string) => {
    setCheckedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleFolderSelection = (folderPath: string) => {
    const descendantKeys = folderKeysMap.get(folderPath);
    if (!descendantKeys || descendantKeys.length === 0) return;
    setCheckedKeys((prev) => {
      const next = new Set(prev);
      const allChecked = descendantKeys.every((k) => next.has(k));
      if (allChecked) {
        for (const k of descendantKeys) next.delete(k);
      } else {
        for (const k of descendantKeys) next.add(k);
      }
      return next;
    });
  };

  const allLoadedSelected =
    keys.length > 0 && keys.every((k) => checkedKeys.has(k.key));

  const toggleSelectAll = () => {
    if (allLoadedSelected) {
      setCheckedKeys(new Set());
    } else {
      setCheckedKeys(new Set(keys.map((k) => k.key)));
    }
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setCheckedKeys(new Set());
  };

  useEffect(() => {
    if (!selectionMode || showAddModal || bulkDeleteModal.isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        exitSelectionMode();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectionMode, showAddModal, bulkDeleteModal.isOpen]);

  const handleBulkDeleteClick = (hard = false) => {
    if (readOnly || checkedKeys.size === 0 || isBulkDeleting) return;
    setBulkDeleteModal({ isOpen: true, isHard: hard });
  };

  const handleConfirmBulkDelete = async () => {
    const isHard = bulkDeleteModal.isHard;
    setBulkDeleteModal({ isOpen: false, isHard: false });
    if (readOnly || checkedKeys.size === 0) return;

    const keysToDelete = Array.from(checkedKeys);
    setIsBulkDeleting(true);
    try {
      const deletedCount = isHard
        ? await KeyService.DeleteKeys(connId, currentDb, keysToDelete)
        : await KeyService.UnlinkKeys(connId, currentDb, keysToDelete);

      const deletedSet = new Set(keysToDelete);
      setKeys((prev) => prev.filter((k) => !deletedSet.has(k.key)));
      setTotalKeys((prev) => Math.max(0, prev - keysToDelete.length));

      if (selectedKey && deletedSet.has(selectedKey)) {
        onKeyDeleted?.();
      }

      exitSelectionMode();
      const countLabel = `${deletedCount} ${deletedCount === 1 ? "key" : "keys"}`;
      if (isHard) {
        toastSuccess("Keys Deleted", `${countLabel} permanently deleted.`);
      } else {
        toastSuccess("Keys Unlinked", `${countLabel} unlinked for background deletion.`);
      }
    } catch (err: unknown) {
      toastError("Failed to delete keys", getErrorMessage(err));
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const displayCount = viewMode === "tree" ? treeItems.length : keys.length;

  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: displayCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 35,
    overscan: 25,
  });

  // Re-measure virtualizer when explorer tab becomes active to ensure correct sizing after hidden
  useEffect(() => {
    if (isActive) {
      rowVirtualizer.measure();
    }
  }, [isActive, rowVirtualizer]);

  const getTypeBadgeClass = getDataTypeBadgeClass;
  const getTypeShortName = getDataTypeShortName;

  const handleCreateKey = async () => {
    const trimmedKey = newKeyName.trim();
    if (!trimmedKey || isCreatingKey || readOnly) return;

    setIsCreatingKey(true);
    const ttlSec = newKeyTTL.trim() ? parseInt(newKeyTTL.trim(), 10) : -1;

    try {
      switch (newKeyType) {
        case "string":
          await DataService.SetString(
            connId,
            currentDb,
            trimmedKey,
            newStringValue,
            ttlSec > 0 ? ttlSec : 0
          );
          break;
        case "hash":
          await DataService.HSet(
            connId,
            currentDb,
            trimmedKey,
            newHashField.trim() || "field",
            newHashValue || "value"
          );
          if (ttlSec > 0) {
            await KeyService.SetTTL(connId, currentDb, trimmedKey, ttlSec);
          }
          break;
        case "list":
          await DataService.RPush(connId, currentDb, trimmedKey, [
            newListItem.trim() || "item",
          ]);
          if (ttlSec > 0) {
            await KeyService.SetTTL(connId, currentDb, trimmedKey, ttlSec);
          }
          break;
        case "set":
          await DataService.SAdd(connId, currentDb, trimmedKey, [
            newSetMember.trim() || "member",
          ]);
          if (ttlSec > 0) {
            await KeyService.SetTTL(connId, currentDb, trimmedKey, ttlSec);
          }
          break;
        case "zset": {
          const score = Number.isFinite(parseFloat(newZSetScore))
            ? parseFloat(newZSetScore)
            : 1;
          await DataService.ZAdd(
            connId,
            currentDb,
            trimmedKey,
            score,
            newZSetMember.trim() || "member"
          );
          if (ttlSec > 0) {
            await KeyService.SetTTL(connId, currentDb, trimmedKey, ttlSec);
          }
          break;
        }
        case "stream": {
          let payload: Record<string, unknown>;
          try {
            payload = JSON.parse(newStreamPayload.trim() || '{"field":"value"}');
          } catch {
            payload = { field: newStreamPayload.trim() || "value" };
          }
          await DataService.XAdd(connId, currentDb, trimmedKey, payload);
          if (ttlSec > 0) {
            await KeyService.SetTTL(connId, currentDb, trimmedKey, ttlSec);
          }
          break;
        }
        case "json": {
          const jsonVal = newJsonValue.trim() || "{}";
          try {
            JSON.parse(jsonVal);
          } catch {
            toastError("Invalid JSON", "Please enter a valid JSON format (e.g. {}).");
            setIsCreatingKey(false);
            return;
          }
          await DataService.JSONSet(connId, currentDb, trimmedKey, "$", jsonVal);
          if (ttlSec > 0) {
            await KeyService.SetTTL(connId, currentDb, trimmedKey, ttlSec);
          }
          break;
        }
        default:
          await DataService.SetString(
            connId,
            currentDb,
            trimmedKey,
            "",
            ttlSec > 0 ? ttlSec : 0
          );
      }

      toastSuccess("Key Created", `Key "${trimmedKey}" created successfully.`);

      const newKeyInfo: KeyInfo = {
        key: trimmedKey,
        type: newKeyType,
        ttl: ttlSec > 0 ? ttlSec : -1,
        size: 0,
        encoding: "",
      };

      setKeys((prev) => [newKeyInfo, ...prev.filter((k) => k.key !== trimmedKey)]);
      setTotalKeys((prev) => prev + 1);
      onSelectKey(trimmedKey, currentDb);

      setShowAddModal(false);
      setNewKeyName("");
      setNewStringValue("");
      setNewHashField("field");
      setNewHashValue("value");
      setNewListItem("item");
      setNewSetMember("member");
      setNewZSetScore("1");
      setNewZSetMember("member");
      setNewStreamPayload('{"sensor": "temp", "val": 24.5}');
      setNewJsonValue("{}");
      setNewKeyTTL("");
    } catch (err: unknown) {
      toastError("Failed to create key", getErrorMessage(err));
    } finally {
      setIsCreatingKey(false);
    }
  };

  useEffect(() => {
    if (!showAddModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isCreatingKey) {
        e.preventDefault();
        setShowAddModal(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showAddModal, isCreatingKey]);

  return (
    <div
      ref={containerRef}
      style={{ width: `${sidebarWidth}px` }}
      className="relative flex h-full shrink-0 flex-col border-r border-zinc-200 bg-white select-none"
    >
      {/* Top Bar with DB Selector & Actions (h-14 aligned) */}
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-zinc-200 bg-white px-3">
        <div className="min-w-0 flex-1">
          <DatabaseSelector
            currentDb={currentDb}
            onSelectDb={onSelectDb}
            clusterMode={clusterMode}
          />
        </div>

        {!readOnly && (
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              onClick={() => {
                if (selectionMode) {
                  exitSelectionMode();
                } else {
                  setSelectionMode(true);
                }
              }}
              disabled={keys.length === 0 && !selectionMode}
              size="icon"
              variant="outline"
              className={`flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg shadow-2xs ${
                selectionMode
                  ? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100/70"
                  : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
              }`}
              title={selectionMode ? "Exit Multi-Select (Esc)" : "Select Multiple Keys"}
            >
              <ListChecks size={15} />
            </Button>
            <Button
              onClick={() => setShowAddModal(true)}
              size="icon"
              variant="default"
              className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg shadow-2xs"
              title="Add New Key"
            >
              <Plus size={15} />
            </Button>
          </div>
        )}
      </div>

      {/* Search, View Mode Toggle & Filter Bar */}
      <div className="flex shrink-0 flex-col gap-1.5 border-b border-zinc-200 bg-zinc-50/50 px-3 py-2">
        <div className="flex w-full items-center gap-1.5">
          <div className="relative min-w-0 flex-1">
            <Search
              size={13}
              className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-zinc-400"
            />
            <input
              type="text"
              placeholder="Search keys..."
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  fetchKeys(0, true);
                }
              }}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              className="h-8 w-full rounded-lg border border-zinc-200 bg-white pr-7 pl-8 font-mono text-xs text-zinc-800 shadow-2xs transition-all outline-none placeholder:text-zinc-400 focus:border-rose-500 focus:ring-1 focus:ring-rose-500/20"
            />
            {pattern && (
              <button
                type="button"
                onClick={() => {
                  setPattern("");
                  fetchKeys(0, true, "");
                }}
                className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer rounded p-0.5 text-zinc-400 transition-colors hover:text-zinc-600"
                title="Clear Pattern"
              >
                <X size={12} />
              </button>
            )}
          </div>

          <Button
            onClick={() => fetchKeys(0, true)}
            variant="outline"
            size="icon"
            className="size-8 shrink-0 cursor-pointer rounded-lg border border-zinc-200 bg-white text-zinc-500 shadow-2xs hover:bg-zinc-50 hover:text-zinc-800"
            title="Refresh Key Scan"
          >
            <RefreshCw size={13} className={loading ? "animate-spin text-rose-600" : ""} />
          </Button>
        </div>

        <div className="flex items-center justify-between px-0.5 text-xs">
          <div className="flex items-center gap-1.5">
            {/* View Mode Toggle: Tree vs List */}
            <div className="flex h-7 items-center rounded-lg border border-zinc-200 bg-zinc-100 p-0.5 shadow-2xs">
              <button
                type="button"
                onClick={() => {
                  setViewMode("tree");
                  try {
                    localStorage.setItem("memspace:explorer-view-mode", "tree");
                  } catch {
                    // ignore storage errors
                  }
                }}
                className={`flex h-full cursor-pointer items-center justify-center rounded-md px-2 transition-all ${
                  viewMode === "tree"
                    ? "bg-white font-semibold text-zinc-900 shadow-2xs"
                    : "text-zinc-400 hover:text-zinc-700"
                }`}
                title="Namespace Tree View"
              >
                <FolderTree size={13} />
              </button>
              <button
                type="button"
                onClick={() => {
                  setViewMode("list");
                  try {
                    localStorage.setItem("memspace:explorer-view-mode", "list");
                  } catch {
                    // ignore storage errors
                  }
                }}
                className={`flex h-full cursor-pointer items-center justify-center rounded-md px-2 transition-all ${
                  viewMode === "list"
                    ? "bg-white font-semibold text-zinc-900 shadow-2xs"
                    : "text-zinc-400 hover:text-zinc-700"
                }`}
                title="Flat List View"
              >
                <List size={13} />
              </button>
            </div>

            {/* Type Filter Dropdown (Matched to h-7) */}
            <div className="relative flex h-7 items-center">
              <div className="pointer-events-none flex h-full cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700 shadow-2xs transition-colors hover:bg-zinc-50">
                <Filter size={11} className="shrink-0 text-zinc-400" />
                <span className="capitalize">{typeFilter === "all" ? "All Types" : typeFilter}</span>
                <ChevronDown size={11} className="ml-0.5 shrink-0 text-zinc-400" />
              </div>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="absolute inset-0 size-full cursor-pointer opacity-0"
                title="Filter by Type"
              >
                <option value="all" className="bg-white text-zinc-900">All Types</option>
                <option value="string" className="bg-white text-zinc-900">String</option>
                <option value="hash" className="bg-white text-zinc-900">Hash</option>
                <option value="list" className="bg-white text-zinc-900">List</option>
                <option value="set" className="bg-white text-zinc-900">Set</option>
                <option value="zset" className="bg-white text-zinc-900">Sorted Set (ZSet)</option>
                <option value="stream" className="bg-white text-zinc-900">Stream</option>
                <option value="json" className="bg-white text-zinc-900">JSON</option>
              </select>
            </div>
          </div>

          <div className="flex h-7 shrink-0 items-center justify-center font-sans text-[11px] leading-none text-zinc-400 select-none">
            {(() => {
              const isFiltering = (pattern && pattern !== "*") || typeFilter !== "all";
              if (keys.length === 0) {
                return <span>{isFiltering ? "0 matches" : "0 keys"}</span>;
              }
              if (isFiltering) {
                if (totalKeys > 0) {
                  return (
                    <span>
                      <strong className="font-semibold text-zinc-700">{keys.length.toLocaleString()}</strong> of{" "}
                      {totalKeys.toLocaleString()}
                    </span>
                  );
                }
                return (
                  <span>
                    <strong className="font-semibold text-zinc-700">{keys.length.toLocaleString()}</strong>{" "}
                    {keys.length === 1 ? "match" : "matches"}
                  </span>
                );
              }
              if (totalKeys > 0 && totalKeys > keys.length) {
                return (
                  <span>
                    <strong className="font-semibold text-zinc-700">{keys.length.toLocaleString()}</strong> of ~{totalKeys.toLocaleString()}
                  </span>
                );
              }
              return (
                <span>
                  <strong className="font-semibold text-zinc-700">{keys.length.toLocaleString()}</strong>{" "}
                  {keys.length === 1 ? "key" : "keys"}
                </span>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Bulk Selection Action Bar */}
      {selectionMode && !readOnly && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-rose-200/70 bg-rose-50/70 px-3 py-1.5 text-xs">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={toggleSelectAll}
              disabled={isBulkDeleting || keys.length === 0}
              className="flex cursor-pointer items-center gap-1.5 font-medium text-zinc-700 hover:text-zinc-900 disabled:opacity-50"
              title={allLoadedSelected ? "Deselect All Loaded Keys" : "Select All Loaded Keys"}
            >
              {allLoadedSelected ? (
                <CheckSquare size={13} className="shrink-0 text-rose-600" />
              ) : checkedKeys.size > 0 ? (
                <MinusSquare size={13} className="shrink-0 text-rose-600" />
              ) : (
                <Square size={13} className="shrink-0 text-zinc-400" />
              )}
              <span>{allLoadedSelected ? "None" : "All"}</span>
            </button>
            <span className="truncate text-[11px] font-medium text-zinc-500">
              <strong className="font-semibold text-rose-700">{checkedKeys.size}</strong> selected
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={checkedKeys.size === 0 || isBulkDeleting}
              onClick={() => handleBulkDeleteClick(false)}
              className="h-6 cursor-pointer border-rose-200 bg-white px-2 text-[11px] font-semibold text-rose-700 hover:bg-rose-100/60 hover:text-rose-800"
              title="Asynchronously unlink selected keys (UNLINK)"
            >
              Unlink
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={checkedKeys.size === 0 || isBulkDeleting}
              onClick={() => handleBulkDeleteClick(true)}
              className="h-6 cursor-pointer gap-1 bg-rose-600 px-2 text-[11px] font-semibold text-white hover:bg-rose-700"
              title="Permanently delete selected keys (DEL)"
            >
              <Trash2 size={11} />
              <span>Delete</span>
            </Button>
            <button
              type="button"
              disabled={isBulkDeleting}
              onClick={exitSelectionMode}
              className="flex size-6 cursor-pointer items-center justify-center rounded-md text-zinc-500 hover:bg-rose-200/50 hover:text-zinc-800 disabled:opacity-50"
              title="Cancel Selection (Esc)"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      )}

      {/* Virtualized Key List / Tree */}
      <div
        ref={parentRef}
        className="relative flex-1 overflow-y-auto"
      >
        {keys.length === 0 ? (
          <div className="flex flex-col items-center px-4 py-12 text-center text-xs text-zinc-500">
            {loading ? (
              <div className="flex flex-col items-center gap-2">
                <RefreshCw size={18} className="animate-spin text-rose-600" />
                <p className="font-medium text-zinc-700">Scanning keys...</p>
              </div>
            ) : (
              <>
                <KeyIcon size={24} className="mb-2 text-zinc-300" />
                <p className="font-semibold text-zinc-800">No keys found.</p>
                <p className="mt-1 max-w-45 text-zinc-500">
                  Try changing your pattern or select another database.
                </p>
              </>
            )}
          </div>
        ) : (
          <div
            className="relative w-full"
            style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              if (viewMode === "tree") {
                const item = treeItems[virtualRow.index];
                if (!item) return null;

                if (item.type === "folder") {
                  const descendantKeys = selectionMode
                    ? folderKeysMap.get(item.fullPath) || []
                    : [];
                  const checkedInFolder = selectionMode
                    ? descendantKeys.filter((k) => checkedKeys.has(k)).length
                    : 0;
                  const isFolderAllChecked =
                    selectionMode &&
                    descendantKeys.length > 0 &&
                    checkedInFolder === descendantKeys.length;
                  const isFolderPartial =
                    selectionMode &&
                    checkedInFolder > 0 &&
                    checkedInFolder < descendantKeys.length;

                  return (
                    <div
                      key={item.id}
                      onClick={() => toggleFolder(item.fullPath)}
                      className="group absolute top-0 left-0 flex w-full cursor-pointer items-center justify-between border-b border-zinc-50 px-2 text-xs transition-colors select-none hover:bg-zinc-100/70"
                      style={{
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                        paddingLeft: `${Math.min(item.depth * 14 + 10, 80)}px`,
                      }}
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
                        {selectionMode && !readOnly && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleFolderSelection(item.fullPath);
                            }}
                            className="flex shrink-0 cursor-pointer items-center justify-center text-zinc-400 hover:text-rose-600"
                            title="Select all keys in folder"
                          >
                            {isFolderAllChecked ? (
                              <CheckSquare size={13} className="text-rose-600" />
                            ) : isFolderPartial ? (
                              <MinusSquare size={13} className="text-rose-600" />
                            ) : (
                              <Square size={13} />
                            )}
                          </button>
                        )}
                        <span className="text-zinc-400 transition-colors group-hover:text-zinc-700">
                          {item.isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        </span>
                        {item.isExpanded ? (
                          <FolderOpen size={14} className="shrink-0 text-rose-500" />
                        ) : (
                          <Folder size={14} className="shrink-0 text-amber-500" />
                        )}
                        <span className="truncate text-xs font-semibold text-zinc-800">
                          {item.name}
                        </span>
                      </div>
                      <span className="mr-1 shrink-0 rounded bg-zinc-100 px-1.5 py-px font-mono text-[10px] text-zinc-400">
                        {item.count}
                      </span>
                    </div>
                  );
                }

                // Leaf key in Tree Mode
                const keyInfo = item.keyInfo!;
                const isSelected = selectedKey === keyInfo.key;
                const isChecked = checkedKeys.has(keyInfo.key);

                return (
                  <div
                    key={item.id}
                    onClick={(e) => {
                      if (!readOnly && (selectionMode || e.metaKey || e.ctrlKey)) {
                        if (!selectionMode) setSelectionMode(true);
                        toggleKeySelection(keyInfo.key);
                      } else {
                        onSelectKey(keyInfo.key, currentDb);
                      }
                    }}
                    className={`group absolute top-0 left-0 flex w-full cursor-pointer items-center justify-between border-b border-zinc-50 px-2 text-xs transition-colors ${
                      isChecked
                        ? "bg-rose-50/80 font-medium text-rose-950"
                        : isSelected
                          ? "border-l-2 border-l-rose-600 bg-rose-50/90 font-medium text-rose-950"
                          : "text-zinc-700 hover:bg-zinc-50/80"
                    }`}
                    style={{
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                      paddingLeft: `${Math.min(item.depth * 14 + 20, 90)}px`,
                    }}
                  >
                    <div className="mr-1.5 flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
                      {selectionMode && !readOnly && (
                        <span className="flex shrink-0 items-center justify-center">
                          {isChecked ? (
                            <CheckSquare size={13} className="text-rose-600" />
                          ) : (
                            <Square size={13} className="text-zinc-400 group-hover:text-zinc-600" />
                          )}
                        </span>
                      )}
                      <span
                        className={`shrink-0 rounded border px-1 py-px font-mono text-[9px] font-bold uppercase ${getTypeBadgeClass(
                          keyInfo.type
                        )}`}
                      >
                        {getTypeShortName(keyInfo.type)}
                      </span>
                      <span
                        className={`truncate font-mono text-xs ${
                          isSelected || isChecked ? "font-bold text-rose-900" : "text-zinc-800"
                        }`}
                        title={
                          keyInfo.ttl > 0
                            ? `${keyInfo.key} (TTL: ${keyInfo.ttl}s)`
                            : keyInfo.key
                        }
                      >
                        {item.name}
                      </span>
                    </div>

                    <div className="flex shrink-0 items-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(keyInfo.key);
                        }}
                        className="cursor-pointer rounded p-1 text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-zinc-200/60 hover:text-zinc-700"
                        title="Copy Key Name"
                      >
                        <Copy size={11} />
                      </button>
                    </div>
                  </div>
                );
              }

              // Flat List Mode with Segmented Key Display
              const item = keys[virtualRow.index];
              const isSelected = selectedKey === item.key;
              const isChecked = checkedKeys.has(item.key);

              return (
                <div
                  key={item.key}
                  onClick={(e) => {
                    if (!readOnly && (selectionMode || e.metaKey || e.ctrlKey)) {
                      if (!selectionMode) setSelectionMode(true);
                      toggleKeySelection(item.key);
                    } else {
                      onSelectKey(item.key, currentDb);
                    }
                  }}
                  className={`group absolute top-0 left-0 flex w-full cursor-pointer items-center justify-between border-b border-zinc-100 px-3 text-xs transition-colors ${
                    isChecked
                      ? "bg-rose-50/80 font-medium text-rose-950"
                      : isSelected
                        ? "border-l-2 border-l-rose-600 bg-rose-50/90 font-medium text-rose-950"
                        : "text-zinc-700 hover:bg-zinc-50/80"
                  }`}
                  style={{
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <div className="mr-1.5 flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
                    {selectionMode && !readOnly && (
                      <span className="flex shrink-0 items-center justify-center">
                        {isChecked ? (
                          <CheckSquare size={13} className="text-rose-600" />
                        ) : (
                          <Square size={13} className="text-zinc-400 group-hover:text-zinc-600" />
                        )}
                      </span>
                    )}
                    <span
                      className={`shrink-0 rounded border px-1.5 py-px font-mono text-[9px] font-bold uppercase ${getTypeBadgeClass(
                        item.type
                      )}`}
                    >
                      {getTypeShortName(item.type)}
                    </span>

                    {/* Segmented Namespace vs Key */}
                    <span
                      className="truncate font-mono text-xs"
                      title={
                        item.ttl > 0
                          ? `${item.key} (TTL: ${item.ttl}s)`
                          : item.key
                      }
                    >
                      {(() => {
                        const idx = item.key.lastIndexOf(":");
                        if (idx === -1) {
                          return (
                            <span
                              className={
                                isSelected || isChecked
                                  ? "font-bold text-rose-900"
                                  : "font-semibold text-zinc-800"
                              }
                            >
                              {item.key}
                            </span>
                          );
                        }
                        const prefix = item.key.substring(0, idx + 1);
                        const leafName = item.key.substring(idx + 1);
                        return (
                          <>
                            <span className="font-normal text-zinc-400">{prefix}</span>
                            <span
                              className={
                                isSelected || isChecked
                                  ? "font-bold text-rose-900"
                                  : "font-semibold text-zinc-800"
                              }
                            >
                              {leafName}
                            </span>
                          </>
                        );
                      })()}
                    </span>
                  </div>

                  <div className="flex shrink-0 items-center">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(item.key);
                      }}
                      className="cursor-pointer rounded p-1 text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-zinc-200/60 hover:text-zinc-700"
                      title="Copy Key Name"
                    >
                      <Copy size={11} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Scan Next Batch */}
      {cursor > 0 && (
        <div className="shrink-0 border-t border-zinc-200 bg-zinc-50/60 p-2 text-center">
          <Button
            onClick={() => fetchKeys(cursor, false)}
            disabled={loading}
            variant="default"
            size="sm"
            className="h-8 w-full text-xs font-semibold shadow-xs"
          >
            {loading ? "Scanning..." : "Scan Next Batch"}
          </Button>
        </div>
      )}

      {/* Add Key Modal */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs duration-150 animate-in fade-in"
          onClick={() => !isCreatingKey && setShowAddModal(false)}
        >
          <div
            className="w-full max-w-md transform space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl transition-all duration-150 scale-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
              <div className="flex items-center gap-2">
                <div className="flex size-7 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-600">
                  <Plus size={14} />
                </div>
                <h3 className="text-sm font-bold text-zinc-900">
                  Create New Key
                </h3>
              </div>
              <button
                disabled={isCreatingKey}
                onClick={() => setShowAddModal(false)}
                className="flex size-6 cursor-pointer items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-50"
              >
                <X size={14} />
              </button>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">Key Name</label>
                <Input
                  type="text"
                  placeholder="e.g. user:1001 or cache:stats"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  className="h-9 font-mono text-xs"
                  autoFocus
                  disabled={isCreatingKey}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleCreateKey()}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">Data Type</label>
                <div className="relative">
                  <select
                    value={newKeyType}
                    onChange={(e) => setNewKeyType(e.target.value)}
                    disabled={isCreatingKey}
                    className="flex h-9 w-full cursor-pointer rounded-lg border border-zinc-200 bg-white py-1.5 pr-8 pl-3 font-sans text-xs text-zinc-800 focus:border-rose-500 focus:outline-none"
                  >
                    <option value="string" className="bg-white text-zinc-900">String (Plain text / JSON / binary)</option>
                    <option value="hash" className="bg-white text-zinc-900">Hash (Map of field-value pairs)</option>
                    <option value="list" className="bg-white text-zinc-900">List (Ordered sequence of elements)</option>
                    <option value="set" className="bg-white text-zinc-900">Set (Unique unordered collection)</option>
                    <option value="zset" className="bg-white text-zinc-900">Sorted Set (Scored unique members)</option>
                    <option value="stream" className="bg-white text-zinc-900">Stream (Append-only message log)</option>
                    <option value="json" className="bg-white text-zinc-900">JSON (Native RedisJSON document)</option>
                  </select>
                  <ChevronDown
                    size={13}
                    className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-zinc-400"
                  />
                </div>
              </div>

              {/* Dynamic Value Input Depending on Type */}
              {newKeyType === "string" && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-700">
                    Value <span className="font-normal text-zinc-400">(optional)</span>
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Enter initial string value or leave blank..."
                    value={newStringValue}
                    onChange={(e) => setNewStringValue(e.target.value)}
                    disabled={isCreatingKey}
                    className="flex w-full resize-none rounded-lg border border-zinc-200 bg-white px-3 py-2 font-mono text-xs text-zinc-900 focus:border-rose-500 focus:outline-none"
                  />
                </div>
              )}

              {newKeyType === "hash" && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-700">Initial Field</label>
                    <Input
                      type="text"
                      placeholder="field"
                      value={newHashField}
                      onChange={(e) => setNewHashField(e.target.value)}
                      disabled={isCreatingKey}
                      className="h-9 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-700">Initial Value</label>
                    <Input
                      type="text"
                      placeholder="value"
                      value={newHashValue}
                      onChange={(e) => setNewHashValue(e.target.value)}
                      disabled={isCreatingKey}
                      className="h-9 font-mono text-xs"
                    />
                  </div>
                </div>
              )}

              {newKeyType === "list" && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-700">Initial Element</label>
                  <Input
                    type="text"
                    placeholder="item"
                    value={newListItem}
                    onChange={(e) => setNewListItem(e.target.value)}
                    disabled={isCreatingKey}
                    className="h-9 font-mono text-xs"
                  />
                </div>
              )}

              {newKeyType === "set" && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-700">Initial Member</label>
                  <Input
                    type="text"
                    placeholder="member"
                    value={newSetMember}
                    onChange={(e) => setNewSetMember(e.target.value)}
                    disabled={isCreatingKey}
                    className="h-9 font-mono text-xs"
                  />
                </div>
              )}

              {newKeyType === "zset" && (
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-1">
                    <label className="mb-1 block text-xs font-medium text-zinc-700">Score</label>
                    <Input
                      type="number"
                      step="any"
                      placeholder="1"
                      value={newZSetScore}
                      onChange={(e) => setNewZSetScore(e.target.value)}
                      disabled={isCreatingKey}
                      className="h-9 font-mono text-xs"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="mb-1 block text-xs font-medium text-zinc-700">Member</label>
                    <Input
                      type="text"
                      placeholder="member"
                      value={newZSetMember}
                      onChange={(e) => setNewZSetMember(e.target.value)}
                      disabled={isCreatingKey}
                      className="h-9 font-mono text-xs"
                    />
                  </div>
                </div>
              )}

              {newKeyType === "stream" && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-700">
                    Initial Payload <span className="font-normal text-zinc-400">(JSON object)</span>
                  </label>
                  <textarea
                    rows={2}
                    placeholder='{"sensor": "temp", "val": 24.5}'
                    value={newStreamPayload}
                    onChange={(e) => setNewStreamPayload(e.target.value)}
                    disabled={isCreatingKey}
                    className="flex w-full resize-none rounded-lg border border-zinc-200 bg-white px-3 py-2 font-mono text-xs text-zinc-900 focus:border-rose-500 focus:outline-none"
                  />
                </div>
              )}

              {newKeyType === "json" && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-700">
                    Initial JSON Document
                  </label>
                  <textarea
                    rows={3}
                    placeholder="{}"
                    value={newJsonValue}
                    onChange={(e) => setNewJsonValue(e.target.value)}
                    disabled={isCreatingKey}
                    className="flex w-full resize-none rounded-lg border border-zinc-200 bg-white px-3 py-2 font-mono text-xs text-zinc-900 focus:border-rose-500 focus:outline-none"
                  />
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">
                  TTL in Seconds <span className="font-normal text-zinc-400">(optional, persistent if empty)</span>
                </label>
                <Input
                  type="number"
                  min="1"
                  placeholder="-1 (No expiration)"
                  value={newKeyTTL}
                  onChange={(e) => setNewKeyTTL(e.target.value)}
                  disabled={isCreatingKey}
                  className="h-9 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-zinc-100 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isCreatingKey}
                  onClick={() => setShowAddModal(false)}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  disabled={isCreatingKey || !newKeyName.trim()}
                  onClick={handleCreateKey}
                  className="gap-1.5 text-xs font-semibold"
                >
                  {isCreatingKey ? (
                    <RefreshCw size={13} className="animate-spin" />
                  ) : (
                    <Plus size={13} />
                  )}
                  <span>Create Key</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete / Unlink Confirmation Modal */}
      <ConfirmModal
        isOpen={bulkDeleteModal.isOpen}
        title={
          bulkDeleteModal.isHard
            ? `Delete ${checkedKeys.size} ${checkedKeys.size === 1 ? "Key" : "Keys"} Permanently`
            : `Unlink ${checkedKeys.size} ${checkedKeys.size === 1 ? "Key" : "Keys"}`
        }
        description={
          bulkDeleteModal.isHard
            ? `Are you sure you want to permanently delete ${checkedKeys.size} selected ${
                checkedKeys.size === 1 ? "key" : "keys"
              }? This synchronous DEL operation cannot be undone.`
            : `Are you sure you want to unlink ${checkedKeys.size} selected ${
                checkedKeys.size === 1 ? "key" : "keys"
              }? This will asynchronously reclaim memory in the background using UNLINK.`
        }
        confirmText={
          bulkDeleteModal.isHard
            ? `Delete ${checkedKeys.size} ${checkedKeys.size === 1 ? "Key" : "Keys"}`
            : `Unlink ${checkedKeys.size} ${checkedKeys.size === 1 ? "Key" : "Keys"}`
        }
        cancelText="Cancel"
        variant="danger"
        onConfirm={handleConfirmBulkDelete}
        onCancel={() => setBulkDeleteModal({ isOpen: false, isHard: false })}
      />

      {/* Drag Resize Handle */}
      <div
        onMouseDown={handleMouseDown}
        onDoubleClick={() => {
          setSidebarWidth(340);
          try {
            localStorage.setItem("memspace:explorer-width", "340");
          } catch {
            // ignore storage errors
          }
        }}
        title="Drag to resize sidebar (double-click to reset)"
        className={`absolute top-0 right-0 z-20 h-full w-1.5 cursor-col-resize transition-colors hover:bg-rose-500/40 ${
          isResizing ? "bg-rose-500" : "bg-transparent"
        }`}
      />
    </div>
  );
};
