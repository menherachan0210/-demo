const path = require('path');
const { app, BrowserWindow, clipboard, ipcMain } = require('electron');
const QRCode = require('qrcode');
const { createDemoServer } = require('./server');

let mainWindow = null;
let demoServer = null;

async function renderQrCode(text) {
  if (!text) {
    return null;
  }

  try {
    return await QRCode.toDataURL(text, {
      errorCorrectionLevel: 'M',
      margin: 1,
      scale: 8,
      color: {
        dark: '#12314d',
        light: '#0000'
      }
    });
  } catch (error) {
    console.error('Failed to render pairing QR in main process:', error);
    return null;
  }
}

async function buildViewState(state) {
  return {
    ...state,
    pairQrDataUrl: await renderQrCode(state?.pairText || '')
  };
}

async function broadcastState(state) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send('demo:state', await buildViewState(state));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1180,
    minHeight: 760,
    title: '扫码联动桌面端 Demo',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.webContents.on('did-finish-load', async () => {
    if (demoServer) {
      await broadcastState(demoServer.getState());
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function bootstrap() {
  demoServer = createDemoServer({
    onStateChange: broadcastState
  });

  await demoServer.start();

  ipcMain.handle('demo:get-state', async () => buildViewState(demoServer.getState()));
  ipcMain.handle('demo:refresh-state', async () => buildViewState(demoServer.refresh()));
  ipcMain.handle('demo:clear-scans', async () => buildViewState(demoServer.clearScans()));
  ipcMain.handle('demo:copy-text', (_event, text) => {
    clipboard.writeText(String(text || ''));
    return true;
  });

  createWindow();
}

app.whenReady().then(bootstrap).catch((error) => {
  console.error('Electron demo failed to start:', error);
  app.exit(1);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  if (demoServer) {
    demoServer.close();
  }
});
