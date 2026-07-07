import { SierraConfig } from "./market";

export interface SierraService {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  status(): SierraConfig["status"];
  subscribe(symbol: string): Promise<void>;
  unsubscribe(symbol: string): Promise<void>;
}

export class NotImplementedSierraService implements SierraService {
  connect(): Promise<void> {
    return Promise.reject(new Error("Sierra DTC connectivity is not implemented in Phase 1."));
  }

  disconnect(): Promise<void> {
    return Promise.reject(new Error("Sierra DTC connectivity is not implemented in Phase 1."));
  }

  status(): SierraConfig["status"] {
    return "DISCONNECTED";
  }

  subscribe(_symbol: string): Promise<void> {
    return Promise.reject(new Error("Sierra DTC subscriptions are not implemented in Phase 1."));
  }

  unsubscribe(_symbol: string): Promise<void> {
    return Promise.reject(new Error("Sierra DTC subscriptions are not implemented in Phase 1."));
  }
}
