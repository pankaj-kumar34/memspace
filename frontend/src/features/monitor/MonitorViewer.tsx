import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Activity,
  Play,
  Square,
  Pause,
  Trash2,
  Download,
  Search,
  AlertTriangle,
} from "lucide-react";
import { Events } from "@wailsio/runtime";
import type { MonitorEvent } from "../../../bindings/memspace/backend/models/index.js";
import { MonitorService } from "../../../bindings/memspace/backend/services/index.js";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { useToast } from "../../components/ui/Toast";
import { getErrorMessage } from "../../lib/utils";

interface MonitorViewerProps {
  connId: string;
  clusterMode?: boolean;
}

const MAX_EVENTS = 2000;

const READ_COMMANDS = new Set([
  "GET", "MGET", "HGET", "HGETALL", "HMGET", "HSCAN", "LRANGE", "LLEN", "LINDEX",
  "SMEMBERS", "SISMEMBER", "SSCAN", "ZRANGE", "ZRANGEBYSCORE", "ZSCORE", "ZSCAN",
  "XRANGE", "XREAD", "SCAN", "KEYS", "TTL", "PTTL", "EXISTS", "TYPE", "PING", "INFO",
  "JSON.GET",
]);

const WRITE_COMMANDS = new Set([
  "SET", "MSET", "SETEX", "PSETEX", "SETNX", "INCR", "DECR", "APPEND",
  "HSET", "HMSET", "HINCRBY", "LPUSH", "RPUSH", "LSET", "SADD", "ZADD", "ZINCRBY",
  "XADD", "EXPIRE", "PEXPIRE", "PERSIST", "RENAME", "JSON.SET", "PUBLISH",
]);

const DELETE_COMMANDS = new Set([
  "DEL", "UNLINK", "HDEL", "LPOP", "RPOP", "LREM", "LTRIM", "SREM", "SPOP",
  "ZREM", "XDEL", "FLUSHDB", "FLUSHALL",
]);

function getCommandCategory(cmd: string): "read" | "write" | "delete" | "other" {
  const upper = cmd.toUpperCase();
  if (DELETE_COMMANDS.has(upper)) return "delete";
  if (WRITE_COMMANDS.has(upper)) return "write";
  if (READ_COMMANDS.has(upper)) return "read";
  return "other";
}

function getCommandBadgeClass(cmd: string): string {
  const cat = getCommandCategory(cmd);
  switch (cat) {
    case "read":
      return "bg-sky-50 text-sky-700 border-sky-200";
    case "write":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "delete":
      return "bg-rose-50 text-rose-700 border-rose-200";
    default:
      return "bg-zinc-100 text-zinc-700 border-zinc-200";
  }
}

export const MonitorViewer: React.FC<MonitorViewerProps> = ({
  connId,
  clusterMode = false,
}) => {
  const { error: toastError, success: toastSuccess } = useToast();
  const [monitoring, setMonitoring] = useState(false);
  const [paused, setPaused] = useState(false);
  const [events, setEvents] = useState<MonitorEvent[]>([]);
  const [filter, setFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"all" | "read" | "write" | "delete">("all");

  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const monitoringRef = useRef(monitoring);
  useEffect(() => {
    monitoringRef.current = monitoring;
  }, [monitoring]);

  useEffect(() => {
    const cancelEvent = Events.On("monitor:event", (eventData: unknown) => {
      if (pausedRef.current) return;
      const raw = eventData as { data?: MonitorEvent } | MonitorEvent | null;
      const ev =
        raw && typeof raw === "object" && "data" in raw
          ? raw.data
          : (raw as MonitorEvent | null);
      if (ev && ev.connId === connId) {
        setEvents((prev) => {
          const next = [ev, ...prev];
          return next.length > MAX_EVENTS ? next.slice(0, MAX_EVENTS) : next;
        });
      }
    });

    const cancelStopped = Events.On("monitor:stopped", (eventData: unknown) => {
      const raw = eventData as { data?: string } | string | null;
      const stoppedConnId =
        raw && typeof raw === "object" && "data" in raw ? raw.data : raw;
      if (stoppedConnId === connId) {
        setMonitoring(false);
      }
    });

    return () => {
      cancelEvent();
      cancelStopped();
      if (monitoringRef.current) {
        MonitorService.StopMonitor(connId).catch(() => {});
      }
    };
  }, [connId]);

  const handleStart = async () => {
    try {
      await MonitorService.StartMonitor(connId);
      setMonitoring(true);
      setPaused(false);
    } catch (err: unknown) {
      toastError("Failed to start MONITOR", getErrorMessage(err));
    }
  };

  const handleStop = async () => {
    try {
      await MonitorService.StopMonitor(connId);
      setMonitoring(false);
      setPaused(false);
    } catch (err: unknown) {
      toastError("Failed to stop MONITOR", getErrorMessage(err));
    }
  };

  const filteredEvents = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return events.filter((ev) => {
      if (categoryFilter !== "all" && getCommandCategory(ev.command) !== categoryFilter) {
        return false;
      }
      if (!q) return true;
      return (
        ev.command.toLowerCase().includes(q) ||
        ev.args.toLowerCase().includes(q) ||
        ev.clientAddr.toLowerCase().includes(q) ||
        ev.db.toLowerCase().includes(q)
      );
    });
  }, [events, filter, categoryFilter]);

  const handleExportCsv = () => {
    if (filteredEvents.length === 0) return;
    const escapeCsv = (val: string) => `"${val.replace(/"/g, '""')}"`;
    const header = "timestamp,db,client_addr,command,args";
    const rows = filteredEvents.map((ev) =>
      [ev.timestamp, ev.db, ev.clientAddr, ev.command, ev.args]
        .map(escapeCsv)
        .join(","),
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `memspace-monitor-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toastSuccess("Exported CSV", `Saved ${filteredEvents.length} monitored commands.`);
  };

  return (
    <div className="flex h-full flex-1 flex-col gap-4 overflow-hidden bg-[#fafafa] p-6 select-none">
      {/* Header & Warning Banner */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-600">
            <Activity size={17} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-zinc-900">
                Real-Time Command Monitor
              </h2>
              {monitoring && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                  <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                  {paused ? "Paused" : "Streaming"}
                </span>
              )}
            </div>
            <p className="text-[11px] text-zinc-500">
              {clusterMode
                ? "MONITOR is only supported on standalone or failover connections (not Cluster mode)."
                : "Streams every command processed by the server in real time."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!monitoring ? (
            <Button
              size="sm"
              onClick={handleStart}
              disabled={clusterMode}
              className="h-8 cursor-pointer gap-1.5 rounded-lg bg-rose-600 px-3 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
            >
              <Play size={12} />
              <span>Start Monitor</span>
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPaused((p) => !p)}
                className="h-8 cursor-pointer gap-1.5 rounded-lg border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                {paused ? <Play size={12} /> : <Pause size={12} />}
                <span>{paused ? "Resume" : "Pause"}</span>
              </Button>
              <Button
                size="sm"
                onClick={handleStop}
                className="h-8 cursor-pointer gap-1.5 rounded-lg bg-zinc-900 px-3 text-xs font-semibold text-white hover:bg-zinc-800"
              >
                <Square size={12} />
                <span>Stop</span>
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Production Overhead Notice */}
      <div className="flex shrink-0 items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-[11px] text-amber-800">
        <AlertTriangle size={14} className="shrink-0 text-amber-600" />
        <span>
          <strong>Heads up:</strong> Redis <code className="font-mono font-semibold">MONITOR</code> adds server throughput overhead on high-traffic production nodes. Stop the stream when finished.
        </span>
      </div>

      {/* Filter & Export Toolbar */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2.5">
        <div className="relative min-w-60 flex-1">
          <Search
            size={14}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-zinc-400"
          />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by command, key pattern, client IP, or DB..."
            className="h-9 bg-white pl-8 text-xs"
          />
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-white p-1">
          {(["all", "read", "write", "delete"] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`cursor-pointer rounded-md px-2.5 py-1 text-[11px] font-semibold capitalize transition-colors ${
                categoryFilter === cat
                  ? "bg-rose-600 text-white"
                  : "text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={() => setEvents([])}
          disabled={events.length === 0}
          className="h-9 cursor-pointer gap-1.5 border-zinc-200 bg-white text-xs text-zinc-600 hover:text-zinc-900"
        >
          <Trash2 size={13} />
          <span>Clear</span>
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={handleExportCsv}
          disabled={filteredEvents.length === 0}
          className="h-9 cursor-pointer gap-1.5 border-zinc-200 bg-white text-xs text-zinc-600 hover:text-zinc-900"
        >
          <Download size={13} />
          <span>Export CSV</span>
        </Button>
      </div>

      {/* Events Table */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xs">
        <div className="grid shrink-0 grid-cols-12 gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-[11px] font-bold tracking-wider text-zinc-500 uppercase">
          <div className="col-span-2">Time</div>
          <div className="col-span-2">Client</div>
          <div className="col-span-1">DB</div>
          <div className="col-span-2">Command</div>
          <div className="col-span-5">Arguments</div>
        </div>

        {filteredEvents.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-zinc-400">
            <Activity size={28} className="opacity-30" />
            <p className="text-xs font-semibold text-zinc-600">
              {monitoring
                ? "Waiting for incoming commands..."
                : "Monitor stream is idle"}
            </p>
            <p className="max-w-sm text-[11px] text-zinc-400">
              {monitoring
                ? "Execute commands from your app or the Console tab to see them appear here in real time."
                : "Click Start Monitor above to inspect live commands hitting this Redis instance."}
            </p>
          </div>
        ) : (
          <div className="flex-1 divide-y divide-zinc-100 overflow-y-auto font-mono text-xs select-text">
            {filteredEvents.map((ev, idx) => (
              <div
                key={`${ev.timestamp}-${idx}`}
                className="grid grid-cols-12 items-center gap-2 px-4 py-2 transition-colors hover:bg-zinc-50/80"
              >
                <div className="col-span-2 truncate text-zinc-400 tabular-nums">
                  {ev.timestamp}
                </div>
                <div className="col-span-2 truncate text-zinc-600">
                  {ev.clientAddr || "-"}
                </div>
                <div className="col-span-1 text-zinc-500">{ev.db || "0"}</div>
                <div className="col-span-2">
                  <span
                    className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-bold ${getCommandBadgeClass(ev.command)}`}
                  >
                    {ev.command}
                  </span>
                </div>
                <div className="col-span-5 truncate text-zinc-800" title={ev.args}>
                  {ev.args || <span className="text-zinc-300 italic">none</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex shrink-0 items-center justify-between border-t border-zinc-100 bg-zinc-50/70 px-4 py-1.5 text-[11px] text-zinc-500">
          <span>
            Showing {filteredEvents.length} of {events.length} captured events (max {MAX_EVENTS})
          </span>
          <span className="font-mono">{monitoring ? "LIVE" : "IDLE"}</span>
        </div>
      </div>
    </div>
  );
};
