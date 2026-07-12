import { Logger } from "../logging";
import { EventChannel, EventHandler, EventPayloadMap, Unsubscribe } from "./types";

/**
 * Provider-agnostic in-process event bus.
 *
 * Concurrency: publish() is synchronous and never awaits subscribers.
 * A slow subscriber cannot block the ScannerEngine or any producer.
 * Subscriber errors are caught and logged — they do not propagate.
 */
export class EventBus {
  private readonly handlers = new Map<EventChannel, Set<EventHandler<unknown>>>();

  constructor(private readonly logger: Logger) {}

  publish<C extends EventChannel>(channel: C, payload: EventPayloadMap[C]): void {
    const channelHandlers = this.handlers.get(channel);
    if (!channelHandlers || channelHandlers.size === 0) return;

    for (const handler of channelHandlers) {
      try {
        handler(payload);
      } catch (error) {
        this.logger.error("Handler error on event channel", {
          channel,
          error: String(error),
        });
      }
    }
  }

  subscribe<C extends EventChannel>(
    channel: C,
    handler: EventHandler<EventPayloadMap[C]>,
  ): Unsubscribe {
    let channelHandlers = this.handlers.get(channel);
    if (!channelHandlers) {
      channelHandlers = new Set();
      this.handlers.set(channel, channelHandlers);
    }

    channelHandlers.add(handler as EventHandler<unknown>);

    return () => {
      channelHandlers!.delete(handler as EventHandler<unknown>);
      if (channelHandlers!.size === 0) {
        this.handlers.delete(channel);
      }
    };
  }

  subscriberCount(channel: EventChannel): number {
    return this.handlers.get(channel)?.size ?? 0;
  }

  channels(): EventChannel[] {
    return Array.from(this.handlers.keys());
  }
}
