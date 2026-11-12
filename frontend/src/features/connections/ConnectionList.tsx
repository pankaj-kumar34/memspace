import React, { useState } from "react";
import { Plus, Server, Power, PowerOff, Edit2, Trash2, Shield, Folder } from "lucide-react";
import type { ConnectionConfig, ConnectionStatus } from "../../../bindings/redisian/backend/models/index.js";
import { ConnectionService } from "../../../bindings/redisian/backend/services/index.js";

interface ConnectionListProps {
  connections: ConnectionConfig[];
  activeConnId: string | null;
  activeStatus: ConnectionStatus | null;
  onConnect: (id: string) => void;
  onDisconnect: (id: string) => void;
  onEdit: (cfg: ConnectionConfig) => void;
  onAddNew: () => void;
  onRefresh: () => void;
}

export const ConnectionList: React.FC<ConnectionListProps> = ({
  connections,
  activeConnId,
  activeStatus,
  onConnect,
  onDisconnect,
  onEdit,
  onAddNew,
  onRefresh,
}) => {
  const [searchTerm, setSearchTerm] = useState("");

  const filtered = connections.filter(
    (c) =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.host.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.group.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Group connections by environment
  const grouped = filtered.reduce<Record<string, ConnectionConfig[]>>((acc, conn) => {
    const grp = conn.group || "Other";
    if (!acc[grp]) acc[grp] = [];
    acc[grp].push(conn);
    return acc;
  }, {});

  const handleDelete = async (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete connection "${name}"?`)) {
      try {
        await ConnectionService.DeleteConnection(id);
        onRefresh();
      } catch (err: any) {
        alert("Failed to delete connection: " + (err?.message || err));
      }
    }
  };

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      backgroundColor: "#0d131f",
      borderRight: "1px solid #1f2937",
      width: "280px",
      minWidth: "240px",
    }}>
      {/* Header */}
      <div style={{
        height: "52px",
        padding: "0 1rem",
        borderBottom: "1px solid #1f2937",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        boxSizing: "border-box",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <div style={{
            width: "24px",
            height: "24px",
            borderRadius: "6px",
            backgroundColor: "#ef4444",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: "bold",
            color: "white",
            fontSize: "14px"
          }}>
            R
          </div>
          <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "#f3f4f6", letterSpacing: "0.02em" }}>
            Redisian
          </span>
        </div>

        <button
          onClick={onAddNew}
          className="btn-primary"
          style={{ padding: "0.3rem 0.6rem", fontSize: "0.8125rem" }}
          title="Add New Redis Connection"
        >
          <Plus size={15} />
          <span>New</span>
        </button>
      </div>

      {/* Filter bar */}
      <div style={{ padding: "0.75rem 1rem", borderBottom: "1px solid #1f2937" }}>
        <input
          type="text"
          placeholder="Filter servers..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="input-dark"
          style={{ width: "100%", fontSize: "0.8125rem", padding: "0.35rem 0.6rem" }}
        />
      </div>

      {/* Connection Tree / Groups */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0.5rem 0.5rem" }}>
        {Object.keys(grouped).length === 0 ? (
          <div style={{ textAlign: "center", padding: "2rem 1rem", color: "#6b7280", fontSize: "0.875rem" }}>
            <Server size={32} style={{ margin: "0 auto 0.5rem auto", opacity: 0.4 }} />
            <p>No connections configured.</p>
            <button
              onClick={onAddNew}
              className="btn-secondary"
              style={{ marginTop: "0.75rem", fontSize: "0.8125rem" }}
            >
              <Plus size={14} /> Add Redis Connection
            </button>
          </div>
        ) : (
          Object.entries(grouped).map(([groupName, conns]) => (
            <div key={groupName} style={{ marginBottom: "1rem" }}>
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "0.35rem",
                padding: "0.25rem 0.5rem",
                color: "#9ca3af",
                fontSize: "0.75rem",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}>
                <Folder size={13} />
                <span>{groupName}</span>
                <span style={{ marginLeft: "auto", opacity: 0.7 }}>({conns.length})</span>
              </div>

              {conns.map((conn) => {
                const isConnected = activeConnId === conn.id && activeStatus?.connected;
                return (
                  <div
                    key={conn.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "0.5rem 0.6rem",
                      borderRadius: "0.375rem",
                      margin: "0.15rem 0",
                      backgroundColor: activeConnId === conn.id ? "rgba(59, 130, 246, 0.15)" : "transparent",
                      borderLeft: `3px solid ${conn.color || "#3b82f6"}`,
                      cursor: "pointer",
                      transition: "background-color 0.1s ease",
                    }}
                    onClick={() => {
                      if (!isConnected) {
                        onConnect(conn.id);
                      }
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", gap: "0.15rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                        <span style={{
                          fontWeight: 500,
                          fontSize: "0.875rem",
                          color: activeConnId === conn.id ? "#93c5fd" : "#f3f4f6",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}>
                          {conn.name}
                        </span>
                        {conn.readOnly && (
                          <span title="Read-Only Mode Enabled">
                            <Shield size={12} color="#ef4444" />
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                        {conn.host}:{conn.port} ({conn.type})
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                      {isConnected ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDisconnect(conn.id);
                          }}
                          style={{
                            background: "none",
                            border: "none",
                            color: "#10b981",
                            cursor: "pointer",
                            padding: "0.2rem",
                          }}
                          title="Disconnect"
                        >
                          <Power size={16} />
                        </button>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onConnect(conn.id);
                          }}
                          style={{
                            background: "none",
                            border: "none",
                            color: "#6b7280",
                            cursor: "pointer",
                            padding: "0.2rem",
                          }}
                          title="Connect"
                        >
                          <PowerOff size={16} />
                        </button>
                      )}

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onEdit(conn);
                        }}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#6b7280",
                          cursor: "pointer",
                          padding: "0.2rem",
                        }}
                        title="Edit Connection"
                      >
                        <Edit2 size={14} />
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(conn.id, conn.name);
                        }}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#ef4444",
                          cursor: "pointer",
                          padding: "0.2rem",
                        }}
                        title="Delete Connection"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
