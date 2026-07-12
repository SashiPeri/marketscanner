import { ClientMessage, ServerMessage } from "./types";

export type SerializationFormat = "json" | "msgpack";

/**
 * Isolated serialization layer.
 * Swap to MessagePack by changing format — callers stay unchanged.
 */
export class Serializer {
  constructor(private readonly format: SerializationFormat = "json") {}

  serialize(message: ServerMessage | ClientMessage): string | Buffer {
    if (this.format === "json") {
      return JSON.stringify(message);
    }
    // Future: return msgpack.encode(message);
    return JSON.stringify(message);
  }

  deserialize<T extends ClientMessage>(raw: string | Buffer): T | null {
    try {
      const text = typeof raw === "string" ? raw : raw.toString("utf8");
      return JSON.parse(text) as T;
    } catch {
      return null;
    }
  }

  getFormat(): SerializationFormat {
    return this.format;
  }
}
