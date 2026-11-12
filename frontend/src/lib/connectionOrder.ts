import type { ConnectionConfig } from "../../bindings/memspace/backend/models/index.js";

const STORAGE_KEY = "memspace:connection_order";

/**
 * Get the saved MRU connection order (array of connection IDs) from localStorage.
 */
export function getSavedConnectionOrder(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn("Failed to load connection order from localStorage:", err);
    return [];
  }
}

/**
 * Save connection order (array of connection IDs) to localStorage.
 */
export function saveConnectionOrder(order: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
  } catch (err) {
    console.warn("Failed to save connection order to localStorage:", err);
  }
}

/**
 * Sorts connections according to the saved MRU order.
 * Connections whose IDs are in savedOrder appear first in that exact sequence,
 * followed by any new/unseen connections.
 */
export function applyConnectionOrder(
  connections: ConnectionConfig[],
  customOrder?: string[]
): ConnectionConfig[] {
  if (!connections || connections.length <= 1) return connections;

  const order = customOrder ?? getSavedConnectionOrder();
  if (!order || order.length === 0) return connections;

  const map = new Map<string, ConnectionConfig>();
  connections.forEach((c) => map.set(c.id, c));

  const sorted: ConnectionConfig[] = [];

  // First, add existing connections in the saved order
  for (const id of order) {
    const c = map.get(id);
    if (c) {
      sorted.push(c);
      map.delete(id);
    }
  }

  // Then, append any remaining connections (e.g., newly added or not yet in saved order)
  for (const c of map.values()) {
    sorted.push(c);
  }

  return sorted;
}

/**
 * Moves the connected connection to the 1st position (index 0) and persists the updated order.
 */
export function reorderWithConnectedFirst(
  connections: ConnectionConfig[],
  connectedId: string
): ConnectionConfig[] {
  if (!connections || connections.length === 0) return connections;

  const targetIndex = connections.findIndex((c) => c.id === connectedId);
  if (targetIndex === -1) return connections;

  // If already at first position, just ensure order is saved
  if (targetIndex === 0) {
    saveConnectionOrder(connections.map((c) => c.id));
    return connections;
  }

  const target = connections[targetIndex];
  const rest = connections.filter((c) => c.id !== connectedId);
  const reordered = [target, ...rest];

  saveConnectionOrder(reordered.map((c) => c.id));
  return reordered;
}

/**
 * Removes a deleted connection ID from the saved order.
 */
export function removeConnectionFromOrder(id: string): void {
  try {
    const current = getSavedConnectionOrder();
    const updated = current.filter((item) => item !== id);
    saveConnectionOrder(updated);
  } catch (err) {
    console.warn("Failed to remove connection from saved order:", err);
  }
}
