import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  Zap,
  Copy,
  Check,
  Download,
  CornerUpLeft,
  Terminal as TermIcon,
} from "lucide-react";
import type { CliResponse } from "../../../bindings/memspace/backend/models/index.js";
import { CliService } from "../../../bindings/memspace/backend/services/index.js";
import { getDataTypeBadgeClass, getModSymbol } from "../../lib/utils";

interface TerminalProps {
  connId: string;
  db: number;
  host: string;
  port: number;
  isActive?: boolean;
}

interface LogEntry {
  command: string;
  response?: CliResponse | null;
  timestamp: string;
}

interface CommandSpec {
  cmd: string;
  syntax: string;
  desc: string;
  category: "string" | "hash" | "list" | "set" | "zset" | "server" | "generic";
}

const REDIS_COMMANDS: CommandSpec[] = [
  // Generic / Keys
  { cmd: "DEL", syntax: "DEL key [key ...]", desc: "Delete one or more keys", category: "generic" },
  { cmd: "EXISTS", syntax: "EXISTS key [key ...]", desc: "Check if key(s) exist", category: "generic" },
  { cmd: "EXPIRE", syntax: "EXPIRE key seconds", desc: "Set a key's time to live in seconds", category: "generic" },
  { cmd: "EXPIREAT", syntax: "EXPIREAT key timestamp", desc: "Set expiration UNIX timestamp", category: "generic" },
  { cmd: "KEYS", syntax: "KEYS pattern", desc: "Find all keys matching pattern (use SCAN in production)", category: "generic" },
  { cmd: "PERSIST", syntax: "PERSIST key", desc: "Remove the expiration from a key", category: "generic" },
  { cmd: "RENAME", syntax: "RENAME key newkey", desc: "Rename a key", category: "generic" },
  { cmd: "SCAN", syntax: "SCAN cursor [MATCH pattern] [COUNT count]", desc: "Iterate database keys safely", category: "generic" },
  { cmd: "TTL", syntax: "TTL key", desc: "Get time to live in seconds", category: "generic" },
  { cmd: "PTTL", syntax: "PTTL key", desc: "Get time to live in milliseconds", category: "generic" },
  { cmd: "TYPE", syntax: "TYPE key", desc: "Determine key data type", category: "generic" },
  { cmd: "UNLINK", syntax: "UNLINK key [key ...]", desc: "Asynchronously delete key(s)", category: "generic" },

  // Strings
  { cmd: "APPEND", syntax: "APPEND key value", desc: "Append value to string", category: "string" },
  { cmd: "DECR", syntax: "DECR key", desc: "Decrement integer value by 1", category: "string" },
  { cmd: "DECRBY", syntax: "DECRBY key decrement", desc: "Decrement integer value by amount", category: "string" },
  { cmd: "GET", syntax: "GET key", desc: "Get value of key", category: "string" },
  { cmd: "GETDEL", syntax: "GETDEL key", desc: "Get value and delete key atomically", category: "string" },
  { cmd: "GETSET", syntax: "GETSET key value", desc: "Set value and return previous value", category: "string" },
  { cmd: "INCR", syntax: "INCR key", desc: "Increment integer value by 1", category: "string" },
  { cmd: "INCRBY", syntax: "INCRBY key increment", desc: "Increment integer value by amount", category: "string" },
  { cmd: "MGET", syntax: "MGET key [key ...]", desc: "Get values of multiple keys", category: "string" },
  { cmd: "MSET", syntax: "MSET key value [key value ...]", desc: "Set multiple keys to values", category: "string" },
  { cmd: "SET", syntax: "SET key value [EX seconds] [NX|XX]", desc: "Set string value of a key", category: "string" },
  { cmd: "SETEX", syntax: "SETEX key seconds value", desc: "Set key value with expiration", category: "string" },
  { cmd: "SETNX", syntax: "SETNX key value", desc: "Set key value only if key does not exist", category: "string" },
  { cmd: "STRLEN", syntax: "STRLEN key", desc: "Get length of key string value", category: "string" },

  // Hashes
  { cmd: "HDEL", syntax: "HDEL key field [field ...]", desc: "Delete one or more hash fields", category: "hash" },
  { cmd: "HEXISTS", syntax: "HEXISTS key field", desc: "Check if hash field exists", category: "hash" },
  { cmd: "HGET", syntax: "HGET key field", desc: "Get value of hash field", category: "hash" },
  { cmd: "HGETALL", syntax: "HGETALL key", desc: "Get all fields and values in hash", category: "hash" },
  { cmd: "HINCRBY", syntax: "HINCRBY key field increment", desc: "Increment integer field in hash", category: "hash" },
  { cmd: "HKEYS", syntax: "HKEYS key", desc: "Get all field names in hash", category: "hash" },
  { cmd: "HLEN", syntax: "HLEN key", desc: "Get number of fields in hash", category: "hash" },
  { cmd: "HMGET", syntax: "HMGET key field [field ...]", desc: "Get multiple hash field values", category: "hash" },
  { cmd: "HMSET", syntax: "HMSET key field value [field value ...]", desc: "Set multiple hash fields", category: "hash" },
  { cmd: "HSCAN", syntax: "HSCAN key cursor [MATCH pattern]", desc: "Incrementally iterate hash fields", category: "hash" },
  { cmd: "HSET", syntax: "HSET key field value [field value ...]", desc: "Set one or more hash fields", category: "hash" },
  { cmd: "HVALS", syntax: "HVALS key", desc: "Get all values in hash", category: "hash" },

  // Lists
  { cmd: "LINDEX", syntax: "LINDEX key index", desc: "Get element from list by index", category: "list" },
  { cmd: "LLEN", syntax: "LLEN key", desc: "Get length of list", category: "list" },
  { cmd: "LPOP", syntax: "LPOP key [count]", desc: "Remove and return first list element", category: "list" },
  { cmd: "LPUSH", syntax: "LPUSH key element [element ...]", desc: "Prepend element(s) to list", category: "list" },
  { cmd: "LRANGE", syntax: "LRANGE key start stop", desc: "Get range of elements from list", category: "list" },
  { cmd: "LREM", syntax: "LREM key count element", desc: "Remove elements from list", category: "list" },
  { cmd: "LSET", syntax: "LSET key index element", desc: "Set element at index in list", category: "list" },
  { cmd: "LTRIM", syntax: "LTRIM key start stop", desc: "Trim list to specified range", category: "list" },
  { cmd: "RPOP", syntax: "RPOP key [count]", desc: "Remove and return last list element", category: "list" },
  { cmd: "RPUSH", syntax: "RPUSH key element [element ...]", desc: "Append element(s) to list", category: "list" },

  // Sets
  { cmd: "SADD", syntax: "SADD key member [member ...]", desc: "Add member(s) to set", category: "set" },
  { cmd: "SCARD", syntax: "SCARD key", desc: "Get number of members in set", category: "set" },
  { cmd: "SDIFF", syntax: "SDIFF key [key ...]", desc: "Subtract multiple sets", category: "set" },
  { cmd: "SINTER", syntax: "SINTER key [key ...]", desc: "Intersect multiple sets", category: "set" },
  { cmd: "SISMEMBER", syntax: "SISMEMBER key member", desc: "Check if member belongs to set", category: "set" },
  { cmd: "SMEMBERS", syntax: "SMEMBERS key", desc: "Get all members in set", category: "set" },
  { cmd: "SPOP", syntax: "SPOP key [count]", desc: "Remove and return random member(s)", category: "set" },
  { cmd: "SRANDMEMBER", syntax: "SRANDMEMBER key [count]", desc: "Get random member(s) from set", category: "set" },
  { cmd: "SREM", syntax: "SREM key member [member ...]", desc: "Remove member(s) from set", category: "set" },
  { cmd: "SUNION", syntax: "SUNION key [key ...]", desc: "Union multiple sets", category: "set" },

  // Sorted Sets
  { cmd: "ZADD", syntax: "ZADD key score member [score member ...]", desc: "Add member(s) with scores", category: "zset" },
  { cmd: "ZCARD", syntax: "ZCARD key", desc: "Get member count in sorted set", category: "zset" },
  { cmd: "ZCOUNT", syntax: "ZCOUNT key min max", desc: "Count members within score range", category: "zset" },
  { cmd: "ZINCRBY", syntax: "ZINCRBY key increment member", desc: "Increment member score", category: "zset" },
  { cmd: "ZRANGE", syntax: "ZRANGE key min max [WITHSCORES]", desc: "Return range of members", category: "zset" },
  { cmd: "ZRANGEBYSCORE", syntax: "ZRANGEBYSCORE key min max [WITHSCORES]", desc: "Return members by score", category: "zset" },
  { cmd: "ZRANK", syntax: "ZRANK key member", desc: "Determine index of member in sorted set", category: "zset" },
  { cmd: "ZREM", syntax: "ZREM key member [member ...]", desc: "Remove member(s) from sorted set", category: "zset" },
  { cmd: "ZREVRANGE", syntax: "ZREVRANGE key start stop [WITHSCORES]", desc: "Return members in reverse order", category: "zset" },
  { cmd: "ZSCORE", syntax: "ZSCORE key member", desc: "Get score of member in sorted set", category: "zset" },

  // Server & Admin
  { cmd: "CLIENT LIST", syntax: "CLIENT LIST", desc: "List connected clients", category: "server" },
  { cmd: "CONFIG GET", syntax: "CONFIG GET parameter", desc: "Get server configuration parameter", category: "server" },
  { cmd: "DBSIZE", syntax: "DBSIZE", desc: "Return key count in current database", category: "server" },
  { cmd: "FLUSHDB", syntax: "FLUSHDB [ASYNC]", desc: "Remove all keys from current database", category: "server" },
  { cmd: "FLUSHALL", syntax: "FLUSHALL [ASYNC]", desc: "Remove all keys from all databases", category: "server" },
  { cmd: "INFO", syntax: "INFO [section]", desc: "Get server information and statistics", category: "server" },
  { cmd: "PING", syntax: "PING [message]", desc: "Ping server to test connectivity", category: "server" },
  { cmd: "SLOWLOG GET", syntax: "SLOWLOG GET [count]", desc: "Retrieve slow queries log", category: "server" },
  { cmd: "TIME", syntax: "TIME", desc: "Return current server timestamp", category: "server" },
];

const categoryBadgeStyles: Record<CommandSpec["category"], string> = {
  string: getDataTypeBadgeClass("string"),
  hash: getDataTypeBadgeClass("hash"),
  list: getDataTypeBadgeClass("list"),
  set: getDataTypeBadgeClass("set"),
  zset: getDataTypeBadgeClass("zset"),
  generic: getDataTypeBadgeClass("generic"),
  server: getDataTypeBadgeClass("server"),
};

/**
 * Formats Redis CLI responses into authentic Redis-style display text.
 */
function formatRedisOutput(output: unknown, rawOutput?: string | null): {
  formatted: string;
  isJson: boolean;
} {
  if (output === null || output === undefined) {
    return { formatted: rawOutput || "(nil)", isJson: false };
  }
  if (typeof output === "number" || typeof output === "bigint") {
    return { formatted: `(integer) ${output}`, isJson: false };
  }
  if (Array.isArray(output)) {
    if (output.length === 0) {
      return { formatted: "(empty list or set)", isJson: false };
    }
    const lines = output.map((item, idx) => {
      const itemStr = typeof item === "object" ? JSON.stringify(item) : String(item);
      return `${idx + 1}) "${itemStr}"`;
    });
    return { formatted: lines.join("\n"), isJson: false };
  }
  if (typeof output === "string") {
    const trimmed = output.trim();
    if (
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))
    ) {
      try {
        const parsed = JSON.parse(trimmed);
        return {
          formatted: JSON.stringify(parsed, null, 2),
          isJson: true,
        };
      } catch {
        // Not valid JSON, keep as plain string
      }
    }
    return { formatted: output, isJson: false };
  }
  if (typeof output === "object") {
    return { formatted: JSON.stringify(output, null, 2), isJson: true };
  }
  return { formatted: rawOutput || String(output), isJson: false };
}

export const Terminal: React.FC<TerminalProps> = ({
  connId,
  db,
  isActive = true,
}) => {
  const [input, setInput] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const modKey = getModSymbol();

  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [executing, setExecuting] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  // Autocomplete state
  const [suggestionIdx, setSuggestionIdx] = useState(0);
  const [dismissSuggestions, setDismissSuggestions] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Global ⌘K / Ctrl+K shortcut to clear output anytime (when terminal is active)
  useEffect(() => {
    if (!isActive) return;
    const onGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K" || e.key === "l" || e.key === "L")) {
        e.preventDefault();
        setLogs([]);
      }
    };
    window.addEventListener("keydown", onGlobalKeyDown);
    return () => window.removeEventListener("keydown", onGlobalKeyDown);
  }, [isActive]);

  // Focus input when tab becomes active
  useEffect(() => {
    if (isActive) {
      inputRef.current?.focus();
    }
  }, [isActive]);

  // Compute autocomplete suggestions based on current first word
  const suggestions = useMemo(() => {
    if (dismissSuggestions || !input.trim()) return [];
    const parts = input.trimStart().split(/\s+/);
    if (parts.length > 2) return []; // only suggest when typing command name

    const prefix = parts[0].toUpperCase();
    if (!prefix) return [];

    return REDIS_COMMANDS.filter((s) => s.cmd.startsWith(prefix) || s.cmd.includes(prefix)).slice(
      0,
      6
    );
  }, [input, dismissSuggestions]);

  const [prevSuggestions, setPrevSuggestions] = useState(suggestions);
  if (suggestions !== prevSuggestions) {
    setPrevSuggestions(suggestions);
    setSuggestionIdx(0);
  }

  const handleExecute = async (commandToRun?: string) => {
    const raw = commandToRun !== undefined ? commandToRun : input;
    const trimmed = raw.trim();
    if (!trimmed || executing) return;

    if (trimmed.toUpperCase() === "CLEAR") {
      setLogs([]);
      setInput("");
      setDismissSuggestions(false);
      return;
    }

    setExecuting(true);
    setHistory((prev) => [...prev, trimmed]);
    setHistoryIndex(-1);
    setDismissSuggestions(true);

    const timeStr = new Date().toLocaleTimeString();

    try {
      const res = await CliService.ExecuteRawCommand(connId, db, trimmed);
      setLogs((prev) => [
        ...prev,
        {
          command: trimmed,
          response: res,
          timestamp: timeStr,
        },
      ]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setLogs((prev) => [
        ...prev,
        {
          command: trimmed,
          response: {
            output: null,
            rawOutput: `(error) ${msg}`,
            error: msg,
            executionTimeMs: 0,
          },
          timestamp: timeStr,
        },
      ]);
    } finally {
      setInput("");
      setExecuting(false);
      setDismissSuggestions(false);
      inputRef.current?.focus();
    }
  };

  const applySuggestion = (cmd: string) => {
    setInput(cmd + " ");
    setDismissSuggestions(true);
    inputRef.current?.focus();
  };

  const handleCopy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1500);
  };

  const handleCopyAll = () => {
    if (logs.length === 0) return;
    const content = logs
      .map((l) => {
        const out = formatRedisOutput(l.response?.output, l.response?.rawOutput).formatted;
        return `[${l.timestamp}] redis[${db}]> ${l.command}\n${out}`;
      })
      .join("\n\n");

    navigator.clipboard.writeText(content);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 1500);
  };

  const handleExportSession = () => {
    if (logs.length === 0) return;
    const content = logs
      .map((l) => {
        const out = formatRedisOutput(l.response?.output, l.response?.rawOutput).formatted;
        return `[${l.timestamp}] redis[${db}]> ${l.command}\n${out}\n`;
      })
      .join("\n" + "-".repeat(50) + "\n\n");

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `memspace-console-db${db}-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Clear shortcut: Cmd+K / Ctrl+K / Ctrl+L
    if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K" || e.key === "l" || e.key === "L")) {
      e.preventDefault();
      setLogs([]);
      return;
    }

    // If suggestions are visible, handle Tab, Enter, Up, Down
    if (suggestions.length > 0 && !dismissSuggestions) {
      if (e.key === "Tab") {
        e.preventDefault();
        applySuggestion(suggestions[suggestionIdx].cmd);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSuggestionIdx((prev) => (prev + 1) % suggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSuggestionIdx((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1));
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setDismissSuggestions(true);
        return;
      }
    }

    if (e.key === "Enter") {
      handleExecute();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (history.length > 0) {
        const nextIdx = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(nextIdx);
        setInput(history[nextIdx]);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (history.length > 0 && historyIndex !== -1) {
        const nextIdx = historyIndex + 1;
        if (nextIdx >= history.length) {
          setHistoryIndex(-1);
          setInput("");
        } else {
          setHistoryIndex(nextIdx);
          setInput(history[nextIdx]);
        }
      }
    }
  };

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden bg-[#fafafa] font-sans text-zinc-800 select-none">
      {/* Output Console Feed - Takes full height without redundant header */}
      <div
        className={`flex-1 overflow-y-auto p-6 select-text sm:p-8 ${
          logs.length === 0 ? "flex flex-col items-center justify-center" : "space-y-2.5"
        }`}
      >
        <div
          className={`mx-auto w-full max-w-5xl ${
            logs.length === 0 ? "my-auto flex flex-col items-center justify-center" : "space-y-2.5"
          }`}
        >
          {/* Clean Empty State - Coloured Icon & Text Commands */}
          {logs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center select-none">
              <TermIcon size={34} strokeWidth={1.65} className="mb-2.5 text-rose-600" />
              <p className="mb-3 text-xs font-medium text-zinc-400">
                Ready for commands
              </p>
              <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 font-mono text-xs">
                {["PING", "INFO", "DBSIZE", "CLIENT LIST", "SLOWLOG GET 10"].map((cmd) => (
                  <button
                    key={cmd}
                    type="button"
                    onClick={() => {
                      setInput(cmd);
                      inputRef.current?.focus();
                    }}
                    className="group flex cursor-pointer items-center gap-1 py-0.5 text-zinc-400 transition-colors hover:text-rose-600"
                  >
                    <span className="font-semibold text-zinc-300 transition-colors group-hover:text-rose-500">
                      &gt;
                    </span>
                    <span className="underline-offset-2 group-hover:underline">{cmd}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Executed Command Blocks - Sleek & Refined */}
          {logs.map((log, i) => {
            const { formatted, isJson } = formatRedisOutput(
              log.response?.output,
              log.response?.rawOutput
            );
            const isCopied = copiedIdx === i;
            const hasError = !!log.response?.error;

            return (
              <div
                key={i}
                className="group rounded-xl border border-zinc-200/80 bg-white p-3 font-mono text-xs shadow-2xs transition-colors hover:border-zinc-300 sm:p-3.5 sm:text-[13px]"
              >
                {/* Command Line & Metadata */}
                <div className="flex items-center justify-between gap-3 select-text">
                  <div className="flex min-w-0 items-center gap-2 overflow-hidden">
                    <span className="font-bold text-rose-600 select-none">&gt;</span>
                    <span className="truncate font-semibold text-zinc-900">
                      {log.command}
                    </span>
                    {isJson && (
                      <span className="rounded border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 font-sans text-[9px] font-bold tracking-wider text-indigo-700 uppercase">
                        JSON
                      </span>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-2.5 font-sans text-[11px] text-zinc-400">
                    {log.response?.executionTimeMs !== undefined && (
                      <span className="flex items-center gap-1 font-mono text-[11px] text-zinc-400">
                        <Zap size={10} className="text-amber-500" />
                        <span>{log.response.executionTimeMs} ms</span>
                      </span>
                    )}

                    <span className="hidden text-zinc-300 sm:inline">•</span>
                    <span className="hidden text-zinc-400 sm:inline">{log.timestamp}</span>

                    <div className="flex items-center gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={() => {
                          setInput(log.command);
                          inputRef.current?.focus();
                        }}
                        className="cursor-pointer rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
                        title="Load command into prompt"
                      >
                        <CornerUpLeft size={12} />
                      </button>

                      <button
                        onClick={() => handleCopy(formatted, i)}
                        className="cursor-pointer rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
                        title="Copy output"
                      >
                        {isCopied ? (
                          <Check size={12} className="text-emerald-600" />
                        ) : (
                          <Copy size={12} />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Command Output */}
                <div className="mt-2 overflow-x-auto border-t border-zinc-100/90 pt-2 leading-relaxed select-text">
                  <pre
                    className={`break-all whitespace-pre-wrap ${
                      hasError ? "font-medium text-rose-600" : "text-zinc-700"
                    }`}
                  >
                    {formatted}
                  </pre>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Floating Command Bar Container */}
      <div className="relative shrink-0 border-t border-zinc-200 bg-[#fafafa] p-4 sm:p-6">
        <div className="relative mx-auto max-w-5xl">
          {/* Command Autocomplete Suggestions Popover */}
          {suggestions.length > 0 && !dismissSuggestions && (
            <div className="absolute inset-x-0 bottom-full z-20 mb-2 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg duration-150 animate-in fade-in slide-in-from-bottom-2">
              <div className="flex items-center justify-between border-b border-zinc-100 bg-zinc-50 px-3 py-1.5 text-[11px] font-medium text-zinc-500">
                <span>Suggested Commands</span>
                <span className="text-[10px] text-zinc-400">
                  Press <kbd className="rounded bg-zinc-200 px-1 text-zinc-700">Tab</kbd> or{" "}
                  <kbd className="rounded bg-zinc-200 px-1 text-zinc-700">↑</kbd>
                  <kbd className="rounded bg-zinc-200 px-1 text-zinc-700">↓</kbd>
                </span>
              </div>
              <div className="max-h-56 divide-y divide-zinc-100 overflow-y-auto">
                {suggestions.map((s, idx) => (
                  <button
                    key={s.cmd}
                    onClick={() => applySuggestion(s.cmd)}
                    className={`flex w-full cursor-pointer items-center justify-between px-3.5 py-2 text-left text-xs transition-colors ${
                      idx === suggestionIdx
                        ? "bg-rose-50 font-medium text-rose-900"
                        : "text-zinc-700 hover:bg-zinc-50"
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="shrink-0 font-mono text-xs font-bold text-rose-600">
                        {s.cmd}
                      </span>
                      <span className="truncate font-mono text-[11px] text-zinc-500">
                        {s.syntax}
                      </span>
                    </div>
                    <div className="ml-2 flex shrink-0 items-center gap-2">
                      <span className="hidden text-[11px] text-zinc-400 sm:inline">{s.desc}</span>
                      <span
                        className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold tracking-wider uppercase ${
                          categoryBadgeStyles[s.category]
                        }`}
                      >
                        {s.category}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input Bar */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm transition-all focus-within:border-rose-500 focus-within:ring-2 focus-within:ring-rose-500/20 sm:p-3.5">
            <div className="flex items-center gap-3">
              <span className="flex shrink-0 items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 font-mono text-xs font-semibold text-rose-700 select-none">
                <span className="size-1.5 animate-pulse rounded-full bg-rose-600" />
                {db > 0 ? `redis[${db}] >` : "redis >"}
              </span>

              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  setDismissSuggestions(false);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Type command (e.g. PING, GET key, HGETALL hash, INFO)..."
                className="flex-1 border-none bg-transparent font-mono text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
                autoFocus
              />

              {executing && (
                <div className="flex shrink-0 items-center gap-2 px-2 py-1 text-xs font-medium text-rose-600 select-none">
                  <span className="size-1.5 animate-ping rounded-full bg-rose-600" />
                  <span>Executing...</span>
                </div>
              )}
            </div>

            {/* Helper shortcuts & session action row */}
            <div className="mt-2 flex items-center justify-between border-t border-zinc-100 pt-2.5 text-[11px] text-zinc-500">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <kbd className="rounded border border-zinc-200 bg-zinc-100 px-1.5 py-0.5 font-sans text-[10px] text-zinc-600">
                    Enter
                  </kbd>
                  <span>run</span>
                </span>
                <span className="text-zinc-300">•</span>
                <span className="flex items-center gap-1">
                  <kbd className="rounded border border-zinc-200 bg-zinc-100 px-1.5 py-0.5 font-sans text-[10px] text-zinc-600">
                    Tab
                  </kbd>
                  <span>autocomplete</span>
                </span>
                <span className="text-zinc-300">•</span>
                <span className="flex items-center gap-1">
                  <kbd className="rounded border border-zinc-200 bg-zinc-100 px-1.5 py-0.5 font-sans text-[10px] text-zinc-600">
                    {modKey}K
                  </kbd>
                  <span>clear</span>
                </span>
                <span className="text-zinc-300">•</span>
                <span className="flex items-center gap-1">
                  <kbd className="rounded border border-zinc-200 bg-zinc-100 px-1.5 py-0.5 font-sans text-[10px] text-zinc-600">
                    ↑
                  </kbd>
                  <kbd className="rounded border border-zinc-200 bg-zinc-100 px-1.5 py-0.5 font-sans text-[10px] text-zinc-600">
                    ↓
                  </kbd>
                  <span>history</span>
                </span>
              </div>

              {/* Session utilities when entries exist */}
              <div className="flex items-center gap-2.5">
                {logs.length > 0 && (
                  <>
                    <button
                      onClick={handleCopyAll}
                      className="flex cursor-pointer items-center gap-1 font-medium text-zinc-500 transition-colors hover:text-zinc-800"
                      title="Copy full console session"
                    >
                      {copiedAll ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
                      <span>{copiedAll ? "Copied" : "Copy All"}</span>
                    </button>
                    <span className="text-zinc-300">•</span>
                    <button
                      onClick={handleExportSession}
                      className="flex cursor-pointer items-center gap-1 font-medium text-zinc-500 transition-colors hover:text-zinc-800"
                      title="Download session log (.txt)"
                    >
                      <Download size={11} />
                      <span>Export</span>
                    </button>
                    <span className="text-zinc-300">•</span>
                    <span className="font-medium text-zinc-400">
                      {logs.length} {logs.length === 1 ? "entry" : "entries"}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
