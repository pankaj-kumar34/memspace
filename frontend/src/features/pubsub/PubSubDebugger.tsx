import React, { useState, useEffect, useRef } from "react";
import { Radio, Send, Plus, Trash2, Check, Bell, X } from "lucide-react";
import { Events } from "@wailsio/runtime";
import type { PubSubMessage } from "../../../bindings/memspace/backend/services";
import { PubSubService } from "../../../bindings/memspace/backend/services";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { useToast } from "../../components/ui/Toast";
import { getErrorMessage } from "../../lib/utils";

interface PubSubDebuggerProps {
  connId: string;
  onSubscribedChannelsChange?: (channels: string[]) => void;
}

export const PubSubDebugger: React.FC<PubSubDebuggerProps> = ({
  connId,
  onSubscribedChannelsChange,
}) => {
  const { error: toastError, success: toastSuccess } = useToast();
  const [channels, setChannels] = useState<string[]>(["news", "notifications"]);
  const [newChannel, setNewChannel] = useState("");
  const [messages, setMessages] = useState<PubSubMessage[]>([]);
  const [subscribedChannels, setSubscribedChannels] = useState<string[]>([]);

  const onSubscribedChannelsChangeRef = useRef(onSubscribedChannelsChange);
  useEffect(() => {
    onSubscribedChannelsChangeRef.current = onSubscribedChannelsChange;
  }, [onSubscribedChannelsChange]);

  useEffect(() => {
    onSubscribedChannelsChangeRef.current?.(subscribedChannels);
  }, [subscribedChannels]);

  useEffect(() => {
    return () => {
      onSubscribedChannelsChangeRef.current?.([]);
    };
  }, []);

  // Publish inputs
  const [publishChannel, setPublishChannel] = useState("news");
  const [publishPayload, setPublishPayload] = useState(
    '{"message": "Hello from Memspace"}',
  );
  const [publishSuccess, setPublishSuccess] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const subscribedChannelsRef = useRef<string[]>([]);
  useEffect(() => {
    subscribedChannelsRef.current = subscribedChannels;
  }, [subscribedChannels]);
  const isSubscribed = subscribedChannels.length > 0;

  useEffect(() => {
    // Listen to real-time pubsub:message event from backend
    const cancelListener = Events.On("pubsub:message", (eventData: unknown) => {
      const raw = eventData as { data?: PubSubMessage } | PubSubMessage | null;
      const msg =
        raw && typeof raw === "object" && "data" in raw
          ? raw.data
          : (raw as PubSubMessage | null);
      if (msg && msg.connId === connId) {
        setMessages((prev) => [...prev, msg]);
      }
    });

    return () => {
      cancelListener();
      if (subscribedChannelsRef.current.length > 0) {
        PubSubService.Unsubscribe(connId, []).catch(() => {});
      }
    };
  }, [connId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Toggle single channel subscription
  const handleToggleChannel = async (ch: string) => {
    const isCurrentlySubscribed = subscribedChannels.includes(ch);
    const updated = isCurrentlySubscribed
      ? subscribedChannels.filter((c) => c !== ch)
      : [...subscribedChannels, ch];

    try {
      if (updated.length === 0) {
        await PubSubService.Unsubscribe(connId, []);
      } else {
        await PubSubService.Subscribe(connId, updated);
      }
    } catch (err: unknown) {
      if (updated.length === 0) {
        console.warn("Unsubscribed all channels:", err);
      } else {
        toastError("Subscription Update Failed", getErrorMessage(err));
        return;
      }
    }
    setSubscribedChannels(updated);
  };

  const handleAddChannel = () => {
    const trimmed = newChannel.trim();
    if (!trimmed || channels.includes(trimmed)) return;
    setChannels((prev) => [...prev, trimmed]);
    setNewChannel("");
  };

  const handleRemoveChannel = async (ch: string) => {
    setChannels((prev) => prev.filter((c) => c !== ch));
    if (subscribedChannels.includes(ch)) {
      const remaining = subscribedChannels.filter((c) => c !== ch);
      setSubscribedChannels(remaining);
      try {
        if (remaining.length === 0) {
          await PubSubService.Unsubscribe(connId, []);
        } else {
          await PubSubService.Subscribe(connId, remaining);
        }
      } catch (err) {
        console.error(
          "Failed to update subscriptions after removing channel:",
          err,
        );
      }
    }
  };

  const handlePublish = async () => {
    if (!publishChannel.trim() || !publishPayload.trim()) return;
    try {
      await PubSubService.Publish(
        connId,
        publishChannel.trim(),
        publishPayload.trim(),
      );
      setPublishSuccess(true);
      setTimeout(() => setPublishSuccess(false), 2000);
      toastSuccess("Message Published", `Published to #${publishChannel.trim()}`);
    } catch (err: unknown) {
      toastError("Publish Failed", getErrorMessage(err));
    }
  };

  return (
    <div className="flex h-full flex-1 overflow-hidden bg-[#fafafa] font-sans select-none">
      {/* Channels & Publisher Left Sidebar */}
      <div className="flex w-88 shrink-0 flex-col gap-5 overflow-y-auto border-r border-zinc-200 bg-white p-5 lg:w-96">
        {/* Channels Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold tracking-wider text-zinc-500 uppercase">
              Channels
            </span>
            <span className="rounded-full border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-500">
              {subscribedChannels.length} listening
            </span>
          </div>

          {/* Add Channel Input (Embedded Ghost Plus Button) */}
          <div className="relative flex items-center">
            <Input
              type="text"
              placeholder="Enter channel name..."
              value={newChannel}
              onChange={(e) => setNewChannel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddChannel()}
              className="h-9 rounded-xl border-zinc-200 bg-white pr-9 font-sans text-sm font-medium text-zinc-900 placeholder:font-normal placeholder:text-zinc-400"
            />
            <button
              onClick={handleAddChannel}
              disabled={!newChannel.trim()}
              className="absolute right-1.5 flex size-6 cursor-pointer items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-800 disabled:pointer-events-none disabled:opacity-30"
              title="Add Channel (Enter)"
            >
              <Plus size={14} />
            </button>
          </div>

          {/* Channel list chips (Takes required space with inline flex-wrap) */}
          <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto pr-1">
            {channels.length === 0 ? (
              <p className="py-1 text-xs text-zinc-400 italic">
                No channels added yet
              </p>
            ) : (
              channels.map((ch) => {
                const chSubscribed = subscribedChannels.includes(ch);
                return (
                  <div
                    key={ch}
                    onClick={() => {
                      handleToggleChannel(ch);
                      setPublishChannel(ch);
                    }}
                    className={`group inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 font-sans text-xs transition-all select-none active:scale-98 ${
                      chSubscribed
                        ? "border-emerald-300 bg-emerald-50/90 text-emerald-950 shadow-2xs"
                        : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:border-zinc-300 hover:bg-zinc-100"
                    }`}
                    title={
                      chSubscribed
                        ? `Listening to #${ch} — Click to unsubscribe`
                        : `Click to subscribe to #${ch}`
                    }
                  >
                    <span
                      className={`size-1.5 shrink-0 rounded-full transition-all ${
                        chSubscribed
                          ? "animate-pulse bg-emerald-500 ring-2 ring-emerald-500/30"
                          : "bg-zinc-300 group-hover:bg-zinc-400"
                      }`}
                    />
                    <span
                      className={`max-w-35 truncate font-semibold ${
                        chSubscribed
                          ? "font-bold text-emerald-950"
                          : "text-zinc-800"
                      }`}
                    >
                      #{ch}
                    </span>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveChannel(ch);
                      }}
                      className="ml-0.5 shrink-0 cursor-pointer rounded p-0.5 text-zinc-400 transition-colors hover:bg-rose-100/60 hover:text-rose-600"
                      title={`Delete #${ch}`}
                    >
                      <X size={11} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="h-px bg-zinc-200" />

        {/* Message Publisher */}
        <div className="flex flex-1 flex-col gap-3 font-sans">
          <span className="text-xs font-bold tracking-wider text-zinc-500 uppercase">
            Publish Message
          </span>

          <div className="flex flex-1 flex-col space-y-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-zinc-700">
                Channel
              </label>
              <Input
                type="text"
                value={publishChannel}
                onChange={(e) => setPublishChannel(e.target.value)}
                placeholder="e.g. news"
                className="h-9 rounded-xl border-zinc-200 bg-white font-sans text-sm font-medium text-zinc-900 placeholder:font-normal placeholder:text-zinc-400"
              />
            </div>

            <div className="flex min-h-40 flex-1 flex-col">
              <label className="mb-1.5 block text-xs font-semibold text-zinc-700">
                Payload
              </label>
              <textarea
                value={publishPayload}
                onChange={(e) => setPublishPayload(e.target.value)}
                placeholder='Enter payload (e.g. {"event": "ping"})...'
                className="min-h-40 w-full flex-1 resize-y rounded-xl border border-zinc-200 bg-white p-3 font-mono text-xs leading-relaxed text-zinc-900 select-text placeholder:font-sans placeholder:text-zinc-400 focus:border-rose-500 focus:ring-1 focus:ring-rose-500/20 focus:outline-none"
                spellCheck={false}
              />
            </div>

            <Button
              onClick={handlePublish}
              variant="default"
              size="sm"
              className="h-9 w-full cursor-pointer gap-2 rounded-xl text-xs font-semibold shadow-xs"
            >
              {publishSuccess ? (
                <Check size={14} className="text-white" />
              ) : (
                <Send size={14} />
              )}
              <span>
                {publishSuccess ? "Published Successfully!" : "Publish Message"}
              </span>
            </Button>
          </div>
        </div>
      </div>

      {/* Real-time Message Stream */}
      <div className="flex h-full flex-1 flex-col overflow-hidden bg-[#fafafa] font-sans">
        {/* Stream Header */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-6 text-xs shadow-2xs">
          <div className="flex items-center gap-2.5">
            <Radio
              size={15}
              className={
                isSubscribed
                  ? "animate-pulse text-emerald-600"
                  : "text-zinc-400"
              }
            />
            <span className="text-xs font-bold text-zinc-900 sm:text-sm">
              Live Message Feed
            </span>
            <span className="rounded-full border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500">
              {messages.length} received
            </span>
          </div>

          <Button
            onClick={() => setMessages([])}
            variant="ghost"
            size="sm"
            className="h-7 cursor-pointer gap-1.5 rounded-lg px-2.5 text-xs text-zinc-500 transition-colors hover:bg-rose-50 hover:text-rose-600"
            title="Clear all received messages"
          >
            <Trash2 size={13} />
            <span>Clear Feed</span>
          </Button>
        </div>

        {/* Stream Content: Perfectly Centered Empty State OR Scrollable Feed */}
        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center p-8 text-center select-none">
            <div className="mb-4 flex size-16 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-zinc-400 shadow-xs">
              <Bell size={28} className="text-zinc-400" />
            </div>
            <h4 className="text-base font-bold text-zinc-900">
              No Pub/Sub messages received yet
            </h4>
            <p className="mt-2 max-w-sm text-xs leading-relaxed text-zinc-500">
              {isSubscribed
                ? `Currently listening to ${subscribedChannels.map((c) => `#${c}`).join(", ")} in real-time. Messages published by any client will appear here immediately.`
                : "Click any channel chip on the left (e.g. #news) to start listening."}
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 select-text sm:p-8">
            <div className="mx-auto max-w-4xl space-y-4">
              {messages.map((m, idx) => (
                <div
                  key={idx}
                  className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 font-sans shadow-2xs transition-shadow hover:shadow-xs sm:p-5"
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 font-mono text-xs font-bold text-rose-700">
                        #{m.channel}
                      </span>
                    </div>
                    <span className="font-mono text-xs text-zinc-400">
                      {new Date(m.timestamp * 1000).toLocaleTimeString()}
                    </span>
                  </div>

                  <div className="rounded-xl border border-zinc-200/70 bg-zinc-50/80 p-3.5 font-mono text-xs leading-relaxed break-all whitespace-pre-wrap text-zinc-900 select-text sm:text-[13px]">
                    {m.payload}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
