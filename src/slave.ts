import * as net from "net";
import { unpack } from "msgpackr";
import { CONFIG } from "./main";

export function startSlave(native: any) {
  const server = net.createServer((socket) => {
    console.log("Master connected");
    socket.setNoDelay(true);

    socket.on("data", (data) => {
      try {
        // 流式解包，msgpackr 支持 unpackMultiple 但这里简单处理
        // 如果数据包粘连严重，需要自行处理 buffer
        const msg = unpack(data);

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
      } catch (e) {
        // 忽略解析错误
      }
    });
  });

  server.listen(CONFIG.PORT, () => {
    console.log(`Slave running on port ${CONFIG.PORT}`);
  });
}
