import React, { useState, useEffect } from "react";
import { X, Server, Shield, CheckCircle, AlertCircle, RefreshCw } from "lucide-react";
import type { ConnectionConfig } from "../../../bindings/redisian/backend/models/index.js";
import { ConnectionService } from "../../../bindings/redisian/backend/services/index.js";

interface ConnectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  initialConfig?: ConnectionConfig | null;
}

export const ConnectionDialog: React.FC<ConnectionDialogProps> = ({
  isOpen,
  onClose,
  onSaved,
  initialConfig,
}) => {
  const [activeTab, setActiveTab] = useState<"general" | "ssh" | "tls" | "advanced">("general");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const [form, setForm] = useState<ConnectionConfig>({
    id: "",
    name: "Local Redis",
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
    color: "#3b82f6",
    group: "Development",
  });

  useEffect(() => {
    if (initialConfig) {
      setForm(initialConfig);
    } else {
      setForm({
        id: "",
        name: "Local Redis",
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
        color: "#3b82f6",
        group: "Development",
      });
    }
    setTestResult(null);
  }, [initialConfig, isOpen]);

  if (!isOpen) return null;

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const msg = await ConnectionService.TestConnection(form);
      setTestResult({ success: true, message: msg || "Connection successful" });
    } catch (err: any) {
      setTestResult({ success: false, message: err?.message || String(err) });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    try {
      await ConnectionService.SaveConnection(form);
      onSaved();
      onClose();
    } catch (err: any) {
      alert("Failed to save connection: " + (err?.message || err));
    }
  };

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      backgroundColor: "rgba(0, 0, 0, 0.75)",
      backdropFilter: "blur(4px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 50,
    }}>
      <div style={{
        backgroundColor: "#111827",
        border: "1px solid #374151",
        borderRadius: "0.75rem",
        width: "650px",
        maxWidth: "95vw",
        maxHeight: "90vh",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
      }}>
        {/* Header */}
        <div style={{
          padding: "1rem 1.5rem",
          borderBottom: "1px solid #1f2937",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Server size={20} color="#3b82f6" />
            <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#f3f4f6" }}>
              {initialConfig ? "Edit Connection" : "New Connection"}
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer" }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{
          display: "flex",
          borderBottom: "1px solid #1f2937",
          padding: "0 1.5rem",
          backgroundColor: "#0d131f",
          gap: "1.5rem",
        }}>
          {(["general", "ssh", "tls", "advanced"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: "0.75rem 0",
                background: "none",
                border: "none",
                borderBottom: activeTab === tab ? "2px solid #3b82f6" : "2px solid transparent",
                color: activeTab === tab ? "#3b82f6" : "#9ca3af",
                fontWeight: 500,
                fontSize: "0.875rem",
                textTransform: "capitalize",
                cursor: "pointer",
              }}
            >
              {tab === "ssh" ? "SSH Bastion" : tab === "tls" ? "TLS / SSL" : tab}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ padding: "1.5rem", overflowY: "auto", flex: 1 }}>
          {activeTab === "general" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div>
                  <label style={{ fontSize: "0.8125rem", color: "#9ca3af", display: "block", marginBottom: "0.25rem" }}>Connection Name</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="input-dark"
                    style={{ width: "100%" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: "0.8125rem", color: "#9ca3af", display: "block", marginBottom: "0.25rem" }}>Environment Group</label>
                  <select
                    value={form.group}
                    onChange={(e) => setForm({ ...form, group: e.target.value })}
                    className="input-dark"
                    style={{ width: "100%" }}
                  >
                    <option value="Production">Production</option>
                    <option value="Staging">Staging</option>
                    <option value="Development">Development</option>
                    <option value="Local">Local</option>
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "1rem" }}>
                <div>
                  <label style={{ fontSize: "0.8125rem", color: "#9ca3af", display: "block", marginBottom: "0.25rem" }}>Host</label>
                  <input
                    type="text"
                    value={form.host}
                    onChange={(e) => setForm({ ...form, host: e.target.value })}
                    className="input-dark"
                    style={{ width: "100%" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: "0.8125rem", color: "#9ca3af", display: "block", marginBottom: "0.25rem" }}>Port</label>
                  <input
                    type="number"
                    value={form.port}
                    onChange={(e) => setForm({ ...form, port: parseInt(e.target.value) || 6379 })}
                    className="input-dark"
                    style={{ width: "100%" }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div>
                  <label style={{ fontSize: "0.8125rem", color: "#9ca3af", display: "block", marginBottom: "0.25rem" }}>Username (Optional ACL)</label>
                  <input
                    type="text"
                    value={form.username || ""}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    className="input-dark"
                    style={{ width: "100%" }}
                    placeholder="default"
                  />
                </div>
                <div>
                  <label style={{ fontSize: "0.8125rem", color: "#9ca3af", display: "block", marginBottom: "0.25rem" }}>Password</label>
                  <input
                    type="password"
                    value={form.password || ""}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="input-dark"
                    style={{ width: "100%" }}
                    placeholder="Auth password"
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div>
                  <label style={{ fontSize: "0.8125rem", color: "#9ca3af", display: "block", marginBottom: "0.25rem" }}>Topology Type</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                    className="input-dark"
                    style={{ width: "100%" }}
                  >
                    <option value="standalone">Standalone</option>
                    <option value="cluster">Redis Cluster</option>
                    <option value="sentinel">Redis Sentinel</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: "0.8125rem", color: "#9ca3af", display: "block", marginBottom: "0.25rem" }}>Initial Database (0-15)</label>
                  <input
                    type="number"
                    disabled={form.type === "cluster"}
                    value={form.database}
                    onChange={(e) => setForm({ ...form, database: parseInt(e.target.value) || 0 })}
                    className="input-dark"
                    style={{ width: "100%" }}
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === "ssh" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#e2e8f0", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={form.ssh.enabled}
                  onChange={(e) => setForm({ ...form, ssh: { ...form.ssh, enabled: e.target.checked } })}
                />
                <span style={{ fontWeight: 500 }}>Enable SSH Bastion Tunnel</span>
              </label>

              {form.ssh.enabled && (
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "0.5rem" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "1rem" }}>
                    <div>
                      <label style={{ fontSize: "0.8125rem", color: "#9ca3af", display: "block", marginBottom: "0.25rem" }}>SSH Host</label>
                      <input
                        type="text"
                        value={form.ssh.host}
                        onChange={(e) => setForm({ ...form, ssh: { ...form.ssh, host: e.target.value } })}
                        className="input-dark"
                        style={{ width: "100%" }}
                        placeholder="bastion.example.com"
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: "0.8125rem", color: "#9ca3af", display: "block", marginBottom: "0.25rem" }}>SSH Port</label>
                      <input
                        type="number"
                        value={form.ssh.port}
                        onChange={(e) => setForm({ ...form, ssh: { ...form.ssh, port: parseInt(e.target.value) || 22 } })}
                        className="input-dark"
                        style={{ width: "100%" }}
                      />
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                    <div>
                      <label style={{ fontSize: "0.8125rem", color: "#9ca3af", display: "block", marginBottom: "0.25rem" }}>SSH User</label>
                      <input
                        type="text"
                        value={form.ssh.user}
                        onChange={(e) => setForm({ ...form, ssh: { ...form.ssh, user: e.target.value } })}
                        className="input-dark"
                        style={{ width: "100%" }}
                        placeholder="ubuntu"
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: "0.8125rem", color: "#9ca3af", display: "block", marginBottom: "0.25rem" }}>SSH Password (Optional)</label>
                      <input
                        type="password"
                        value={form.ssh.password || ""}
                        onChange={(e) => setForm({ ...form, ssh: { ...form.ssh, password: e.target.value } })}
                        className="input-dark"
                        style={{ width: "100%" }}
                      />
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "1rem" }}>
                    <div>
                      <label style={{ fontSize: "0.8125rem", color: "#9ca3af", display: "block", marginBottom: "0.25rem" }}>Private Key File Path</label>
                      <input
                        type="text"
                        value={form.ssh.keyPath || ""}
                        onChange={(e) => setForm({ ...form, ssh: { ...form.ssh, keyPath: e.target.value } })}
                        className="input-dark"
                        style={{ width: "100%" }}
                        placeholder="~/.ssh/id_rsa"
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: "0.8125rem", color: "#9ca3af", display: "block", marginBottom: "0.25rem" }}>Key Passphrase</label>
                      <input
                        type="password"
                        value={form.ssh.passphrase || ""}
                        onChange={(e) => setForm({ ...form, ssh: { ...form.ssh, passphrase: e.target.value } })}
                        className="input-dark"
                        style={{ width: "100%" }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "tls" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#e2e8f0", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={form.tls.enabled}
                  onChange={(e) => setForm({ ...form, tls: { ...form.tls, enabled: e.target.checked } })}
                />
                <span style={{ fontWeight: 500 }}>Enable TLS / SSL Encryption</span>
              </label>

              {form.tls.enabled && (
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "0.5rem" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#9ca3af", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={form.tls.insecureSkipVerify}
                      onChange={(e) => setForm({ ...form, tls: { ...form.tls, insecureSkipVerify: e.target.checked } })}
                    />
                    <span>Skip TLS certificate verification (Insecure)</span>
                  </label>

                  <div>
                    <label style={{ fontSize: "0.8125rem", color: "#9ca3af", display: "block", marginBottom: "0.25rem" }}>CA Certificate Path / PEM</label>
                    <input
                      type="text"
                      value={form.tls.caCert || ""}
                      onChange={(e) => setForm({ ...form, tls: { ...form.tls, caCert: e.target.value } })}
                      className="input-dark"
                      style={{ width: "100%" }}
                      placeholder="/path/to/ca.crt"
                    />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                    <div>
                      <label style={{ fontSize: "0.8125rem", color: "#9ca3af", display: "block", marginBottom: "0.25rem" }}>Client Certificate (mTLS)</label>
                      <input
                        type="text"
                        value={form.tls.clientCert || ""}
                        onChange={(e) => setForm({ ...form, tls: { ...form.tls, clientCert: e.target.value } })}
                        className="input-dark"
                        style={{ width: "100%" }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: "0.8125rem", color: "#9ca3af", display: "block", marginBottom: "0.25rem" }}>Client Private Key (mTLS)</label>
                      <input
                        type="text"
                        value={form.tls.clientKey || ""}
                        onChange={(e) => setForm({ ...form, tls: { ...form.tls, clientKey: e.target.value } })}
                        className="input-dark"
                        style={{ width: "100%" }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "advanced" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#ef4444", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={form.readOnly}
                  onChange={(e) => setForm({ ...form, readOnly: e.target.checked })}
                />
                <span style={{ fontWeight: 600 }}>Enable Read-Only Protection Mode</span>
              </label>
              <p style={{ fontSize: "0.8125rem", color: "#9ca3af", marginTop: "-0.5rem" }}>
                Blocks destructive commands (FLUSHALL, FLUSHDB, DEL, UNLINK, KEYS, CONFIG SET) to protect production data.
              </p>

              <div>
                <label style={{ fontSize: "0.8125rem", color: "#9ca3af", display: "block", marginBottom: "0.25rem" }}>Color Badge Tag</label>
                <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem" }}>
                  {["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899"].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setForm({ ...form, color: c })}
                      style={{
                        width: "28px",
                        height: "28px",
                        borderRadius: "50%",
                        backgroundColor: c,
                        border: form.color === c ? "3px solid white" : "1px solid transparent",
                        cursor: "pointer",
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Test Status Feedback */}
          {testResult && (
            <div style={{
              marginTop: "1.25rem",
              padding: "0.75rem",
              borderRadius: "0.375rem",
              backgroundColor: testResult.success ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
              border: `1px solid ${testResult.success ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              fontSize: "0.875rem",
              color: testResult.success ? "#10b981" : "#ef4444",
            }}>
              {testResult.success ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
              <span>{testResult.message}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "1rem 1.5rem",
          borderTop: "1px solid #1f2937",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          backgroundColor: "#0d131f",
        }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={handleTest}
            disabled={testing}
          >
            {testing ? <RefreshCw size={15} className="animate-spin" /> : <Shield size={15} />}
            <span>{testing ? "Testing..." : "Test Connection"}</span>
          </button>

          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={handleSave}>
              Save Connection
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
