const { app, BrowserWindow, dialog, ipcMain, protocol, screen, shell } = require("electron");
const { randomUUID } = require("node:crypto");
const { createReadStream, existsSync, promises: fs } = require("node:fs");
const path = require("node:path");
const { Readable } = require("node:stream");
const { pathToFileURL } = require("node:url");

const developmentServerUrl = process.env.VITE_DEV_SERVER_URL;
const settingsPath = () => path.join(app.getPath("userData"), "settings.json");
const upstreamRepositoryUrl = "https://github.com/captbaritone/webamp";
const projectRepositoryUrl = "https://github.com/appatalks/wisp-ampdeck";
const supportedAudioExtensions = new Set([".aac", ".aiff", ".flac", ".m4a", ".mp3", ".ogg", ".opus", ".wav", ".webm"]);
const audioMimeTypes = new Map([
  [".aac", "audio/aac"],
  [".aiff", "audio/aiff"],
  [".flac", "audio/flac"],
  [".m4a", "audio/mp4"],
  [".mp3", "audio/mpeg"],
  [".ogg", "audio/ogg"],
  [".opus", "audio/ogg"],
  [".wav", "audio/wav"],
  [".webm", "audio/webm"]
]);
const minimumZoomFactor = 0.75;
const maximumZoomFactor = 2.5;
const supportsWindowShape = process.platform === "win32";
const localAudioFiles = new Map();
const linuxWindowDrags = new Set();
let musicMetadataModule;

protocol.registerSchemesAsPrivileged([{
  scheme: "ampdeck-audio",
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: true
  }
}]);

function toTrack(filePath) {
  const id = randomUUID();
  localAudioFiles.set(id, filePath);

  return {
    url: `ampdeck-audio://track/${id}/${encodeURIComponent(path.basename(filePath))}`,
    defaultName: path.basename(filePath)
  };
}

async function registerAudioTracks(filePaths) {
  localAudioFiles.clear();
  const tracks = filePaths.map(toTrack);
  await updateSettings({ audioFiles: Object.fromEntries(localAudioFiles) });
  return tracks;
}

function formatPosition(position) {
  if (!position?.no) {
    return null;
  }

  return position.of ? `${position.no} of ${position.of}` : String(position.no);
}

async function getTrackDetails(trackUrl) {
  let parsedUrl;

  try {
    parsedUrl = new URL(trackUrl);
  } catch {
    throw new Error("This track does not have a readable local file.");
  }

  const id = parsedUrl.protocol === "ampdeck-audio:" && parsedUrl.hostname === "track"
    ? parsedUrl.pathname.split("/")[1]
    : null;
  const filePath = id ? localAudioFiles.get(id) : null;

  if (!filePath || !existsSync(filePath)) {
    throw new Error("This track does not have a readable local file.");
  }

  musicMetadataModule ??= import("music-metadata");
  const { parseFile } = await musicMetadataModule;
  const [metadata, stats] = await Promise.all([
    parseFile(filePath, { skipCovers: true, duration: true }),
    fs.stat(filePath)
  ]);
  const { common, format } = metadata;

  return {
    title: common.title ?? null,
    artist: common.artist ?? null,
    albumArtist: common.albumartist ?? null,
    album: common.album ?? null,
    year: common.year ?? null,
    date: common.date ?? null,
    genre: common.genre?.join(", ") ?? null,
    composer: common.composer?.join(", ") ?? null,
    track: formatPosition(common.track),
    disc: formatPosition(common.disk),
    copyright: common.copyright ?? null,
    duration: format.duration ?? null,
    bitrate: format.bitrate ?? null,
    sampleRate: format.sampleRate ?? null,
    channels: format.numberOfChannels ?? null,
    bitsPerSample: format.bitsPerSample ?? null,
    codec: format.codec ?? null,
    codecProfile: format.codecProfile ?? null,
    container: format.container ?? null,
    lossless: format.lossless ?? null,
    fileName: path.basename(filePath),
    filePath,
    fileSize: stats.size
  };
}

function toSkin(filePath) {
  return {
    url: pathToFileURL(filePath).href,
    name: path.basename(filePath)
  };
}

async function readSettings() {
  try {
    return JSON.parse(await fs.readFile(settingsPath(), "utf8"));
  } catch {
    return {};
  }
}

async function saveSettings(settings) {
  await fs.mkdir(path.dirname(settingsPath()), { recursive: true });
  await fs.writeFile(settingsPath(), JSON.stringify(settings, null, 2), "utf8");
}

async function updateSettings(patch) {
  await saveSettings({ ...(await readSettings()), ...patch });
}

async function getAudioFiles(directoryPath) {
  let entries;

  try {
    entries = await fs.readdir(directoryPath, { withFileTypes: true });
  } catch {
    return [];
  }

  const nestedFiles = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      return getAudioFiles(entryPath);
    }

    return entry.isFile() && supportedAudioExtensions.has(path.extname(entry.name).toLowerCase())
      ? [entryPath]
      : [];
  }));

  return nestedFiles.flat().sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

function normalizeZoomFactor(value) {
  return Math.min(maximumZoomFactor, Math.max(minimumZoomFactor, Math.round(value * 20) / 20));
}

function parseByteRange(rangeHeader, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader ?? "");

  if (!match || (!match[1] && !match[2])) {
    return null;
  }

  if (!match[1]) {
    const suffixLength = Number(match[2]);
    return suffixLength > 0
      ? { start: Math.max(size - suffixLength, 0), end: size - 1 }
      : null;
  }

  const start = Number(match[1]);
  const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  return start < size && start <= end ? { start, end } : null;
}

async function handleLocalAudioRequest(request) {
  const requestUrl = new URL(request.url);
  const id = requestUrl.pathname.split("/")[1];
  const filePath = localAudioFiles.get(id);

  if (!filePath) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const { size } = await fs.stat(filePath);
    const rangeHeader = request.headers.get("range");
    const range = rangeHeader ? parseByteRange(rangeHeader, size) : { start: 0, end: size - 1 };
    const headers = new Headers({
      "Accept-Ranges": "bytes",
      "Access-Control-Allow-Origin": "*",
      "Content-Type": audioMimeTypes.get(path.extname(filePath).toLowerCase()) ?? "application/octet-stream"
    });

    if (!range) {
      headers.set("Content-Range", `bytes */${size}`);
      return new Response(null, { status: 416, headers });
    }

    const status = rangeHeader ? 206 : 200;
    headers.set("Content-Length", String(range.end - range.start + 1));
    if (status === 206) {
      headers.set("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
    }

    const body = request.method === "HEAD"
      ? null
      : Readable.toWeb(createReadStream(filePath, { start: range.start, end: range.end }));
    return new Response(body, { status, headers });
  } catch {
    return new Response("Unable to read audio file", { status: 500 });
  }
}

async function showOpenDialog(event, options) {
  const window = BrowserWindow.fromWebContents(event.sender);
  return window
    ? dialog.showOpenDialog(window, options)
    : dialog.showOpenDialog(options);
}

function resizeLinuxWindowToRegions(window, regions) {
  if (regions.length === 0 || linuxWindowDrags.has(window.id)) {
    return;
  }

  const workArea = screen.getDisplayMatching(window.getBounds()).workArea;
  const width = Math.min(workArea.width, Math.max(...regions.map((region) => region.x + region.width)));
  const height = Math.min(workArea.height, Math.max(...regions.map((region) => region.y + region.height)));
  window.setBounds({
    width: Math.max(1, width),
    height: Math.max(1, height)
  });
}

function openExternalUrl(url) {
  if (!url.startsWith("https:")) {
    return false;
  }

  const destination = url.startsWith(upstreamRepositoryUrl) ? projectRepositoryUrl : url;
  void shell.openExternal(destination);
  return true;
}

async function createWindow() {
  const workArea = screen.getPrimaryDisplay().workArea;
  const useBoundedLinuxWindow = process.platform === "linux";
  const savedSettings = await readSettings();

  for (const [id, filePath] of Object.entries(savedSettings.audioFiles ?? {})) {
    if (typeof filePath === "string" && existsSync(filePath)) {
      localAudioFiles.set(id, filePath);
    }
  }

  const initialZoomFactor = useBoundedLinuxWindow
    ? normalizeZoomFactor(savedSettings.zoomFactor ?? 1)
    : 1;
  const window = new BrowserWindow({
    x: workArea.x,
    y: workArea.y,
    width: useBoundedLinuxWindow ? Math.ceil(275 * initialZoomFactor) : workArea.width,
    height: useBoundedLinuxWindow ? Math.ceil(464 * initialZoomFactor) : workArea.height,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  window.on("closed", () => linuxWindowDrags.delete(window.id));

  if (supportsWindowShape) {
    window.setShape([]);
  } else if (process.platform === "darwin") {
    window.setIgnoreMouseEvents(true, { forward: true });
  }

  window.webContents.setZoomFactor(initialZoomFactor);

  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternalUrl(url);
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (openExternalUrl(url)) {
      event.preventDefault();
    }
  });

  if (developmentServerUrl) {
    void window.loadURL(developmentServerUrl);
  } else {
    void window.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

ipcMain.handle("music:choose", async (event) => {
  const result = await showOpenDialog(event, {
    title: "Add music to Wisp AmpDeck",
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "Audio files", extensions: ["mp3", "flac", "m4a", "aac", "ogg", "opus", "wav", "aiff", "wma"] }]
  });

  return result.canceled ? [] : registerAudioTracks(result.filePaths);
});

ipcMain.handle("music:choose-folder", async (event) => {
  const result = await showOpenDialog(event, {
    title: "Add a music folder to Wisp AmpDeck",
    properties: ["openDirectory"]
  });

  if (result.canceled) {
    return [];
  }

  return registerAudioTracks(await getAudioFiles(result.filePaths[0]));
});

ipcMain.handle("music:get-saved", () => (
  [...localAudioFiles.entries()].map(([id, filePath]) => ({
    url: `ampdeck-audio://track/${id}/${encodeURIComponent(path.basename(filePath))}`,
    defaultName: path.basename(filePath)
  }))
));

ipcMain.handle("music:get-details", (_event, trackUrl) => getTrackDetails(trackUrl));

ipcMain.handle("skin:choose", async (event) => {
  const result = await showOpenDialog(event, {
    title: "Choose a Winamp skin",
    properties: ["openFile"],
    filters: [{ name: "Winamp skins", extensions: ["wsz", "zip"] }]
  });

  return result.canceled ? null : toSkin(result.filePaths[0]);
});

ipcMain.handle("skin:get-saved", async () => {
  const savedSkin = (await readSettings()).skin;
  return savedSkin && existsSync(new URL(savedSkin.url)) ? savedSkin : null;
});

ipcMain.handle("skin:save", async (_event, skin) => {
  await updateSettings({ skin });
});

ipcMain.handle("app:get-zoom", async () => (await readSettings()).zoomFactor ?? 1);

ipcMain.handle("app:set-zoom", async (event, requestedZoomFactor) => {
  const zoomFactor = normalizeZoomFactor(Number(requestedZoomFactor) || 1);
  BrowserWindow.fromWebContents(event.sender)?.webContents.setZoomFactor(zoomFactor);
  await updateSettings({ zoomFactor });
  return zoomFactor;
});

ipcMain.on("app:close", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close();
});

ipcMain.on("app:set-interactive-regions", (event, regions) => {
  if (!Array.isArray(regions)) {
    return;
  }

  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || window.isDestroyed()) {
    return;
  }

  const zoomFactor = window.webContents.getZoomFactor();
  const shapedRegions = regions
    .filter((region) => Number.isFinite(region?.x) && Number.isFinite(region?.y) && Number.isFinite(region?.width) && Number.isFinite(region?.height))
    .filter((region) => region.width > 0 && region.height > 0)
    .slice(0, 32)
    .map((region) => ({
      x: Math.round(region.x * zoomFactor),
      y: Math.round(region.y * zoomFactor),
      width: Math.ceil(region.width * zoomFactor),
      height: Math.ceil(region.height * zoomFactor)
    }));

  if (supportsWindowShape) {
    window.setShape(shapedRegions);
  } else if (process.platform === "linux") {
    resizeLinuxWindowToRegions(window, shapedRegions);
  }
});

ipcMain.on("app:set-mouse-interactivity", (event, interactive) => {
  if (process.platform === "darwin") {
    BrowserWindow.fromWebContents(event.sender)?.setIgnoreMouseEvents(!interactive, { forward: true });
  }
});

ipcMain.on("app:set-window-dragging", (event, dragging) => {
  if (process.platform !== "linux") {
    return;
  }

  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || window.isDestroyed()) {
    return;
  }

  if (!dragging) {
    linuxWindowDrags.delete(window.id);
    return;
  }

  linuxWindowDrags.add(window.id);
  const bounds = window.getBounds();
  const workArea = screen.getDisplayMatching(bounds).workArea;
  window.setBounds({
    width: Math.max(bounds.width, workArea.x + workArea.width - bounds.x),
    height: Math.max(bounds.height, workArea.y + workArea.height - bounds.y)
  });
});

app.whenReady().then(async () => {
  protocol.handle("ampdeck-audio", handleLocalAudioRequest);
  await createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});