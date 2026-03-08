const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export async function bridgeInvoke<T = unknown>(command: string, args?: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/api/v1/bridge/invoke/${command}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ args: args ?? {} }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.message ?? `Invoke failed for ${command}`);
  }
  return payload.result as T;
}

type EventCallback<T> = (payload: T) => void;

const bus = new EventTarget();

export function emitCompatEvent<T>(eventName: string, payload: T): void {
  bus.dispatchEvent(new CustomEvent(eventName, { detail: payload }));
}

export function subscribeCompatEvent<T>(eventName: string, callback: EventCallback<T>): () => void {
  const listener = (event: Event) => {
    callback((event as CustomEvent<T>).detail);
  };
  bus.addEventListener(eventName, listener);
  return () => bus.removeEventListener(eventName, listener);
}
