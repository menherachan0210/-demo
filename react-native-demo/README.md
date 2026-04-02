# React Native 扫码 Demo

这个目录是新的手机端实现，基于 `Expo + React Native`，直接复用上层目录里的 `electron-demo/` 电脑接收端。

## 功能

- 扫描电脑端配对二维码
- 配对扫码默认后置摄像头
- 菲票连续扫码默认前置摄像头
- 支持前后摄切换
- 支持补光开关
- 扫到业务二维码后立即发送到 Electron
- 电脑端按二维码内容去重，重复的菲票编号不会再次入库

## 运行

先启动电脑端：

```powershell
cd ..\electron-demo
npm start
```

再启动手机端：

```powershell
cd react-native-demo
npm start
```

然后：

1. 用 `Expo Go` 打开项目
2. 先点“扫描配对码”
3. 对准电脑窗口里的配对二维码
4. 配对成功后，点“连续扫码发送”
5. 把业务二维码拿到手机前置镜头前连续识别

## 说明

- 电脑端接口沿用 `electron-demo/server.js`
- 当前配对信息只保存在内存里，重启 App 后需要重新配对一次
- 这个 demo 走的是局域网 HTTP，请确保手机和电脑在同一个网络
