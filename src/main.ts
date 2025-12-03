import { app, BrowserWindow } from "electron";
import { startMaster } from "./master";
import { startSlave } from "./slave";

// 加载 Native 模块
const native = require("../build/Release/bridge.node");

// 配置：雷电网桥 IP
// 建议在 Mac mini 上手动设置雷电网桥 IP 为静态 10.0.0.2
export const CONFIG = {
  SLAVE_IP: "192.168.2.1",
  PORT: 9000,
};

app.whenReady().then(() => {
  // 权限检查
  if (!native.checkAuth()) {
    console.log("Waiting for Accessibility permissions...");
  }

  const role = process.env.ROLE || "MASTER";
  console.log(`Starting as ${role}`);

  if (role === "MASTER") {
    startMaster(native);
  } else {
    startSlave(native);
  }

  // 创建一个小窗口显示状态
  const win = new BrowserWindow({ width: 300, height: 200 });
  win.loadURL(`data:text/html;charset=utf-8,<h1>Role: ${role}</h1>`);
});
