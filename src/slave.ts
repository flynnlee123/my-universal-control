import * as net from "net";
import { unpackMultiple } from "msgpackr";
import { screen } from "electron";
import { CONFIG } from "./main";

export function startSlave(native: any) {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.size;
  console.log(`Slave Screen Size: ${width}x${height}`);

  const server = net.createServer((socket) => {
    console.log("Master connected");
    socket.setNoDelay(true);

    socket.on("data", (data) => {
      try {
        const msgs = unpackMultiple(data);

        for (const msg of msgs) {
            switch (msg.t) {
              case "m": // Move
                const absX = msg.x * width;
                const absY = msg.y * height;
                native.moveMouseAbs(absX, absY);
                break;
              case "c": // Click
                // msg.b: button, msg.d: isDown, msg.cl: clickCount
                // 默认 clickCount 为 1，防止 undefined
                native.clickMouse(msg.b, msg.d, msg.cl || 1);
                break;
              case "k": // Key
                native.keyEvent(msg.k, msg.d);
                break;
              case "s": // Scroll
                native.scrollEvent(msg.dy, msg.dx);
                break;
            }
        }
      } catch (e) {
        console.error("Parse error:", e);
      }
    });
  });

  server.listen(CONFIG.PORT, () => {
    console.log(`Slave running on port ${CONFIG.PORT}`);
  });
}