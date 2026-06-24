const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');

let mainWindow = null;

function createWindow() {
  // Get primary display dimensions
  const primaryDisplay = screen.getPrimaryDisplay();
  const { x, y, width, height } = primaryDisplay.bounds;

  mainWindow = new BrowserWindow({
    x: x,
    y: y,
    width: width,
    height: height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    hasShadow: false,
    skipTaskbar: false,
    title: "Visual Timer Overlay",
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('index.html');

  // Set always-on-top level to 'screen-saver' so it stays above standard windows
  mainWindow.setAlwaysOnTop(true, 'screen-saver');

  // Handle IPC message for toggling mouse events ignore state.
  // When ignore is true, clicks will pass through the transparent parts.
  // When ignore is false, clicks are captured by the window.
  ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      win.setIgnoreMouseEvents(ignore, options || { forward: true });
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Disable hardware acceleration issues with transparency on some systems if necessary
// app.disableHardwareAcceleration();

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
