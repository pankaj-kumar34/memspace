import React from "react";
import {
  Plus,
  Server,
  Power,
  Edit2,
  Trash2,
  Shield,
  Plug,
  Unplug,
  Lock,
  Terminal as TermIcon,
  Braces,
  Gauge,
  Radio,
  Activity,
  Download,
  Sparkles
} from "lucide-react";
import type { ConnectionConfig, ConnectionStatus } from "../../../bindings/memspace/backend/models/index.js";
import { Button } from "../../components/ui/button";
import { useFlipReorder } from "../../lib/useFlipReorder";
import { getModSymbol } from "../../lib/utils";

interface ConnectionListProps {
  connections: ConnectionConfig[];
  activeConnId: string | null;
  activeStatus: ConnectionStatus | null;
  activeTab?: "terminal" | "explorer" | "diagnostics" | "pubsub" | "monitor";
  onSelectTab?: (tab: "terminal" | "explorer" | "diagnostics" | "pubsub" | "monitor") => void;
  onConnect: (id: string) => void;
  onDisconnect: (id: string) => void;
  onEdit: (cfg: ConnectionConfig) => void;
  onDelete?: (id: string, name: string) => void;
  onAddNew: () => void;
  onRefresh: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  connectingId?: string | null;
  appVersion?: string;
  updateAvailableVersion?: string | null;
  onOpenUpdater?: () => void;
}

export const ConnectionList: React.FC<ConnectionListProps> = ({
  connections,
  activeConnId,
  activeStatus,
  activeTab = "terminal",
  onSelectTab,
  onConnect,
  onDisconnect,
  onEdit,
  onDelete,
  onAddNew,
  isCollapsed = false,
  onToggleCollapse,
  connectingId = null,
  appVersion = "1.0.0",
  updateAvailableVersion = null,
  onOpenUpdater,
}) => {
  const { containerRef: expandedContainerRef, registerItem: registerExpandedItem } =
    useFlipReorder(connections, "expanded");
  const { containerRef: railContainerRef, registerItem: registerRailItem } =
    useFlipReorder(connections, "rail");

  const handleDelete = (id: string, name: string) => {
    if (onDelete) {
      onDelete(id, name);
    }
  };

  const isConnected = !!(activeConnId && activeStatus?.connected);

  const modSymbol = getModSymbol();

  const navItems: Array<{
    id: "terminal" | "explorer" | "diagnostics" | "pubsub" | "monitor";
    label: string;
    icon: React.ReactNode;
    shortcut: string;
  }> = [
    { id: "terminal", label: "Console", icon: <TermIcon size={15} />, shortcut: `${modSymbol}1` },
    { id: "explorer", label: "Explorer", icon: <Braces size={15} />, shortcut: `${modSymbol}2` },
    { id: "diagnostics", label: "Diagnostics", icon: <Gauge size={15} />, shortcut: `${modSymbol}3` },
    { id: "pubsub", label: "Pub / Sub", icon: <Radio size={15} />, shortcut: `${modSymbol}4` },
    { id: "monitor", label: "Monitor", icon: <Activity size={15} />, shortcut: `${modSymbol}5` },
  ];

  const getAccentColor = (conn: ConnectionConfig) => {
    if (conn.color && conn.color.trim() !== "") return conn.color;
    const g = (conn.group || "").toLowerCase();
    if (g.includes("prod")) return "#e11d48"; // Production: Rose
    if (g.includes("stag") || g.includes("uat")) return "#f59e0b"; // Staging: Amber
    if (g.includes("local")) return "#10b981"; // Local: Emerald
    if (g.includes("dev")) return "#3b82f6"; // Development: Blue
    return "#3b82f6"; // Default Development: Blue
  };

  return (
    <aside
      className={`relative flex h-full shrink-0 flex-col overflow-hidden border-r border-zinc-800 bg-zinc-900 transition-[width] duration-300 ease-in-out select-none ${
        isCollapsed ? "w-16" : "w-72"
      }`}
    >
      {/* Top Header - persistent across both states, perfectly aligned */}
      <div className="flex h-14 w-full shrink-0 items-center gap-2.5 overflow-hidden border-b border-zinc-800 bg-zinc-900/90 px-4">
        <img
          src="/icon.png"
          alt="Memspace"
          onClick={onToggleCollapse}
          className="size-8 shrink-0 cursor-pointer rounded-lg object-contain shadow-md transition-all hover:scale-105"
          title={isCollapsed ? `Expand Sidebar (${modSymbol}B)` : `Collapse Sidebar (${modSymbol}B)`}
        />
        <span
          className={`text-sm font-bold tracking-tight whitespace-nowrap text-white transition-all duration-200 ${
            isCollapsed
              ? "pointer-events-none invisible -translate-x-2 opacity-0"
              : "translate-x-0 opacity-100"
          }`}
        >
          Memspace
        </span>
      </div>

      {/* Main Body Area: Holds Collapsed Rail & Expanded View */}
      <div className="relative min-h-0 w-full flex-1 overflow-hidden">
        {/* Layer 1: Collapsed Rail View */}
        <div
          className={`absolute inset-0 flex w-16 flex-col items-center transition-all duration-200 ${
            isCollapsed
              ? "pointer-events-auto visible translate-x-0 opacity-100"
              : "pointer-events-none invisible -translate-x-2 opacity-0"
          }`}
        >
          {/* Top Section: Navigation Tool Icons (Boot & Shutdown Animation) */}
          <div className={`sidebar-rail-boot w-full shrink-0 flex-col items-center gap-1.5 px-2 pt-3 ${!isConnected ? "shutdown" : ""}`}>
            {navItems.map((item) => {
              const isActive = isConnected && activeTab === item.id;
              const disabled = !isConnected;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    if (onSelectTab) onSelectTab(item.id);
                  }}
                  className={`flex size-9 cursor-pointer items-center justify-center rounded-xl transition-all ${
                    isActive
                      ? "bg-rose-600 text-white shadow-xs"
                      : disabled
                      ? "text-zinc-600 opacity-50 hover:bg-zinc-800/60 hover:text-zinc-300 hover:opacity-100"
                      : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
                  }`}
                  title={disabled ? `${item.label} (Connect to open • ${item.shortcut})` : `${item.label} (${item.shortcut})`}
                >
                  {item.icon}
                </button>
              );
            })}
          </div>

          {/* Divider between tools and server list (only shown when connected) */}
          {isConnected && <div className="my-2 h-px w-7 shrink-0 bg-zinc-800 transition-all duration-200" />}

          {/* Bottom Section: Server Icons / Dots */}
          <div ref={railContainerRef} className="flex w-full flex-1 flex-col items-center space-y-2.5 overflow-y-auto p-2">
            {connections.map((conn) => {
              const isConnConnected = activeConnId === conn.id && activeStatus?.connected;
              const isSelected = activeConnId === conn.id;
              const isConnecting = connectingId === conn.id;
              const accentColor = getAccentColor(conn);

              return (
                <button
                  key={conn.id}
                  ref={(el) => registerRailItem(conn.id, el)}
                  onClick={() => {
                    if (!isConnConnected && !isConnecting) {
                      onConnect(conn.id);
                    }
                  }}
                  disabled={isConnecting}
                  className={`relative flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-xl transition-all duration-200 ${
                    isConnConnected
                      ? "z-10 text-white"
                      : isSelected
                      ? "text-white shadow-sm"
                      : "border border-transparent text-zinc-400 hover:bg-zinc-800"
                  } ${isConnecting ? "cursor-wait" : ""}`}
                  style={{
                    backgroundColor: isConnConnected
                      ? `${accentColor}25`
                      : isSelected
                      ? `${accentColor}18`
                      : undefined,
                    borderColor: isConnConnected
                      ? `${accentColor}90`
                      : isSelected
                      ? `${accentColor}50`
                      : undefined,
                    boxShadow: isConnConnected
                      ? `0 0 16px -1px ${accentColor}65, inset 0 0 8px ${accentColor}25`
                      : undefined,
                  }}
                  title={
                    isConnecting
                      ? `Connecting to ${conn.name}...`
                      : `${conn.name}${conn.ephemeral ? " (Temp)" : ""} (${conn.host}:${conn.port})`
                  }
                >
                  <span
                    className={`size-3 rounded-full ring-2 ring-zinc-900 transition-all duration-200 ${
                      isConnecting ? "scale-125 animate-pulse" : ""
                    }`}
                    style={{
                      backgroundColor: accentColor,
                      boxShadow: isConnConnected || isConnecting ? `0 0 10px ${accentColor}` : undefined,
                    }}
                  />
                </button>
              );
            })}
          </div>

          {/* Add Connection & Update Quick Buttons */}
          <div className="flex w-full shrink-0 flex-col items-center justify-center gap-2 border-t border-zinc-800/80 p-2.5">
            {onOpenUpdater && updateAvailableVersion && (
              <button
                onClick={onOpenUpdater}
                className="relative flex size-9 cursor-pointer items-center justify-center rounded-xl border border-rose-500/40 bg-rose-600/20 text-rose-400 transition-all hover:bg-rose-600/30"
                title={`Update available: v${updateAvailableVersion} (Click to install)`}
              >
                <Download size={14} />
                <span className="absolute -top-0.5 -right-0.5 size-2.5 animate-pulse rounded-full bg-rose-500 ring-2 ring-zinc-900" />
              </button>
            )}
            <button
              onClick={onAddNew}
              className="flex size-9 cursor-pointer items-center justify-center rounded-xl border border-zinc-700/80 bg-zinc-800 text-zinc-300 shadow-sm transition-all hover:bg-zinc-700 hover:text-white"
              title={`New Connection (${modSymbol}N)`}
            >
              <Plus size={16} />
            </button>
          </div>
        </div>

        {/* Layer 2: Expanded View */}
        <div
          className={`absolute inset-y-0 left-0 flex w-72 flex-col transition-all duration-200 ${
            isCollapsed
              ? "pointer-events-none invisible translate-x-2 opacity-0"
              : "pointer-events-auto visible translate-x-0 opacity-100"
          }`}
        >
          {/* TOP SECTION: Workspace Navigation (Boot & Shutdown Animation) */}
          <div className={`sidebar-boot-container shrink-0 border-b border-zinc-800/80 bg-zinc-900/50 ${!isConnected ? "shutdown" : ""}`}>
            <div className="sidebar-boot-inner flex flex-col p-3">
              {/* Section Label */}
              <div className="mb-2.5 px-1 text-xs font-bold tracking-wider text-zinc-400 uppercase">
                Navigation
              </div>

              {/* Nav Items */}
              <nav className="flex flex-col gap-1">
                {navItems.map((item) => {
                  const isActive = isConnected && activeTab === item.id;
                  const disabled = !isConnected;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        if (onSelectTab) onSelectTab(item.id);
                      }}
                      className={`sidebar-boot-item group relative flex h-9 cursor-pointer items-center justify-between rounded-xl px-3 text-sm transition-all ${
                        isActive
                          ? "bg-rose-600 font-medium text-white shadow-xs"
                          : disabled
                          ? "text-zinc-500 opacity-60 hover:bg-zinc-800/50 hover:text-zinc-200 hover:opacity-100"
                          : "font-normal text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-100"
                      }`}
                      title={disabled ? `${item.label} (Connect to open • ${item.shortcut})` : `${item.label} (${item.shortcut})`}
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className={isActive ? "text-white" : disabled ? "text-zinc-600" : "text-zinc-400 group-hover:text-zinc-200"}>
                          {item.icon}
                        </span>
                        <span className="truncate">{item.label}</span>
                      </div>
                      <span
                        className={`rounded px-1.5 py-0.5 font-mono text-xs ${
                          isActive ? "bg-white/20 text-white" : "text-zinc-500 group-hover:text-zinc-400"
                        }`}
                      >
                        {item.shortcut}
                      </span>
                    </button>
                  );
                })}
              </nav>
            </div>
          </div>

          {/* BOTTOM SECTION: Connections */}
          <div className="flex min-h-0 flex-1 flex-col bg-zinc-900">
            <div className="flex shrink-0 items-center justify-between px-4 pt-3 pb-1.5">
              <span className="text-xs font-bold tracking-wider text-zinc-400 uppercase">
                Connections ({connections.length})
              </span>
              <button
                onClick={onAddNew}
                className="flex size-6 cursor-pointer items-center justify-center rounded-lg bg-transparent text-zinc-400 transition-all hover:bg-zinc-800 hover:text-zinc-100 active:scale-92"
                title={`New Connection (${modSymbol}N)`}
              >
                <Plus size={14} />
              </button>
            </div>

            {/* Flat Connection List */}
            <div ref={expandedContainerRef} className="flex-1 space-y-2.5 overflow-y-auto p-3">
              {connections.length === 0 ? (
                <div className="flex flex-col items-center px-4 py-12 text-center text-xs text-zinc-400">
                  <div className="mb-3 flex size-12 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-400">
                    <Server size={20} className="text-rose-600" />
                  </div>
                  <p className="text-xs font-semibold text-zinc-200">No connections found</p>
                  <p className="mt-1 max-w-50 text-[11px] leading-relaxed text-zinc-400">
                    Create a connection to get started.
                  </p>
                  <Button
                    onClick={onAddNew}
                    variant="default"
                    size="sm"
                    className="mt-4 h-8 gap-1.5 rounded-lg text-xs shadow-sm"
                  >
                    <Plus size={13} /> New Connection
                  </Button>
                </div>
              ) : (
                connections.map((conn) => {
                  const isConnConnected = activeConnId === conn.id && activeStatus?.connected;
                  const isSelected = activeConnId === conn.id;
                  const isConnecting = connectingId === conn.id;
                  const accentColor = getAccentColor(conn);

                  return (
                    <div
                      key={conn.id}
                      ref={(el) => registerExpandedItem(conn.id, el)}
                      className={`group relative flex items-center justify-between rounded-2xl border py-3 pr-2.5 pl-4 transition-all ${
                        isSelected
                          ? "text-white shadow-md"
                          : "border-zinc-800/80 bg-zinc-800/40 text-zinc-300 hover:border-zinc-700/80 hover:bg-zinc-800/60"
                      } ${isConnecting ? "opacity-90" : ""}`}
                      style={{
                        backgroundColor: isSelected ? `${accentColor}18` : undefined,
                        borderColor: isSelected ? `${accentColor}50` : undefined,
                      }}
                    >
                      {/* Left Accent Indicator Pill (Modern Linear/Raycast style) */}
                      <div
                        className="absolute inset-y-3.5 left-1.5 w-1 rounded-full transition-all duration-150 group-hover:w-1.5"
                        style={{ backgroundColor: accentColor }}
                      />

                      <div className="mr-2 flex min-w-0 flex-1 items-center overflow-hidden">
                        {/* Name and Host Info */}
                        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                          <div className="flex items-center gap-1.5 truncate">
                            <span
                              className={`truncate text-sm font-bold tracking-tight transition-colors ${
                                isSelected ? "text-white" : "text-zinc-100 group-hover:text-white"
                              }`}
                            >
                              {conn.name}
                            </span>

                            {conn.ephemeral && (
                              <span
                                title="Temporary connection (deleted on disconnect)"
                                className="shrink-0 rounded border border-emerald-500/30 bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400"
                              >
                                Temp
                              </span>
                            )}

                            {conn.readOnly && (
                              <span title="Read-Only Mode Enabled: Destructive commands blocked" className="flex shrink-0 items-center text-rose-400">
                                <Shield size={11} />
                              </span>
                            )}
                            {conn.tls?.enabled && (
                              <span title="TLS Encryption Enabled" className="flex shrink-0 items-center text-emerald-400">
                                <Lock size={11} />
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex items-center font-mono text-xs text-zinc-400">
                            <span className="truncate" title={conn.host}>
                              {conn.host}
                            </span>
                            <span className="shrink-0 font-medium text-zinc-500">
                              :{conn.port}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Action Controls */}
                      <div className="ml-1.5 flex shrink-0 items-center gap-1">
                        {/* Hover Actions (Edit & Delete): Slide in to the left on hover */}
                        <div className="hidden items-center gap-1 group-hover:flex">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onEdit(conn);
                            }}
                            className="flex size-7.5 cursor-pointer items-center justify-center rounded-xl text-zinc-400 transition-colors hover:text-zinc-100"
                            title="Edit Connection"
                          >
                            <Edit2 size={13} />
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(conn.id, conn.name);
                            }}
                            className="flex size-7.5 cursor-pointer items-center justify-center rounded-xl text-zinc-400 transition-colors hover:text-rose-400"
                            title="Delete Connection"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>

                        {/* Connected/Disconnect Button OR Connect Button (Pure Icon Ghost Style: No Background) */}
                        {isConnConnected ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDisconnect(conn.id);
                            }}
                            className="group/disc flex size-7.5 cursor-pointer items-center justify-center rounded-xl bg-transparent text-emerald-400 transition-all hover:bg-zinc-800 hover:text-rose-400 active:scale-93"
                            title="Connected • Click to Disconnect"
                          >
                            <Plug size={14} className="group-hover/disc:hidden" />
                            <Unplug size={14} className="hidden group-hover/disc:inline" />
                          </button>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!isConnecting) {
                                onConnect(conn.id);
                              }
                            }}
                            disabled={isConnecting}
                            className={`flex size-7.5 cursor-pointer items-center justify-center rounded-xl bg-transparent transition-all hover:bg-zinc-800 active:scale-93 ${
                              isConnecting
                                ? "cursor-wait text-rose-400"
                                : "text-rose-500 hover:text-emerald-400"
                            }`}
                            title={isConnecting ? "Connecting..." : "Power On • Connect"}
                          >
                            <Power size={14} className={isConnecting ? "animate-pulse" : ""} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Sidebar Footer: Auto-Update Status */}
            {onOpenUpdater && updateAvailableVersion && (
              <div className="flex shrink-0 items-center justify-between border-t border-zinc-800/80 bg-zinc-900/90 px-3.5 py-2.5">
                <button
                  onClick={onOpenUpdater}
                  className="flex cursor-pointer items-center gap-2 font-mono text-xs text-zinc-400 transition-colors hover:text-zinc-200"
                  title="Check for updates from GitHub Releases"
                >
                  <span>v{appVersion}</span>
                </button>

                <button
                  onClick={onOpenUpdater}
                  className="flex cursor-pointer items-center gap-1.5 rounded-full border border-rose-500/40 bg-rose-600/20 px-2.5 py-1 text-[11px] font-semibold text-rose-300 shadow-2xs transition-all hover:bg-rose-600/30"
                  title={`Install Memspace v${updateAvailableVersion}`}
                >
                  <Sparkles size={11} className="text-rose-400" />
                  <span>Update v{updateAvailableVersion}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
};
