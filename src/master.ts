import { screen, globalShortcut } from "electron";
import * as net from "net";
import { pack } from "msgpackr";
import { uIOhook } from "uiohook-napi";
import { CONFIG } from "./main";

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

  // 屏幕中心点
  const { width, height } = screen.getPrimaryDisplay().size
  const centerX = Math.floor(width / 2);
  const centerY = Math.floor(height / 2);

  // 状态变量
  let lastX = centerX;
  let lastY = centerY;
  
  // 核心优化：防抖动与幽灵事件过滤
  let isResetting = false; // 是否正在等待瞬移完成
  
  // 新增：回正计时器与边界阈值
  let resetTimer: any = null;
  const RESET_DELAY = 800; // 鼠标停止移动 30ms 后执行回正
  const EDGE_MARGIN = 100; // 距离屏幕边缘小于 100px 时强制回正（防止系统光标撞墙）

  const connect = () => {
    socket = new net.Socket();
    socket.connect(CONFIG.PORT, CONFIG.SLAVE_IP, () => {
      console.log("Connected to Slave");
      socket?.setNoDelay(true); // 禁用 Nagle 算法，降低延迟
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
      // native.setCursor(false);
      // 初始归位
      native.warpMouse(centerX, centerY);
      lastX = centerX;
      lastY = centerY;
      isResetting = true; // 标记正在归位，忽略即将到来的旧位置事件
    } else {
      console.log("<<< LOCAL MODE");
      native.setCursor(true);
    }
  };

  globalShortcut.register("Option+Q", toggleRemote);
  globalShortcut.register("Ctrl+Option+Command+Esc", () => {
    isRemote = false;
    native.setCursor(true);
    process.exit(0);
  });

  // 封装回正逻辑
  const resetToCenter = () => {
    native.warpMouse(centerX, centerY);
    // 手动更新 lastX 期待值，并开启过滤模式
    lastX = centerX;
    lastY = centerY;
    isResetting = true;
  };

  uIOhook.on("input", (e: any) => {
    if (!isRemote || !socket) return;

    // 1. 鼠标移动 (核心优化逻辑)
    if (e.type === EVENT_TYPE.MOUSE_MOVED) {
      // 如果处于“重置中”状态，我们需要过滤掉那些“瞬移前”的残留事件
      if (isResetting) {
        const dist = Math.hypot(e.x - centerX, e.y - centerY);
        if (dist < 50) {
          // 捕捉到了瞬移后的新位置，解除锁定
          isResetting = false;
          lastX = e.x;
          lastY = e.y;
        }
        // 否则，丢弃该事件（这是瞬移前的“幽灵”事件）
        return;
      }

      const dx = e.x - lastX;
      const dy = e.y - lastY;

      lastX = e.x;
      lastY = e.y;

      if (dx !== 0 || dy !== 0) {
        socket.write(pack({ t: "m", x: dx, y: dy }));
      }

      // --- 新逻辑：防抖回正 ---
      
      // 清除之前的定时器
      if (resetTimer) clearTimeout(resetTimer);

      // 边界保护：如果快撞墙了，立即回正，防止 dx 变为 0
      if (e.x < EDGE_MARGIN || e.x > width - EDGE_MARGIN || 
          e.y < EDGE_MARGIN || e.y > height - EDGE_MARGIN) {
        resetToCenter();
      } else {
        // 正常情况：只有当鼠标停止动作（无滑动）超过阈值时才回正
        resetTimer = setTimeout(resetToCenter, RESET_DELAY);
      }
    }

    // 2. 鼠标点击
    else if (e.type === EVENT_TYPE.MOUSE_PRESSED) {
      socket.write(pack({ t: "c", b: e.button, d: true }));
    } else if (e.type === EVENT_TYPE.MOUSE_RELEASED) {
      socket.write(pack({ t: "c", b: e.button, d: false }));
    }

    // 3. 滚轮
    else if (e.type === EVENT_TYPE.MOUSE_WHEEL) {
      let delta = e.rotation;
      if (e.amount && e.amount > 0) delta *= e.amount;
      
      // 调整灵敏度
      delta = delta * 5;

      if (e.direction === 3) { // Vertical
        socket.write(pack({ t: "s", dy: delta, dx: 0 }));
      } else if (e.direction === 4) { // Horizontal
        socket.write(pack({ t: "s", dy: 0, dx: delta }));
      }
    }

    // 4. 键盘
    else if (e.type === EVENT_TYPE.KEY_PRESSED || e.type === EVENT_TYPE.KEY_RELEASED) {
      console.log(e)
      const isDown = e.type === EVENT_TYPE.KEY_PRESSED;
      let code = e.rawcode ?? e.keycode;
      socket.write(pack({ t: "k", k: code, d: isDown }));
    }
  });

  uIOhook.start();
}