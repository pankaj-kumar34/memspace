import React, { useEffect } from "react";
import { AlertTriangle, Trash2, X } from "lucide-react";
import { Button } from "./button";

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "warning" | "default";
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "danger",
  onConfirm,
  onCancel,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      } else if (e.key === "Enter") {
        e.preventDefault();
        onConfirm();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onConfirm, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs duration-150 animate-in fade-in"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md transform space-y-4 overflow-hidden rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl transition-all duration-150 scale-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3.5">
          <div
            className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${
              variant === "warning"
                ? "bg-amber-100 text-amber-600"
                : "bg-rose-100 text-rose-600"
            }`}
          >
            {variant === "danger" ? <Trash2 size={20} /> : <AlertTriangle size={20} />}
          </div>

          <div className="min-w-0 flex-1 pt-0.5">
            <h3 className="text-base leading-tight font-bold text-zinc-900">
              {title}
            </h3>
            <p className="mt-1.5 text-xs leading-relaxed text-zinc-600">
              {description}
            </p>
          </div>

          <button
            onClick={onCancel}
            className="flex size-7 cursor-pointer items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
            title="Close (Esc)"
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex items-center justify-end gap-2.5 border-t border-zinc-100 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            className="h-9 cursor-pointer border-zinc-200 bg-white px-4 text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
          >
            {cancelText}
          </Button>

          <Button
            type="button"
            variant={
              variant === "danger"
                ? "destructive"
                : variant === "warning"
                  ? "warning"
                  : "default"
            }
            size="sm"
            onClick={onConfirm}
            className="h-9 cursor-pointer gap-1.5 px-4 text-xs font-semibold shadow-xs"
          >
            {variant === "danger" && <Trash2 size={13} />}
            <span>{confirmText}</span>
          </Button>
        </div>
      </div>
    </div>
  );
};
