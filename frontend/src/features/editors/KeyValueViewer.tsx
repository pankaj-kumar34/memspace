import React, { useState, useEffect } from "react";
import {
  Clock,
  HardDrive,
  Trash2,
  RefreshCw,
  Edit2,
  Check,
  X,
  FileCode
} from "lucide-react";
import type { KeyDetails } from "../../../bindings/redisian/backend/models/index.js";
import { KeyService } from "../../../bindings/redisian/backend/services/index.js";
import { formatBytes } from "../../lib/utils";
import { StringEditor } from "./StringEditor";
import { HashEditor } from "./HashEditor";
import { ListEditor } from "./ListEditor";
import { SetEditor } from "./SetEditor";
import { ZSetEditor } from "./ZSetEditor";
import { StreamEditor } from "./StreamEditor";
import { JsonEditor } from "./JsonEditor";

interface KeyValueViewerProps {
  connId: string;
  db: number;
  keyName: string;
  readOnly?: boolean;
  onKeyDeleted: () => void;
  onKeyRenamed: (newKey: string) => void;
}

export const KeyValueViewer: React.FC<KeyValueViewerProps> = ({
  connId,
  db,
  keyName,
  readOnly = false,
  onKeyDeleted,
  onKeyRenamed,
}) => {
  const [details, setDetails] = useState<KeyDetails | null>(null);
  const [loading, setLoading] = useState(false);

  // Rename state
  const [isRenaming, setIsRenaming] = useState(false);
  const [renamedKey, setRenamedKey] = useState(keyName);

  // TTL edit state
  const [isEditingTTL, setIsEditingTTL] = useState(false);
  const [newTTL, setNewTTL] = useState<number>(-1);

  const loadKeyDetails = async () => {
    if (!connId || !keyName) return;
    setLoading(true);
    try {
      const res = await KeyService.GetKeyDetails(connId, db, keyName);
      if (res) {
        setDetails(res);
        setRenamedKey(res.key);
        setNewTTL(res.ttl);
      }
    } catch (err: any) {
      console.error("Failed to load key details:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadKeyDetails();
    setIsRenaming(false);
    setIsEditingTTL(false);
  }, [connId, db, keyName]);

  const handleDelete = async (hard = false) => {
    if (readOnly) return;
    const msg = hard
      ? `Delete key "${keyName}" permanently?`
      : `Unlink key "${keyName}" in the background?`;
    if (confirm(msg)) {
      try {
        if (hard) {
          await KeyService.DeleteKey(connId, db, keyName);
        } else {
          await KeyService.UnlinkKey(connId, db, keyName);
        }
        onKeyDeleted();
      } catch (err: any) {
        alert("Failed to delete key: " + (err?.message || err));
      }
    }
  };

  const handleSaveRename = async () => {
    if (readOnly || !renamedKey.trim() || renamedKey === keyName) return;
    try {
      await KeyService.RenameKey(connId, db, keyName, renamedKey.trim());
      setIsRenaming(false);
      onKeyRenamed(renamedKey.trim());
    } catch (err: any) {
      alert("Failed to rename key: " + (err?.message || err));
    }
  };

  const handleSaveTTL = async () => {
    if (readOnly) return;
    try {
      await KeyService.SetTTL(connId, db, keyName, newTTL);
      setIsEditingTTL(false);
      loadKeyDetails();
    } catch (err: any) {
      alert("Failed to update TTL: " + (err?.message || err));
    }
  };

  if (loading && !details) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#6b7280" }}>
        <RefreshCw size={24} className="animate-spin" />
      </div>
    );
  }

  if (!details) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#6b7280" }}>
        Select a key from the explorer to inspect its value.
      </div>
    );
  }

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      padding: "1rem",
      backgroundColor: "#0b0f19",
      flex: 1,
      overflow: "hidden",
    }}>
      {/* Header Card */}
      <div style={{
        padding: "0.85rem 1rem",
        backgroundColor: "#111827",
        border: "1px solid #1f2937",
        borderRadius: "0.5rem",
        marginBottom: "0.75rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.6rem",
      }}>
        {/* Top row: Key name and actions */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flex: 1 }}>
            <span
              className={`badge badge-${details.type.toLowerCase()}`}
              style={{
                fontSize: "0.7rem",
                padding: "0.15rem 0.45rem",
                borderRadius: "4px",
                fontWeight: 700,
                textTransform: "uppercase",
              }}
            >
              {details.type}
            </span>

            {isRenaming ? (
              <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", flex: 1, maxWidth: "450px" }}>
                <input
                  type="text"
                  value={renamedKey}
                  onChange={(e) => setRenamedKey(e.target.value)}
                  className="input-dark font-mono"
                  style={{ flex: 1, fontSize: "0.85rem", padding: "0.2rem 0.5rem" }}
                  autoFocus
                />
                <button onClick={handleSaveRename} style={{ background: "none", border: "none", color: "#10b981", cursor: "pointer" }}>
                  <Check size={16} />
                </button>
                <button onClick={() => setIsRenaming(false)} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer" }}>
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <span className="font-mono" style={{ fontSize: "1rem", fontWeight: 600, color: "#f3f4f6" }}>
                  {details.key}
                </span>
                {!readOnly && (
                  <button
                    onClick={() => setIsRenaming(true)}
                    style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer" }}
                    title="Rename Key"
                  >
                    <Edit2 size={13} />
                  </button>
                )}
              </div>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <button
              onClick={loadKeyDetails}
              className="btn-secondary"
              style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem" }}
              title="Reload Key"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            </button>

            {!readOnly && (
              <>
                <button
                  onClick={() => handleDelete(false)}
                  className="btn-secondary"
                  style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem", color: "#f87171" }}
                  title="Unlink Key (Async Del)"
                >
                  Unlink
                </button>
                <button
                  onClick={() => handleDelete(true)}
                  className="btn-danger"
                  style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem" }}
                  title="Hard Delete Key"
                >
                  <Trash2 size={13} />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Metadata info badges: TTL, Size, Encoding */}
        <div style={{ display: "flex", alignItems: "center", gap: "1.25rem", fontSize: "0.8125rem", color: "#9ca3af" }}>
          {/* TTL Badge */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
            <Clock size={14} color="#f59e0b" />
            {isEditingTTL ? (
              <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                <input
                  type="number"
                  value={newTTL}
                  onChange={(e) => setNewTTL(parseInt(e.target.value) || -1)}
                  className="input-dark font-mono"
                  style={{ width: "80px", fontSize: "0.75rem", padding: "0.15rem 0.35rem" }}
                  placeholder="-1 for never"
                />
                <button onClick={handleSaveTTL} style={{ background: "none", border: "none", color: "#10b981", cursor: "pointer" }}>
                  <Check size={14} />
                </button>
                <button onClick={() => setIsEditingTTL(false)} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer" }}>
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                <span>TTL: {details.ttl === -1 ? "No Expiration" : details.ttl === -2 ? "Expired" : `${details.ttl}s`}</span>
                {!readOnly && (
                  <button
                    onClick={() => setIsEditingTTL(true)}
                    style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer" }}
                    title="Edit TTL"
                  >
                    <Edit2 size={12} />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Size */}
          {details.size > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
              <HardDrive size={14} color="#38bdf8" />
              <span>Memory: {formatBytes(details.size)}</span>
            </div>
          )}

          {/* Encoding */}
          {details.encoding && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
              <FileCode size={14} color="#a855f7" />
              <span>Encoding: <code className="font-mono">{details.encoding}</code></span>
            </div>
          )}
        </div>
      </div>

      {/* Value Editor Container */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
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
                  initialValue={typeof details.value === "string" ? details.value : String(details.value ?? "")}
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
                  initialEntries={details.value || {}}
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
                  initialJson={typeof details.value === "string" ? details.value : JSON.stringify(details.value)}
                  readOnly={readOnly}
                  onRefresh={loadKeyDetails}
                />
              );
            default:
              return (
                <StringEditor
                  key={editorKey}
                  connId={connId}
                  db={db}
                  keyName={details.key}
                  initialValue={String(details.value ?? "")}
                  readOnly={readOnly}
                  onSaved={loadKeyDetails}
                />
              );
          }
        })()}
      </div>
    </div>
  );
};
