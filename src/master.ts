import { screen, globalShortcut } from "electron";
import * as net from "net";
import { pack } from "msgpackr";
import { uIOhook } from "uiohook-napi";
import { CONFIG } from "./main";
import { UIOHOOK_TO_MAC_MAP } from "./keymap";

// UioHook Event Constants
const EVENT_TYPE = {
  KEY_PRESSED: 4,
  KEY_RELEASED: 5,
  MOUSE_CLICKED: 6,
  MOUSE_PRESSED: 7,
  MOUSE_RELEASED: 8,
  MOUSE_MOVED: 9,
  MOUSE_WHEEL: 11,
};

export function startMaster(native: any) {
  let socket: net.Socket | null = null;
  let isRemote = false;

  // 获取 Master 屏幕尺寸
  const { width, height } = screen.getPrimaryDisplay().size;
  console.log(`Master Screen Size: ${width}x${height}`);

  const connect = () => {
    socket = new net.Socket();
    socket.connect(CONFIG.PORT, CONFIG.SLAVE_IP, () => {
      console.log("Connected to Slave");
      socket?.setNoDelay(true); // 禁用 Nagle 算法
    });
    socket.on("close", () => setTimeout(connect, 1000));
    socket.on("error", (e) => console.log("Conn error:", e.message));
  };
  connect();

  const toggleRemote = () => {
    if (!socket) return;
    isRemote = !isRemote;

    if (isRemote) {
      console.log(">>> REMOTE MODE");
      // 远程模式下，不再隐藏光标，也不再锁定光标
      // 允许用户在 Master 上自由移动，Slave 会等比例跟随
      // native.setCursor(false); 
    } else {
      console.log("<<< LOCAL MODE");
      // native.setCursor(true);
    }
  };

  globalShortcut.register("Option+Q", toggleRemote);
  globalShortcut.register("Ctrl+Option+Command+Esc", () => {
    isRemote = false;
    process.exit(0);
  });

  uIOhook.on("input", (e: any) => {
    if (!isRemote || !socket) return;

    // 1. 鼠标移动 (绝对坐标映射策略)
    if (e.type === EVENT_TYPE.MOUSE_MOVED) {
        // 计算归一化坐标 (0.0 ~ 1.0)
        let normX = e.x / width;
        let normY = e.y / height;

        // 简单的边界钳制，防止计算出的坐标略微越界
        normX = Math.max(0, Math.min(1, normX));
        normY = Math.max(0, Math.min(1, normY));

        socket.write(pack({ t: "m", x: normX, y: normY }));
    }

    // 2. 鼠标点击
    else if (e.type === EVENT_TYPE.MOUSE_PRESSED) {
      socket.write(pack({ t: "c", b: e.button, d: true }));
    } else if (e.type === EVENT_TYPE.MOUSE_RELEASED) {
      socket.write(pack({ t: "c", b: e.button, d: false }));
    }

    // 3. 滚轮 (保持 Delta 策略，因为滚轮是相对运动)
    else if (e.type === EVENT_TYPE.MOUSE_WHEEL) {
      let delta = e.rotation;
      if (e.amount && e.amount > 0) delta *= e.amount;

      // 调整灵敏度，并取反方向 (Fix: Up is Down issue)
      delta = delta * -5;

      if (e.direction === 3) {
        // Vertical
        socket.write(pack({ t: "s", dy: delta, dx: 0 }));
      } else if (e.direction === 4) {
        // Horizontal
        socket.write(pack({ t: "s", dy: 0, dx: delta }));
      }
    }

    // 4. 键盘
    else if (
      e.type === EVENT_TYPE.KEY_PRESSED ||
      e.type === EVENT_TYPE.KEY_RELEASED
    ) {
      const isDown = e.type === EVENT_TYPE.KEY_PRESSED;
      const code = e.rawcode ?? UIOHOOK_TO_MAC_MAP[e.keycode];
      socket.write(pack({ t: "k", k: code, d: isDown }));
    }
  });

  uIOhook.start();
}