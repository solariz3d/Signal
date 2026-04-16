const { app, BrowserWindow, screen, session, desktopCapturer } = require('electron');
const path = require('path');

let mainWindow = null;
let splashWindow = null;

const SPLASH_DURATION_MS = 5500;  // 5s animation + 500ms fade-out tail

function createSplash() {
  const primary = screen.getPrimaryDisplay();
  const { width, height } = primary.bounds;

  splashWindow = new BrowserWindow({
    width,
    height,
    x: primary.bounds.x,
    y: primary.bounds.y,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  splashWindow.loadFile(path.join(__dirname, 'src', 'splash.html'));
  splashWindow.setMenu(null);
  splashWindow.on('closed', () => { splashWindow = null; });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 2560,
    height: 1440,
    minWidth: 500,
    minHeight: 400,
    title: 'Signal Audio',
    frame: false,
    fullscreen: true,
    backgroundColor: '#000000',
    resizable: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWindow.setMenu(null);

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.key === 'Escape') {
      if (mainWindow.isFullScreen()) mainWindow.setFullScreen(false);
      else app.quit();
    }
    if (input.key === 'F11' && input.type === 'keyDown') {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  // CRITICAL: Desktop audio loopback handler
  // Must pass audio: 'loopback' to get system audio on Windows
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
      if (sources.length > 0) {
        callback({ video: sources[0], audio: 'loopback' });
      } else {
        callback({});
      }
    }).catch(err => {
      console.error('[main] desktopCapturer error:', err);
      callback({});
    });
  });

  // Splash first — ceremonial opener
  createSplash();
  // Main window created hidden in parallel so it's ready when splash ends
  createWindow();

  // Cross-fade handoff: main reveals underneath 800ms before splash closes
  setTimeout(() => {
    if (mainWindow) mainWindow.show();
  }, SPLASH_DURATION_MS - 800);

  // Close splash after full duration (fade-out completes inside)
  setTimeout(() => {
    if (splashWindow) splashWindow.close();
  }, SPLASH_DURATION_MS);
});

app.on('window-all-closed', () => {
  app.quit();
});
