const { app, BrowserWindow, Tray, Menu, nativeImage, shell, ipcMain, session, safeStorage } = require('electron');
const path = require('path');
const Store = require('electron-store');

const store = new Store();
const ICLOUD_NOTES_URL = 'https://www.icloud.com/notes';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

let mainWindow = null;
let splashWindow = null;
let settingsWindow = null;
let tray = null;
let isQuitting = false;

// ── Credential storage (OS-level encryption via safeStorage) ──────────────────

function saveCredentials(email, password) {
  if (safeStorage.isEncryptionAvailable()) {
    store.set('creds.email', safeStorage.encryptString(email).toString('base64'));
    store.set('creds.password', safeStorage.encryptString(password).toString('base64'));
  } else {
    store.set('creds.email', Buffer.from(email).toString('base64'));
    store.set('creds.password', Buffer.from(password).toString('base64'));
  }
}

function loadCredentials() {
  try {
    const e = store.get('creds.email');
    const p = store.get('creds.password');
    if (!e || !p) return null;
    if (safeStorage.isEncryptionAvailable()) {
      return {
        email: safeStorage.decryptString(Buffer.from(e, 'base64')),
        password: safeStorage.decryptString(Buffer.from(p, 'base64'))
      };
    }
    return {
      email: Buffer.from(e, 'base64').toString(),
      password: Buffer.from(p, 'base64').toString()
    };
  } catch {
    return null;
  }
}

ipcMain.handle('save-credentials', (_, { email, password }) => {
  saveCredentials(email, password);
  return { ok: true };
});

ipcMain.handle('load-credentials', () => loadCredentials());

ipcMain.handle('clear-credentials', () => {
  store.delete('creds.email');
  store.delete('creds.password');
  return { ok: true };
});

// ── Settings window ───────────────────────────────────────────────────────────

function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 420,
    height: 300,
    resizable: false,
    minimizable: false,
    maximizable: false,
    parent: mainWindow,
    title: 'Auto-Login Settings',
    icon: getIconPath(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  settingsWindow.loadFile('settings.html');
  settingsWindow.on('closed', () => { settingsWindow = null; });
}

// Prevent multiple instances
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

function getIconPath() {
  const ico = path.join(__dirname, 'icon.ico');
  const png = path.join(__dirname, 'icon.png');
  try {
    const fs = require('fs');
    if (fs.existsSync(ico)) return ico;
    if (fs.existsSync(png)) return png;
  } catch (_) {}
  return null;
}

function createSplash() {
  splashWindow = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });
  splashWindow.loadFile('splash.html');
  splashWindow.center();
}

function createMainWindow() {
  const bounds = store.get('windowBounds', { width: 1100, height: 800, x: undefined, y: undefined });

  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 600,
    minHeight: 500,
    show: false,
    title: 'iCloud Notes',
    icon: getIconPath(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      // Use a persistent partition so cookies/session survive restarts
      partition: 'persist:icloud-notes',
      spellcheck: true
    }
  });

  // Set a realistic browser user agent to avoid Apple's "unsupported browser" page
  mainWindow.webContents.setUserAgent(USER_AGENT);

  mainWindow.loadURL(ICLOUD_NOTES_URL);

  // Show main window and close splash once the page finishes loading
  mainWindow.webContents.once('did-finish-load', () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
    mainWindow.show();
    mainWindow.focus();
  });

  // Fallback: close splash after 8 seconds regardless
  setTimeout(() => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show();
    }
  }, 8000);

  // Save window bounds on resize/move
  const saveBounds = () => {
    if (mainWindow && !mainWindow.isMaximized() && !mainWindow.isMinimized()) {
      store.set('windowBounds', mainWindow.getBounds());
    }
  };
  mainWindow.on('resize', saveBounds);
  mainWindow.on('move', saveBounds);

  // Minimize to tray instead of closing
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
      if (tray) {
        tray.displayBalloon({
          title: 'iCloud Notes',
          content: 'Running in the background. Click the tray icon to open.',
          iconType: 'info'
        });
      }
    }
  });

  // Auto-fill Apple ID login when credentials are saved
  mainWindow.webContents.on('did-finish-load', () => {
    const url = mainWindow.webContents.getURL();
    const isAppleAuth = url.includes('apple.com') &&
      (url.includes('auth') || url.includes('login') || url.includes('account') || url.includes('signin'));
    if (!isAppleAuth) return;
    const creds = loadCredentials();
    if (!creds) return;
    mainWindow.webContents.executeJavaScript(`
      (function(email, password) {
        function fill(el, val) {
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          setter.call(el, val);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
        const emailEl =
          document.querySelector('#account_name_text_field') ||
          document.querySelector('input[name="accountName"]') ||
          document.querySelector('input[type="email"]');
        if (emailEl && !emailEl.value) { fill(emailEl, email); return; }
        const passEl =
          document.querySelector('#password_text_field') ||
          document.querySelector('input[name="password"]') ||
          document.querySelector('input[type="password"]');
        if (passEl && !passEl.value) fill(passEl, password);
      })(${JSON.stringify(creds.email)}, ${JSON.stringify(creds.password)});
    `).catch(() => {});
  });

  // Open external links in the default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith('https://www.icloud.com')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });
}

function createTray() {
  const iconPath = getIconPath();
  let icon;
  if (iconPath) {
    icon = nativeImage.createFromPath(iconPath);
  } else {
    // Create a minimal 16x16 blue icon as fallback
    icon = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABmJLR0QA/wD/AP+gvaeTAAAA' +
      'HklEQVQ4jWNgYGD4z8BQDwAAAP//AwBY3wGVAAAAAElFTkSuQmCC'
    );
  }

  tray = new Tray(icon);
  tray.setToolTip('iCloud Notes');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open iCloud Notes',
      click: () => {
        mainWindow.show();
        mainWindow.focus();
      }
    },
    { type: 'separator' },
    {
      label: 'Auto-Login Settings',
      click: () => createSettingsWindow()
    },
    { type: 'separator' },
    {
      label: 'Reload',
      click: () => {
        mainWindow.webContents.reload();
        mainWindow.show();
        mainWindow.focus();
      }
    },
    {
      label: 'Clear Session & Re-login',
      click: async () => {
        const { dialog } = require('electron');
        const result = await dialog.showMessageBox(mainWindow, {
          type: 'question',
          buttons: ['Clear & Re-login', 'Cancel'],
          defaultId: 0,
          title: 'Clear Session',
          message: 'This will sign you out and clear saved login data. Continue?'
        });
        if (result.response === 0) {
          const ses = session.fromPartition('persist:icloud-notes');
          await ses.clearStorageData();
          mainWindow.loadURL(ICLOUD_NOTES_URL);
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.focus();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(() => {
  // Set app user model id for Windows notifications
  app.setAppUserModelId('iCloud Notes');

  createSplash();
  createMainWindow();
  createTray();
});

app.on('window-all-closed', (e) => {
  // Keep the app alive in the tray; only quit via menu
  e.preventDefault();
});

app.on('before-quit', () => {
  isQuitting = true;
});
