import React, { useState, useEffect, useCallback } from "react";
import {
  LayoutDashboard,
  HardDrive,
  Users,
  Zap,
  Server,
  RefreshCw,
  Clock
} from "lucide-react";
import type { SlowLogEntry, ClientEntry } from "../../../bindings/memspace/backend/models/index.js";
import { DiagnosticsService } from "../../../bindings/memspace/backend/services/index.js";
import { formatBytes, getErrorMessage } from "../../lib/utils";
import { Button } from "../../components/ui/button";
import { ConfirmModal } from "../../components/ui/ConfirmModal";
import { useToast } from "../../components/ui/Toast";

interface ServerMetricsDashboardProps {
  connId: string;
  isActive?: boolean;
}

export const ServerMetricsDashboard: React.FC<ServerMetricsDashboardProps> = ({
  connId,
  isActive = true,
}) => {
  const { success: toastSuccess, error: toastError } = useToast();
  const [activeTab, setActiveTab] = useState<"overview" | "slowlog" | "clients">("overview");
  const [info, setInfo] = useState<Record<string, Record<string, string>>>({});
  const [slowLogs, setSlowLogs] = useState<SlowLogEntry[]>([]);
  const [clients, setClients] = useState<ClientEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [killClientTarget, setKillClientTarget] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
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
    } catch (err: unknown) {
      console.error("Failed to fetch diagnostics:", err);
    } finally {
      setLoading(false);
    }
  }, [connId, activeTab]);

  useEffect(() => {
    if (!isActive) return;
    const initTimer = setTimeout(() => {
      void fetchMetrics();
    }, 0);
    const interval = setInterval(() => {
      void fetchMetrics();
    }, 5000);
    return () => {
      clearTimeout(initTimer);
      clearInterval(interval);
    };
  }, [isActive, fetchMetrics]);

  const handleConfirmKillClient = async () => {
    if (!killClientTarget) return;
    const addr = killClientTarget;
    setKillClientTarget(null);
    try {
      await DiagnosticsService.KillClient(connId, addr);
      toastSuccess("Client Killed", `Client connection ${addr} terminated.`);
      void fetchMetrics();
    } catch (err: unknown) {
      toastError("Failed to kill client", getErrorMessage(err));
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

  const tabItems = [
    { id: "overview" as const, label: "Overview", icon: LayoutDashboard, count: undefined },
    {
      id: "slowlog" as const,
      label: "Slow Log",
      icon: Clock,
      count: slowLogs.length > 0 ? slowLogs.length : undefined,
    },
    {
      id: "clients" as const,
      label: "Client List",
      icon: Users,
      count: clients.length > 0 ? clients.length : (clientsInfo["connected_clients"] ? parseInt(clientsInfo["connected_clients"], 10) : undefined),
    },
  ];

  return (
    <div className="flex h-full flex-1 flex-col gap-5 overflow-y-auto bg-[#fafafa] p-6 select-none">
      {/* Tab Switcher & Actions Bar */}
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 pb-4">
        <div className="flex items-center gap-1 rounded-xl border border-zinc-200 bg-zinc-100/90 p-1 shadow-2xs">
          {tabItems.map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-xs transition-all ${
                  isActive
                    ? "bg-rose-600 font-semibold text-white shadow-xs"
                    : "font-medium text-zinc-600 hover:bg-white/80 hover:text-zinc-900"
                }`}
              >
                <Icon size={14} className={isActive ? "text-white" : "text-zinc-500"} />
                <span>{tab.label}</span>
                {tab.count !== undefined && tab.count > 0 && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] leading-none font-bold ${
                      isActive
                        ? "bg-rose-700/80 text-rose-100"
                        : "bg-zinc-200/80 text-zinc-600"
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <Button
          onClick={fetchMetrics}
          variant="outline"
          size="sm"
          className="h-10 cursor-pointer gap-2 rounded-xl border-zinc-200 bg-white px-3.5 text-xs font-semibold text-zinc-700 shadow-2xs transition-all hover:bg-zinc-50 active:scale-98"
        >
          <RefreshCw size={13} className={loading ? "animate-spin text-rose-600" : "text-zinc-500"} />
          <span>Refresh</span>
        </Button>
      </div>

      {activeTab === "overview" && (
        <div className="flex flex-col gap-7 sm:gap-8">
          {/* Top Key Metric Cards */}
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            {/* Memory Card */}
            <div className="flex flex-col gap-1 rounded-xl border border-zinc-200 bg-white p-4 shadow-xs">
              <div className="flex items-center justify-between text-xs font-medium text-zinc-500">
                <span>Memory Used</span>
                <HardDrive size={15} className="text-rose-600" />
              </div>
              <div className="mt-1 text-xl font-bold text-zinc-900">
                {formatBytes(usedMemBytes)}
              </div>
              <div className="text-[11px] text-zinc-400">
                Peak: {formatBytes(peakMemBytes)} (Frag: {fragRatio.toFixed(2)})
              </div>
            </div>

            {/* Throughput Card */}
            <div className="flex flex-col gap-1 rounded-xl border border-zinc-200 bg-white p-4 shadow-xs">
              <div className="flex items-center justify-between text-xs font-medium text-zinc-500">
                <span>Throughput</span>
                <Zap size={15} className="text-amber-500" />
              </div>
              <div className="mt-1 text-xl font-bold text-zinc-900">
                {opsPerSec}
              </div>
              <div className="text-[11px] text-zinc-400">
                Operations / second
              </div>
            </div>

            {/* Connected Clients */}
            <div className="flex flex-col gap-1 rounded-xl border border-zinc-200 bg-white p-4 shadow-xs">
              <div className="flex items-center justify-between text-xs font-medium text-zinc-500">
                <span>Active Clients</span>
                <Users size={15} className="text-emerald-600" />
              </div>
              <div className="mt-1 text-xl font-bold text-zinc-900">
                {connectedClients}
              </div>
              <div className="text-[11px] text-zinc-400">
                Connected sockets
              </div>
            </div>

            {/* Server Info */}
            <div className="flex flex-col gap-1 rounded-xl border border-zinc-200 bg-white p-4 shadow-xs">
              <div className="flex items-center justify-between text-xs font-medium text-zinc-500">
                <span>Redis Server</span>
                <Server size={15} className="text-indigo-600" />
              </div>
              <div className="mt-1 text-xl font-bold text-zinc-900">
                v{srv["redis_version"] || "Ready"}
              </div>
              <div className="text-[11px] text-zinc-400">
                Uptime: {uptimeDays} days ({info["replication"]?.["role"] || "master"})
              </div>
            </div>
          </div>

          {/* Detailed INFO Sections Grid */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {["server", "memory", "stats", "replication"].map((sec) => {
              const secData = info[sec] || {};
              return (
                <div
                  key={sec}
                  className="rounded-xl border border-zinc-200 bg-white p-4 shadow-xs"
                >
                  <h3 className="mb-2.5 border-b border-zinc-100 pb-1.5 text-xs font-bold tracking-wider text-rose-600 uppercase">
                    {sec} Metrics
                  </h3>

                  <div className="flex flex-col gap-1.5 text-xs">
                    {Object.entries(secData).slice(0, 8).map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between py-0.5">
                        <span className="mr-2 truncate font-mono text-zinc-500">{k}</span>
                        <span className="truncate font-mono font-semibold text-zinc-800">{String(v)}</span>
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
        <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold tracking-wider text-zinc-900 uppercase">
              Recent Slow Operations (SLOWLOG GET)
            </h3>
            <span className="text-[11px] text-zinc-500">
              {slowLogs.length} entries
            </span>
          </div>

          <div className="overflow-x-auto rounded-lg border border-zinc-200">
            <table className="w-full border-collapse text-xs">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-zinc-600 select-none">
                <tr>
                  <th className="w-16 px-3 py-2 font-semibold">ID</th>
                  <th className="w-36 px-3 py-2 font-semibold">Timestamp</th>
                  <th className="w-24 px-3 py-2 font-semibold">Duration</th>
                  <th className="px-3 py-2 font-semibold">Command & Arguments</th>
                  <th className="w-32 px-3 py-2 font-semibold">Client</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 select-text">
                {slowLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-zinc-500">
                      No slow operations recorded.
                    </td>
                  </tr>
                ) : (
                  slowLogs.map((log) => (
                    <tr key={log.id} className="font-mono transition-colors hover:bg-zinc-50/80">
                      <td className="px-3 py-2 text-zinc-400">#{log.id}</td>
                      <td className="px-3 py-2 text-zinc-500">{new Date(log.timestamp * 1000).toLocaleTimeString()}</td>
                      <td className="px-3 py-2 font-bold text-rose-600">{(log.executionTime / 1000).toFixed(2)} ms</td>
                      <td className="px-3 py-2 break-all text-zinc-800">{log.args?.join(" ")}</td>
                      <td className="px-3 py-2 text-zinc-500">{log.clientName || log.clientAddr || "N/A"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "clients" && (
        <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold tracking-wider text-zinc-900 uppercase">
              Connected Clients (CLIENT LIST)
            </h3>
            <span className="text-[11px] text-zinc-500">
              {clients.length} connected
            </span>
          </div>

          <div className="overflow-x-auto rounded-lg border border-zinc-200">
            <table className="w-full border-collapse text-xs">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-zinc-600 select-none">
                <tr>
                  <th className="w-16 px-3 py-2 font-semibold">ID</th>
                  <th className="w-40 px-3 py-2 font-semibold">Address</th>
                  <th className="w-24 px-3 py-2 font-semibold">Age</th>
                  <th className="w-24 px-3 py-2 font-semibold">Idle</th>
                  <th className="w-28 px-3 py-2 font-semibold">Last Command</th>
                  <th className="w-20 px-3 py-2 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 select-text">
                {clients.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-zinc-500">
                      No connected clients listed.
                    </td>
                  </tr>
                ) : (
                  clients.map((cl) => (
                    <tr key={cl.id} className="font-mono transition-colors hover:bg-zinc-50/80">
                      <td className="px-3 py-2 text-zinc-400">#{cl.id}</td>
                      <td className="px-3 py-2 text-zinc-800">{cl.addr}</td>
                      <td className="px-3 py-2 text-zinc-500">{cl.age}s</td>
                      <td className="px-3 py-2 text-zinc-500">{cl.idle}s</td>
                      <td className="px-3 py-2 font-bold text-rose-600">{cl.cmd}</td>
                      <td className="px-3 py-2 text-right font-sans select-none">
                        <button
                          onClick={() => setKillClientTarget(cl.addr)}
                          className="cursor-pointer rounded px-2 py-0.5 text-[11px] font-medium text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                        >
                          Kill
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Kill Client Confirmation Modal */}
      <ConfirmModal
        isOpen={!!killClientTarget}
        title="Kill Client Connection"
        description={`Are you sure you want to kill client connection ${killClientTarget}?`}
        confirmText="Kill Connection"
        cancelText="Cancel"
        variant="danger"
        onConfirm={handleConfirmKillClient}
        onCancel={() => setKillClientTarget(null)}
      />
    </div>
  );
};
