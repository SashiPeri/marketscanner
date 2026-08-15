import { SierraIntegrationGoal, SierraTransportKind } from "./types";

/**
 * Thrown by stub adapters when a concrete transport is not yet wired.
 */
export class SierraIntegrationNotImplementedError extends Error {
  readonly goal: SierraIntegrationGoal;
  readonly transport: SierraTransportKind;

  constructor(goal: SierraIntegrationGoal, transport: SierraTransportKind, detail?: string) {
    const message =
      detail ??
      `Sierra integration not implemented for goal "${goal}" (recommended transport: ${transport})`;
    super(message);
    this.name = "SierraIntegrationNotImplementedError";
    this.goal = goal;
    this.transport = transport;
  }
}
