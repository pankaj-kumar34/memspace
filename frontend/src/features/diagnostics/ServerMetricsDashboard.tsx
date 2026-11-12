import React, { useState, useEffect } from "react";
import {
  Activity,
  HardDrive,
  Users,
  Zap,
  Server,
  RefreshCw,
  UserX
} from "lucide-react";
import type { SlowLogEntry, ClientEntry } from "../../../bindings/redisian/backend/models/index.js";
import { DiagnosticsService } from "../../../bindings/redisian/backend/services/index.js";
import { formatBytes } from "../../lib/utils";

interface ServerMetricsDashboardProps {
  connId: string;
}

export const ServerMetricsDashboard: React.FC<ServerMetricsDashboardProps> = ({ connId }) => {
  const [activeTab, setActiveTab] = useState<"overview" | "slowlog" | "clients">("overview");
  const [info, setInfo] = useState<any>({});
  const [slowLogs, setSlowLogs] = useState<SlowLogEntry[]>([]);
  const [clients, setClients] = useState<ClientEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchMetrics = async () => {
    if (!connId) return;
    setLoading(true);
    try {
      const infoData = await DiagnosticsService.GetInfo(connId);
      setInfo(infoData || {});

      if (activeTab === "slowlog") {
        const sl = await DiagnosticsService.GetSlowLog(connId, 50);
        setSlowLogs(sl || []);
      } else if (activeTab === "clients") {
        const cl = await DiagnosticsService.GetClientList(connId);
        setClients(cl || []);
      }
    } catch (err: any) {
      console.error("Failed to fetch diagnostics:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 5000);
    return () => clearInterval(interval);
  }, [connId, activeTab]);

  const handleKillClient = async (addr: string) => {
    if (confirm(`Kill client connection ${addr}?`)) {
      try {
        await DiagnosticsService.KillClient(connId, addr);
        fetchMetrics();
      } catch (err: any) {
        alert("Failed to kill client: " + (err?.message || err));
      }
    }
  };

  const mem = info["memory"] || {};
  const srv = info["server"] || {};
  const stats = info["stats"] || {};
  const clientsInfo = info["clients"] || {};

  const usedMemBytes = parseInt(mem["used_memory"] || "0", 10);
  const peakMemBytes = parseInt(mem["used_memory_peak"] || "0", 10);
  const fragRatio = parseFloat(mem["mem_fragmentation_ratio"] || "1.0");
  const opsPerSec = stats["instantaneous_ops_per_sec"] || "0";
  const connectedClients = clientsInfo["connected_clients"] || "1";
  const uptimeDays = Math.floor(parseInt(srv["uptime_in_seconds"] || "0", 10) / 86400);

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      backgroundColor: "#090d16",
      overflowY: "auto",
      padding: "1.5rem",
      gap: "1.25rem",
    }}>
      {/* Top Header & Tab switcher */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Activity size={22} color="#3b82f6" />
          <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#f3f4f6" }}>Server Diagnostics & Metrics</h2>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <div style={{
            display: "flex",
            backgroundColor: "#111827",
            borderRadius: "0.375rem",
            padding: "0.2rem",
            border: "1px solid #1f2937",
          }}>
            {(["overview", "slowlog", "clients"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: "0.3rem 0.75rem",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  borderRadius: "0.25rem",
                  border: "none",
                  cursor: "pointer",
                  backgroundColor: activeTab === tab ? "#2563eb" : "transparent",
                  color: activeTab === tab ? "white" : "#9ca3af",
                  textTransform: "capitalize",
                }}
              >
                {tab}
              </button>
            ))}
          </div>

          <button onClick={fetchMetrics} className="btn-secondary" style={{ padding: "0.3rem 0.6rem", fontSize: "0.75rem" }}>
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {activeTab === "overview" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {/* Top Key Metric Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem" }}>
            {/* Memory Card */}
            <div style={{
              backgroundColor: "#111827",
              border: "1px solid #1f2937",
              borderRadius: "0.5rem",
              padding: "1rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.35rem",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "#9ca3af", fontSize: "0.8125rem" }}>
                <span>Memory Used</span>
                <HardDrive size={16} color="#3b82f6" />
              </div>
              <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#f3f4f6" }}>
                {formatBytes(usedMemBytes)}
              </div>
              <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                Peak: {formatBytes(peakMemBytes)} (Frag: {fragRatio.toFixed(2)})
              </div>
            </div>

            {/* Throughput Card */}
            <div style={{
              backgroundColor: "#111827",
              border: "1px solid #1f2937",
              borderRadius: "0.5rem",
              padding: "1rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.35rem",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "#9ca3af", fontSize: "0.8125rem" }}>
                <span>Throughput</span>
                <Zap size={16} color="#eab308" />
              </div>
              <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#f3f4f6" }}>
                {opsPerSec}
              </div>
              <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                Operations / second
              </div>
            </div>

            {/* Connected Clients */}
            <div style={{
              backgroundColor: "#111827",
              border: "1px solid #1f2937",
              borderRadius: "0.5rem",
              padding: "1rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.35rem",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "#9ca3af", fontSize: "0.8125rem" }}>
                <span>Clients</span>
                <Users size={16} color="#10b981" />
              </div>
              <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#f3f4f6" }}>
                {connectedClients}
              </div>
              <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                Active client connections
              </div>
            </div>

            {/* Server Info */}
            <div style={{
              backgroundColor: "#111827",
              border: "1px solid #1f2937",
              borderRadius: "0.5rem",
              padding: "1rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.35rem",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "#9ca3af", fontSize: "0.8125rem" }}>
                <span>Redis Server</span>
                <Server size={16} color="#a855f7" />
              </div>
              <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#f3f4f6" }}>
                v{srv["redis_version"] || "Unknown"}
              </div>
              <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                Uptime: {uptimeDays} days (Role: {info["replication"]?.["role"] || "master"})
              </div>
            </div>
          </div>

          {/* Detailed INFO Sections Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            {["server", "memory", "stats", "replication"].map((sec) => {
              const secData = info[sec] || {};
              return (
                <div
                  key={sec}
                  style={{
                    backgroundColor: "#111827",
                    border: "1px solid #1f2937",
                    borderRadius: "0.5rem",
                    padding: "1rem",
                  }}
                >
                  <h3 style={{
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    color: "#93c5fd",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    marginBottom: "0.75rem",
                    borderBottom: "1px solid #1f2937",
                    paddingBottom: "0.4rem",
                  }}>
                    {sec} Metrics
                  </h3>

                  <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", fontSize: "0.8125rem" }}>
                    {Object.entries(secData).slice(0, 8).map(([k, v]) => (
                      <div key={k} style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: "#9ca3af" }} className="font-mono">{k}</span>
                        <span style={{ color: "#f3f4f6", fontWeight: 500 }} className="font-mono">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === "slowlog" && (
        <div style={{
          backgroundColor: "#111827",
          border: "1px solid #1f2937",
          borderRadius: "0.5rem",
          padding: "1rem",
        }}>
          <h3 style={{ fontSize: "0.95rem", fontWeight: 600, color: "#f3f4f6", marginBottom: "0.75rem" }}>
            Recent Slow Operations (SLOWLOG GET)
          </h3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
              <thead>
                <tr style={{ backgroundColor: "#0d131f", color: "#9ca3af", textAlign: "left", borderBottom: "1px solid #1f2937" }}>
                  <th style={{ padding: "0.5rem 0.75rem", width: "70px" }}>ID</th>
                  <th style={{ padding: "0.5rem 0.75rem", width: "160px" }}>Timestamp</th>
                  <th style={{ padding: "0.5rem 0.75rem", width: "110px" }}>Duration</th>
                  <th style={{ padding: "0.5rem 0.75rem" }}>Command & Arguments</th>
                  <th style={{ padding: "0.5rem 0.75rem", width: "140px" }}>Client</th>
                </tr>
              </thead>
              <tbody>
                {slowLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", padding: "2rem", color: "#6b7280" }}>
                      No slow operations recorded.
                    </td>
                  </tr>
                ) : (
                  slowLogs.map((log) => (
                    <tr key={log.id} style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.04)" }}>
                      <td style={{ padding: "0.5rem 0.75rem", color: "#6b7280" }} className="font-mono">
                        #{log.id}
                      </td>
                      <td style={{ padding: "0.5rem 0.75rem", color: "#9ca3af" }}>
                        {new Date(log.timestamp * 1000).toLocaleTimeString()}
                      </td>
                      <td style={{ padding: "0.5rem 0.75rem", color: "#fb7185", fontWeight: 600 }} className="font-mono">
                        {(log.executionTime / 1000).toFixed(2)} ms
                      </td>
                      <td style={{ padding: "0.5rem 0.75rem", color: "#f3f4f6" }} className="font-mono">
                        {log.args?.join(" ")}
                      </td>
                      <td style={{ padding: "0.5rem 0.75rem", color: "#94a3b8" }} className="font-mono">
                        {log.clientAddr || "-"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "clients" && (
        <div style={{
          backgroundColor: "#111827",
          border: "1px solid #1f2937",
          borderRadius: "0.5rem",
          padding: "1rem",
        }}>
          <h3 style={{ fontSize: "0.95rem", fontWeight: 600, color: "#f3f4f6", marginBottom: "0.75rem" }}>
            Connected Clients (CLIENT LIST)
          </h3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
              <thead>
                <tr style={{ backgroundColor: "#0d131f", color: "#9ca3af", textAlign: "left", borderBottom: "1px solid #1f2937" }}>
                  <th style={{ padding: "0.5rem 0.75rem", width: "60px" }}>ID</th>
                  <th style={{ padding: "0.5rem 0.75rem" }}>Address</th>
                  <th style={{ padding: "0.5rem 0.75rem", width: "80px" }}>Age</th>
                  <th style={{ padding: "0.5rem 0.75rem", width: "80px" }}>Idle</th>
                  <th style={{ padding: "0.5rem 0.75rem", width: "100px" }}>Last Cmd</th>
                  <th style={{ padding: "0.5rem 0.75rem", width: "70px", textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.id} style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.04)" }}>
                    <td style={{ padding: "0.5rem 0.75rem", color: "#6b7280" }} className="font-mono">
                      {c.id}
                    </td>
                    <td style={{ padding: "0.5rem 0.75rem", color: "#f3f4f6" }} className="font-mono">
                      {c.addr}
                    </td>
                    <td style={{ padding: "0.5rem 0.75rem", color: "#9ca3af" }}>
                      {c.age}s
                    </td>
                    <td style={{ padding: "0.5rem 0.75rem", color: "#9ca3af" }}>
                      {c.idle}s
                    </td>
                    <td style={{ padding: "0.5rem 0.75rem", color: "#38bdf8" }} className="font-mono">
                      {c.cmd}
                    </td>
                    <td style={{ padding: "0.5rem 0.75rem", textAlign: "right" }}>
                      <button
                        onClick={() => handleKillClient(c.addr)}
                        style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer" }}
                        title="Kill Client"
                      >
                        <UserX size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
