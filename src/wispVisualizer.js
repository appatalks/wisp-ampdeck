const snapDistance = 10;
const positionStorageKey = "wisp-visualizer-position";
const visibilityStorageKey = "wisp-visualizer-visible";
const modeStorageKey = "wisp-visualizer-mode";
const visualizationModes = ["wisp", "galaxy", "orbit"];

function deterministicRandom(index, salt = 0) {
  const value = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function averageRange(values, startRatio, endRatio) {
  const start = Math.floor(values.length * startRatio);
  const end = Math.max(start + 1, Math.floor(values.length * endRatio));
  let total = 0;

  for (let index = start; index < end; index += 1) {
    total += values[index];
  }

  return total / (end - start) / 255;
}

function snapPosition(left, top, width, height, visualizer) {
  const targets = [...document.querySelectorAll("#main-window, #equalizer-window, #playlist-window")]
    .filter((element) => element !== visualizer)
    .map((element) => element.getBoundingClientRect());
  let snappedLeft = left;
  let snappedTop = top;

  for (const target of targets) {
    const xCandidates = [target.left, target.right, target.left - width, target.right - width];
    const yCandidates = [target.top, target.bottom, target.top - height, target.bottom - height];

    for (const candidate of xCandidates) {
      if (Math.abs(snappedLeft - candidate) <= snapDistance) {
        snappedLeft = candidate;
      }
    }

    for (const candidate of yCandidates) {
      if (Math.abs(snappedTop - candidate) <= snapDistance) {
        snappedTop = candidate;
      }
    }
  }

  return {
    left: Math.max(0, Math.round(snappedLeft)),
    top: Math.max(0, Math.round(snappedTop))
  };
}

export function createWispVisualizer({ analyser, canvas, element, mascotUrl, onRegionsChange, setFullscreen }) {
  const context = canvas.getContext("2d");
  const frequencyData = new Uint8Array(analyser.frequencyBinCount);
  const waveformData = new Uint8Array(analyser.fftSize);
  const mascot = new Image();
  const particles = [];
  const stars = Array.from({ length: 46 }, (_, index) => ({
    x: (index * 73 % 271) / 271,
    y: (index * 47 % 193) / 193,
    size: index % 9 === 0 ? 1.4 : 0.7,
    phase: index * 0.63
  }));
  const galaxyParticles = Array.from({ length: 620 }, (_, index) => {
    const radius = deterministicRandom(index, 1) ** 0.62;
    const arm = index % 4;
    return {
      radius,
      angle: arm * Math.PI / 2 + radius * 8.6 + (deterministicRandom(index, 2) - 0.5) * (0.3 + radius * 0.72),
      size: 0.25 + deterministicRandom(index, 3) * (1.1 - radius * 0.35),
      warmth: deterministicRandom(index, 4),
      alpha: 0.2 + deterministicRandom(index, 5) * 0.68
    };
  });
  const titlebar = element.querySelector(".wisp-visualizer-titlebar");
  const closeButton = element.querySelector("#close-wisp-visualizer");
  const fullscreenButton = element.querySelector("#fullscreen-wisp-visualizer");
  const modeLabel = element.querySelector("#wisp-visualizer-mode");
  const previousModeButton = element.querySelector("#previous-visualization");
  const nextModeButton = element.querySelector("#next-visualization");
  let animationFrame = 0;
  let smoothedBass = 0;
  let lastParticleTime = 0;
  let drag = null;
  let fullscreen = false;
  let mode = visualizationModes.includes(localStorage.getItem(modeStorageKey))
    ? localStorage.getItem(modeStorageKey)
    : visualizationModes[0];

  mascot.src = mascotUrl;
  modeLabel.textContent = mode.toUpperCase();

  const changeMode = (direction) => {
    const index = visualizationModes.indexOf(mode);
    mode = visualizationModes[(index + direction + visualizationModes.length) % visualizationModes.length];
    modeLabel.textContent = mode.toUpperCase();
    localStorage.setItem(modeStorageKey, mode);
  };

  const toggleFullscreen = async () => {
    fullscreen = await setFullscreen(!fullscreen);
    element.classList.toggle("is-fullscreen", fullscreen);
    fullscreenButton.setAttribute("aria-label", fullscreen ? "Exit fullscreen" : "Enter fullscreen");
    fullscreenButton.title = fullscreen ? "Exit fullscreen" : "Enter fullscreen";
    onRegionsChange();
  };

  try {
    const position = JSON.parse(localStorage.getItem(positionStorageKey));
    if (Number.isFinite(position?.left) && Number.isFinite(position?.top)) {
      element.style.left = `${Math.max(0, position.left)}px`;
      element.style.top = `${Math.max(0, position.top)}px`;
    }
  } catch {}

  const setVisible = (visible) => {
    if (!visible && fullscreen) {
      void toggleFullscreen().then(() => setVisible(false));
      return;
    }

    element.hidden = !visible;
    localStorage.setItem(visibilityStorageKey, String(visible));
    onRegionsChange();
    if (visible && !animationFrame) {
      animationFrame = requestAnimationFrame(draw);
    }
  };

  const resizeCanvas = () => {
    const bounds = canvas.getBoundingClientRect();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(bounds.width * pixelRatio));
    const height = Math.max(1, Math.round(bounds.height * pixelRatio));

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  };

  const drawGalaxy = (time, width, height, bass, mids, treble, energy) => {
    const centerX = width * 0.5;
    const centerY = height * 0.49;
    const pulse = 1 + smoothedBass * 0.045;
    const background = context.createRadialGradient(centerX, centerY, 2, centerX, centerY, width * 0.72);
    background.addColorStop(0, `rgba(82,49,119,${0.25 + energy * 0.08})`);
    background.addColorStop(0.28, "#0b0b1c");
    background.addColorStop(1, "#010207");
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);

    for (const star of stars) {
      const shimmer = 0.18 + (Math.sin(time * 0.0012 + star.phase) + 1) * 0.08 + treble * 0.12;
      context.fillStyle = `rgba(210,220,255,${shimmer})`;
      context.fillRect(star.x * width, star.y * height, star.size * 0.7, star.size * 0.7);
    }

    context.save();
    context.translate(centerX, centerY);
    context.rotate(-0.17);
    context.globalCompositeOperation = "lighter";
    const rotation = time * 0.000055;
    for (const particle of galaxyParticles) {
      const radius = particle.radius * width * 0.47 * pulse;
      const angle = particle.angle + rotation * (1.3 - particle.radius * 0.72);
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius * 0.41;
      const coreBias = 1 - particle.radius;
      const musicGlow = 0.88 + bass * 0.14 + mids * 0.06;
      const alpha = particle.alpha * (0.45 + coreBias * 0.55) * musicGlow;
      const color = particle.warmth > 0.84
        ? `rgba(183,255,101,${alpha * 0.72})`
        : particle.warmth > 0.38
          ? `rgba(203,143,255,${alpha})`
          : `rgba(92,218,232,${alpha * 0.82})`;
      context.fillStyle = color;
      context.beginPath();
      context.arc(x, y, particle.size * (0.72 + coreBias * 0.58), 0, Math.PI * 2);
      context.fill();
    }

    const core = context.createRadialGradient(0, 0, 0, 0, 0, 28 + bass * 3);
    core.addColorStop(0, `rgba(248,235,255,${0.76 + bass * 0.12})`);
    core.addColorStop(0.16, "rgba(205,151,255,.55)");
    core.addColorStop(0.48, "rgba(82,229,207,.18)");
    core.addColorStop(1, "rgba(10,8,28,0)");
    context.fillStyle = core;
    context.beginPath();
    context.arc(0, 0, 31 + bass * 3, 0, Math.PI * 2);
    context.fill();
    context.restore();

    context.save();
    context.globalAlpha = 0.16 + energy * 0.08;
    context.strokeStyle = "#b7ff65";
    context.lineWidth = 0.7;
    context.beginPath();
    for (let index = 0; index < waveformData.length; index += 12) {
      const x = index / (waveformData.length - 1) * width;
      const y = height - 12 + (waveformData[index] - 128) / 128 * 5;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.stroke();
    context.restore();
  };

  const drawOrbit = (time, width, height, bass, mids, treble, energy) => {
    const centerX = width * 0.5;
    const centerY = height * 0.49;
    const background = context.createRadialGradient(centerX, centerY, 2, centerX, centerY, width * 0.66);
    background.addColorStop(0, `rgba(20,62,52,${0.42 + energy * 0.12})`);
    background.addColorStop(0.4, "#090b1a");
    background.addColorStop(1, "#02030a");
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);

    context.save();
    context.translate(centerX, centerY);
    context.globalCompositeOperation = "screen";
    for (let ring = 0; ring < 3; ring += 1) {
      context.beginPath();
      const baseRadius = 29 + ring * 24 + smoothedBass * (3 - ring * 0.7);
      for (let point = 0; point <= 180; point += 1) {
        const angle = point / 180 * Math.PI * 2;
        const dataIndex = Math.floor(point / 180 * (waveformData.length - 1));
        const wave = (waveformData[dataIndex] - 128) / 128;
        const radius = baseRadius + wave * (5 + energy * 8) * (1 - ring * 0.16);
        const x = Math.cos(angle + time * 0.00008 * (ring % 2 ? -1 : 1)) * radius;
        const y = Math.sin(angle + time * 0.00008 * (ring % 2 ? -1 : 1)) * radius * 0.72;
        if (point === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.strokeStyle = ["rgba(183,255,101,.8)", "rgba(91,231,211,.54)", "rgba(203,143,255,.46)"][ring];
      context.lineWidth = ring === 0 ? 1.3 : 0.8;
      context.stroke();
    }

    for (let index = 0; index < 28; index += 1) {
      const value = frequencyData[Math.floor(index / 28 * frequencyData.length * 0.58)] / 255;
      const angle = index / 28 * Math.PI * 2 + time * 0.00018;
      const radius = 79 + value * 10;
      context.fillStyle = index % 5 === 0 ? "rgba(218,163,255,.8)" : "rgba(183,255,101,.72)";
      context.beginPath();
      context.arc(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.72, 0.65 + value * 1.4, 0, Math.PI * 2);
      context.fill();
    }

    const center = context.createRadialGradient(0, 0, 0, 0, 0, 23 + bass * 4);
    center.addColorStop(0, `rgba(239,255,207,${0.76 + bass * 0.16})`);
    center.addColorStop(0.18, "rgba(183,255,101,.48)");
    center.addColorStop(0.55, "rgba(91,231,211,.16)");
    center.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = center;
    context.beginPath();
    context.arc(0, 0, 27 + bass * 4, 0, Math.PI * 2);
    context.fill();
    context.restore();
  };

  const draw = (time) => {
    animationFrame = 0;
    if (element.hidden) {
      return;
    }

    resizeCanvas();
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const scaleX = canvas.width / width;
    const scaleY = canvas.height / height;
    context.setTransform(scaleX, 0, 0, scaleY, 0, 0);
    analyser.getByteFrequencyData(frequencyData);
    analyser.getByteTimeDomainData(waveformData);

    const bass = averageRange(frequencyData, 0, 0.1);
    const mids = averageRange(frequencyData, 0.1, 0.42);
    const treble = averageRange(frequencyData, 0.42, 0.78);
    const energy = Math.min(1, bass * 0.55 + mids * 0.3 + treble * 0.25);
    smoothedBass += (bass - smoothedBass) * 0.18;

    if (mode === "galaxy") {
      drawGalaxy(time, width, height, bass, mids, treble, energy);
      animationFrame = requestAnimationFrame(draw);
      return;
    }

    if (mode === "orbit") {
      drawOrbit(time, width, height, bass, mids, treble, energy);
      animationFrame = requestAnimationFrame(draw);
      return;
    }

    const background = context.createRadialGradient(width * 0.36, height * 0.42, 3, width * 0.45, height * 0.5, width * 0.72);
    background.addColorStop(0, `rgba(29, 45, 36, ${0.48 + energy * 0.22})`);
    background.addColorStop(0.38, "#090b19");
    background.addColorStop(1, "#02030a");
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);

    for (const star of stars) {
      const shimmer = 0.25 + (Math.sin(time * 0.0018 + star.phase) + 1) * 0.18 + treble * 0.48;
      context.fillStyle = `rgba(${star.phase % 2 > 1 ? "192,142,255" : "183,255,101"},${shimmer})`;
      context.fillRect(star.x * width, star.y * height, star.size, star.size);
    }

    context.save();
    context.globalCompositeOperation = "screen";
    context.lineWidth = 1;
    for (let ribbon = 0; ribbon < 3; ribbon += 1) {
      context.beginPath();
      for (let index = 0; index < waveformData.length; index += 8) {
        const x = index / (waveformData.length - 1) * width;
        const wave = (waveformData[index] - 128) / 128;
        const y = height * (0.68 + ribbon * 0.075) + wave * (10 + energy * 24) * (1 - ribbon * 0.2);
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.strokeStyle = ["rgba(183,255,101,.62)", "rgba(91,231,211,.38)", "rgba(199,128,255,.34)"][ribbon];
      context.stroke();
    }
    context.restore();

    const barCount = 32;
    const barGap = 2.5;
    const barWidth = (width - 22 - (barCount - 1) * barGap) / barCount;
    context.save();
    context.globalAlpha = 0.42;
    for (let index = 0; index < barCount; index += 1) {
      const sourceIndex = Math.floor((index / barCount) ** 1.7 * frequencyData.length * 0.72);
      const value = frequencyData[sourceIndex] / 255;
      const barHeight = 1 + value * height * 0.18;
      const barGradient = context.createLinearGradient(0, height - barHeight, 0, height);
      barGradient.addColorStop(0, value > 0.72 ? "#f1c2ff" : "#b7ff65");
      barGradient.addColorStop(0.48, "#5be7d3");
      barGradient.addColorStop(1, "rgba(48,33,94,.25)");
      context.fillStyle = barGradient;
      context.fillRect(11 + index * (barWidth + barGap), height - 8 - barHeight, barWidth, barHeight);
    }
    context.restore();

    if (time - lastParticleTime > Math.max(26, 82 - energy * 65)) {
      particles.push({
        x: width * 0.36,
        y: height * 0.42,
        vx: -0.35 - Math.random() * (0.5 + energy),
        vy: (Math.random() - 0.5) * (0.7 + energy),
        life: 1,
        size: 0.7 + Math.random() * 1.8 + bass * 2,
        hue: Math.random() > 0.78 ? 282 : Math.random() > 0.5 ? 92 : 168
      });
      lastParticleTime = time;
    }

    context.save();
    context.globalCompositeOperation = "lighter";
    for (let index = particles.length - 1; index >= 0; index -= 1) {
      const particle = particles[index];
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.life -= 0.012;
      if (particle.life <= 0) {
        particles.splice(index, 1);
        continue;
      }
      context.fillStyle = `hsla(${particle.hue},92%,68%,${particle.life * 0.7})`;
      context.beginPath();
      context.arc(particle.x, particle.y, particle.size * particle.life, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();

    if (mascot.complete && mascot.naturalWidth > 0) {
      const mascotWidth = width * (0.77 + smoothedBass * 0.07);
      const mascotHeight = mascotWidth * mascot.naturalHeight / mascot.naturalWidth;
      const mascotX = width * 0.1 + Math.sin(time * 0.0007) * 4;
      const mascotY = height * 0.12 + Math.sin(time * 0.0013) * 3 - smoothedBass * 4;
      context.save();
      context.globalCompositeOperation = "screen";
      context.globalAlpha = 0.34 + energy * 0.28;
      context.filter = `blur(${5 + bass * 8}px) brightness(${1.25 + bass * 0.65})`;
      context.drawImage(mascot, mascotX, mascotY, mascotWidth, mascotHeight);
      context.restore();
      context.save();
      context.filter = `brightness(${1 + bass * 0.34}) saturate(${1.05 + mids * 0.55}) drop-shadow(0 0 ${4 + bass * 9}px rgba(183,255,101,.8))`;
      context.drawImage(mascot, mascotX, mascotY, mascotWidth, mascotHeight);
      context.restore();
    }

    const faceX = width * 0.225;
    const faceY = height * 0.49;
    const ringRadius = 29 + smoothedBass * 10;
    context.save();
    context.translate(faceX, faceY);
    context.rotate(-Math.PI * 0.76);
    for (let index = 0; index < 44; index += 1) {
      const value = frequencyData[Math.floor(index / 44 * frequencyData.length * 0.55)] / 255;
      const angle = index / 44 * Math.PI * 1.52;
      context.save();
      context.rotate(angle);
      context.fillStyle = index % 7 === 0 ? "rgba(224,174,255,.9)" : "rgba(183,255,101,.78)";
      context.fillRect(ringRadius, -0.55, 2 + value * 10, 1.1);
      context.restore();
    }
    context.restore();

    animationFrame = requestAnimationFrame(draw);
  };

  titlebar.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.target.closest("button")) {
      return;
    }
    const bounds = element.getBoundingClientRect();
    drag = { x: event.clientX, y: event.clientY, left: bounds.left, top: bounds.top };
    titlebar.setPointerCapture(event.pointerId);
  });

  titlebar.addEventListener("pointermove", (event) => {
    if (!drag) {
      return;
    }
    const position = snapPosition(
      drag.left + event.clientX - drag.x,
      drag.top + event.clientY - drag.y,
      element.offsetWidth,
      element.offsetHeight,
      element
    );
    element.style.left = `${position.left}px`;
    element.style.top = `${position.top}px`;
    onRegionsChange();
  });

  const finishDrag = () => {
    if (!drag) {
      return;
    }
    drag = null;
    const position = { left: element.offsetLeft, top: element.offsetTop };
    localStorage.setItem(positionStorageKey, JSON.stringify(position));
    onRegionsChange();
  };

  titlebar.addEventListener("pointerup", finishDrag);
  titlebar.addEventListener("pointercancel", finishDrag);
  closeButton.addEventListener("click", () => setVisible(false));
  fullscreenButton.addEventListener("click", () => void toggleFullscreen());
  previousModeButton.addEventListener("click", () => changeMode(-1));
  nextModeButton.addEventListener("click", () => changeMode(1));
  canvas.addEventListener("dblclick", () => void toggleFullscreen());
  window.addEventListener("keydown", (event) => {
    if (fullscreen && event.key === "Escape") {
      event.preventDefault();
      void toggleFullscreen();
    }
  }, true);

  setVisible(localStorage.getItem(visibilityStorageKey) !== "false");

  return {
    toggle() {
      setVisible(element.hidden);
    }
  };
}