import { screen, globalShortcut, BrowserWindow } from "electron";
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
  let overlayWin: BrowserWindow | null = null;

  // 获取 Master 屏幕尺寸
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.size;
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

  // 创建全屏透明遮罩窗口
  const createOverlay = () => {
    if (overlayWin) return;

    overlayWin = new BrowserWindow({
      x: primaryDisplay.bounds.x,
      y: primaryDisplay.bounds.y,
      width: width,
      height: height,
      frame: false, // 无边框
      transparent: true, // 透明
      alwaysOnTop: true, // 置顶
      hasShadow: false,
      enableLargerThanScreen: true,
      resizable: false,
      movable: false,
      skipTaskbar: true, // 不显示在任务栏
      type: "panel", // 提高层级
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    // 设置最高层级，覆盖 Dock 和菜单栏 (ScreenSaver 级别)
    overlayWin.setAlwaysOnTop(true, "screen-saver");
    overlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    // 加载空页面，利用 CSS 强制隐藏光标
    // 同时设置 background: transparent 确保透明
    overlayWin.loadURL(`data:text/html;charset=utf-8,
      <style>
        html, body { 
          width: 100vw; height: 100vh; 
          margin: 0; padding: 0; 
          overflow: hidden; 
          cursor: none !important; 
          background: rgba(0,0,0,.1);
          user-select: none;
        }
      </style>
      <body></body>
    `);

    // 聚焦窗口以捕获点击
    overlayWin.focus();
  };

  const destroyOverlay = () => {
    if (overlayWin) {
      if (!overlayWin.isDestroyed()) {
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

      // 1. 创建遮罩：捕获点击防止误触 + CSS 隐藏光标
      createOverlay();

      // 2. 双重保险：调用 Native API 隐藏光标
    //   native.setCursor(false);
    } else {
      console.log("<<< LOCAL MODE");

      // 1. 销毁遮罩
      destroyOverlay();

      // 2. 恢复光标
      native.setCursor(true);
    }
  };

  globalShortcut.register("Option+Q", toggleRemote);
  globalShortcut.register("Ctrl+Option+Command+Esc", () => {
    isRemote = false;
    destroyOverlay(); // 确保退出时销毁遮罩
    native.setCursor(true);
    process.exit(0);
  });

  uIOhook.on("input", (e: any) => {
    if (!isRemote || !socket) return;

    // 1. 鼠标移动 (绝对坐标映射策略)
    if (e.type === EVENT_TYPE.MOUSE_MOVED) {
      // 计算归一化坐标 (0.0 ~ 1.0)
      let normX = e.x / width;
      let normY = e.y / height;

      // 简单的边界钳制
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

    // 3. 滚轮 (Delta 策略)
    else if (e.type === EVENT_TYPE.MOUSE_WHEEL) {
      let delta = e.rotation;
      if (e.amount && e.amount > 0) delta *= e.amount;

      // 调整灵敏度，并取反方向
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
