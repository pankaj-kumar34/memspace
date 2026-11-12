import React, { useMemo } from "react";
import { Copy, Check } from "lucide-react";

interface JsonSyntaxHighlighterProps {
  value: string;
  isJson?: boolean;
  searchTerm?: string;
  wrapLines?: boolean;
  className?: string;
  showLineNumbers?: boolean;
}

interface Token {
  type: "text" | "key" | "colon" | "string" | "number" | "boolean" | "null" | "punct";
  val: string;
}

// Robust JSON token matcher
const JSON_TOKEN_REGEX =
  /("(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*")(\s*:)?|(-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|\b(true|false)\b|\b(null)\b|([{}[\],:])/g;

export const JsonSyntaxHighlighter: React.FC<JsonSyntaxHighlighterProps> = ({
  value,
  isJson = true,
  searchTerm = "",
  wrapLines = false,
  showLineNumbers = true,
  className = "",
}) => {
  const [copiedLine, setCopiedLine] = React.useState<number | null>(null);

  // Split lines
  const lines = useMemo(() => {
    return value.split("\n");
  }, [value]);

  // Tokenize lines if JSON, or treat as plain lines
  const tokenizedLines = useMemo(() => {
    if (!isJson) {
      return lines.map((line) => [{ type: "text" as const, val: line }]);
    }

    return lines.map((line) => {
      const tokens: Token[] = [];
      let lastIndex = 0;
      let match: RegExpExecArray | null;
      const tokenRegex = new RegExp(JSON_TOKEN_REGEX.source, JSON_TOKEN_REGEX.flags);

      while ((match = tokenRegex.exec(line)) !== null) {
        if (match.index > lastIndex) {
          tokens.push({
            type: "text",
            val: line.slice(lastIndex, match.index),
          });
        }

        if (match[1]) {
          if (match[2]) {
            tokens.push({ type: "key", val: match[1] });
            tokens.push({ type: "colon", val: match[2] });
          } else {
            tokens.push({ type: "string", val: match[1] });
          }
        } else if (match[3]) {
          tokens.push({ type: "number", val: match[3] });
        } else if (match[4]) {
          tokens.push({ type: "boolean", val: match[4] });
        } else if (match[5]) {
          tokens.push({ type: "null", val: match[5] });
        } else if (match[6]) {
          tokens.push({ type: "punct", val: match[6] });
        }
        lastIndex = JSON_TOKEN_REGEX.lastIndex;
      }

      if (lastIndex < line.length) {
        tokens.push({
          type: "text",
          val: line.slice(lastIndex),
        });
      }

      return tokens;
    });
  }, [lines, isJson]);

  const handleCopyLine = (lineIdx: number, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedLine(lineIdx);
    setTimeout(() => setCopiedLine(null), 1200);
  };

  // Helper to highlight search term within text
  const renderHighlightedText = (text: string, defaultClass: string) => {
    if (!searchTerm.trim()) {
      return <span className={defaultClass}>{text}</span>;
    }

    const term = searchTerm.toLowerCase();
    const lower = text.toLowerCase();
    const parts: React.ReactNode[] = [];
    let start = 0;
    let idx = lower.indexOf(term, start);

    if (idx === -1) {
      return <span className={defaultClass}>{text}</span>;
    }

    while (idx !== -1) {
      if (idx > start) {
        parts.push(
          <span key={start} className={defaultClass}>
            {text.slice(start, idx)}
          </span>
        );
      }
      parts.push(
        <mark
          key={`m-${idx}`}
          className="rounded-xs bg-amber-300 px-0.5 font-bold text-amber-950"
        >
          {text.slice(idx, idx + term.length)}
        </mark>
      );
      start = idx + term.length;
      idx = lower.indexOf(term, start);
    }

    if (start < text.length) {
      parts.push(
        <span key={start} className={defaultClass}>
          {text.slice(start)}
        </span>
      );
    }

    return <>{parts}</>;
  };

  const getTokenClassName = (type: Token["type"]) => {
    switch (type) {
      case "key":
        return "text-indigo-600 font-semibold";
      case "colon":
        return "text-zinc-400 font-normal";
      case "string":
        return "text-emerald-600 font-normal";
      case "number":
        return "text-amber-600 font-medium";
      case "boolean":
        return "text-purple-600 font-semibold";
      case "null":
        return "text-rose-500 font-semibold italic";
      case "punct":
        return "text-zinc-400 font-normal";
      default:
        return "text-zinc-800";
    }
  };

  return (
    <div
      className={`relative h-full flex-1 overflow-auto font-mono text-xs select-text ${
        className || (showLineNumbers ? "bg-white" : "")
      }`}
    >
      <div className={`inline-block min-w-full ${showLineNumbers ? "py-2" : "py-0"}`}>
        {tokenizedLines.map((tokens, idx) => {
          const lineNum = idx + 1;
          const isCopied = copiedLine === idx;
          const rawLineText = lines[idx];

          return (
            <div
              key={idx}
              className={`group flex items-start leading-5 transition-colors ${
                showLineNumbers ? "px-2 hover:bg-zinc-100/70" : "px-0"
              } ${wrapLines ? "break-all whitespace-pre-wrap" : "whitespace-pre"}`}
            >
              {/* Line number gutter */}
              {showLineNumbers && (
                <div className="flex w-10 shrink-0 items-center justify-end gap-1 pr-3 text-right font-mono text-[11px] text-zinc-400 select-none">
                  <span className="opacity-70 transition-opacity group-hover:opacity-100">
                    {lineNum}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyLine(idx, rawLineText)}
                    className="cursor-pointer rounded p-0.5 text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100 hover:text-zinc-700"
                    title={`Copy line ${lineNum}`}
                  >
                    {isCopied ? (
                      <Check size={9} className="text-emerald-600" />
                    ) : (
                      <Copy size={9} />
                    )}
                  </button>
                </div>
              )}

              {/* Code Tokens */}
              <div
                className={`flex-1 ${
                  showLineNumbers ? "border-l border-zinc-100 pl-2" : "px-0"
                }`}
              >
                {tokens.length === 0 || (tokens.length === 1 && tokens[0].val === "") ? (
                  <span>&nbsp;</span>
                ) : (
                  tokens.map((token, tIdx) => (
                    <React.Fragment key={tIdx}>
                      {renderHighlightedText(token.val, getTokenClassName(token.type))}
                    </React.Fragment>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
