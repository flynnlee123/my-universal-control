import * as net from "net";
import { unpackMultiple } from "msgpackr"; // 使用 unpackMultiple 处理粘包
import { CONFIG } from "./main";

export function startSlave(native: any) {
  const server = net.createServer((socket) => {
    console.log("Master connected");
    socket.setNoDelay(true);

    socket.on("data", (data) => {
      try {
        // 核心修复：
        // 1. 使用 unpackMultiple 一次性解包所有堆积的消息
        // 2. 去掉原来逻辑中的 break，确保所有积压的移动指令都被执行
        const msgs = unpackMultiple(data);

        for (const msg of msgs) {
            switch (msg.t) {
              case "m": // Move
                native.moveMouse(msg.x, msg.y);
                break;
              case "c": // Click
                native.clickMouse(msg.b, msg.d);
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