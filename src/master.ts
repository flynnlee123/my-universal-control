import { screen, globalShortcut, BrowserWindow } from "electron";
import * as net from "net";
import { pack } from "msgpackr";
import { uIOhook } from "uiohook-napi";
import { CONFIG } from "./main";
import { UIOHOOK_TO_MAC_MAP } from "./keymap";

const EVENT_TYPE = {
  KEY_PRESSED: 4,
  KEY_RELEASED: 5,
  MOUSE_CLICKED: 6, // 注意：uiohook 只有在 CLICKED 事件里 clicks 字段才最准，但 PRESSED 也可以尝试获取
  MOUSE_PRESSED: 7,
  MOUSE_RELEASED: 8,
  MOUSE_MOVED: 9,
  MOUSE_WHEEL: 11,
};

export function startMaster(native: any) {
  let socket: net.Socket | null = null;
  let isRemote = false;
  let overlayWin: BrowserWindow | null = null;

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.size;
  console.log(`Master Screen Size: ${width}x${height}`);

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

  const createOverlay = () => {
    if (overlayWin) return;
    
    overlayWin = new BrowserWindow({
      x: primaryDisplay.bounds.x,
      y: primaryDisplay.bounds.y,
      width: width,
      height: height,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      hasShadow: false,
      enableLargerThanScreen: true,
      resizable: false,
      movable: false,
      skipTaskbar: true,
      
      // === 核心修复 1: Dock 栏屏蔽 ===
      // kiosk: true 模式下，macOS 会强制隐藏 Dock 和菜单栏，
      // 并阻止鼠标撞击边缘唤出 Dock。
      kiosk: true, 
      // simpleFullscreen 有时比 kiosk 更温和，但在屏蔽 Dock 方面 kiosk 更强力
      // 我们可以组合使用，或者只用 kiosk
      
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      }
    });

    overlayWin.setAlwaysOnTop(true, "screen-saver");
    // 确保占据所有工作区
    overlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    overlayWin.loadURL(`data:text/html;charset=utf-8,
      <style>
        html, body { 
          width: 100vw; height: 100vh; 
          margin: 0; padding: 0; 
          overflow: hidden; 
          cursor: none !important; 
          background: transparent; 
          user-select: none;
        }
      </style>
      <body></body>
    `);
    
    overlayWin.focus();
  };

  const destroyOverlay = () => {
    if (overlayWin) {
      if (!overlayWin.isDestroyed()) {
        overlayWin.setKiosk(false); // 退出前关闭 Kiosk
        overlayWin.close();
      }
      overlayWin = null;
    }
  };

  const toggleRemote = () => {
    if (!socket) return;
    isRemote = !isRemote;

    if (isRemote) {
      console.log(">>> REMOTE MODE");
      createOverlay();
      native.setCursor(false);
    } else {
      console.log("<<< LOCAL MODE");
      destroyOverlay();
      native.setCursor(true);
    }
  };

  globalShortcut.register("Option+Q", toggleRemote);
  globalShortcut.register("Ctrl+Option+Command+Esc", () => {
    isRemote = false;
    destroyOverlay();
    native.setCursor(true);
    process.exit(0);
  });

  uIOhook.on("input", (e: any) => {
    if (!isRemote || !socket) return;

    if (e.type === EVENT_TYPE.MOUSE_MOVED) {
        let normX = e.x / width;
        let normY = e.y / height;
        normX = Math.max(0, Math.min(1, normX));
        normY = Math.max(0, Math.min(1, normY));
        socket.write(pack({ t: "m", x: normX, y: normY }));
    }

    else if (e.type === EVENT_TYPE.MOUSE_PRESSED) {
      // === 核心修复 3: 双击支持 ===
      // uIOhook 会在 event 对象中提供 clicks 计数 (1, 2, 3)
      // 我们将其透传给 Slave
      socket.write(pack({ t: "c", b: e.button, d: true, cl: e.clicks }));
    } 
    else if (e.type === EVENT_TYPE.MOUSE_RELEASED) {
      socket.write(pack({ t: "c", b: e.button, d: false, cl: e.clicks }));
    }

    else if (e.type === EVENT_TYPE.MOUSE_WHEEL) {
      let delta = e.rotation;
      if (e.amount && e.amount > 0) delta *= e.amount;

      // === 核心修复 2: Scroll 丝滑度 ===
      // 调整倍率：增大倍率以减少“步进感”，
      // Native 端已设置为 kCGScrollEventUnitPixel + Continuous
      // Apple Trackpad 通常发送很多小的 delta，普通滚轮发送大的 delta
      // -10 左右的倍率在 Pixel 模式下通常比较自然
      delta = delta * -10; 

      if (e.direction === 3) {
        socket.write(pack({ t: "s", dy: delta, dx: 0 }));
      } else if (e.direction === 4) {
        socket.write(pack({ t: "s", dy: 0, dx: delta }));
      }
    }

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