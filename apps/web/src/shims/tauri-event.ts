import { subscribeCompatEvent } from "./platform-bridge";

export type Event<T> = { payload: T };
export type UnlistenFn = () => void;

export async function listen<T>(eventName: string, handler: (event: Event<T>) => void): Promise<UnlistenFn> {
  return subscribeCompatEvent<T>(eventName, (payload) => handler({ payload }));
}
