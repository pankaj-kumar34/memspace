import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { AlertCircle, CheckCircle, Info, AlertTriangle, X } from "lucide-react";

export type ToastType = "error" | "success" | "warning" | "info";

export interface ToastMessage {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number;
}

interface ToastOptions {
  type?: ToastType;
  title?: string;
  message: string;
  duration?: number;
}

interface ToastContextType {
  toast: (options: ToastOptions) => void;
  error: (titleOrMessage: string, message?: string, duration?: number) => void;
  success: (titleOrMessage: string, message?: string, duration?: number) => void;
  warning: (titleOrMessage: string, message?: string, duration?: number) => void;
  info: (titleOrMessage: string, message?: string, duration?: number) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    ({ type = "info", title, message, duration = 5000 }: ToastOptions) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev, { id, type, title, message, duration }]);
    },
    []
  );

  const error = useCallback(
    (titleOrMessage: string, message?: string, duration?: number) => {
      const hasTwoArgs = message !== undefined;
      toast({
        type: "error",
        title: hasTwoArgs ? titleOrMessage : undefined,
        message: hasTwoArgs ? message : titleOrMessage,
        duration: duration ?? 6000,
      });
    },
    [toast]
  );

  const success = useCallback(
    (titleOrMessage: string, message?: string, duration?: number) => {
      const hasTwoArgs = message !== undefined;
      toast({
        type: "success",
        title: hasTwoArgs ? titleOrMessage : undefined,
        message: hasTwoArgs ? message : titleOrMessage,
        duration: duration ?? 4000,
      });
    },
    [toast]
  );

  const warning = useCallback(
    (titleOrMessage: string, message?: string, duration?: number) => {
      const hasTwoArgs = message !== undefined;
      toast({
        type: "warning",
        title: hasTwoArgs ? titleOrMessage : undefined,
        message: hasTwoArgs ? message : titleOrMessage,
        duration: duration ?? 5000,
      });
    },
    [toast]
  );

  const info = useCallback(
    (titleOrMessage: string, message?: string, duration?: number) => {
      const hasTwoArgs = message !== undefined;
      toast({
        type: "info",
        title: hasTwoArgs ? titleOrMessage : undefined,
        message: hasTwoArgs ? message : titleOrMessage,
        duration: duration ?? 4000,
      });
    },
    [toast]
  );

  return (
    <ToastContext.Provider value={{ toast, error, success, warning, info, dismiss }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed right-5 bottom-5 z-50 flex w-full max-w-sm flex-col gap-2.5 sm:max-w-md"
      >
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onClose={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
};

const ToastCard: React.FC<{ toast: ToastMessage; onClose: () => void }> = ({ toast, onClose }) => {
  useEffect(() => {
    if (!toast.duration || toast.duration <= 0) return;
    const timer = setTimeout(() => {
      onClose();
    }, toast.duration);
    return () => clearTimeout(timer);
  }, [toast.duration, onClose]);

  const typeConfig = {
    error: {
      icon: <AlertCircle size={16} className="shrink-0 text-rose-400" />,
      border: "border-rose-500/30",
      accentBg: "bg-rose-500/10",
      shadow: "shadow-rose-950/20",
    },
    success: {
      icon: <CheckCircle size={16} className="shrink-0 text-emerald-400" />,
      border: "border-emerald-500/30",
      accentBg: "bg-emerald-500/10",
      shadow: "shadow-emerald-950/20",
    },
    warning: {
      icon: <AlertTriangle size={16} className="shrink-0 text-amber-400" />,
      border: "border-amber-500/30",
      accentBg: "bg-amber-500/10",
      shadow: "shadow-amber-950/20",
    },
    info: {
      icon: <Info size={16} className="shrink-0 text-blue-400" />,
      border: "border-blue-500/30",
      accentBg: "bg-blue-500/10",
      shadow: "shadow-blue-950/20",
    },
  }[toast.type];

  return (
    <div
      role="alert"
      className={`pointer-events-auto flex items-start gap-3 rounded-xl border bg-zinc-900/95 p-3.5 text-zinc-100 backdrop-blur-md ${typeConfig.border} shadow-xl ${typeConfig.shadow} transition-all duration-200 animate-in fade-in slide-in-from-bottom-2`}
    >
      <div className={`rounded-lg p-1.5 ${typeConfig.accentBg} mt-0.5 shrink-0`}>
        {typeConfig.icon}
      </div>
      <div className="min-w-0 flex-1 pr-1">
        {toast.title && (
          <h5 className="mb-0.5 text-xs font-semibold tracking-tight text-white">
            {toast.title}
          </h5>
        )}
        <p className="font-sans text-xs leading-relaxed wrap-break-word text-zinc-300 select-text">
          {toast.message}
        </p>
      </div>
      <button
        onClick={onClose}
        className="shrink-0 cursor-pointer rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
        title="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
};
