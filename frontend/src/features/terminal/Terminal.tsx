import React, { useState, useRef, useEffect } from "react";
import { Terminal as TermIcon, Trash2, CornerDownLeft, Zap } from "lucide-react";
import type { CliResponse } from "../../../bindings/redisian/backend/models/index.js";
import { CliService } from "../../../bindings/redisian/backend/services/index.js";

interface TerminalProps {
  connId: string;
  db: number;
  host: string;
  port: number;
}

interface LogEntry {
  command: string;
  response?: CliResponse | null;
  timestamp: string;
}

export const Terminal: React.FC<TerminalProps> = ({ connId, db, host, port }) => {
  const [input, setInput] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      command: "INFO server",
      timestamp: new Date().toLocaleTimeString(),
      response: {
        output: "Redisian Interactive CLI Ready. Type commands or HELP.",
        rawOutput: "Redisian Interactive CLI Ready. Type commands or HELP.",
        executionTimeMs: 0,
      },
    },
  ]);

  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [executing, setExecuting] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const parseCommandArgs = (cmd: string): string[] => {
    const regex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
    const args: string[] = [];
    let match;
    while ((match = regex.exec(cmd)) !== null) {
      args.push(match[1] || match[2] || match[0]);
    }
    return args;
  };

  const handleExecute = async () => {
    const trimmed = input.trim();
    if (!trimmed || executing) return;

    if (trimmed.toUpperCase() === "CLEAR") {
      setLogs([]);
      setInput("");
      return;
    }

    const args = parseCommandArgs(trimmed);
    setExecuting(true);
    setHistory((prev) => [...prev, trimmed]);
    setHistoryIndex(-1);

    const timeStr = new Date().toLocaleTimeString();

    try {
      const res = await CliService.ExecuteCommand(connId, db, args);
      setLogs((prev) => [
        ...prev,
        {
          command: trimmed,
          response: res,
          timestamp: timeStr,
        },
      ]);
    } catch (err: any) {
      setLogs((prev) => [
        ...prev,
        {
          command: trimmed,
          response: {
            output: null,
            rawOutput: `(error) ${err?.message || err}`,
            error: err?.message || String(err),
            executionTimeMs: 0,
          },
          timestamp: timeStr,
        },
      ]);
    } finally {
      setInput("");
      setExecuting(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
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
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      backgroundColor: "#070a13",
      borderTop: "1px solid #1f2937",
      color: "#e2e8f0",
      fontFamily: "monospace",
    }}>
      {/* Terminal Title Bar */}
      <div style={{
        padding: "0.5rem 1rem",
        backgroundColor: "#0d131f",
        borderBottom: "1px solid #1f2937",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        fontSize: "0.8125rem",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <TermIcon size={15} color="#3b82f6" />
          <span style={{ fontWeight: 600, color: "#f3f4f6" }}>Redis CLI Console</span>
          <span style={{ color: "#6b7280" }}>[{host}:{port} db{db}]</span>
        </div>

        <button
          onClick={() => setLogs([])}
          style={{
            background: "none",
            border: "none",
            color: "#9ca3af",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "0.25rem",
            fontSize: "0.75rem",
          }}
          title="Clear Terminal Output"
        >
          <Trash2 size={13} />
          <span>Clear</span>
        </button>
      </div>

      {/* Output Console */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        padding: "1rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.6rem",
        fontSize: "0.85rem",
      }}>
        {logs.map((log, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#38bdf8" }}>
              <span style={{ color: "#64748b", fontSize: "0.75rem" }}>[{log.timestamp}]</span>
              <span style={{ color: "#f43f5e" }}>&gt;</span>
              <span style={{ fontWeight: 600 }}>{log.command}</span>
              {log.response?.executionTimeMs !== undefined && (
                <span style={{ marginLeft: "auto", color: "#6b7280", fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "0.2rem" }}>
                  <Zap size={11} color="#eab308" />
                  {log.response.executionTimeMs} ms
                </span>
              )}
            </div>

            <div style={{
              paddingLeft: "1.25rem",
              color: log.response?.error ? "#f87171" : "#e2e8f0",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              lineHeight: "1.4",
            }}>
              {log.response?.rawOutput || JSON.stringify(log.response?.output, null, 2)}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Command Input Prompt */}
      <div style={{
        padding: "0.6rem 1rem",
        backgroundColor: "#0d131f",
        borderTop: "1px solid #1f2937",
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
      }}>
        <span style={{ color: "#38bdf8", fontWeight: 600, fontSize: "0.85rem" }}>
          {host}:{port}[{db}]&gt;
        </span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type Redis command (e.g. GET key, HGETALL myhash, INFO)..."
          className="font-mono"
          style={{
            flex: 1,
            backgroundColor: "transparent",
            border: "none",
            outline: "none",
            color: "#f3f4f6",
            fontSize: "0.85rem",
          }}
          autoFocus
        />
        <button
          onClick={handleExecute}
          disabled={executing || !input.trim()}
          style={{
            background: "none",
            border: "none",
            color: input.trim() ? "#3b82f6" : "#4b5563",
            cursor: input.trim() ? "pointer" : "default",
          }}
        >
          <CornerDownLeft size={16} />
        </button>
      </div>
    </div>
  );
};
