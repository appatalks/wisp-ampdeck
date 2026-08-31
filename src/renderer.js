import Webamp from "webamp";
import "./styles.css";
import mascotUrl from "./assets/wisp-mascot.png";
import { createWispVisualizer } from "./wispVisualizer.js";

const projectRepositoryUrl = "https://github.com/appatalks/wisp-ampdeck";
const settingsUrl = "wisp-ampdeck:settings";
const defaultSkinUrl = new URL("./skins/Wisp-AmpDeck.wsz", window.location.href).href;
const settingsDialog = document.querySelector("#ampdeck-settings");
const scaleInput = document.querySelector("#interface-scale");
const scaleValue = document.querySelector("#scale-value");
const resetScaleButton = document.querySelector("#reset-scale");
const closeSettingsButton = document.querySelector("#close-settings");
const codecStatus = document.querySelector("#codec-status");
const songDetailsDialog = document.querySelector("#song-details");
const songDetailsTitle = document.querySelector("#song-details-title");
const songDetailsStatus = document.querySelector("#song-details-status");
const songDetailsContent = document.querySelector("#song-details-content");
const closeSongDetailsButton = document.querySelector("#close-song-details");
const visualizerElement = document.querySelector("#wisp-visualizer");
const visualizerCanvas = document.querySelector("#wisp-visualizer-canvas");
const toggleVisualizerButton = document.querySelector("#toggle-wisp-visualizer");
let interactiveRegionUpdateQueued = false;
let pointerIsOverInteractiveElement = false;
let detachableWindowDragActive = false;
let songDetailsRequestId = 0;
let wispVisualizer;

const detachableWindowDragSelector = [
  "#equalizer-window .title-bar",
  "#playlist-window .playlist-top",
  "#playlist-window-shade",
  ".gen-window .gen-top",
  "#wisp-visualizer .wisp-visualizer-titlebar"
].join(",");

function updateInteractiveRegions() {
  interactiveRegionUpdateQueued = false;

  const selectors = [
    "#main-window",
    "#equalizer-window",
    "#playlist-window",
    "#milkdrop-window",
    "#wisp-visualizer:not([hidden])",
    ".gen-window",
    ".context-menu",
    ".context-menu ul",
    "#ampdeck-settings:not([hidden])",
    "#song-details:not([hidden])"
  ];
  const regions = [...document.querySelectorAll(selectors.join(","))].map((element) => {
    const bounds = element.getBoundingClientRect();
    return { x: bounds.left, y: bounds.top, width: bounds.width, height: bounds.height };
  });

  window.ampdeck.setInteractiveRegions(regions);
}

function scheduleInteractiveRegionUpdate() {
  if (!interactiveRegionUpdateQueued) {
    interactiveRegionUpdateQueued = true;
    requestAnimationFrame(updateInteractiveRegions);
  }
}

function finishDetachableWindowDrag() {
  if (!detachableWindowDragActive) {
    return;
  }

  detachableWindowDragActive = false;
  window.ampdeck.setWindowDragging(false);
  scheduleInteractiveRegionUpdate();
}

function updateMouseInteractivity(target) {
  const interactiveSelectors = [
    "#main-window",
    "#equalizer-window",
    "#playlist-window",
    "#milkdrop-window",
    "#wisp-visualizer",
    ".gen-window",
    ".context-menu",
    "#ampdeck-settings",
    "#song-details"
  ];
  const interactive = target instanceof Element && Boolean(target.closest(interactiveSelectors.join(",")));

  if (interactive !== pointerIsOverInteractiveElement) {
    pointerIsOverInteractiveElement = interactive;
    window.ampdeck.setMouseInteractivity(interactive);
  }
}

function replaceBundledBranding(root) {
  if (!root) {
    return;
  }

  if (root instanceof HTMLAnchorElement && root.href === "https://webamp.org/about" && root.id !== "about") {
    root.href = settingsUrl;
  }

  for (const link of root.querySelectorAll?.('a[href="https://webamp.org/about"]') ?? []) {
    if (link.id !== "about") {
      link.href = settingsUrl;
    }
  }

  const textNodes = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let textNode = textNodes.nextNode();

  while (textNode) {
    if (textNode.nodeValue?.includes("Webamp")) {
      textNode.nodeValue = textNode.nodeValue.replaceAll("Webamp", "Wisp AmpDeck");
    }
    textNode = textNodes.nextNode();
  }
}

replaceBundledBranding(document.body);

new MutationObserver((records) => {
  for (const record of records) {
    if (record.type === "characterData") {
      replaceBundledBranding(record.target.parentElement);
      continue;
    }

    for (const node of record.addedNodes) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        replaceBundledBranding(node);
      }
    }
  }
  scheduleInteractiveRegionUpdate();
}).observe(document.body, { childList: true, characterData: true, subtree: true });

async function pickMusicFiles() {
  return window.ampdeck.pickMusicFiles();
}

async function pickMusicFolder() {
  return window.ampdeck.pickMusicFolder();
}

function renderCodecStatus() {
  const audio = document.createElement("audio");
  const codecs = [
    ["MP3", "audio/mpeg"],
    ["AAC", "audio/aac"],
    ["FLAC", "audio/flac"],
    ["Ogg", "audio/ogg"],
    ["WAV", "audio/wav"]
  ];

  codecStatus.replaceChildren(...codecs.map(([name, mimeType]) => {
    const item = document.createElement("li");
    const availability = audio.canPlayType(mimeType) ? "available" : "unavailable";
    item.textContent = `${name}: ${availability}`;
    return item;
  }));
}

async function setInterfaceScale(percent) {
  const zoomFactor = await window.ampdeck.setZoomFactor(percent / 100);
  const normalizedPercent = Math.round(zoomFactor * 100);
  scaleInput.value = String(normalizedPercent);
  scaleValue.value = `${normalizedPercent}%`;
  scaleValue.textContent = `${normalizedPercent}%`;
}

function openSettings() {
  renderCodecStatus();
  closeSongDetails();

  if (settingsDialog.hidden) {
    settingsDialog.hidden = false;
    scheduleInteractiveRegionUpdate();
  }
}

function closeSettings() {
  settingsDialog.hidden = true;
  scheduleInteractiveRegionUpdate();
}

function closeSongDetails() {
  songDetailsRequestId += 1;
  songDetailsDialog.hidden = true;
  scheduleInteractiveRegionUpdate();
}

function getCurrentTrack() {
  const state = webamp.store.getState();
  const trackId = state.playlist.currentTrack;
  return trackId == null ? null : state.tracks[trackId] ?? null;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) {
    return null;
  }

  const totalSeconds = Math.round(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor(totalSeconds % 3600 / 60);
  const remainingSeconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`
    : `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes)) {
    return null;
  }

  const units = ["B", "KB", "MB", "GB"];
  const unitIndex = Math.min(Math.floor(Math.log(Math.max(bytes, 1)) / Math.log(1024)), units.length - 1);
  const value = bytes / (1024 ** unitIndex);
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatChannels(channels) {
  if (channels === 1) {
    return "1 (Mono)";
  }
  if (channels === 2) {
    return "2 (Stereo)";
  }
  return Number.isFinite(channels) ? String(channels) : null;
}

function createDetailsSection(title, fields) {
  const populatedFields = fields.filter(([, value]) => value !== null && value !== undefined && value !== "");
  if (populatedFields.length === 0) {
    return null;
  }

  const section = document.createElement("section");
  const heading = document.createElement("h2");
  const list = document.createElement("dl");
  heading.textContent = title;

  for (const [label, value] of populatedFields) {
    const term = document.createElement("dt");
    const description = document.createElement("dd");
    term.textContent = label;
    description.textContent = String(value);
    list.append(term, description);
  }

  section.append(heading, list);
  return section;
}

function renderSongDetails(details, track) {
  const title = details.title || track.title || details.fileName || track.defaultName || "Song Information";
  songDetailsTitle.textContent = title;
  songDetailsStatus.textContent = "";

  const tagSection = createDetailsSection("Tags", [
    ["Title", details.title],
    ["Artist", details.artist || track.artist],
    ["Album artist", details.albumArtist],
    ["Album", details.album || track.album],
    ["Year", details.year],
    ["Date", details.date],
    ["Genre", details.genre],
    ["Composer", details.composer],
    ["Track", details.track],
    ["Disc", details.disc],
    ["Copyright", details.copyright]
  ]);
  const audioSection = createDetailsSection("Audio", [
    ["Duration", formatDuration(details.duration || track.duration)],
    ["Bitrate", Number.isFinite(details.bitrate) ? `${Math.round(details.bitrate / 1000)} kbps` : track.kbps && `${track.kbps.trim()} kbps`],
    ["Sample rate", Number.isFinite(details.sampleRate) ? `${details.sampleRate / 1000} kHz` : track.khz && `${track.khz.trim()} kHz`],
    ["Channels", formatChannels(details.channels || track.channels)],
    ["Bit depth", Number.isFinite(details.bitsPerSample) ? `${details.bitsPerSample}-bit` : null],
    ["Codec", details.codec],
    ["Codec profile", details.codecProfile],
    ["Container", details.container],
    ["Encoding", details.lossless === true ? "Lossless" : details.lossless === false ? "Lossy" : null]
  ]);
  const fileSection = createDetailsSection("File", [
    ["Name", details.fileName],
    ["Size", formatFileSize(details.fileSize)],
    ["Location", details.filePath]
  ]);

  songDetailsContent.replaceChildren(...[tagSection, audioSection, fileSection].filter(Boolean));
}

async function openSongDetails() {
  const track = getCurrentTrack();
  closeSettings();
  songDetailsDialog.hidden = false;
  songDetailsTitle.textContent = track?.title || track?.defaultName || "Song Information";
  songDetailsStatus.textContent = track ? "Reading file metadata..." : "No song is selected.";
  songDetailsContent.replaceChildren();
  scheduleInteractiveRegionUpdate();

  if (!track) {
    return;
  }

  const requestId = ++songDetailsRequestId;
  try {
    const details = await window.ampdeck.getTrackDetails(track.url);
    if (requestId === songDetailsRequestId) {
      renderSongDetails(details, track);
      scheduleInteractiveRegionUpdate();
    }
  } catch (error) {
    if (requestId === songDetailsRequestId) {
      songDetailsStatus.textContent = error?.message || "Song information is unavailable.";
    }
  }
}

async function chooseSkin() {
  const skin = await window.ampdeck.pickSkinFile();

  if (!skin) {
    return;
  }

  await webamp.setSkinFromUrl(skin.url);
  await window.ampdeck.saveSkin(skin);
}

const webamp = new Webamp({
  zIndex: 1,
  enableHotkeys: true,
  initialSkin: { url: defaultSkinUrl },
  availableSkins: [{ url: defaultSkinUrl, name: "Wisp AmpDeck" }],
  windowLayout: {
    main: { position: { top: 0, left: 0 } },
    equalizer: { position: { top: 116, left: 0 } },
    playlist: { position: { top: 232, left: 0 }, size: { width: 275, height: 232 } }
  },
  filePickers: [{
    contextMenuName: "Add local files...",
    filePicker: pickMusicFiles,
    requiresNetwork: false
  }, {
    contextMenuName: "Add music folder...",
    filePicker: pickMusicFolder,
    requiresNetwork: false
  }]
});

function openPlayerMenu() {
  const mainWindow = document.querySelector("#main-window");

  if (!mainWindow) {
    return;
  }

  const bounds = mainWindow.getBoundingClientRect();
  mainWindow.dispatchEvent(new MouseEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    clientX: bounds.left + 8,
    clientY: bounds.top + 20
  }));
}

document.addEventListener("pointerup", (event) => {
  const songTitle = event.target instanceof Element ? event.target.closest("#main-window #marquee") : null;
  if (event.button === 0 && songTitle) {
    void openSongDetails();
  }
}, true);

document.addEventListener("click", (event) => {
  const aboutButton = event.target instanceof Element ? event.target.closest("#about") : null;

  if (aboutButton) {
    event.preventDefault();
    event.stopImmediatePropagation();
    openPlayerMenu();
    return;
  }

  const settingsLink = event.target instanceof Element
    ? event.target.closest(`a[href="${settingsUrl}"]`)
    : null;

  if (settingsLink) {
    event.preventDefault();
    event.stopImmediatePropagation();
    openSettings();
    return;
  }

  const upstreamLink = event.target instanceof Element
    ? event.target.closest('a[href*="github.com/captbaritone/webamp"]')
    : null;

  if (!upstreamLink) {
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();
}, true);

async function start() {
  await webamp.renderWhenReady(document.querySelector("#webamp"));

  wispVisualizer = createWispVisualizer({
    analyser: webamp.media.getAnalyser(),
    canvas: visualizerCanvas,
    element: visualizerElement,
    mascotUrl,
    onRegionsChange: scheduleInteractiveRegionUpdate,
    setFullscreen: window.ampdeck.setFullscreen
  });

  await setInterfaceScale((await window.ampdeck.getZoomFactor()) * 100);

  webamp.store.dispatch({
    type: "UPDATE_WINDOW_POSITIONS",
    absolute: true,
    positions: {
      main: { x: 0, y: 0 },
      equalizer: { x: 0, y: 116 },
      playlist: { x: 0, y: 232 }
    }
  });

  const savedSkin = await window.ampdeck.getSavedSkin();
  if (savedSkin) {
    try {
      await webamp.setSkinFromUrl(savedSkin.url);
    } catch {}
  }

  const savedTracks = await window.ampdeck.getSavedMusic();
  if (savedTracks.length > 0 && webamp.getPlaylistTracks().length === 0) {
    webamp.appendTracks(savedTracks);
    webamp.setCurrentTrack(0);
  }

  webamp.onClose(() => window.ampdeck.close());
  webamp.onTrackDidChange(() => {
    if (!songDetailsDialog.hidden) {
      void openSongDetails();
    }
  });
  webamp.__onStateChange(scheduleInteractiveRegionUpdate);
  scheduleInteractiveRegionUpdate();
}

window.addEventListener("keydown", (event) => {
  const modifierPressed = event.ctrlKey || event.metaKey;

  if (modifierPressed && !event.shiftKey && event.key.toLowerCase() === "o") {
    event.preventDefault();
    void pickMusicFiles().then((tracks) => webamp.setTracksToPlay(tracks));
  }

  if (modifierPressed && event.shiftKey && event.key.toLowerCase() === "s") {
    event.preventDefault();
    void chooseSkin();
  }

  if (modifierPressed && event.shiftKey && event.key.toLowerCase() === "o") {
    event.preventDefault();
    void pickMusicFolder().then((tracks) => webamp.setTracksToPlay(tracks));
  }

  if (modifierPressed && !event.shiftKey && ["+", "="].includes(event.key)) {
    event.preventDefault();
    void setInterfaceScale(Number(scaleInput.value) + 5);
  }

  if (modifierPressed && !event.shiftKey && event.key === "-") {
    event.preventDefault();
    void setInterfaceScale(Number(scaleInput.value) - 5);
  }

  if (modifierPressed && !event.shiftKey && event.key === "0") {
    event.preventDefault();
    void setInterfaceScale(100);
  }

  if (event.altKey && event.key.toLowerCase() === "v") {
    event.preventDefault();
    wispVisualizer?.toggle();
  }
}, true);

scaleInput.addEventListener("input", () => {
  const percent = Number(scaleInput.value);
  scaleValue.value = `${percent}%`;
  scaleValue.textContent = `${percent}%`;
});

scaleInput.addEventListener("change", () => {
  void setInterfaceScale(Number(scaleInput.value));
});

resetScaleButton.addEventListener("click", () => {
  void setInterfaceScale(100);
});
toggleVisualizerButton.addEventListener("click", () => wispVisualizer?.toggle());

closeSettingsButton.addEventListener("click", closeSettings);
closeSongDetailsButton.addEventListener("click", closeSongDetails);
document.addEventListener("mousedown", (event) => {
  const target = event.target;

  if (
    event.button === 0 &&
    target instanceof Element &&
    target.closest(detachableWindowDragSelector)?.classList.contains("draggable")
  ) {
    detachableWindowDragActive = true;
    window.ampdeck.setWindowDragging(true);
  }
}, true);
window.addEventListener("mouseup", finishDetachableWindowDrag, true);
window.addEventListener("blur", finishDetachableWindowDrag);
window.addEventListener("resize", scheduleInteractiveRegionUpdate);
window.addEventListener("mousemove", (event) => {
  updateMouseInteractivity(event.target);

  if (event.target instanceof Element && event.target.closest("#webamp-context-menu")) {
    scheduleInteractiveRegionUpdate();
  }
});

void start().catch((error) => {
  console.error("Unable to start Wisp AmpDeck", error);
});