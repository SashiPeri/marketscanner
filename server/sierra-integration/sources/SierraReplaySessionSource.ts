import { ReplaySessionDescriptor, ReplaySessionStatus } from "../types";

/**
 * Replay session metadata — observe-only (no play/pause control in this phase).
 * Recommended transport: ACSIL bridge observing Sierra Replay.
 */
export interface SierraReplaySessionSource {
  listSessions(): Promise<ReplaySessionDescriptor[]>;

  getStatus(sessionId: string): Promise<ReplaySessionStatus | undefined>;
}
