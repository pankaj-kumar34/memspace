import React, { useState, useEffect, useRef } from "react";
import { Radio, Send, Plus, Trash2, Check, Bell } from "lucide-react";
import { Events } from "@wailsio/runtime";
import type { PubSubMessage } from "../../../bindings/redisian/backend/services";
import { PubSubService } from "../../../bindings/redisian/backend/services";

interface PubSubDebuggerProps {
  connId: string;
}

export const PubSubDebugger: React.FC<PubSubDebuggerProps> = ({ connId }) => {
  const [channels, setChannels] = useState<string[]>(["news", "notifications"]);
  const [newChannel, setNewChannel] = useState("");
  const [messages, setMessages] = useState<PubSubMessage[]>([]);
  const [isSubscribed, setIsSubscribed] = useState(false);

  // Publish inputs
  const [publishChannel, setPublishChannel] = useState("news");
  const [publishPayload, setPublishPayload] = useState('{"message": "Hello from Redisian"}');
  const [publishSuccess, setPublishSuccess] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Listen to real-time pubsub:message event from backend
    const cancelListener = Events.On("pubsub:message", (eventData: any) => {
      const msg: PubSubMessage = eventData.data || eventData;
      if (msg && msg.connId === connId) {
        setMessages((prev) => [...prev, msg]);
      }
    });

    return () => {
      cancelListener();
      if (isSubscribed) {
        PubSubService.Unsubscribe(connId, []).catch(console.error);
      }
    };
  }, [connId, isSubscribed]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubscribe = async () => {
    if (channels.length === 0) return;
    try {
      await PubSubService.Subscribe(connId, channels);
      setIsSubscribed(true);
    } catch (err: any) {
      alert("Failed to subscribe: " + (err?.message || err));
    }
  };

  const handleUnsubscribe = async () => {
    try {
      await PubSubService.Unsubscribe(connId, []);
      setIsSubscribed(false);
    } catch (err: any) {
      alert("Failed to unsubscribe: " + (err?.message || err));
    }
  };

  const handleAddChannel = () => {
    if (!newChannel.trim() || channels.includes(newChannel.trim())) return;
    setChannels((prev) => [...prev, newChannel.trim()]);
    setNewChannel("");
  };

  const handleRemoveChannel = (ch: string) => {
    setChannels((prev) => prev.filter((c) => c !== ch));
  };

  const handlePublish = async () => {
    if (!publishChannel.trim() || !publishPayload.trim()) return;
    try {
      await PubSubService.Publish(connId, publishChannel.trim(), publishPayload.trim());
      setPublishSuccess(true);
      setTimeout(() => setPublishSuccess(false), 2000);
    } catch (err: any) {
      alert("Failed to publish: " + (err?.message || err));
    }
  };

  return (
    <div style={{
      display: "flex",
      height: "100%",
      backgroundColor: "#090d16",
      overflow: "hidden",
    }}>
      {/* Channels & Publisher Left Sidebar */}
      <div style={{
        width: "320px",
        borderRight: "1px solid #1f2937",
        backgroundColor: "#0d131f",
        display: "flex",
        flexDirection: "column",
        padding: "1rem",
        gap: "1.25rem",
      }}>
        {/* Subscription Control */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#93c5fd", textTransform: "uppercase" }}>
              Channels to Subscribe
            </span>
            {isSubscribed ? (
              <button onClick={handleUnsubscribe} className="btn-secondary" style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem", color: "#f87171" }}>
                Unsubscribe
              </button>
            ) : (
              <button onClick={handleSubscribe} className="btn-primary" style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem" }}>
                Subscribe All
              </button>
            )}
          </div>

          <div style={{ display: "flex", gap: "0.4rem", marginBottom: "0.5rem" }}>
            <input
              type="text"
              placeholder="Channel name..."
              value={newChannel}
              onChange={(e) => setNewChannel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddChannel()}
              className="input-dark font-mono"
              style={{ flex: 1, fontSize: "0.8125rem", padding: "0.25rem 0.5rem" }}
            />
            <button onClick={handleAddChannel} className="btn-secondary" style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem" }}>
              <Plus size={14} />
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            {channels.map((ch) => (
              <div
                key={ch}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.3rem 0.6rem",
                  backgroundColor: "#111827",
                  borderRadius: "0.25rem",
                  fontSize: "0.8125rem",
                }}
              >
                <span className="font-mono" style={{ color: "#38bdf8" }}>#{ch}</span>
                <button
                  onClick={() => handleRemoveChannel(ch)}
                  style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer" }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Publisher Form */}
        <div style={{
          marginTop: "auto",
          paddingTop: "1rem",
          borderTop: "1px solid #1f2937",
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
        }}>
          <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#93c5fd", textTransform: "uppercase" }}>
            Publish Message
          </span>

          <input
            type="text"
            placeholder="Channel (e.g. news)"
            value={publishChannel}
            onChange={(e) => setPublishChannel(e.target.value)}
            className="input-dark font-mono"
            style={{ fontSize: "0.8125rem" }}
          />

          <textarea
            placeholder="Payload..."
            value={publishPayload}
            onChange={(e) => setPublishPayload(e.target.value)}
            className="input-dark font-mono"
            style={{ height: "80px", resize: "none", fontSize: "0.8125rem" }}
          />

          <button onClick={handlePublish} className="btn-primary" style={{ fontSize: "0.8125rem" }}>
            {publishSuccess ? <Check size={14} /> : <Send size={14} />}
            <span>{publishSuccess ? "Published!" : "Publish to Redis"}</span>
          </button>
        </div>
      </div>

      {/* Message Feed */}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        padding: "1rem",
        backgroundColor: "#070a13",
      }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingBottom: "0.75rem",
          borderBottom: "1px solid #1f2937",
          marginBottom: "0.75rem",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Radio size={16} color={isSubscribed ? "#10b981" : "#6b7280"} />
            <span style={{ fontWeight: 600, color: "#f3f4f6", fontSize: "0.875rem" }}>
              Live Message Feed {isSubscribed ? "(Listening)" : "(Idle)"}
            </span>
          </div>

          <button
            onClick={() => setMessages([])}
            className="btn-secondary"
            style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem" }}
          >
            Clear Messages
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {messages.length === 0 ? (
            <div style={{ textAlign: "center", margin: "auto", color: "#6b7280", fontSize: "0.875rem" }}>
              <Bell size={28} style={{ margin: "0 auto 0.5rem auto", opacity: 0.3 }} />
              <p>No messages received yet.</p>
              <p style={{ fontSize: "0.75rem", color: "#4b5563" }}>Click "Subscribe All" to start receiving real-time events.</p>
            </div>
          ) : (
            messages.map((m, i) => (
              <div
                key={i}
                style={{
                  padding: "0.5rem 0.75rem",
                  backgroundColor: "#111827",
                  border: "1px solid #1f2937",
                  borderRadius: "0.375rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.25rem",
                  fontSize: "0.8125rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="font-mono" style={{ color: "#38bdf8", fontWeight: 600 }}>
                    #{m.channel}
                  </span>
                  <span style={{ color: "#6b7280", fontSize: "0.75rem" }}>
                    {new Date(m.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <div className="font-mono" style={{ color: "#e2e8f0", wordBreak: "break-all" }}>
                  {m.payload}
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
};
