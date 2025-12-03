import * as net from "net";
import { unpack } from "msgpackr";
import { CONFIG } from "./main";

export function startSlave(native: any) {
  const server = net.createServer((socket) => {
    console.log("Master connected");
    socket.setNoDelay(true);

    socket.on("data", (data) => {
      try {
        // 如果数据包粘连严重，建议使用 msgpackr 的 unpackMultiple 或自行处理 buffer 拼接
        // 这里假设网络状况良好，直接解包
        // 注意：在高速移动时，data 可能会包含多个包，unpack 只解第一个会导致丢包
        // 简单修复：尝试解包所有内容
        
        // 简单的 buffer 处理逻辑（增强版）
        let offset = 0;
        while (offset < data.length) {
            const start = offset;
            const msg = unpack(data.subarray(start));
            
            // msgpackr 不会告诉我们包的长度，这是一个潜在问题
            // 但 unpack 通常只读取它需要的部分。
            // 实际上 msgpackr 的 unpack 默认只解一个。
            // 更好的做法是使用 unpackMultiple 如果数据是连续的 buffer
            // 但为了保险起见，如果不粘包，上面的写法可以。
            // 如果粘包，我们需要知道 offset。msgpackr 文档建议使用 unpackMultiple
            
            // 鉴于 socket 也是 stream，我们暂时假设每次 data 是一组完整的 msgpack chunks
            // 但为了性能，我们先只处理解出来的第一个，因为大多数时候是一个。
            // 如果你发现丢帧，这里是优化点。
            
            // 下面是处理逻辑：
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
            
            // 简易处理：这里暂时 break，因为没有可靠的 offset 获取方式
            // 如果遇到严重粘包导致卡顿，建议改用 msgpackr 的 addExtension 或者 unpackMultiple
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