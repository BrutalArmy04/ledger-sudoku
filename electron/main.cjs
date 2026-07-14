const { app, BrowserWindow, Menu } = require('electron');
const path = require('node:path');

const isDev = !app.isPackaged;

function createWindow() {
  const win = new BrowserWindow({
    width: 720,
    height: 920,
    minWidth: 420,
    minHeight: 640,
    backgroundColor: '#F7F6F3',
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', isDev ? 'public' : 'dist', 'logo.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.platform === 'darwin') {
    // Unlike Windows/Linux, macOS relies on the app menu for Cmd+Q/Cmd+W and
    // the edit menu for Cmd+C/V/X/A. Passing null here (as we do elsewhere)
    // removes those roles entirely rather than just hiding a menu bar - the
    // app still runs, but looks frozen to anyone who doesn't know to
    // right-click the dock icon to quit.
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        { role: 'appMenu' },
        { role: 'editMenu' },
        { role: 'windowMenu' },
      ])
    );
  } else {
    Menu.setApplicationMenu(null);
  }

  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
