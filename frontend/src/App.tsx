import React, { useState, useEffect, useRef } from "react";
import {
  Server,
  Key,
  Braces,
  Terminal as TermIcon,
  Gauge,
  Radio,
  Activity,
  Plus,
  AlertTriangle,
  Clock,
  Shield,
  Zap,
  PanelLeftClose,
  PanelLeft,
  Database,
  Lock,
  Unplug,
  Edit2,
  Trash2,
  Layers,
  RefreshCw,
  Power,
} from "lucide-react";
import type {
  AppVersionInfo,
  ConnectionConfig,
  ConnectionStatus,
  UpdateCheckResult,
} from "../bindings/memspace/backend/models/index.js";
import {
  ConnectionService,
  UpdaterService,
} from "../bindings/memspace/backend/services/index.js";
import { Events } from "@wailsio/runtime";
import { ConnectionList } from "./features/connections/ConnectionList";
import { ConnectionProfile } from "./features/connections/ConnectionProfile";
import { KeyExplorer } from "./features/explorer/KeyExplorer";
import { KeyValueViewer } from "./features/editors/KeyValueViewer";
import { Terminal } from "./features/terminal/Terminal";
import { ServerMetricsDashboard } from "./features/diagnostics/ServerMetricsDashboard";
import { PubSubDebugger } from "./features/pubsub/PubSubDebugger";
import { MonitorViewer } from "./features/monitor/MonitorViewer";
import { Button } from "./components/ui/button";
import { Badge } from "./components/ui/badge";
import { ConfirmModal } from "./components/ui/ConfirmModal";
import { ShortcutsModal } from "./components/ui/ShortcutsModal";
import { UpdateModal } from "./components/ui/UpdateModal";
import { useToast } from "./components/ui/Toast";
import {
  applyConnectionOrder,
  reorderWithConnectedFirst,
  removeConnectionFromOrder,
} from "./lib/connectionOrder";
import { getErrorMessage, getModSymbol, isMacPlatform } from "./lib/utils";

interface MemspaceWindowBridge extends Window {
  __navTab?: (tab: unknown) => void;
  __toggleSidebar?: () => void;
  __newConn?: () => void;
  __toggleShortcuts?: () => void;
}

export function App() {
  const { error: toastError } = useToast();
  const [connections, setConnections] = useState<ConnectionConfig[]>([]);
  const [activeConnId, setActiveConnId] = useState<string | null>(null);
  const [activeStatus, setActiveStatus] = useState<ConnectionStatus | null>(
    null,
  );
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    "terminal" | "explorer" | "diagnostics" | "pubsub" | "monitor"
  >("terminal");
  const [currentDb, setCurrentDb] = useState(0);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [deletedKeyInfo, setDeletedKeyInfo] = useState<{ key: string; id: number } | null>(null);
  const [renamedKeyInfo, setRenamedKeyInfo] = useState<{ oldKey: string; newKey: string; id: number } | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const isMac = isMacPlatform();
  const modSymbol = getModSymbol();

  // Dialog State
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editingConfig, setEditingConfig] = useState<ConnectionConfig | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isUpdaterOpen, setIsUpdaterOpen] = useState(false);
  const [versionInfo, setVersionInfo] = useState<AppVersionInfo | null>(null);
  const [updateCheckResult, setUpdateCheckResult] =
    useState<UpdateCheckResult | null>(null);
  const [activePubSubChannels, setActivePubSubChannels] = useState<string[]>(
    [],
  );
  const [pendingPubSubAction, setPendingPubSubAction] = useState<{
    type: "connect" | "disconnect";
    id: string;
    directConn?: ConnectionConfig;
    title: string;
    description: string;
    confirmText: string;
  } | null>(null);

  const [ephemeralConn, setEphemeralConn] = useState<ConnectionConfig | null>(null);

  // Stable refs for event listeners and global window bridge
  const connectionsRef = useRef(connections);
  const activeConnIdRef = useRef(activeConnId);
  const activeStatusRef = useRef(activeStatus);
  const handleNavTabRef = useRef<
    (tab: "terminal" | "explorer" | "diagnostics" | "pubsub" | "monitor") => void
  >(() => {});
  const handleOpenAddRef = useRef<() => void>(() => {});

  const loadConnections = async () => {
    try {
      const list = await ConnectionService.GetConnections();
      const savedOnly = (list || []).filter((c) => !c.ephemeral);
      const ordered = applyConnectionOrder(savedOnly);
      setConnections(ordered);
      return ordered;
    } catch (err) {
      console.error("Failed to load connections:", err);
      return [];
    }
  };

  const handleConnect = async (
    id: string,
    directConn?: ConnectionConfig,
  ): Promise<boolean> => {
    let conn = directConn || connections.find((c) => c.id === id);
    if (!conn) {
      const list = await loadConnections();
      conn = (list || []).find((c) => c.id === id);
    }
    const previousConnId = activeConnId;
    setConnectingId(id);
    try {
      const status = await ConnectionService.Connect(id);
      if (!status || !status.connected) {
        throw new Error(
          status?.errorMessage || "Failed to establish connection",
        );
      }
      const initialDb = conn?.type === "cluster" ? 0 : (conn?.database ?? 0);
      setActiveConnId(id);
      setActiveStatus(status);
      setSelectedKey(null);
      setCurrentDb(initialDb);

      // Clean up previous active connection on the backend if switching to a different server
      if (previousConnId && previousConnId !== id) {
        ConnectionService.Disconnect(previousConnId)
          .then(() => {
            if (ephemeralConn?.id === previousConnId) {
              setEphemeralConn(null);
              ConnectionService.DeleteConnection(previousConnId).catch(() => {});
            }
            const prevConn = connectionsRef.current.find(
              (c) => c.id === previousConnId,
            );
            if (prevConn?.ephemeral) {
              removeConnectionFromOrder(previousConnId);
              loadConnections();
            }
          })
          .catch((err) => {
            console.warn("Failed to disconnect previous connection:", err);
          });
      }

      // Promote connected profile to the first position with smooth animation (saved profiles only)
      if (!conn?.ephemeral) {
        setConnections((prev) => {
          const exists = prev.some((c) => c.id === id);
          const baseList = exists ? prev : conn ? [...prev, conn] : prev;
          return reorderWithConnectedFirst(baseList, id);
        });
      }

      return true;
    } catch (err: unknown) {
      let errMsg = getErrorMessage(err) || "Unknown error";
      // Remove dial host:port prefix and any host reference so server host is not exposed in toast
      errMsg = errMsg.replace(/dial (?:tcp|udp)?\s*[^:]+:\d+:\s*/gi, "");
      errMsg = errMsg.replace(/lookup\s+[^:]+:\s*/gi, "lookup: ");
      if (conn?.host && conn.host.trim()) {
        errMsg = errMsg.split(conn.host).join("");
      }
      errMsg = errMsg.replace(/^:\s*/, "").trim();

      const connName = conn?.name || "Server";
      toastError(
        "Connection Failed",
        `Could not connect to "${connName}": ${errMsg}`,
      );
      return false;
    } finally {
      setConnectingId(null);
    }
  };

  const handleDisconnect = async (id: string) => {
    try {
      const conn =
        connections.find((c) => c.id === id) ||
        (ephemeralConn?.id === id ? ephemeralConn : null);
      await ConnectionService.Disconnect(id);
      if (conn?.ephemeral) {
        removeConnectionFromOrder(id);
        await ConnectionService.DeleteConnection(id);
        setEphemeralConn(null);
      }
      if (activeConnId === id) {
        setActiveConnId(null);
        setActiveStatus(null);
        setSelectedKey(null);
        setActiveTab("terminal");
        setCurrentDb(0);
      }
      await loadConnections();
    } catch (err: unknown) {
      toastError(
        "Disconnect Failed",
        `Failed to disconnect: ${getErrorMessage(err)}`,
      );
    }
  };

  const requestConnect = (id: string, directConn?: ConnectionConfig) => {
    if (activeConnId === id) return;

    if (activeConnId && activePubSubChannels.length > 0) {
      const activeConn = connections.find((c) => c.id === activeConnId);
      const activeName = activeConn?.name || "current server";
      const targetConn = directConn || connections.find((c) => c.id === id);
      const targetName = targetConn?.name || "new server";

      setPendingPubSubAction({
        type: "connect",
        id,
        directConn,
        title: "Active Pub/Sub Subscriptions",
        description: `You are currently subscribed to ${activePubSubChannels.length} channel${
          activePubSubChannels.length > 1 ? "s" : ""
        } (${activePubSubChannels.join(", ")}) on "${activeName}". Switching to "${targetName}" will cancel these subscriptions. Do you want to proceed?`,
        confirmText: "Switch Connection",
      });
      return;
    }

    handleConnect(id, directConn);
  };

  const requestDisconnect = (id: string) => {
    if (activeConnId === id && activePubSubChannels.length > 0) {
      const activeConn = connections.find((c) => c.id === activeConnId);
      const activeName = activeConn?.name || "current server";

      setPendingPubSubAction({
        type: "disconnect",
        id,
        title: "Active Pub/Sub Subscriptions",
        description: `You are currently subscribed to ${activePubSubChannels.length} channel${
          activePubSubChannels.length > 1 ? "s" : ""
        } (${activePubSubChannels.join(", ")}) on "${activeName}". Disconnecting will cancel these subscriptions. Do you want to proceed?`,
        confirmText: "Disconnect",
      });
      return;
    }

    handleDisconnect(id);
  };

  const handleConfirmPubSubAction = () => {
    if (!pendingPubSubAction) return;
    const action = pendingPubSubAction;
    setPendingPubSubAction(null);

    if (action.id === "__localhost_quick__") {
      proceedQuickConnectLocal();
    } else if (action.type === "connect") {
      handleConnect(action.id, action.directConn);
    } else if (action.type === "disconnect") {
      handleDisconnect(action.id);
    }
  };

  const handleCancelPubSubAction = () => {
    setPendingPubSubAction(null);
  };

  const handleSelectDb = (db: number) => {
    setCurrentDb(db);
    setSelectedKey(null);
  };

  const handleOpenAdd = () => {
    setEditingConfig(null);
    setIsEditingProfile(true);
  };

  const handleNavTab = (
    tab: "terminal" | "explorer" | "diagnostics" | "pubsub" | "monitor",
  ) => {
    const isConn = !!(
      activeConnIdRef.current && activeStatusRef.current?.connected
    );
    if (isConn) {
      setActiveTab(tab);
      if (tab === "explorer") {
        setSidebarCollapsed(true);
      }
      setIsEditingProfile(false);
      setEditingConfig(null);
      return;
    }

    const conns = connectionsRef.current;
    if (conns && conns.length > 0) {
      const targetConn =
        conns.find((c) => c.id === activeConnIdRef.current) || conns[0];
      setActiveTab(tab);
      if (tab === "explorer") {
        setSidebarCollapsed(true);
      }
      setIsEditingProfile(false);
      setEditingConfig(null);
      handleConnect(targetConn.id, targetConn);
      return;
    }

    const tabLabels: Record<string, string> = {
      terminal: `Console (${modSymbol}1)`,
      explorer: `Explorer (${modSymbol}2)`,
      diagnostics: `Diagnostics (${modSymbol}3)`,
      pubsub: `Pub / Sub (${modSymbol}4)`,
      monitor: `Monitor (${modSymbol}5)`,
    };
    toastError(
      "Connection Required",
      `Connect to a Redis instance first to access ${tabLabels[tab] || tab}.`,
    );
  };

  useEffect(() => {
    connectionsRef.current = connections;
    activeConnIdRef.current = activeConnId;
    activeStatusRef.current = activeStatus;
    handleNavTabRef.current = handleNavTab;
    handleOpenAddRef.current = handleOpenAdd;
  });

  useEffect(() => {
    ConnectionService.GetConnections()
      .then((list) => {
        const savedOnly = (list || []).filter((c) => !c.ephemeral);
        setConnections(applyConnectionOrder(savedOnly));
      })
      .catch((err) => {
        console.error("Failed to load connections:", err);
      });

    // Load current version info and perform a non-blocking startup update check
    UpdaterService.GetVersionInfo()
      .then((info) => {
        if (info) setVersionInfo(info);
      })
      .catch(() => {});

    UpdaterService.CheckForUpdate()
      .then((res) => {
        if (res) setUpdateCheckResult(res);
      })
      .catch(() => {});

    // 1. Listen for native desktop shortcuts via Wails Events
    const cancelNav = Events.On("nav:tab", (eventData: unknown) => {
      const raw = eventData as { data?: unknown } | string | null;
      const tab = raw && typeof raw === "object" && "data" in raw ? raw.data : raw;
      if (
        tab === "terminal" ||
        tab === "explorer" ||
        tab === "diagnostics" ||
        tab === "pubsub" ||
        tab === "monitor"
      ) {
        handleNavTabRef.current(tab);
      }
    });

    const cancelToggleSidebar = Events.On("nav:toggle-sidebar", () => {
      setSidebarCollapsed((prev) => !prev);
    });

    const cancelNewConn = Events.On("nav:new-connection", () => {
      handleOpenAddRef.current();
    });

    let lastToggleTime = 0;
    const triggerToggleShortcuts = (e?: Event) => {
      const now = Date.now();
      if (now - lastToggleTime < 250) return;
      lastToggleTime = now;
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      setIsShortcutsOpen((prev) => !prev);
    };

    const cancelShortcuts = Events.On("nav:shortcuts", () => {
      triggerToggleShortcuts();
    });

    // 2. Direct JavaScript bridge for Wails window.ExecJS
    const win = window as MemspaceWindowBridge;
    win.__navTab = (tab: unknown) => {
      if (
        tab === "terminal" ||
        tab === "explorer" ||
        tab === "diagnostics" ||
        tab === "pubsub" ||
        tab === "monitor"
      ) {
        handleNavTabRef.current(tab);
      }
    };
    win.__toggleSidebar = () => {
      setSidebarCollapsed((prev) => !prev);
    };
    win.__newConn = () => {
      handleOpenAddRef.current();
    };
    win.__toggleShortcuts = () => {
      triggerToggleShortcuts();
    };

    // 3. DOM keydown listeners with capture phase (supports Cmd, Ctrl, and Alt/Option)
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return; // Prevent duplicate repeat events while holding key down

      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      const isAlt = e.altKey;

      const target = e.target as HTMLElement | null;
      const isInput = !!(
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      );

      const isSlashOrQuestion =
        e.key === "/" ||
        e.key === "?" ||
        e.code === "Slash" ||
        e.keyCode === 191 ||
        e.which === 191;

      // 1. Cmd/Ctrl + / (or Cmd/Ctrl + ?)
      if (isCmdOrCtrl && isSlashOrQuestion) {
        triggerToggleShortcuts(e);
        return;
      }

      // 2. '?' or '/' when outside inputs
      if (
        !isCmdOrCtrl &&
        !isAlt &&
        !isInput &&
        (e.key === "?" || e.key === "/" || isSlashOrQuestion)
      ) {
        triggerToggleShortcuts(e);
        return;
      }

      if (!isCmdOrCtrl && !isAlt) return;

      const is1 = e.key === "1" || e.code === "Digit1" || e.code === "Numpad1";
      const is2 = e.key === "2" || e.code === "Digit2" || e.code === "Numpad2";
      const is3 = e.key === "3" || e.code === "Digit3" || e.code === "Numpad3";
      const is4 = e.key === "4" || e.code === "Digit4" || e.code === "Numpad4";
      const is5 = e.key === "5" || e.code === "Digit5" || e.code === "Numpad5";
      const isB = e.key === "b" || e.key === "B" || e.code === "KeyB";
      const isN = e.key === "n" || e.key === "N" || e.code === "KeyN";

      if (isCmdOrCtrl && isN) {
        e.preventDefault();
        e.stopPropagation();
        handleOpenAddRef.current();
      } else if (isCmdOrCtrl && isB) {
        e.preventDefault();
        e.stopPropagation();
        setSidebarCollapsed((prev) => !prev);
      } else if (is1) {
        e.preventDefault();
        e.stopPropagation();
        handleNavTabRef.current("terminal");
      } else if (is2) {
        e.preventDefault();
        e.stopPropagation();
        handleNavTabRef.current("explorer");
      } else if (is3) {
        e.preventDefault();
        e.stopPropagation();
        handleNavTabRef.current("diagnostics");
      } else if (is4) {
        e.preventDefault();
        e.stopPropagation();
        handleNavTabRef.current("pubsub");
      } else if (is5) {
        e.preventDefault();
        e.stopPropagation();
        handleNavTabRef.current("monitor");
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });

    return () => {
      cancelNav();
      cancelToggleSidebar();
      cancelNewConn();
      cancelShortcuts();
      delete win.__navTab;
      delete win.__toggleSidebar;
      delete win.__newConn;
      delete win.__toggleShortcuts;
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  }, []);

  const handleOpenEdit = (cfg: ConnectionConfig) => {
    setEditingConfig(cfg);
    setIsEditingProfile(true);
  };

  const handleDeleteConnection = (id: string, name?: string) => {
    const targetName =
      name ||
      connections.find((c) => c.id === id)?.name ||
      (ephemeralConn?.id === id ? ephemeralConn.name : undefined) ||
      "this connection";
    setDeleteTarget({ id, name: targetName });
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    const { id } = deleteTarget;
    setDeleteTarget(null);

    try {
      await ConnectionService.DeleteConnection(id);
      removeConnectionFromOrder(id);

      if (ephemeralConn?.id === id) {
        setEphemeralConn(null);
      }

      // If active, cleanly disconnect and reset
      if (activeConnId === id) {
        setActiveConnId(null);
        setActiveStatus(null);
        setSelectedKey(null);
        setActiveTab("terminal");
        setCurrentDb(0);
      }

      // If editing this connection, exit edit mode
      if (editingConfig?.id === id) {
        setIsEditingProfile(false);
        setEditingConfig(null);
      }

      await loadConnections();
    } catch (err: unknown) {
      console.error("Failed to delete connection:", err);
    }
  };

  const proceedQuickConnectLocal = async () => {
    // Check if user already has a saved (non-ephemeral) connection for localhost:6379
    const existingSaved = connections.find(
      (c) =>
        !c.ephemeral &&
        (c.host === "127.0.0.1" || c.host === "localhost") &&
        c.port === 6379,
    );
    if (existingSaved) {
      await handleConnect(existingSaved.id, existingSaved);
      return;
    }

    // Clean up any stale ephemeral localhost entries from previous failed attempts
    const staleEphemerals = connections.filter(
      (c) => c.ephemeral && (c.host === "127.0.0.1" || c.host === "localhost"),
    );
    for (const stale of staleEphemerals) {
      await ConnectionService.DeleteConnection(stale.id);
      removeConnectionFromOrder(stale.id);
    }
    if (staleEphemerals.length > 0) {
      const cleaned = await ConnectionService.GetConnections();
      setConnections(cleaned || []);
    }

    const tempId = `ephemeral-local-${Date.now()}`;
    const newLocal: ConnectionConfig = {
      id: tempId,
      name: "Localhost",
      host: "127.0.0.1",
      port: 6379,
      username: "",
      password: "",
      database: 0,
      type: "standalone",
      sentinelMaster: "",
      sentinelNodes: [],
      clusterNodes: [],
      ssh: {
        enabled: false,
        host: "",
        port: 22,
        user: "",
        password: "",
        keyPath: "",
        passphrase: "",
      },
      tls: {
        enabled: false,
        caCert: "",
        clientCert: "",
        clientKey: "",
        insecureSkipVerify: false,
      },
      readOnly: false,
      color: "#10b981",
      group: "Local",
      ephemeral: true,
    };

    setConnectingId(tempId);
    try {
      // 1. Temporarily register with backend so Connect can dial it
      await ConnectionService.SaveConnection(newLocal);

      // 2. Attempt connect - do NOT add to saved connections state (no profile in sidebar or recents)
      const success = await handleConnect(tempId, newLocal);

      if (success) {
        setEphemeralConn(newLocal);
        // Clean refresh: ensure only saved non-ephemeral connections are in state
        await loadConnections();
      } else {
        // Failed to connect! Remove temporary entry from backend
        await ConnectionService.DeleteConnection(tempId);
        removeConnectionFromOrder(tempId);
      }
    } catch (err: unknown) {
      await ConnectionService.DeleteConnection(tempId);
      removeConnectionFromOrder(tempId);
      toastError(
        "Connection Failed",
        "Failed to initialize connection: " + getErrorMessage(err),
      );
    } finally {
      setConnectingId(null);
    }
  };

  const handleQuickConnectLocal = async () => {
    // If already connecting, no-op
    if (connectingId) return;

    // If already connected to localhost, no-op
    if (activeConnId) {
      const active =
        connections.find((c) => c.id === activeConnId) ||
        (ephemeralConn?.id === activeConnId ? ephemeralConn : null);
      if (
        active &&
        (active.host === "127.0.0.1" || active.host === "localhost") &&
        active.port === 6379
      ) {
        return;
      }
    }

    // Check if there are active Pub/Sub subscriptions on current connection
    if (activeConnId && activePubSubChannels.length > 0) {
      const activeConn =
        connections.find((c) => c.id === activeConnId) ||
        (ephemeralConn?.id === activeConnId ? ephemeralConn : null);
      const activeName = activeConn?.name || "current server";

      setPendingPubSubAction({
        type: "connect",
        id: "__localhost_quick__",
        title: "Active Pub/Sub Subscriptions",
        description: `You are currently subscribed to ${activePubSubChannels.length} channel${
          activePubSubChannels.length > 1 ? "s" : ""
        } (${activePubSubChannels.join(", ")}) on "${activeName}". Connecting to Localhost will cancel these subscriptions. Do you want to proceed?`,
        confirmText: "Switch Connection",
      });
      return;
    }

    await proceedQuickConnectLocal();
  };

  const activeConnection =
    connections.find((c) => c.id === activeConnId) ||
    (ephemeralConn && ephemeralConn.id === activeConnId ? ephemeralConn : null);

  const getEnvInfo = (conn: ConnectionConfig) => {
    const rawGroup = conn.group?.trim() || "Development";
    const g = rawGroup.toLowerCase();
    let defaultColor = "#3b82f6";
    let label = rawGroup;
    if (g.includes("prod")) {
      defaultColor = "#e11d48";
      if (g === "prod") label = "Production";
    } else if (g.includes("stag") || g.includes("uat")) {
      defaultColor = "#f59e0b";
      if (g === "stag" || g === "stg") label = "Staging";
    } else if (g.includes("local")) {
      defaultColor = "#10b981";
      if (g === "local") label = "Local";
    } else if (g.includes("dev")) {
      defaultColor = "#3b82f6";
      if (g === "dev") label = "Development";
    }
    const color =
      conn.color && conn.color.trim() !== "" ? conn.color : defaultColor;
    return { label, color };
  };

  const activeEnv = activeConnection ? getEnvInfo(activeConnection) : null;

  const envBreakdown = React.useMemo(() => {
    const map = new Map<
      string,
      { label: string; count: number; color: string; order: number }
    >();

    connections.forEach((conn) => {
      const { label, color } = getEnvInfo(conn);
      const lk = label.toLowerCase();
      let order = 50;
      if (lk.includes("prod")) order = 10;
      else if (lk.includes("stag") || lk.includes("uat")) order = 20;
      else if (lk.includes("dev")) order = 30;
      else if (lk.includes("local")) order = 40;

      const existing = map.get(label);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(label, { label, count: 1, color, order });
      }
    });

    return Array.from(map.values()).sort(
      (a, b) => a.order - b.order || a.label.localeCompare(b.label),
    );
  }, [connections]);

  const recentConnections = connections.slice(0, 3);

  const sidebarConnections = React.useMemo(() => {
    if (!ephemeralConn) return connections;
    return [
      ephemeralConn,
      ...connections.filter((c) => c.id !== ephemeralConn.id),
    ];
  }, [connections, ephemeralConn]);

  return (
    <div className="flex size-full overflow-hidden bg-[#fafafa] font-sans text-zinc-900 select-none">
      {/* 1. Left Sidebar: Connection Management (Collapsible) */}
      <ConnectionList
        connections={sidebarConnections}
        activeConnId={activeConnId}
        activeStatus={activeStatus}
        activeTab={activeTab}
        onSelectTab={handleNavTab}
        onConnect={requestConnect}
        onDisconnect={requestDisconnect}
        onEdit={handleOpenEdit}
        onDelete={handleDeleteConnection}
        onAddNew={handleOpenAdd}
        onRefresh={loadConnections}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
        connectingId={connectingId}
        appVersion={versionInfo?.version || "1.0.0"}
        updateAvailableVersion={
          updateCheckResult?.hasUpdate ? updateCheckResult.latestVersion : null
        }
        onOpenUpdater={() => setIsUpdaterOpen(true)}
      />

      {/* 2. Main Content Area */}
      <div className="flex h-full flex-1 flex-col overflow-hidden bg-[#fafafa]">
        {isEditingProfile ? (
          <ConnectionProfile
            initialConfig={editingConfig}
            onBack={() => {
              setIsEditingProfile(false);
              setEditingConfig(null);
            }}
            onDelete={handleDeleteConnection}
            onSaved={async (savedCfg, andConnect) => {
              if (ephemeralConn?.id === savedCfg.id && !savedCfg.ephemeral) {
                setEphemeralConn(null);
              }
              await loadConnections();
              setIsEditingProfile(false);
              setEditingConfig(null);
              if (andConnect) {
                requestConnect(savedCfg.id, savedCfg);
              } else if (activeConnId === savedCfg.id) {
                const updatedDb =
                  savedCfg.type === "cluster" ? 0 : (savedCfg.database ?? 0);
                setCurrentDb(updatedDb);
              }
            }}
          />
        ) : activeConnection ? (
          <>
            {/* Safety Banner */}
            {(() => {
              const isProd = activeConnection.group
                ?.toLowerCase()
                .includes("prod");
              const isReadOnly = activeConnection.readOnly;
              if (!isProd && !isReadOnly) return null;

              return (
                <div
                  className={`flex shrink-0 items-center gap-2 border-b px-4 py-1.5 text-xs font-semibold tracking-wide ${
                    isProd
                      ? "border-rose-200 bg-rose-50 text-rose-700"
                      : "border-amber-200 bg-amber-50 text-amber-700"
                  }`}
                >
                  <AlertTriangle
                    size={13}
                    className={isProd ? "text-rose-600" : "text-amber-600"}
                  />
                  <span>
                    {isProd && isReadOnly
                      ? "PRODUCTION ENVIRONMENT (READ-ONLY) — MUTATION COMMANDS ARE DISABLED."
                      : isProd
                        ? "WARNING: CONNECTED TO PRODUCTION INSTANCE. PROCEED WITH CAUTION."
                        : "READ-ONLY MODE ENABLED — WRITE AND MUTATION COMMANDS ARE BLOCKED."}
                  </span>
                </div>
              );
            })()}

            {/* Top Workspace Header (When Connected) with Dynamic Environment Tint */}
            <div
              className="relative flex h-14 shrink-0 items-center justify-between gap-4 overflow-hidden border-b px-5 shadow-2xs transition-all duration-300"
              style={{
                backgroundColor: "#ffffff",
                backgroundImage: activeEnv
                  ? `linear-gradient(180deg, ${activeEnv.color}0d 0%, rgba(255, 255, 255, 0.98) 100%)`
                  : undefined,
                borderBottomColor: activeEnv
                  ? `${activeEnv.color}35`
                  : "#e4e4e7",
                boxShadow: activeEnv
                  ? `0 2px 14px -3px ${activeEnv.color}15`
                  : undefined,
              }}
            >
              {/* Subtle Ambient Radial Glow */}
              {activeEnv && (
                <div
                  className="pointer-events-none absolute inset-0 transition-opacity duration-500"
                  style={{
                    background: `radial-gradient(ellipse 60% 140% at 50% 0%, ${activeEnv.color}10 0%, transparent 80%)`,
                  }}
                />
              )}

              {/* Left: Sidebar Toggle & Breadcrumb */}
              <div className="z-10 flex shrink-0 items-center gap-2.5 text-xs">
                <button
                  onClick={() => setSidebarCollapsed((prev) => !prev)}
                  className="mr-1 flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
                  title={
                    sidebarCollapsed
                      ? `Expand Sidebar (${modSymbol}B)`
                      : `Collapse Sidebar (${modSymbol}B)`
                  }
                >
                  {sidebarCollapsed ? (
                    <PanelLeft size={16} />
                  ) : (
                    <PanelLeftClose size={16} />
                  )}
                </button>
                {activeTab === "terminal" && (
                  <TermIcon size={15} className="text-rose-600" />
                )}
                {activeTab === "explorer" && (
                  <Braces size={15} className="text-rose-600" />
                )}
                {activeTab === "diagnostics" && (
                  <Gauge size={15} className="text-rose-600" />
                )}
                {activeTab === "pubsub" && (
                  <Radio size={15} className="text-rose-600" />
                )}
                {activeTab === "monitor" && (
                  <Activity size={15} className="text-rose-600" />
                )}
                <span className="text-sm font-bold text-zinc-900">
                  {activeTab === "terminal" && "Console"}
                  {activeTab === "explorer" && "Explorer"}
                  {activeTab === "diagnostics" && "Diagnostics"}
                  {activeTab === "pubsub" && "Pub / Sub"}
                  {activeTab === "monitor" && "Monitor"}
                </span>
              </div>

              {/* Right: Quick Actions */}
              <div className="z-10 flex items-center gap-2.5">
                {activeConnection.readOnly && (
                  <Badge
                    variant="destructive"
                    className="gap-1.5 px-2.5 py-1 text-xs"
                  >
                    <Shield size={11} /> Read-Only
                  </Badge>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => requestDisconnect(activeConnection.id)}
                  className="h-8 cursor-pointer gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-700 shadow-2xs transition-all hover:border-rose-300 hover:bg-rose-100 hover:text-rose-800 active:scale-98"
                  title="Disconnect from active session"
                >
                  <Unplug size={13} className="text-rose-600" />
                  <span>Disconnect</span>
                </Button>
              </div>
            </div>

            {/* Main Tab Views (State preserved across navigation within active connection) */}
            <div key={activeConnection.id} className="relative flex flex-1 overflow-hidden">
              {/* 1. Terminal / Console View */}
              <div
                className={`flex size-full flex-col ${
                  activeTab === "terminal" ? "flex" : "hidden"
                }`}
              >
                <Terminal
                  connId={activeConnection.id}
                  db={currentDb}
                  host={activeConnection.host}
                  port={activeConnection.port}
                  isActive={activeTab === "terminal"}
                />
              </div>

              {/* 2. Key Explorer & Value Viewer */}
              <div
                className={`size-full ${
                  activeTab === "explorer" ? "flex" : "hidden"
                }`}
              >
                <KeyExplorer
                  connId={activeConnection.id}
                  clusterMode={activeConnection.type === "cluster"}
                  readOnly={activeConnection.readOnly}
                  selectedKey={selectedKey}
                  currentDb={currentDb}
                  onSelectDb={handleSelectDb}
                  onSelectKey={(k, db) => {
                    setSelectedKey(k);
                    setCurrentDb(db);
                  }}
                  deletedKeyInfo={deletedKeyInfo}
                  renamedKeyInfo={renamedKeyInfo}
                  onKeyDeleted={() => setSelectedKey(null)}
                  isActive={activeTab === "explorer"}
                />
                {selectedKey ? (
                  <KeyValueViewer
                    key={`${activeConnection.id}-${currentDb}-${selectedKey}`}
                    connId={activeConnection.id}
                    db={currentDb}
                    keyName={selectedKey}
                    readOnly={activeConnection.readOnly}
                    onKeyDeleted={(k) => {
                      setSelectedKey(null);
                      if (k) setDeletedKeyInfo({ key: k, id: Date.now() });
                    }}
                    onKeyRenamed={(newKey, oldKey) => {
                      setSelectedKey(newKey);
                      if (oldKey)
                        setRenamedKeyInfo({ oldKey, newKey, id: Date.now() });
                    }}
                  />
                ) : (
                  <div className="flex h-full flex-1 flex-col items-center justify-center gap-2.5 bg-[#fafafa] p-6 text-zinc-400 select-none">
                    <div className="mb-1 flex size-12 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-zinc-400 shadow-2xs">
                      <Key size={22} className="text-zinc-500 opacity-70" />
                    </div>
                    <p className="text-xs font-semibold text-zinc-700">
                      Select a key from the explorer on the left to inspect
                      and edit its value.
                    </p>
                    <p className="max-w-sm text-center text-[11px] leading-relaxed text-zinc-400">
                      Supports Strings, Hashes, Lists, Sets, Sorted Sets,
                      Streams, and JSON documents.
                    </p>
                  </div>
                )}
              </div>

              {/* 3. Server Metrics Dashboard */}
              <div
                className={`size-full ${
                  activeTab === "diagnostics" ? "block" : "hidden"
                }`}
              >
                <ServerMetricsDashboard
                  connId={activeConnection.id}
                  db={currentDb}
                  isActive={activeTab === "diagnostics"}
                />
              </div>

              {/* 4. Pub/Sub Debugger */}
              <div
                className={`size-full ${
                  activeTab === "pubsub" ? "block" : "hidden"
                }`}
              >
                <PubSubDebugger
                  connId={activeConnection.id}
                  onSubscribedChannelsChange={setActivePubSubChannels}
                />
              </div>

              {/* 5. Real-Time Command Monitor */}
              <div
                className={`size-full ${
                  activeTab === "monitor" ? "block" : "hidden"
                }`}
              >
                <MonitorViewer
                  connId={activeConnection.id}
                  clusterMode={activeConnection.type === "cluster"}
                />
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Top Workspace Header (When Not Connected) */}
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-5 shadow-2xs">
              <div className="flex items-center gap-2.5 text-xs">
                <button
                  onClick={() => setSidebarCollapsed((prev) => !prev)}
                  className="mr-1 flex size-8 cursor-pointer items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
                  title={
                    sidebarCollapsed
                      ? `Expand Sidebar (${modSymbol}B)`
                      : `Collapse Sidebar (${modSymbol}B)`
                  }
                >
                  {sidebarCollapsed ? (
                    <PanelLeft size={16} />
                  ) : (
                    <PanelLeftClose size={16} />
                  )}
                </button>
                <Server size={15} className="text-rose-600" />
                <span className="text-sm font-bold text-zinc-900">
                  Overview
                </span>
              </div>
            </div>

            {/* Rich Welcome & Saved Connections Screen */}
            <div className="flex-1 overflow-y-auto bg-[#fafafa] p-6 select-none sm:p-7 lg:p-8">
              <div className="mx-auto max-w-6xl space-y-8 sm:space-y-9">
                {/* Hero Header */}
                <div className="relative flex flex-col justify-between gap-4 overflow-hidden rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-2xs sm:flex-row sm:items-center sm:p-5">
                  <div className="pointer-events-none absolute top-0 right-0 size-80 rounded-full bg-rose-600/5 blur-3xl" />

                  <div className="z-10 flex items-start gap-4 sm:items-center">
                    <img
                      src="/icon.png"
                      alt="Memspace"
                      className="size-16 shrink-0 rounded-xl object-contain shadow-md shadow-rose-600/10 select-none"
                    />
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-bold tracking-tight text-zinc-900 sm:text-xl">
                          Welcome to Memspace
                        </h2>
                        <button
                          onClick={() => setIsUpdaterOpen(true)}
                          className="cursor-pointer rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700 transition-colors hover:bg-rose-100"
                          title="Click to check for updates"
                        >
                          v{versionInfo?.version || "1.0.0"}
                        </button>
                      </div>
                      <p className="mt-1 max-w-md text-xs leading-relaxed text-zinc-500 sm:text-sm">
                        Select a saved connection below or connect to a local
                        instance to begin.
                      </p>
                    </div>
                  </div>

                  <div className="z-10 flex shrink-0 items-center gap-2.5">
                    <Button
                      onClick={handleOpenAdd}
                      variant="default"
                      size="sm"
                      className="h-9 cursor-pointer gap-1.5 rounded-lg bg-rose-600 px-4 text-xs font-semibold text-white shadow-xs shadow-rose-600/15 hover:bg-rose-500 sm:text-sm"
                    >
                      <Plus size={15} />
                      <span>New Connection</span>
                    </Button>
                    <Button
                      onClick={handleQuickConnectLocal}
                      disabled={!!connectingId}
                      variant="outline"
                      size="sm"
                      className={`h-9 cursor-pointer gap-1.5 rounded-lg border-zinc-200 px-3.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 sm:text-sm ${
                        connectingId?.startsWith("ephemeral-local")
                          ? "cursor-wait opacity-75"
                          : connectingId
                            ? "cursor-not-allowed opacity-50"
                            : ""
                      }`}
                    >
                      {connectingId?.startsWith("ephemeral-local") ? (
                        <>
                          <RefreshCw
                            size={13.5}
                            className="animate-spin text-rose-600"
                          />
                          <span>Connecting...</span>
                        </>
                      ) : (
                        <>
                          <Zap size={13.5} className="text-rose-600" />
                          <span>Connect to Localhost</span>
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Saved Connections or Empty State */}
                <div className="space-y-8 sm:space-y-9">
                  {connections.length > 0 ? (
                    <>
                      {/* Environments Summary */}
                      {envBreakdown.length > 0 && (
                        <div className="space-y-3.5">
                          <div className="flex items-center justify-between px-1">
                            <h3 className="flex items-center gap-2 text-xs font-bold tracking-wider text-zinc-800 uppercase">
                              <Layers size={13.5} className="text-rose-600" />
                              <span>Environments</span>
                            </h3>
                          </div>

                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            {envBreakdown.map((env) => (
                              <div
                                key={env.label}
                                className="flex items-center justify-between gap-2 rounded-xl border border-zinc-200/90 bg-white px-3.5 py-3 shadow-2xs transition-all hover:border-zinc-300"
                              >
                                <div className="flex min-w-0 items-center gap-2.5">
                                  <span
                                    className="size-2.5 shrink-0 rounded-full shadow-2xs"
                                    style={{ backgroundColor: env.color }}
                                  />
                                  <span className="truncate text-xs font-semibold text-zinc-800">
                                    {env.label}
                                  </span>
                                </div>
                                <span
                                  className="shrink-0 rounded-md border px-2 py-0.5 font-mono text-xs font-bold"
                                  style={{
                                    backgroundColor: `${env.color}15`,
                                    color: env.color,
                                    borderColor: `${env.color}35`,
                                  }}
                                >
                                  {env.count}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Recent Connections (Top 3) */}
                      <div className="space-y-3.5">
                        <div className="flex items-center justify-between px-1">
                          <h3 className="flex items-center gap-2 text-xs font-bold tracking-wider text-zinc-800 uppercase">
                            <Clock size={13.5} className="text-rose-600" />
                            <span>Recent Connections</span>
                          </h3>
                        </div>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                          {recentConnections.map((conn) => {
                            const isConnecting = connectingId === conn.id;
                            const envBadge = conn.group
                              ?.toLowerCase()
                              .includes("prod")
                              ? {
                                  label: "PROD",
                                  bg: "bg-rose-50 text-rose-700 border-rose-200",
                                  color: "#e11d48",
                                }
                              : conn.group?.toLowerCase().includes("stag") ||
                                  conn.group?.toLowerCase().includes("uat")
                                ? {
                                    label: "STG",
                                    bg: "bg-amber-50 text-amber-700 border-amber-200",
                                    color: "#f59e0b",
                                  }
                                : conn.group?.toLowerCase().includes("local")
                                  ? {
                                      label: "LOCAL",
                                      bg: "bg-emerald-50 text-emerald-700 border-emerald-200",
                                      color: "#10b981",
                                    }
                                  : {
                                      label: "DEV",
                                      bg: "bg-blue-50 text-blue-700 border-blue-200",
                                      color: "#3b82f6",
                                    };
                            const accentColor =
                              conn.color && conn.color.trim() !== ""
                                ? conn.color
                                : envBadge.color;

                            return (
                              <div
                                key={conn.id}
                                className={`group relative flex flex-col justify-between gap-4 overflow-hidden rounded-xl border border-zinc-200 bg-white p-4 shadow-2xs transition-all duration-200 hover:border-(--card-accent) sm:p-4.5 ${
                                  isConnecting ? "opacity-90" : ""
                                }`}
                                style={
                                  {
                                    "--card-accent": `${accentColor}70`,
                                  } as React.CSSProperties
                                }
                              >
                                <div className="flex items-start justify-between gap-2.5">
                                  <div className="min-w-0 flex-1 overflow-hidden">
                                    <div className="flex min-w-0 items-center gap-2">
                                      <h4 className="truncate text-sm font-bold text-zinc-900 transition-colors">
                                        {conn.name}
                                      </h4>
                                      <span
                                        className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold tracking-wider uppercase ${envBadge.bg}`}
                                      >
                                        {envBadge.label}
                                      </span>
                                    </div>
                                    <div className="mt-1 flex items-center font-mono text-xs text-zinc-500">
                                      <span
                                        className="truncate"
                                        title={conn.host}
                                      >
                                        {conn.host}
                                      </span>
                                      <span className="shrink-0 text-zinc-400">
                                        :{conn.port}
                                      </span>
                                    </div>
                                  </div>

                                  <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleOpenEdit(conn);
                                      }}
                                      className="flex size-7 cursor-pointer items-center justify-center rounded-md text-zinc-400 transition-colors hover:text-zinc-800"
                                      title="Edit Connection"
                                    >
                                      <Edit2 size={12.5} />
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteConnection(
                                          conn.id,
                                          conn.name,
                                        );
                                      }}
                                      className="flex size-7 cursor-pointer items-center justify-center rounded-md text-zinc-400 transition-colors hover:text-rose-600"
                                      title="Delete Connection"
                                    >
                                      <Trash2 size={12.5} />
                                    </button>
                                  </div>
                                </div>

                                <div className="flex items-center justify-between border-t border-zinc-100 pt-3 text-xs">
                                  <div className="flex flex-wrap items-center gap-1.5 text-zinc-500">
                                    {conn.tls?.enabled && (
                                      <span
                                        className="flex items-center gap-1 text-[11px] font-medium text-emerald-600"
                                        title="TLS Enabled"
                                      >
                                        <Lock size={11} /> TLS
                                      </span>
                                    )}
                                    {conn.readOnly && (
                                      <span
                                        className="flex items-center gap-1 rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700"
                                        title="Read-Only Mode Enabled: Destructive commands are blocked"
                                      >
                                        <Shield size={10} /> Read-Only
                                      </span>
                                    )}
                                    <span className="flex items-center gap-1 rounded border border-zinc-200 bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600">
                                      <Database
                                        size={10}
                                        className="text-zinc-500"
                                      />{" "}
                                      DB {conn.database || 0}
                                    </span>
                                    {conn.type === "cluster" && (
                                      <span className="rounded border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[10px] text-indigo-700">
                                        Cluster
                                      </span>
                                    )}
                                  </div>

                                  <button
                                    onClick={() => {
                                      if (!isConnecting) {
                                        requestConnect(conn.id, conn);
                                      }
                                    }}
                                    disabled={isConnecting}
                                    className={`flex size-7.5 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-transparent transition-all hover:bg-zinc-100 active:scale-93 ${
                                      isConnecting
                                        ? "cursor-wait text-rose-400"
                                        : "text-rose-500 hover:text-emerald-600"
                                    }`}
                                    title={isConnecting ? "Connecting..." : `Power On • Connect to ${conn.name}`}
                                  >
                                    <Power
                                      size={14}
                                      className={isConnecting ? "animate-pulse" : ""}
                                    />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-2xs sm:p-12">
                      <div className="mb-3.5 flex size-13 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 text-rose-600 shadow-xs">
                        <Server size={24} className="text-rose-600" />
                      </div>
                      <h3 className="text-base font-semibold text-zinc-900">
                        No Connections
                      </h3>
                      <p className="mt-1 max-w-sm text-xs leading-relaxed text-zinc-500">
                        Get started by creating a new Redis or Valkey
                        connection, or quickly connect to an instance running on
                        localhost.
                      </p>
                      <div className="mt-5 flex items-center gap-2.5">
                        <Button
                          onClick={handleOpenAdd}
                          size="sm"
                          className="h-9 cursor-pointer gap-1.5 rounded-lg bg-rose-600 px-4 text-xs font-semibold text-white shadow-xs shadow-rose-600/15 hover:bg-rose-500"
                        >
                          <Plus size={14} />
                          <span>New Connection</span>
                        </Button>
                        <Button
                          onClick={handleQuickConnectLocal}
                          disabled={!!connectingId}
                          variant="outline"
                          size="sm"
                          className={`h-9 cursor-pointer gap-1.5 rounded-lg border-zinc-200 px-3.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 ${
                            connectingId ? "cursor-wait opacity-75" : ""
                          }`}
                        >
                          {connectingId ? (
                            <>
                              <RefreshCw
                                size={13.5}
                                className="animate-spin text-rose-600"
                              />
                              <span>Connecting...</span>
                            </>
                          ) : (
                            <>
                              <Zap size={13.5} className="text-rose-600" />
                              <span>Connect to Localhost</span>
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Keyboard Shortcuts Modal */}
      <ShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
        isMac={isMac}
      />

      {/* GitHub Releases Auto-Update Modal */}
      <UpdateModal
        isOpen={isUpdaterOpen}
        onClose={() => setIsUpdaterOpen(false)}
        versionInfo={versionInfo}
        initialCheckResult={updateCheckResult}
        onUpdateCheckComplete={(res) => setUpdateCheckResult(res)}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Delete Connection"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone and will permanently remove all stored credentials.`}
        confirmText="Delete Connection"
        cancelText="Cancel"
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Pub/Sub Active Subscriptions Confirmation Modal */}
      <ConfirmModal
        isOpen={!!pendingPubSubAction}
        title={pendingPubSubAction?.title || "Active Pub/Sub Subscriptions"}
        description={pendingPubSubAction?.description || ""}
        confirmText={pendingPubSubAction?.confirmText || "Proceed"}
        cancelText="Cancel"
        variant="warning"
        onConfirm={handleConfirmPubSubAction}
        onCancel={handleCancelPubSubAction}
      />
    </div>
  );
}

export default App;
