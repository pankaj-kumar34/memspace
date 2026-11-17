import React, { useEffect, useState, useMemo } from "react";
import { Keyboard, X, Search } from "lucide-react";
import { Button } from "./button";
import { isMacPlatform } from "../../lib/utils";

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isMac?: boolean;
}

interface ShortcutItem {
  name: string;
  keys: string[];
  description?: string;
}

interface ShortcutCategory {
  category: string;
  items: ShortcutItem[];
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({
  isOpen,
  onClose,
  isMac = isMacPlatform(),
}) => {
  if (!isOpen) return null;
  return <ShortcutsModalContent onClose={onClose} isMac={isMac} />;
};

const ShortcutsModalContent: React.FC<{
  onClose: () => void;
  isMac: boolean;
}> = ({ onClose, isMac }) => {
  const [search, setSearch] = useState("");
  const modSymbol = isMac ? "⌘" : "Ctrl";

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const categories: ShortcutCategory[] = useMemo(() => [
    {
      category: "Global Navigation",
      items: [
        { name: "New Connection", keys: [modSymbol, "N"] },
        { name: "Toggle Sidebar", keys: [modSymbol, "B"] },
        { name: "Keyboard Shortcuts", keys: [modSymbol, "/"] },
        { name: "Quick Help", keys: ["?"] },
      ],
    },
    {
      category: "Workspace Views",
      items: [
        { name: "Console (Terminal)", keys: [modSymbol, "1"] },
        { name: "Explorer", keys: [modSymbol, "2"] },
        { name: "Diagnostics Dashboard", keys: [modSymbol, "3"] },
        { name: "Pub / Sub Debugger", keys: [modSymbol, "4"] },
        { name: "Command Monitor", keys: [modSymbol, "5"] },
      ],
    },
    {
      category: "Key Editor & Viewer",
      items: [
        { name: "Save Key Changes", keys: [modSymbol, "S"] },
        { name: "Close / Dismiss", keys: ["Esc"] },
      ],
    },
    {
      category: "Console (Terminal)",
      items: [
        { name: "Execute Command", keys: ["Enter"] },
        { name: "Clear Output", keys: [modSymbol, "K"] },
        { name: "Command History", keys: ["↑", "↓"] },
        { name: "Auto-Complete", keys: ["Tab"] },
      ],
    },
  ], [modSymbol]);

  const filteredCategories = useMemo(() => {
    if (!search.trim()) return categories;
    const q = search.toLowerCase();
    return categories
      .map((cat) => ({
        ...cat,
        items: cat.items.filter(
          (item) =>
            item.name.toLowerCase().includes(q) ||
            item.keys.some((k) => k.toLowerCase().includes(q))
        ),
      }))
      .filter((cat) => cat.items.length > 0);
  }, [categories, search]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs duration-150 animate-in select-none fade-in"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-xl transform flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl transition-all duration-150 scale-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 bg-zinc-50/60 p-4 sm:px-5 sm:py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-600 shadow-2xs">
              <Keyboard size={16} />
            </div>
            <div>
              <h3 className="text-sm leading-tight font-bold text-zinc-900">
                Keyboard Shortcuts
              </h3>
              <p className="mt-0.5 text-[11px] text-zinc-500">
                Universal shortcuts across Memspace
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="rounded border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600">
              {isMac ? "macOS" : "Windows / Linux"}
            </span>
            <button
              onClick={onClose}
              className="flex size-7 cursor-pointer items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-200/70 hover:text-zinc-700"
              title="Close (Esc)"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="shrink-0 border-b border-zinc-100 bg-white p-3 sm:px-5">
          <div className="relative flex items-center">
            <Search size={14} className="pointer-events-none absolute left-3 text-zinc-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search shortcuts..."
              autoFocus
              className="h-8 w-full rounded-lg border border-zinc-200 bg-zinc-50 pr-3 pl-8 text-xs text-zinc-800 placeholder-zinc-400 transition-colors focus:border-rose-400 focus:bg-white focus:outline-none"
            />
          </div>
        </div>

        {/* Body / Categorized List */}
        <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
          {filteredCategories.length === 0 ? (
            <div className="py-8 text-center text-xs text-zinc-400">
              No shortcuts found matching "{search}".
            </div>
          ) : (
            filteredCategories.map((cat) => (
              <div key={cat.category} className="space-y-1.5">
                <div className="px-1 text-[10px] font-bold tracking-wider text-zinc-400 uppercase">
                  {cat.category}
                </div>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {cat.items.map((item) => (
                    <div
                      key={item.name}
                      className="flex items-center justify-between rounded-lg border border-zinc-100 bg-zinc-50/80 px-2.5 py-1.5 transition-colors hover:bg-zinc-100/70"
                    >
                      <span className="mr-2 truncate text-xs font-medium text-zinc-700">
                        {item.name}
                      </span>
                      <div className="flex shrink-0 items-center gap-1">
                        {item.keys.map((k, idx) => (
                          <kbd
                            key={idx}
                            className="rounded border border-zinc-200 bg-white px-1.5 py-0.5 font-mono text-[11px] font-semibold text-zinc-800 shadow-2xs"
                          >
                            {k}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between border-t border-zinc-100 bg-zinc-50/60 px-5 py-3 text-xs text-zinc-500">
          <div className="flex items-center gap-1.5">
            <span>Press</span>
            <kbd className="rounded border border-zinc-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-zinc-700 shadow-2xs">
              Esc
            </kbd>
            <span>to close</span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            className="h-8 cursor-pointer border-zinc-200 bg-white px-3.5 text-xs font-medium text-zinc-700 shadow-2xs hover:bg-zinc-100"
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};
