import React, { useState, useEffect } from "react";
import {
  Server,
  Key,
  Terminal as TermIcon,
  Activity,
  Radio,
  Shield,
  Clock,
  Wifi,
  WifiOff,
  AlertTriangle
} from "lucide-react";
import { Events } from "@wailsio/runtime";
import type { ConnectionConfig, ConnectionStatus } from "../bindings/redisian/backend/models/index.js";
import { ConnectionService } from "../bindings/redisian/backend/services/index.js";
import { ConnectionList } from "./features/connections/ConnectionList";
import { ConnectionDialog } from "./features/connections/ConnectionDialog";
import { KeyExplorer } from "./features/explorer/KeyExplorer";
import { KeyValueViewer } from "./features/editors/KeyValueViewer";
import { Terminal } from "./features/terminal/Terminal";
import { ServerMetricsDashboard } from "./features/diagnostics/ServerMetricsDashboard";
import { PubSubDebugger } from "./features/pubsub/PubSubDebugger";

export default function App() {
  const [connections, setConnections] = useState<ConnectionConfig[]>([]);
  const [activeConnId, setActiveConnId] = useState<string | null>(null);
  const [activeStatus, setActiveStatus] = useState<ConnectionStatus | null>(null);
  const [currentDb, setCurrentDb] = useState(0);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<ConnectionConfig | null>(null);

  // Active Main Tab: "explorer" | "terminal" | "diagnostics" | "pubsub"
  const [activeTab, setActiveTab] = useState<"explorer" | "terminal" | "diagnostics" | "pubsub">("explorer");

  // Key Selection
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // Time from Wails background event
  const [systemTime, setSystemTime] = useState("");

  const activeConnection = connections.find((c) => c.id === activeConnId);

  const loadConnections = async () => {
    try {
      const list = await ConnectionService.GetConnections();
      setConnections(list || []);
    } catch (err) {
      console.error("Failed to load connections:", err);
    }
  };

  useEffect(() => {
    loadConnections();

    // Listen to time event emitted from main.go
    const cancelTime = Events.On("time", (timeValue: any) => {
      setSystemTime(timeValue.data || String(timeValue));
    });

    return () => {
      cancelTime();
    };
  }, []);

  const handleConnect = async (id: string) => {
    try {
      const status = await ConnectionService.Connect(id);
      setActiveConnId(id);
      setActiveStatus(status);
      setSelectedKey(null);
    } catch (err: any) {
      alert("Failed to connect: " + (err?.message || err));
    }
  };

  const handleDisconnect = async (id: string) => {
    try {
      await ConnectionService.Disconnect(id);
      if (activeConnId === id) {
        setActiveConnId(null);
        setActiveStatus(null);
        setSelectedKey(null);
      }
    } catch (err: any) {
      alert("Failed to disconnect: " + (err?.message || err));
    }
  };

  const handleOpenAdd = () => {
    setEditingConfig(null);
    setDialogOpen(true);
  };

  const handleOpenEdit = (cfg: ConnectionConfig) => {
    setEditingConfig(cfg);
    setDialogOpen(true);
  };

  return (
    <div className="app-container">
      {/* 1. Left Sidebar: Connections List */}
      <ConnectionList
        connections={connections}
        activeConnId={activeConnId}
        activeStatus={activeStatus}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
        onEdit={handleOpenEdit}
        onAddNew={handleOpenAdd}
        onRefresh={loadConnections}
      />

      {/* 2. Main Content Area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
        {/* Safety Header / Active Server Banner */}
        {activeConnection ? (
          <>
            {(() => {
              const isProd = activeConnection.group?.toLowerCase().includes("prod");
              const isReadOnly = activeConnection.readOnly;
              if (!isProd && !isReadOnly) return null;

              return (
                <div style={{
                  backgroundColor: isProd ? "#7f1d1d" : "#1e293b",
                  color: isProd ? "#fecaca" : "#93c5fd",
                  padding: "0.25rem 1rem",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  letterSpacing: "0.03em",
                  borderBottom: "1px solid rgba(255,255,255,0.1)",
                }}>
                  <AlertTriangle size={14} color={isProd ? "#f87171" : "#60a5fa"} />
                  <span>
                    {isProd && isReadOnly
                      ? "PRODUCTION ENVIRONMENT (READ-ONLY MODE) — WRITE COMMANDS BLOCKED."
                      : isProd
                      ? "WARNING: CONNECTED TO PRODUCTION REDIS INSTANCE. PROCEED WITH CAUTION."
                      : "READ-ONLY MODE ENABLED — WRITE AND MUTATION COMMANDS ARE BLOCKED."}
                  </span>
                </div>
              );
            })()}

            <div style={{
              height: "52px",
              padding: "0 1.25rem",
              backgroundColor: "#111827",
              borderBottom: "1px solid #1f2937",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              boxSizing: "border-box",
            }}>
              {/* Active Connection Title & Badges */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <div style={{
                  width: "10px",
                  height: "10px",
                  borderRadius: "50%",
                  backgroundColor: activeStatus?.connected ? "#10b981" : "#ef4444",
                  boxShadow: activeStatus?.connected ? "0 0 8px #10b981" : "none",
                }} />
                <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "#f3f4f6" }}>
                  {activeConnection.name}
                </span>

                <span style={{ fontSize: "0.75rem", color: "#9ca3af" }}>
                  ({activeConnection.host}:{activeConnection.port})
                </span>

                {activeStatus?.serverVersion && (
                  <span style={{
                    fontSize: "0.7rem",
                    padding: "0.15rem 0.4rem",
                    backgroundColor: "#1e293b",
                    borderRadius: "4px",
                    color: "#94a3b8",
                  }}>
                    v{activeStatus.serverVersion}
                  </span>
                )}

                {activeConnection.readOnly && (
                  <span style={{
                    fontSize: "0.7rem",
                    padding: "0.15rem 0.4rem",
                    backgroundColor: "rgba(239, 68, 68, 0.2)",
                    border: "1px solid rgba(239, 68, 68, 0.4)",
                    borderRadius: "4px",
                    color: "#f87171",
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    gap: "0.2rem",
                  }}>
                    <Shield size={11} /> Read-Only
                  </span>
                )}
              </div>

              {/* Navigation Tabs */}
              <div style={{
                display: "flex",
                backgroundColor: "#0d131f",
                borderRadius: "0.375rem",
                padding: "0.2rem",
                border: "1px solid #1f2937",
                gap: "0.2rem",
              }}>
                <button
                  onClick={() => setActiveTab("explorer")}
                  style={{
                    padding: "0.3rem 0.75rem",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    borderRadius: "0.25rem",
                    border: "none",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.35rem",
                    backgroundColor: activeTab === "explorer" ? "#2563eb" : "transparent",
                    color: activeTab === "explorer" ? "white" : "#9ca3af",
                  }}
                >
                  <Key size={13} />
                  <span>Key Explorer</span>
                </button>

                <button
                  onClick={() => setActiveTab("terminal")}
                  style={{
                    padding: "0.3rem 0.75rem",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    borderRadius: "0.25rem",
                    border: "none",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.35rem",
                    backgroundColor: activeTab === "terminal" ? "#2563eb" : "transparent",
                    color: activeTab === "terminal" ? "white" : "#9ca3af",
                  }}
                >
                  <TermIcon size={13} />
                  <span>Terminal CLI</span>
                </button>

                <button
                  onClick={() => setActiveTab("diagnostics")}
                  style={{
                    padding: "0.3rem 0.75rem",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    borderRadius: "0.25rem",
                    border: "none",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.35rem",
                    backgroundColor: activeTab === "diagnostics" ? "#2563eb" : "transparent",
                    color: activeTab === "diagnostics" ? "white" : "#9ca3af",
                  }}
                >
                  <Activity size={13} />
                  <span>Diagnostics</span>
                </button>

                <button
                  onClick={() => setActiveTab("pubsub")}
                  style={{
                    padding: "0.3rem 0.75rem",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    borderRadius: "0.25rem",
                    border: "none",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.35rem",
                    backgroundColor: activeTab === "pubsub" ? "#2563eb" : "transparent",
                    color: activeTab === "pubsub" ? "white" : "#9ca3af",
                  }}
                >
                  <Radio size={13} />
                  <span>Pub / Sub</span>
                </button>
              </div>
            </div>

            {/* Main Tab Views */}
            <div style={{ flex: 1, overflow: "hidden", display: "flex" }}>
              {activeTab === "explorer" && (
                <div style={{ display: "flex", width: "100%", height: "100%" }}>
                  <KeyExplorer
                    connId={activeConnection.id}
                    clusterMode={activeConnection.type === "cluster"}
                    readOnly={activeConnection.readOnly}
                    selectedKey={selectedKey}
                    onSelectKey={(k, db) => {
                      setSelectedKey(k);
                      setCurrentDb(db);
                    }}
                    onKeyDeleted={() => setSelectedKey(null)}
                  />
                  {selectedKey ? (
                    <KeyValueViewer
                      connId={activeConnection.id}
                      db={currentDb}
                      keyName={selectedKey}
                      readOnly={activeConnection.readOnly}
                      onKeyDeleted={() => setSelectedKey(null)}
                      onKeyRenamed={(newKey) => setSelectedKey(newKey)}
                    />
                  ) : (
                    <div style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#6b7280",
                      gap: "0.75rem",
                      backgroundColor: "#090d16",
                    }}>
                      <Key size={40} style={{ opacity: 0.2 }} />
                      <p style={{ fontSize: "0.875rem" }}>Select a key on the left to inspect and edit its value.</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "terminal" && (
                <Terminal
                  connId={activeConnection.id}
                  db={currentDb}
                  host={activeConnection.host}
                  port={activeConnection.port}
                />
              )}

              {activeTab === "diagnostics" && (
                <div style={{ width: "100%", height: "100%" }}>
                  <ServerMetricsDashboard connId={activeConnection.id} />
                </div>
              )}

              {activeTab === "pubsub" && (
                <div style={{ width: "100%", height: "100%" }}>
                  <PubSubDebugger connId={activeConnection.id} />
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            {/* Persistent Top Header when No Server is Connected */}
            <div style={{
              height: "52px",
              padding: "0 1.25rem",
              backgroundColor: "#111827",
              borderBottom: "1px solid #1f2937",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              boxSizing: "border-box",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", color: "#9ca3af", fontSize: "0.8125rem" }}>
                <Server size={15} style={{ opacity: 0.6 }} />
                <span>Workspace</span>
                <span style={{ opacity: 0.4 }}>/</span>
                <span style={{ color: "#6b7280" }}>No Active Server</span>
              </div>
              <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                Press <kbd style={{ padding: "0.15rem 0.35rem", backgroundColor: "#1f2937", borderRadius: "3px", border: "1px solid #374151", color: "#e2e8f0" }}>+ New</kbd> to add a Redis connection
              </div>
            </div>

            <div style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: "#6b7280",
              gap: "1rem",
              backgroundColor: "#090d16",
            }}>
              <Server size={48} style={{ opacity: 0.3 }} />
              <h3 style={{ fontSize: "1.125rem", color: "#f3f4f6", fontWeight: 600 }}>No Server Selected</h3>
              <p style={{ fontSize: "0.875rem", maxWidth: "380px", textAlign: "center" }}>
                Select an existing Redis connection from the sidebar, or configure a new connection to get started.
              </p>
              <button onClick={handleOpenAdd} className="btn-primary" style={{ marginTop: "0.5rem" }}>
                Add Redis Connection
              </button>
            </div>
          </>
        )}

        {/* Global Status Footer */}
        <div style={{
          height: "28px",
          backgroundColor: "#090d16",
          borderTop: "1px solid #1f2937",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 1rem",
          fontSize: "0.75rem",
          color: "#6b7280",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
              {activeStatus?.connected ? <Wifi size={12} color="#10b981" /> : <WifiOff size={12} color="#6b7280" />}
              <span>{activeStatus?.connected ? "Connected" : "Disconnected"}</span>
            </span>

            {activeStatus?.latencyMs !== undefined && (
              <span>Latency: <strong style={{ color: "#38bdf8" }}>{activeStatus.latencyMs} ms</strong></span>
            )}

            {activeConnection && (
              <span>DB: <strong style={{ color: "#e2e8f0" }}>{currentDb}</strong></span>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <span>Redisian Desktop v1.0.0</span>
            {systemTime && (
              <span style={{ display: "flex", alignItems: "center", gap: "0.25rem", color: "#9ca3af" }}>
                <Clock size={11} />
                <span>{systemTime}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Add / Edit Connection Dialog */}
      <ConnectionDialog
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSaved={loadConnections}
        initialConfig={editingConfig}
      />
    </div>
  );
}
