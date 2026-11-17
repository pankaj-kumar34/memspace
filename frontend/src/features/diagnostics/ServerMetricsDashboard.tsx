import React, { useState, useEffect, useCallback } from "react";
import {
  LayoutDashboard,
  HardDrive,
  Users,
  Zap,
  Server,
  RefreshCw,
  Clock,
  Database,
  Search
} from "lucide-react";
import type { SlowLogEntry, ClientEntry, BigKeyScanResult } from "../../../bindings/memspace/backend/models/index.js";
import { DiagnosticsService } from "../../../bindings/memspace/backend/services/index.js";
import { formatBytes, getErrorMessage } from "../../lib/utils";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { ConfirmModal } from "../../components/ui/ConfirmModal";
import { useToast } from "../../components/ui/Toast";

interface SparklineChartProps {
  title: string;
  subtitle: string;
  data: number[];
  strokeColor: string;
  fillColor: string;
  formatValue: (val: number) => string;
}

const SparklineChart: React.FC<SparklineChartProps> = ({
  title,
  subtitle,
  data,
  strokeColor,
  fillColor,
  formatValue,
}) => {
  const width = 400;
  const height = 84;
  const padY = 8;

  const latest = data.length > 0 ? data[data.length - 1] : 0;
  const minVal = data.length > 0 ? Math.min(...data) : 0;
  const maxVal = data.length > 0 ? Math.max(...data) : 1;
  const range = maxVal - minVal || 1;

  const points = data.map((val, idx) => {
    const x = data.length <= 1 ? width : (idx / (data.length - 1)) * width;
    const y = height - padY - ((val - minVal) / range) * (height - padY * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const polylinePoints = points.join(" ");
  const areaPath =
    points.length > 1
      ? `M 0,${height} L ${points.map((p) => p).join(" L ")} L ${width},${height} Z`
      : "";

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-4 shadow-xs">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-xs font-bold text-zinc-800">{title}</h4>
          <p className="text-[11px] text-zinc-400">{subtitle}</p>
        </div>
        <div className="text-right">
          <div className="font-mono text-sm font-bold text-zinc-900 tabular-nums">
            {formatValue(latest)}
          </div>
          {data.length > 1 && (
            <div className="font-mono text-[10px] text-zinc-400 tabular-nums">
              min {formatValue(minVal)} · max {formatValue(maxVal)}
            </div>
          )}
        </div>
      </div>

      <div className="h-[84px] w-full overflow-hidden rounded-lg bg-zinc-50/70 px-1 pt-1">
        {data.length < 2 ? (
          <div className="flex h-full items-center justify-center text-[11px] text-zinc-400">
            Collecting live samples...
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            className="size-full"
          >
            <path d={areaPath} fill={fillColor} />
            <polyline
              fill="none"
              stroke={strokeColor}
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={polylinePoints}
            />
          </svg>
        )}
      </div>
    </div>
  );
};

interface ServerMetricsDashboardProps {
  connId: string;
  db?: number;
  isActive?: boolean;
}

export const ServerMetricsDashboard: React.FC<ServerMetricsDashboardProps> = ({
  connId,
  db = 0,
  isActive = true,
}) => {
  const { success: toastSuccess, error: toastError } = useToast();
  const [activeTab, setActiveTab] = useState<"overview" | "bigkeys" | "slowlog" | "clients">("overview");
  const [info, setInfo] = useState<Record<string, Record<string, string>>>({});
  const [slowLogs, setSlowLogs] = useState<SlowLogEntry[]>([]);
  const [clients, setClients] = useState<ClientEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [killClientTarget, setKillClientTarget] = useState<string | null>(null);

  // Rolling live chart history (last 30 samples)
  const [opsHistory, setOpsHistory] = useState<number[]>([]);
  const [memHistory, setMemHistory] = useState<number[]>([]);

  // BigKey Scanner state
  const [bigKeyPattern, setBigKeyPattern] = useState("*");
  const [bigKeyMaxKeys, setBigKeyMaxKeys] = useState(2000);
  const [bigKeyScanning, setBigKeyScanning] = useState(false);
  const [bigKeyResult, setBigKeyResult] = useState<BigKeyScanResult | null>(null);

  const fetchMetrics = useCallback(async () => {
    if (!connId) return;
    setLoading(true);
    try {
      const infoData = await DiagnosticsService.GetInfo(connId);
      setInfo(infoData || {});

      const opsVal = parseInt(infoData?.["stats"]?.["instantaneous_ops_per_sec"] || "0", 10);
      const memVal = parseInt(infoData?.["memory"]?.["used_memory"] || "0", 10);
      if (!Number.isNaN(opsVal)) {
        setOpsHistory((prev) => [...prev.slice(-29), opsVal]);
      }
      if (!Number.isNaN(memVal) && memVal > 0) {
        setMemHistory((prev) => [...prev.slice(-29), memVal]);
      }

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

  const handleScanBigKeys = async () => {
    if (!connId) return;
    setBigKeyScanning(true);
    try {
      const res = await DiagnosticsService.ScanBigKeys(
        connId,
        db,
        bigKeyPattern.trim() || "*",
        bigKeyMaxKeys,
        25,
      );
      setBigKeyResult(res);
    } catch (err: unknown) {
      toastError("BigKey scan failed", getErrorMessage(err));
    } finally {
      setBigKeyScanning(false);
    }
  };

  useEffect(() => {
    if (!isActive) return;
    const initTimer = setTimeout(() => {
      void fetchMetrics();
    }, 0);
    const interval = setInterval(() => {
      void fetchMetrics();
    }, 3000);
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
      id: "bigkeys" as const,
      label: "BigKey Scanner",
      icon: Database,
      count: bigKeyResult?.topKeys?.length,
    },
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

          {/* Live Trend Sparklines */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <SparklineChart
              title="Throughput Trend"
              subtitle="Rolling 3s samples (ops/sec)"
              data={opsHistory}
              strokeColor="#e11d48"
              fillColor="rgba(225, 29, 72, 0.12)"
              formatValue={(v) => `${Math.round(v).toLocaleString()}/s`}
            />
            <SparklineChart
              title="Memory Usage Trend"
              subtitle="Rolling 3s samples (used_memory)"
              data={memHistory}
              strokeColor="#0284c7"
              fillColor="rgba(2, 132, 199, 0.12)"
              formatValue={(v) => formatBytes(v)}
            />
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

      {activeTab === "bigkeys" && (
        <div className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-xs font-bold tracking-wider text-zinc-900 uppercase">
                Non-Blocking BigKey &amp; Memory Profiler
              </h3>
              <p className="text-[11px] text-zinc-500">
                Samples keys in DB {db} using cursor <code className="font-mono">SCAN</code> and pipelined <code className="font-mono">MEMORY USAGE</code>.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-44">
                <Search
                  size={13}
                  className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-zinc-400"
                />
                <Input
                  value={bigKeyPattern}
                  onChange={(e) => setBigKeyPattern(e.target.value)}
                  placeholder="Pattern (*)"
                  className="h-8 bg-white pl-8 font-mono text-xs"
                />
              </div>

              <select
                value={bigKeyMaxKeys}
                onChange={(e) => setBigKeyMaxKeys(Number(e.target.value))}
                className="h-8 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700"
              >
                <option value={1000}>Sample 1,000 keys</option>
                <option value={2000}>Sample 2,000 keys</option>
                <option value={5000}>Sample 5,000 keys</option>
              </select>

              <Button
                size="sm"
                onClick={handleScanBigKeys}
                disabled={bigKeyScanning}
                className="h-8 cursor-pointer gap-1.5 rounded-lg bg-rose-600 px-3 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                <RefreshCw size={12} className={bigKeyScanning ? "animate-spin" : ""} />
                <span>{bigKeyScanning ? "Scanning..." : "Scan Keyspace"}</span>
              </Button>
            </div>
          </div>

          {bigKeyResult && (
            <div className="grid grid-cols-3 gap-3 rounded-lg border border-zinc-200 bg-zinc-50/70 px-4 py-2.5 text-xs">
              <div>
                <span className="text-zinc-500">Keys Scanned:</span>{" "}
                <span className="font-mono font-bold text-zinc-900">
                  {bigKeyResult.scannedKeys.toLocaleString()}
                </span>
                <span className="ml-1 text-[10px] text-zinc-400">
                  ({bigKeyResult.completed ? "full" : "sampled"})
                </span>
              </div>
              <div>
                <span className="text-zinc-500">Sampled Memory:</span>{" "}
                <span className="font-mono font-bold text-zinc-900">
                  {formatBytes(bigKeyResult.totalMemory)}
                </span>
              </div>
              <div className="text-right">
                <span className="text-zinc-500">Duration:</span>{" "}
                <span className="font-mono font-bold text-zinc-900">
                  {bigKeyResult.durationMs} ms
                </span>
              </div>
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border border-zinc-200">
            <table className="w-full border-collapse text-xs">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-zinc-600 select-none">
                <tr>
                  <th className="px-3 py-2 font-semibold">Key</th>
                  <th className="w-24 px-3 py-2 font-semibold">Type</th>
                  <th className="w-40 px-3 py-2 text-right font-semibold">Memory Usage</th>
                  <th className="w-32 px-3 py-2 text-right font-semibold">Elements / Len</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 select-text">
                {!bigKeyResult ? (
                  <tr>
                    <td colSpan={4} className="py-10 text-center text-zinc-500">
                      Click <strong>Scan Keyspace</strong> to profile the largest keys in this database.
                    </td>
                  </tr>
                ) : bigKeyResult.topKeys.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-10 text-center text-zinc-500">
                      No keys matched pattern <code className="font-mono">{bigKeyPattern || "*"}</code>.
                    </td>
                  </tr>
                ) : (
                  bigKeyResult.topKeys.map((entry) => {
                    const maxMem = bigKeyResult.topKeys[0]?.memoryBytes || 1;
                    const pct = entry.memoryBytes > 0 ? Math.max(4, Math.round((entry.memoryBytes / maxMem) * 100)) : 0;
                    return (
                      <tr key={entry.key} className="font-mono transition-colors hover:bg-zinc-50/80">
                        <td className="max-w-xs truncate px-3 py-2 text-zinc-900" title={entry.key}>
                          {entry.key}
                        </td>
                        <td className="px-3 py-2">
                          <span className="rounded border border-zinc-200 bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-700 uppercase">
                            {entry.type}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex flex-col items-end gap-1">
                            <span className="font-bold text-rose-600">
                              {entry.memoryBytes > 0 ? formatBytes(entry.memoryBytes) : "N/A"}
                            </span>
                            {pct > 0 && (
                              <div className="h-1 w-24 overflow-hidden rounded-full bg-zinc-100">
                                <div className="h-full bg-rose-500" style={{ width: `${pct}%` }} />
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right text-zinc-600">
                          {entry.length.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
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
