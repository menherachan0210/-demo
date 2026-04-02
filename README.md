# 扫码联动 Demo

这个工作区现在包含三个部分：

- `react-native-demo/`：新的 `Expo + React Native` 手机端，负责扫码、配对、把结果推送到电脑
- `扫码demo/`：之前尝试的 `uni-app` 手机端
- `electron-demo/`：`Electron` 桌面端，负责接收手机数据并实时展示

## 推荐路线

当前推荐直接使用 `react-native-demo/`。它不需要 `uni-app UTS` 自定义基座，直接用 `Expo Go` 就可以跑前置摄像头连续扫码 demo。

## 运行 Electron

```powershell
cd electron-demo
npm install
npm start
```

启动后桌面端会显示：

- 未连接时：配对二维码
- 已连接后：设备名称和扫码记录列表

## 运行 React Native Demo

1. 进入 `react-native-demo/`
2. 执行 `npm start`
3. 用 Android 手机上的 `Expo Go` 扫码打开
4. 先扫描 Electron 窗口上的配对二维码
5. 再进入连续扫码页，默认前置摄像头

## 运行 uni-app

1. 用 HBuilderX 打开 `扫码demo/`
2. 由于手机端新增了 `Android UTS` 原生扫码组件，请先安装 HBuilderX 的 Android UTS 开发扩展，并使用自定义基座或本地原生运行环境
3. 运行到 Android 真机
4. 在首页中选择下面任一方式配对：
   - 直接扫描 Electron 窗口上的配对二维码
5. 进入连续扫码页后，默认优先使用前置摄像头
6. 点击“扫码并发送”，把业务二维码内容推送到桌面端

## 连接方式

### 无线连接

手机和 Win11 电脑连接到同一个局域网，手机端优先填写 Electron 显示的“推荐地址”。

### 有线连接

Android 可以用两种方式：

- 打开 USB 网络共享，然后使用电脑暴露出来的网络地址
- 执行 `adb reverse tcp:38888 tcp:38888`，然后把手机端地址改成 `http://127.0.0.1:38888`

如果 Electron 占用的不是 `38888`，以窗口里显示的实际端口为准。

## 常见问题

- Android 前置连续扫码依赖 `uni_modules/uts-front-qr-scanner`，标准基座通常不能直接运行新增原生依赖
- Windows 防火墙可能拦截首次访问，允许当前端口后再测试
- 电脑有多块网卡时，优先选择和手机同网段的地址
- iPhone 通过 USB 直连 Win11 做这个 demo 不如 Android 顺手，第一版建议先用 Android 验证链路
