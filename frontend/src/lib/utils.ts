import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  // eslint-disable-next-line tailwindcss/no-custom-classname
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

export function isMacPlatform(): boolean {
  return (
    typeof navigator !== "undefined" &&
    /(Mac|iPhone|iPod|iPad)/i.test(
      navigator.userAgent || navigator.platform || ""
    )
  );
}

export function getModSymbol(): string {
  return isMacPlatform() ? "⌘" : "Ctrl+";
}

export function getDataTypeBadgeClass(type: string): string {
  switch (type.toLowerCase()) {
    case "string":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "hash":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "list":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "set":
      return "bg-purple-50 text-purple-700 border-purple-200";
    case "zset":
      return "bg-rose-50 text-rose-700 border-rose-200";
    case "stream":
      return "bg-cyan-50 text-cyan-700 border-cyan-200";
    case "rejson-rl":
    case "json":
      return "bg-indigo-50 text-indigo-700 border-indigo-200";
    case "server":
      return "bg-rose-50 text-rose-700 border-rose-200";
    case "generic":
    default:
      return "bg-zinc-100 text-zinc-700 border-zinc-200";
  }
}

export function getDataTypeShortName(type: string): string {
  switch (type.toLowerCase()) {
    case "string":
      return "STR";
    case "hash":
      return "HSH";
    case "list":
      return "LST";
    case "set":
      return "SET";
    case "zset":
      return "ZST";
    case "stream":
      return "STRM";
    case "rejson-rl":
    case "json":
      return "JSON";
    default:
      return type.substring(0, 4).toUpperCase();
  }
}

/**
 * Extracts a human-readable error message from an unknown thrown value.
 */
export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message || String(err);
  if (typeof err === "object" && err !== null && "message" in err) {
    const msg = (err as { message: unknown }).message;
    if (msg !== undefined && msg !== null && msg !== "") {
      return String(msg);
    }
  }
  return String(err);
}

