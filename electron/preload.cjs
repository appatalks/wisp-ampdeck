const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ampdeck", {
  pickMusicFiles: () => ipcRenderer.invoke("music:choose"),
  pickMusicFolder: () => ipcRenderer.invoke("music:choose-folder"),
  getSavedMusic: () => ipcRenderer.invoke("music:get-saved"),
  getTrackDetails: (trackUrl) => ipcRenderer.invoke("music:get-details", trackUrl),
  pickSkinFile: () => ipcRenderer.invoke("skin:choose"),
  getSavedSkin: () => ipcRenderer.invoke("skin:get-saved"),
  saveSkin: (skin) => ipcRenderer.invoke("skin:save", skin),
  getZoomFactor: () => ipcRenderer.invoke("app:get-zoom"),
  setZoomFactor: (zoomFactor) => ipcRenderer.invoke("app:set-zoom", zoomFactor),
  setFullscreen: (fullscreen) => ipcRenderer.invoke("app:set-fullscreen", fullscreen),
  setInteractiveRegions: (regions) => ipcRenderer.send("app:set-interactive-regions", regions),
  setMouseInteractivity: (interactive) => ipcRenderer.send("app:set-mouse-interactivity", interactive),
  setWindowDragging: (dragging) => ipcRenderer.send("app:set-window-dragging", dragging),
  close: () => ipcRenderer.send("app:close")
});