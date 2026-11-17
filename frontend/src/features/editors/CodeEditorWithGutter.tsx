import React, { useRef, useEffect, useMemo } from "react";

interface CodeEditorWithGutterProps {
  value: string;
  onChange: (val: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  readOnly?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  isJson?: boolean;
}

interface Token {
  type: "text" | "key" | "colon" | "string" | "number" | "boolean" | "null" | "punct";
  val: string;
}

const JSON_TOKEN_REGEX =
  /("(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*")(\s*:)?|(-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|\b(true|false)\b|\b(null)\b|([{}[\],:])/g;

const EDITOR_STYLE: React.CSSProperties = {
  fontFamily:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  fontSize: "12px",
  lineHeight: "20px",
  tabSize: 2,
};

export const CodeEditorWithGutter: React.FC<CodeEditorWithGutterProps> = ({
  value,
  onChange,
  onKeyDown,
  readOnly = false,
  placeholder = "Enter value...",
  autoFocus = false,
  isJson = false,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  const lines = useMemo(() => value.split("\n"), [value]);

  // Synchronize gutter & syntax highlight scrolling with textarea
  const handleScroll = () => {
    if (textareaRef.current) {
      const { scrollTop, scrollLeft } = textareaRef.current;
      if (gutterRef.current) {
        gutterRef.current.scrollTop = scrollTop;
      }
      if (highlightRef.current) {
        highlightRef.current.scrollTop = scrollTop;
        highlightRef.current.scrollLeft = scrollLeft;
      }
    }
  };

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  // Handle Tab key to insert 2 spaces
  const handleInternalKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;

      const newValue = value.substring(0, start) + "  " + value.substring(end);
      onChange(newValue);

      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      });
      return;
    }

    onKeyDown?.(e);
  };

  // Tokenize lines for syntax highlighting when isJson is true
  const tokenizedLines = useMemo(() => {
    if (!isJson) return [];

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
        lastIndex = tokenRegex.lastIndex;
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
    <div className="relative flex flex-1 overflow-hidden bg-white font-mono text-xs select-text">
      {/* Line Numbers Gutter */}
      <div
        ref={gutterRef}
        className="w-11 shrink-0 overflow-hidden border-r border-zinc-200/80 bg-zinc-50/70 py-2 pr-2.5 text-right font-mono text-[11px] text-zinc-400 select-none"
        style={{ ...EDITOR_STYLE, userSelect: "none" }}
        aria-hidden="true"
      >
        {lines.map((_, i) => (
          <div key={i} className="h-5">
            {i + 1}
          </div>
        ))}
      </div>

      {/* Editor Area */}
      <div className="relative h-full flex-1 overflow-hidden">
        {/* Syntax Highlighting Layer (Coloured text underneath) */}
        {isJson && (
          <div
            ref={highlightRef}
            className="pointer-events-none absolute inset-0 overflow-hidden p-2 whitespace-pre select-none"
            style={EDITOR_STYLE}
            aria-hidden="true"
          >
            {tokenizedLines.map((tokens, idx) => (
              <div key={idx} className="h-5 whitespace-pre">
                {tokens.length === 0 || (tokens.length === 1 && tokens[0].val === "") ? (
                  <span>&nbsp;</span>
                ) : (
                  tokens.map((token, tIdx) => (
                    <span key={tIdx} className={getTokenClassName(token.type)}>
                      {token.val}
                    </span>
                  ))
                )}
              </div>
            ))}
          </div>
        )}

        {/* Textarea Layer (Direct editing, caret, selection) */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={handleScroll}
          onKeyDown={handleInternalKeyDown}
          readOnly={readOnly}
          className={`absolute inset-0 resize-none overflow-auto border-0 p-2 font-mono text-xs leading-5 whitespace-pre outline-none ${
            isJson
              ? "bg-transparent text-transparent caret-rose-600 selection:bg-rose-500/20 selection:text-transparent"
              : "bg-white text-zinc-900 caret-zinc-900"
          }`}
          style={EDITOR_STYLE}
          placeholder={placeholder}
          spellCheck={false}
        />
      </div>
    </div>
  );
};
