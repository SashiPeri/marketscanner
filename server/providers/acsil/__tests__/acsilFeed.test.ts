import { connect } from "net";
import { describe, expect, it } from "vitest";
import { createLogger } from "../../../logging";
import { AcsilMessage } from "../acsilProtocol";
import { AcsilTcpFeed } from "../AcsilTcpFeed";

describe("AcsilTcpFeed", () => {
  it("delivers study lines as ticks and survives garbage", async () => {
    const logger = createLogger("test");
    const feed = new AcsilTcpFeed(0, logger);
    const ticks: AcsilMessage[] = [];
    feed.on("tick", (message) => ticks.push(message));
    feed.start();

    const port = await feed.waitForListening();
    await new Promise<void>((resolve, reject) => {
      const socket = connect(port, "127.0.0.1", () => {
        socket.write("this is not json\n");
        socket.write('{"t":"trade","sym":"ESZ26-CME","ts":1758784800123,"price":6642.5,"size":3}\n');
        socket.write('{"t":"quote","sym":"ESZ26-CME","ts":1758784800124,"bid":6642.25,"ask":6642.5}\n');
        socket.end();
      });
      socket.on("close", () => resolve());
      socket.on("error", (error) => reject(error));
    });

    // Give the event loop a beat to flush the server side.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(ticks).toHaveLength(2);
    expect(ticks[0]).toMatchObject({ t: "trade", sym: "ESZ26-CME", price: 6642.5 });
    expect(ticks[1]).toMatchObject({ t: "quote", sym: "ESZ26-CME", bid: 6642.25 });
    expect(feed.getLastMessageAt()).toBeDefined();
    feed.stop();
  });
});
