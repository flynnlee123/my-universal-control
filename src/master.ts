import { screen, globalShortcut } from "electron";
import * as net from "net";
import { pack } from "msgpackr";
import { uIOhook, UiohookKey } from "uiohook-napi";
import { CONFIG } from "./main";

// UioHook Event Constants (参考你提供的 header)
const EVENT_TYPE = {
  KEY_PRESSED: 4,
  KEY_RELEASED: 5,
  MOUSE_CLICKED: 6, // 注意：不同版本uiohook定义可能不同，通常我们用 MousePressed/Released
  MOUSE_PRESSED: 7,
  MOUSE_RELEASED: 8,
  MOUSE_MOVED: 9,
  MOUSE_WHEEL: 11,
};

export function startMaster(native: any) {
  let socket: net.Socket | null = null;
  let isRemote = false;

  // 屏幕中心点 (用于无限鼠标模式)
  const { width, height } = screen.getPrimaryDisplay().size;
  const centerX = Math.floor(width / 2);
  const centerY = Math.floor(height / 2);

  // 记录上一帧鼠标位置，用于计算 Delta
  // 初始化为 -1 代表未知
  let lastX = -1;
  let lastY = -1;

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

  // 切换控制模式
  const toggleRemote = () => {
    if (!socket) return;
    isRemote = !isRemote;

    if (isRemote) {
      console.log(">>> REMOTE MODE");
      native.setCursor(false);
      // 记录当前位置作为起点
      const point = screen.getCursorScreenPoint();
      lastX = point.x;
      lastY = point.y;
      // 瞬移到中心，开始 Delta 计算
      native.warpMouse(centerX, centerY);
      lastX = centerX;
      lastY = centerY;
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

  uIOhook.on("input", (e: any) => {
    // 如果是按键 Option+Q，不要处理，交给 globalShortcut
    // 但 uiohook 是系统级的，可能会先于 Electron 捕获
    if (!isRemote || !socket) return;

    // 调试：打印事件结构，帮助你确认 rawcode 字段名
    // console.log(e);

    const packet: any = {};

    // 1. 鼠标移动 (Delta 计算)
    if (e.type === EVENT_TYPE.MOUSE_MOVED) {
      // 如果是第一次进入，先对齐
      if (lastX === -1) {
        lastX = e.x;
        lastY = e.y;
        return;
      }

      const dx = e.x - lastX;
      const dy = e.y - lastY;

      lastX = e.x;
      lastY = e.y;

      if (dx !== 0 || dy !== 0) {
        // 发送 Delta
        socket.write(pack({ t: "m", x: dx, y: dy }));

        // 核心逻辑：防止鼠标撞墙
        // 每次移动后，将鼠标强行拉回中心
        // 这样你可以拥有无限的触控板操作空间
        // 注意：Warp 会触发一个新的 Event，需要过滤掉吗？
        // uiohook 通常会捕获 warp 产生的事件。
        // 简单的防抖策略：Warp 后下一次事件忽略，或者 accept 它是 0 移动
        native.warpMouse(centerX, centerY);
        lastX = centerX;
        lastY = centerY;
      }
    }

    // 2. 鼠标点击
    else if (e.type === EVENT_TYPE.MOUSE_PRESSED) {
      socket.write(pack({ t: "c", b: e.button, d: true }));
    } else if (e.type === EVENT_TYPE.MOUSE_RELEASED) {
      socket.write(pack({ t: "c", b: e.button, d: false }));
    }

    // 3. 滚轮 / 触控板 (修复 NaN 问题)
    else if (e.type === EVENT_TYPE.MOUSE_WHEEL) {
      // uiohook 定义:
      // direction: 3 = Vertical, 4 = Horizontal
      // rotation: usually -1 or 1 (direction sign)
      // amount: magnitude (not always available on mac trackpad via uiohook)

      // 观测你的截图，似乎 e 对象里有 rotation。
      // 触控板通常产生大量的 rotation: 0, amount: ? 的事件，或者 rotation 就是 delta
      // 这里我们需要一种 heuristic

      let delta = e.rotation;
      if (e.amount && e.amount > 0) delta *= e.amount; // 如果有 amount 乘上去

      // 增加灵敏度系数 (Mac触控板数值很小)
      delta = delta * 5;

      if (e.direction === 3) {
        // Vertical
        socket.write(pack({ t: "s", dy: delta, dx: 0 }));
      } else if (e.direction === 4) {
        // Horizontal
        socket.write(pack({ t: "s", dy: 0, dx: delta }));
      }
    }

    // 4. 键盘 (硬件码 Rawcode)
    else if (
      e.type === EVENT_TYPE.KEY_PRESSED ||
      e.type === EVENT_TYPE.KEY_RELEASED
    ) {
      const isDown = e.type === EVENT_TYPE.KEY_PRESSED;

      // 优先使用 rawcode (硬件码)
      // 如果 e.rawcode 存在，它就是 macOS CGKeyCode
      // 如果不存在，e.keycode 是 uiohook 的 Virtual Code，需要转换
      let code = e.rawcode;

      if (code === undefined) {
        // 你的截图里只有 keycode，说明 uiohook-napi 可能没透传 rawcode
        // 这是一个严重问题。uiohook 的 keycode 56 (Alt) != Mac Keycode 56 (Shift)
        // 临时方案：如果拿不到 rawcode，直接发 keycode 可能会错乱
        // 建议检查 uiohook-napi 版本或打印 e 对象的所有 keys
        code = e.keycode;
      }

      // 过滤掉切换键 Option+Q 避免死循环 (keycode 56 is Alt/Option in uiohook VC)
      // 但因为我们在 Native 也是模拟，所以其实 Slave 那边按 Option 没关系

      socket.write(pack({ t: "k", k: code, d: isDown }));
    }
  });

  uIOhook.start();
}
