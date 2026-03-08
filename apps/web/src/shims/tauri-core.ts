import { bridgeInvoke } from "./platform-bridge";

export async function invoke<T = unknown>(command: string, args?: Record<string, unknown>): Promise<T> {
  return bridgeInvoke<T>(command, args);
}
