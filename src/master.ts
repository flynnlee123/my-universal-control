import { screen, globalShortcut, clipboard } from "electron";
import * as net from "net";
import { pack } from "msgpackr";
import { uIOhook, UiohookKey } from "uiohook-napi";
import { CONFIG } from "./main";

export function startMaster(native: any) {
  let socket: net.Socket | null = null;
  let isRemote = false;

  // 获取屏幕中心点
  const { width, height } = screen.getPrimaryDisplay().size;
  const centerX = width / 2;
  const centerY = height / 2;

  // 连接 Slave
  const connect = () => {
    socket = new net.Socket();
    socket.connect(CONFIG.PORT, CONFIG.SLAVE_IP, () => {
      console.log("Connected to Mac Mini via Thunderbolt");
      socket?.setNoDelay(true); // 禁用 Nagle 算法，降低延迟
    });
    socket.on("close", () => setTimeout(connect, 1000));
    socket.on("error", (err) =>
      console.log("Waiting for connection...", err.message)
    );
  };
  connect();

  // 切换控制模式
  const toggleRemote = () => {
    if (!socket || socket.destroyed) return;
    isRemote = !isRemote;

    if (isRemote) {
      console.log(">>> Switch to REMOTE Control");
      native.setCursor(false); // 隐藏本地光标
      native.warpMouse(centerX, centerY); // 初始归位
    } else {
      console.log("<<< Switch to LOCAL Control");
      native.setCursor(true); // 显示本地光标
    }
  };

  // 注册快捷键: Option + Q 切换控制权
  globalShortcut.register("Option+Q", toggleRemote);
  // 紧急逃生键: Command + Option + Esc
  globalShortcut.register("Command+Option+Esc", () => {
    isRemote = false;
    native.setCursor(true);
    console.log("Emergency Escape!");
  });

  // 监听输入
  uIOhook.on("input", (e: any) => {
    if (!isRemote || !socket) return;

    const packet: any = {};

    // 1. 鼠标移动处理 (核心：Delta + Warp)
    if (e.type === 6) {
      // Mouse Move
      // 计算相对于中心点的偏移量
      const dx = e.x - centerX;
      const dy = e.y - centerY;

      if (dx !== 0 || dy !== 0) {
        // 发送偏移量
        socket.write(pack({ t: "m", x: dx, y: dy }));
        // 立即把鼠标拉回中心，产生"无限触摸板"效果
        native.warpMouse(centerX, centerY);
      }
    }

    // 2. 鼠标点击
    else if (e.type === 7) {
      // Mouse Down
      socket.write(pack({ t: "c", b: e.button, d: true }));
    } else if (e.type === 8) {
      // Mouse Up
      socket.write(pack({ t: "c", b: e.button, d: false }));
    }

    // 3. 滚轮/触控板滚动
    else if (e.type === 9) {
      // Wheel
      // uiohook 的 rotation 通常对应垂直，direction 对应水平(较少见，视驱动而定)
      // 这里根据实际手感可能需要调整系数
      socket.write(pack({ t: "s", dy: e.rotation * 10, dx: 0 }));
    }

    // 4. 键盘 (透传 KeyCode)
    else if (e.type === 4) {
      // Key Down
      // 屏蔽 Command+Tab 等系统级快捷键在本地触发(这很难完全屏蔽，建议Master不作为主力机操作时使用)
      socket.write(pack({ t: "k", k: e.keycode, d: true }));
    } else if (e.type === 5) {
      // Key Up
      socket.write(pack({ t: "k", k: e.keycode, d: false }));
    }
  });

  uIOhook.start();
}
