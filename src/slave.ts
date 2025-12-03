import * as net from "net";
import { unpackMultiple } from "msgpackr";
import { screen } from "electron";
import { CONFIG } from "./main";

export function startSlave(native: any) {
  // 获取 Slave 的屏幕尺寸
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
              case "m": // Move (Absolute Proportional)
                // msg.x 和 msg.y 是 0.0 - 1.0 的比例值
                // 映射到 Slave 的实际分辨率
                const absX = msg.x * width;
                const absY = msg.y * height;
                native.moveMouseAbs(absX, absY);
                break;
              case "c": // Click
                native.clickMouse(msg.b, msg.d);
                break;
              case "k": // Key
                native.keyEvent(msg.k, msg.d);
                break;
              case "s": // Scroll (Delta based)
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