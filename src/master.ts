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
  
  // 虚拟光标坐标 (初始化为中心)
  let vX = width / 2;
  let vY = height / 2;

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
      
      // 1. 初始化虚拟光标位置到当前鼠标位置，防止跳变
      const point = screen.getCursorScreenPoint();
      vX = point.x;
      vY = point.y;

      // 2. 隐藏光标
      native.setCursor(false);

      // 3. 锁定系统光标 (解决 Dock 栏误触问题)
      // 系统光标将不再移动，也不会触发边缘手势
      native.setMouseLock(true);

      // 4. 开启点击拦截 (解决点击误触本地窗口问题)
      native.setClickTrap(true);

      // 5. 开启高频轮询获取 Delta 移动量 (比 uIOhook 事件更丝滑，且不依赖光标移动)
      if (deltaTimer) clearInterval(deltaTimer);
      deltaTimer = setInterval(() => {
        const delta = native.getMouseDelta();
        if (delta.x !== 0 || delta.y !== 0) {
          // 更新虚拟坐标
          vX += delta.x;
          vY += delta.y;

          // 钳制范围
          vX = Math.max(0, Math.min(width, vX));
          vY = Math.max(0, Math.min(height, vY));

          // 发送归一化坐标
          socket?.write(pack({ t: "m", x: vX / width, y: vY / height }));
        }
      }, 16); // ~60fps

    } else {
      console.log("<<< LOCAL MODE");
      
      // 1. 停止轮询
      if (deltaTimer) clearInterval(deltaTimer);
      deltaTimer = null;

      // 2. 关闭拦截
      native.setClickTrap(false);
      native.setMouseLock(false);
      native.setCursor(true);
      
      // 3. 可选：将系统光标 Warp 到虚拟光标结束的位置，保持连贯性
      // native.warpMouse(vX, vY);
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

    // 注意：MOUSE_MOVED 我们改用 Polling 处理了，这里忽略 uIOhook 的移动事件
    // 因为锁定了光标，uIOhook 可能会报告光标静止，或者报告的 delta 不够平滑

    // 1. 点击事件
    if (e.type === EVENT_TYPE.MOUSE_PRESSED) {
      socket.write(pack({ t: "c", b: e.button, d: true, cl: e.clicks }));
    } 
    else if (e.type === EVENT_TYPE.MOUSE_RELEASED) {
      socket.write(pack({ t: "c", b: e.button, d: false, cl: e.clicks }));
    }

    // 2. 滚轮 (保持 uIOhook 处理)
    else if (e.type === EVENT_TYPE.MOUSE_WHEEL) {
      let delta = e.rotation;
      if (e.amount && e.amount > 0) delta *= e.amount;
      delta = delta * -10; // 倍率 -10
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