import { screen, globalShortcut } from "electron";
import * as net from "net";
import { pack } from "msgpackr";
import { uIOhook } from "uiohook-napi";
import { CONFIG } from "./main";
import { UIOHOOK_TO_MAC_MAP } from "./keymap";

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
  
  // 轮询定时器
  let deltaTimer: NodeJS.Timeout | null = null;

  // Master 屏幕参数
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.size;
  
  // 虚拟光标
  let vX = width / 2;
  let vY = height / 2;

  // === 手动点击计数逻辑 ===
  let lastClickTime = 0;
  let clickCount = 0;
  const DOUBLE_CLICK_DELAY = 400; // macOS 默认大概是 500ms，设 400ms 更稳
  let lastButton = 0;

  const connect = () => {
    socket = new net.Socket();
    socket.connect(CONFIG.PORT, CONFIG.SLAVE_IP, () => {
      console.log("Connected to Slave");
      socket?.setNoDelay(true);
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
      
      const point = screen.getCursorScreenPoint();
      vX = point.x;
      vY = point.y;

      // 1. 隐藏光标
      native.setCursor(false);

      // 2. 锁定系统光标 (解决 Dock 栏误触)
      native.setMouseLock(true);

      // 3. 开启点击拦截 (防止误点 Master 窗口，会导致 uIOhook 的 clickCount 失效)
      native.setClickTrap(true);

      // 4. 开启轮询 Delta
      if (deltaTimer) clearInterval(deltaTimer);
      deltaTimer = setInterval(() => {
        const delta = native.getMouseDelta();
        if (delta.x !== 0 || delta.y !== 0) {
          vX += delta.x;
          vY += delta.y;
          vX = Math.max(0, Math.min(width, vX));
          vY = Math.max(0, Math.min(height, vY));
          socket?.write(pack({ t: "m", x: vX / width, y: vY / height }));
        }
      }, 16);

    } else {
      console.log("<<< LOCAL MODE");
      
      if (deltaTimer) clearInterval(deltaTimer);
      deltaTimer = null;

      native.setClickTrap(false);
      native.setMouseLock(false);
      native.setCursor(true);
    }
  };

  globalShortcut.register("Option+Q", toggleRemote);
  globalShortcut.register("Ctrl+Option+Command+Esc", () => {
    isRemote = false;
    if (deltaTimer) clearInterval(deltaTimer);
    native.setClickTrap(false);
    native.setMouseLock(false);
    native.setCursor(true);
    process.exit(0);
  });

  uIOhook.on("input", (e: any) => {
    if (!isRemote || !socket) return;

    // 1. 点击事件
    if (e.type === EVENT_TYPE.MOUSE_PRESSED) {
        const now = Date.now();
        
        // 判定是否是连击：时间间隔 < 阈值 且 按键相同
        if (now - lastClickTime < DOUBLE_CLICK_DELAY && lastButton === e.button) {
            clickCount++;
        } else {
            clickCount = 1;
        }
        
        lastClickTime = now;
        lastButton = e.button;

        // 发送给 Slave，带上计算好的 clickCount
        socket.write(pack({ t: "c", b: e.button, d: true, cl: clickCount }));
    } 
    else if (e.type === EVENT_TYPE.MOUSE_RELEASED) {
        // 松开时，clickCount 保持按下的状态
        socket.write(pack({ t: "c", b: e.button, d: false, cl: clickCount }));
    }

    // 2. 滚轮
    else if (e.type === EVENT_TYPE.MOUSE_WHEEL) {
      let delta = e.rotation;
      if (e.amount && e.amount > 0) delta *= e.amount;
      delta = delta * -1; 
      if (e.direction === 3) socket.write(pack({ t: "s", dy: delta, dx: 0 }));
      else if (e.direction === 4) socket.write(pack({ t: "s", dy: 0, dx: delta }));
    }

    // 3. 键盘
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