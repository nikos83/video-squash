const { app, BrowserWindow, ipcMain, shell, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const compressor = require('./lib/compressor');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 640,
    minWidth: 800,
    minHeight: 560,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1a1a1a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    console.error('Renderer gone:', details);
  });
}

app.whenReady().then(() => {
  createWindow();
  buildMenu();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

function buildMenu() {
  const isDev = !app.isPackaged;
  const template = [
    {
      label: app.name,
      submenu: [
        { label: `O aplikacji VideoSquash`, role: 'about' },
        { type: 'separator' },
        { label: 'Ukryj VideoSquash', role: 'hide' },
        { label: 'Ukryj inne', role: 'hideOthers' },
        { label: 'Pokaż wszystkie', role: 'unhide' },
        { type: 'separator' },
        { label: 'Zakończ VideoSquash', role: 'quit' },
      ],
    },
    {
      label: 'Edycja',
      submenu: [
        { label: 'Cofnij', role: 'undo' },
        { label: 'Ponów', role: 'redo' },
        { type: 'separator' },
        { label: 'Wytnij', role: 'cut' },
        { label: 'Kopiuj', role: 'copy' },
        { label: 'Wklej', role: 'paste' },
        { label: 'Zaznacz wszystko', role: 'selectAll' },
      ],
    },
    {
      label: 'Okno',
      submenu: [
        { label: 'Minimalizuj', role: 'minimize' },
        { label: 'Pełny ekran', role: 'togglefullscreen' },
        ...(isDev ? [
          { type: 'separator' },
          { label: 'Narzędzia deweloperskie', role: 'toggleDevTools' },
          { label: 'Odśwież', role: 'reload' },
        ] : []),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// --- IPC Handlers ---

ipcMain.handle('file:info', async (event, filePath) => {
  return compressor.getFileInfo(filePath);
});

ipcMain.handle('file:open-folder', async (event, filePath) => {
  shell.showItemInFolder(filePath);
});

ipcMain.handle('dialog:select-output-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

ipcMain.handle('dialog:open-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Wideo', extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v', '3gp'] },
    ],
  });
  if (result.canceled) return [];
  return result.filePaths;
});

// Compression: uses event.sender to stream progress back
ipcMain.on('compress:start', (event, { files, options }) => {
  processQueue(event.sender, files, options);
});

ipcMain.on('compress:cancel', () => {
  compressor.cancel();
});

function uniquePath(dir, stem, ext) {
  let candidate = path.join(dir, `${stem}${ext}`);
  let n = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${stem}_${n}${ext}`);
    n++;
  }
  return candidate;
}

function buildOutputTag(options) {
  const codec = options.codec || 'h264';
  const crf   = `crf${options.crf ?? 23}`;
  const res   = (options.resolution && options.resolution !== 'original') ? `_${options.resolution}p` : '';
  const preset = options.preset || 'medium';
  const profileSlug = options.profileName
    ? `_${options.profileName.replace(/[^a-z0-9]/gi, '-').toLowerCase()}`
    : '';
  return `${codec}_${crf}${res}_${preset}${profileSlug}`;
}

async function processQueue(sender, files, options) {
  // Window closed or renderer crashed mid-queue: stop ffmpeg instead of sending into a dead webContents
  const send = (channel, payload) => { if (!sender.isDestroyed()) sender.send(channel, payload); };
  sender.once('destroyed', () => compressor.cancel());

  for (const file of files) {
    if (compressor.isCancelled()) break;

    const ext = path.extname(file.path);
    const base = path.basename(file.path, ext);
    const dir = options.outputFolder || path.dirname(file.path);
    const tag = buildOutputTag(options);
    const outputPath = uniquePath(dir, `${base}_${tag}`, '.mp4');

    send('compress:progress', { id: file.id, percent: 0, status: 'compressing' });

    try {
      const result = await compressor.compress({
        input: file.path,
        output: outputPath,
        ...options,
        onProgress: (percent) => {
          send('compress:progress', { id: file.id, percent, status: 'compressing' });
        },
      });

      const originalSize = fs.statSync(file.path).size;
      const compressedSize = fs.statSync(outputPath).size;

      send('compress:done', {
        id: file.id,
        outputPath,
        originalSize,
        compressedSize,
      });
    } catch (err) {
      send('compress:error', { id: file.id, error: err.message });
    }
  }
}
