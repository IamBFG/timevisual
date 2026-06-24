let ipcRenderer = {
  send: () => {}
};
try {
  const electron = require('electron');
  ipcRenderer = electron.ipcRenderer;
} catch (e) {
  console.log("Running in standard web browser mode (no electron).");
}

// --- State Variables ---
let totalDuration = 300; // 5 minutes default
let remainingTime = 300;
let isRunning = false;
let animationFrameId = null;
let endTime = null;

// Warnings
let w1Time = 20;
let w1Rate = 2.0;
let w2Time = 5;
let w2Rate = 0.5;
let soundEnabled = true;
let alarmEnabled = true;

// Visuals
let orientation = 'horizontal';
let positionPercent = 0; // 0 to 1000 (0% to 100% of screen height/width)
let thickness = 12;
let glow = 15;
let bgOpacity = 15; // out of 100
let theme = 'sunset';
let customColor = '#00ffcc';
let showText = false;
let textSize = 20;
let textPos = 'center';

// Interactive state
let ctrlPressed = false;
let isDragging = false;
let dragStartPos = 0;
let dragStartVal = 0;
let panelDragging = false;
let panelOffsetX = 0;
let panelOffsetY = 0;
let isMouseIgnored = false;

// Warning Tick scheduler
let nextTickTime = null;

// Web Audio API context
let audioCtx = null;

// --- DOM Elements ---
const timerBarContainer = document.getElementById('timer-bar-container');
const timerBarBg = document.getElementById('timer-bar-bg');
const timerBar = document.getElementById('timer-bar');
const timerText = document.getElementById('timer-text');
const settingsToggleBtn = document.getElementById('settings-toggle-btn');
const settingsPanel = document.getElementById('settings-panel');
const closePanelBtn = document.getElementById('close-panel-btn');
const dragOverlay = document.getElementById('drag-overlay');

// Inputs
const hoursInput = document.getElementById('hours-input');
const minutesInput = document.getElementById('minutes-input');
const secondsInput = document.getElementById('seconds-input');
const playPauseBtn = document.getElementById('play-pause-btn');
const resetBtn = document.getElementById('reset-btn');
const thicknessSlider = document.getElementById('thickness-slider');
const thicknessVal = document.getElementById('thickness-val');
const glowSlider = document.getElementById('glow-slider');
const glowVal = document.getElementById('glow-val');
const bgOpacitySlider = document.getElementById('bg-opacity-slider');
const bgOpacityVal = document.getElementById('bg-opacity-val');
const showTextCheckbox = document.getElementById('show-text-checkbox');
const textConfigDetails = document.getElementById('text-config-details');
const textSizeSlider = document.getElementById('text-size-slider');
const textSizeVal = document.getElementById('text-size-val');
const textPosSelect = document.getElementById('text-pos-select');
const customColorContainer = document.getElementById('custom-color-container');
const customColorPicker = document.getElementById('custom-color-picker');

// Warning Inputs
const w1TimeInput = document.getElementById('w1-time');
const w1RateInput = document.getElementById('w1-rate');
const w2TimeInput = document.getElementById('w2-time');
const w2RateInput = document.getElementById('w2-rate');
const soundCheckbox = document.getElementById('sound-checkbox');
const alarmCheckbox = document.getElementById('alarm-checkbox');

// Layout Inputs
const positionSlider = document.getElementById('position-slider');
const positionVal = document.getElementById('position-val');
const positionSliderLabel = document.getElementById('position-slider-label');

// Exit
const exitBtn = document.getElementById('exit-btn');

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  initEventListeners();
  updateUIFromState();
  
  // Initially, make window clickable since settings panel is open
  ipcRenderer.send('set-ignore-mouse-events', false);
});

// --- Settings Management (LocalStorage) ---
function loadSettings() {
  try {
    const saved = localStorage.getItem('timer_settings');
    if (saved) {
      const data = JSON.parse(saved);
      hoursInput.value = data.hours ?? 0;
      minutesInput.value = data.minutes ?? 5;
      secondsInput.value = data.seconds ?? 0;
      
      w1Time = data.w1Time ?? 20;
      w1Rate = parseFloat(data.w1Rate ?? 2.0);
      w2Time = data.w2Time ?? 5;
      w2Rate = parseFloat(data.w2Rate ?? 0.5);
      soundEnabled = data.soundEnabled ?? true;
      alarmEnabled = data.alarmEnabled ?? true;
      
      orientation = data.orientation ?? 'horizontal';
      positionPercent = data.positionPercent ?? 0;
      thickness = data.thickness ?? 12;
      glow = data.glow ?? 15;
      bgOpacity = data.bgOpacity ?? 15;
      theme = data.theme ?? 'sunset';
      customColor = data.customColor ?? '#00ffcc';
      showText = data.showText ?? false;
      textSize = data.textSize ?? 20;
      textPos = data.textPos ?? 'center';
    }
    
    // Sync UI elements to variable states
    w1TimeInput.value = w1Time;
    w1RateInput.value = w1Rate;
    w2TimeInput.value = w2Time;
    w2RateInput.value = w2Rate;
    soundCheckbox.checked = soundEnabled;
    alarmCheckbox.checked = alarmEnabled;
    thicknessSlider.value = thickness;
    glowSlider.value = glow;
    bgOpacitySlider.value = bgOpacity;
    showTextCheckbox.checked = showText;
    textSizeSlider.value = textSize;
    textPosSelect.value = textPos;
    customColorPicker.value = customColor;
    positionSlider.value = positionPercent;
    
    // Set radio buttons for orientation
    document.querySelectorAll('input[name="orientation"]').forEach(radio => {
      radio.checked = (radio.value === orientation);
    });

    // Set theme button active
    document.querySelectorAll('.theme-preset').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === theme);
    });
    
    calculateDuration();
  } catch (e) {
    console.error("Failed to load settings:", e);
  }
}

function saveSettings() {
  try {
    const data = {
      hours: parseInt(hoursInput.value) || 0,
      minutes: parseInt(minutesInput.value) || 0,
      seconds: parseInt(secondsInput.value) || 0,
      w1Time,
      w1Rate,
      w2Time,
      w2Rate,
      soundEnabled,
      alarmEnabled,
      orientation,
      positionPercent,
      thickness,
      glow,
      bgOpacity,
      theme,
      customColor,
      showText,
      textSize,
      textPos
    };
    localStorage.setItem('timer_settings', JSON.stringify(data));
  } catch (e) {
    console.error("Failed to save settings:", e);
  }
}

// --- Audio Synthesizer ---
function playTickSound() {
  if (!soundEnabled) return;
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'sine';
    // Higher tick frequency for Stage 2 (urgent)
    const isStage2 = remainingTime <= w2Time;
    osc.frequency.setValueAtTime(isStage2 ? 1000 : 700, audioCtx.currentTime);
    
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.04);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 0.05);
  } catch (e) {
    console.error("Audio tick error:", e);
  }
}

function playAlarmSound() {
  if (!alarmEnabled) return;
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const now = audioCtx.currentTime;
    // Play 3 double-beeps (chime sound)
    for (let i = 0; i < 3; i++) {
      const startTime = now + i * 0.45;
      
      // Low tone
      const osc1 = audioCtx.createOscillator();
      const gain1 = audioCtx.createGain();
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(880, startTime); // A5
      gain1.gain.setValueAtTime(0.12, startTime);
      gain1.gain.exponentialRampToValueAtTime(0.001, startTime + 0.15);
      osc1.connect(gain1);
      gain1.connect(audioCtx.destination);
      osc1.start(startTime);
      osc1.stop(startTime + 0.18);

      // High tone offset
      const startTime2 = startTime + 0.12;
      const osc2 = audioCtx.createOscillator();
      const gain2 = audioCtx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1174.66, startTime2); // D6
      gain2.gain.setValueAtTime(0.12, startTime2);
      gain2.gain.exponentialRampToValueAtTime(0.001, startTime2 + 0.2);
      osc2.connect(gain2);
      gain2.connect(audioCtx.destination);
      osc2.start(startTime2);
      osc2.stop(startTime2 + 0.25);
    }
  } catch (e) {
    console.error("Audio alarm error:", e);
  }
}

// --- Event Listeners Setup ---
function initEventListeners() {
  // Timer Actions
  playPauseBtn.addEventListener('click', toggleTimer);
  resetBtn.addEventListener('click', resetTimer);
  
  // Input changes
  hoursInput.addEventListener('change', () => { sanitizeInputs(); calculateDuration(); });
  minutesInput.addEventListener('change', () => { sanitizeInputs(); calculateDuration(); });
  secondsInput.addEventListener('change', () => { sanitizeInputs(); calculateDuration(); });
  
  // Presets
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const timeInSec = parseInt(btn.dataset.time);
      hoursInput.value = Math.floor(timeInSec / 3600);
      minutesInput.value = Math.floor((timeInSec % 3600) / 60);
      secondsInput.value = timeInSec % 60;
      calculateDuration();
      resetTimer();
    });
  });

  // Tabs Navigation
  document.querySelectorAll('.tab-btn').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      
      tab.classList.add('active');
      document.getElementById(tab.dataset.tab).classList.add('active');
    });
  });

  // Style Settings
  thicknessSlider.addEventListener('input', () => {
    thickness = parseInt(thicknessSlider.value);
    thicknessVal.textContent = thickness + 'px';
    updateUIFromState();
    saveSettings();
  });

  glowSlider.addEventListener('input', () => {
    glow = parseInt(glowSlider.value);
    glowVal.textContent = glow + 'px';
    updateUIFromState();
    saveSettings();
  });

  bgOpacitySlider.addEventListener('input', () => {
    bgOpacity = parseInt(bgOpacitySlider.value);
    bgOpacityVal.textContent = bgOpacity + '%';
    updateUIFromState();
    saveSettings();
  });

  showTextCheckbox.addEventListener('change', () => {
    showText = showTextCheckbox.checked;
    textConfigDetails.classList.toggle('hidden', !showText);
    timerText.classList.toggle('hidden', !showText);
    saveSettings();
  });

  textSizeSlider.addEventListener('input', () => {
    textSize = parseInt(textSizeSlider.value);
    textSizeVal.textContent = textSize + 'px';
    updateUIFromState();
    saveSettings();
  });

  textPosSelect.addEventListener('change', () => {
    textPos = textPosSelect.value;
    updateUIFromState();
    saveSettings();
  });

  // Color Preset Themes
  document.querySelectorAll('.theme-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.theme-preset').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      theme = btn.dataset.theme;
      
      customColorContainer.classList.toggle('hidden', theme !== 'solid');
      updateUIFromState();
      saveSettings();
    });
  });

  customColorPicker.addEventListener('input', () => {
    customColor = customColorPicker.value;
    updateUIFromState();
    saveSettings();
  });

  // Warning Settings
  w1TimeInput.addEventListener('change', () => {
    w1Time = Math.max(1, parseInt(w1TimeInput.value) || 20);
    w1TimeInput.value = w1Time;
    saveSettings();
  });
  w1RateInput.addEventListener('change', () => {
    w1Rate = Math.max(0.1, parseFloat(w1RateInput.value) || 2.0);
    w1RateInput.value = w1Rate;
    saveSettings();
  });
  w2TimeInput.addEventListener('change', () => {
    w2Time = Math.max(1, parseInt(w2TimeInput.value) || 5);
    w2TimeInput.value = w2Time;
    saveSettings();
  });
  w2RateInput.addEventListener('change', () => {
    w2Rate = Math.max(0.1, parseFloat(w2RateInput.value) || 0.5);
    w2RateInput.value = w2Rate;
    saveSettings();
  });
  soundCheckbox.addEventListener('change', () => {
    soundEnabled = soundCheckbox.checked;
    saveSettings();
  });
  alarmCheckbox.addEventListener('change', () => {
    alarmEnabled = alarmCheckbox.checked;
    saveSettings();
  });

  // Layout Settings
  document.querySelectorAll('input[name="orientation"]').forEach(radio => {
    radio.addEventListener('change', () => {
      orientation = radio.value;
      updateUIFromState();
      saveSettings();
    });
  });

  positionSlider.addEventListener('input', () => {
    positionPercent = parseInt(positionSlider.value);
    positionVal.textContent = Math.round(positionPercent / 10) + '%';
    updateUIFromState();
    saveSettings();
  });

  // Show/Hide settings panel
  closePanelBtn.addEventListener('click', hideSettingsPanel);
  settingsToggleBtn.addEventListener('click', showSettingsPanel);
  
  // Close / Exit App
  exitBtn.addEventListener('click', () => {
    window.close();
  });

  // Keyboard Shortcuts (Esc toggles settings)
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      toggleSettingsPanel();
    }
  });

  // --- Keyboard Ctrl Key Listener for Drag Overlay ---
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Control' && !ctrlPressed) {
      ctrlPressed = true;
      dragOverlay.classList.remove('hidden');
      ipcRenderer.send('set-ignore-mouse-events', false); // capture clicks
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.key === 'Control') {
      ctrlPressed = false;
      dragOverlay.classList.add('hidden');
      evalMouseIgnoreState(e.clientX, e.clientY);
    }
  });

  // Safety net if focus is lost
  window.addEventListener('blur', () => {
    ctrlPressed = false;
    dragOverlay.classList.add('hidden');
    ipcRenderer.send('set-ignore-mouse-events', settingsPanel.classList.contains('hidden'), { forward: true });
  });

  // --- Drag-and-Drop Positioning with Ctrl + LMB ---
  window.addEventListener('mousedown', (e) => {
    if (e.ctrlKey && e.button === 0) { // Ctrl + Left Click
      isDragging = true;
      dragStartPos = (orientation === 'horizontal') ? e.clientY : e.clientX;
      dragStartVal = positionPercent;
      updateDragGuides(e);
      e.preventDefault();
    }
  });

  window.addEventListener('mousemove', (e) => {
    // 1. Live dragging action
    if (isDragging) {
      const currentPos = (orientation === 'horizontal') ? e.clientY : e.clientX;
      const delta = currentPos - dragStartPos;
      const screenSize = (orientation === 'horizontal') ? window.innerHeight : window.innerWidth;
      
      const pctDelta = (delta / screenSize) * 1000;
      let newVal = Math.round(dragStartVal + pctDelta);
      newVal = Math.max(0, Math.min(1000, newVal)); // clamp 0-1000
      
      positionPercent = newVal;
      positionSlider.value = positionPercent;
      positionVal.textContent = Math.round(positionPercent / 10) + '%';
      
      updateUIFromState();
      updateDragGuides(e);
      saveSettings();
    }

    // 2. Mouse click-through management
    if (!isDragging && !panelDragging) {
      evalMouseIgnoreState(e.clientX, e.clientY);
    }
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
  });

  // --- Drag Settings Panel ---
  const panelHeader = document.querySelector('.panel-header');
  panelHeader.addEventListener('mousedown', (e) => {
    // Don't drag if click on close button or control inputs
    if (e.target.tagName !== 'BUTTON' && !e.ctrlKey) {
      panelDragging = true;
      const rect = settingsPanel.getBoundingClientRect();
      panelOffsetX = e.clientX - rect.left;
      panelOffsetY = e.clientY - rect.top;
      e.preventDefault();
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (panelDragging) {
      let left = e.clientX - panelOffsetX;
      let top = e.clientY - panelOffsetY;

      // Restrict within window bounds
      left = Math.max(0, Math.min(window.innerWidth - settingsPanel.offsetWidth, left));
      top = Math.max(0, Math.min(window.innerHeight - settingsPanel.offsetHeight, top));

      settingsPanel.style.transform = 'none';
      settingsPanel.style.left = left + 'px';
      settingsPanel.style.top = top + 'px';
    }
  });

  window.addEventListener('mouseup', () => {
    panelDragging = false;
  });
}

// Check if cursor is over interactive elements and toggle click-through
function evalMouseIgnoreState(x, y) {
  if (ctrlPressed) {
    if (isMouseIgnored) {
      ipcRenderer.send('set-ignore-mouse-events', false);
      isMouseIgnored = false;
    }
    return;
  }

  const barRect = timerBarContainer.getBoundingClientRect();
  const panelRect = settingsPanel.classList.contains('hidden') 
    ? { left: 0, right: 0, top: 0, bottom: 0 } 
    : settingsPanel.getBoundingClientRect();
  const toggleBtnRect = settingsToggleBtn.getBoundingClientRect();

  const isOverBar = (
    x >= barRect.left && x <= barRect.right &&
    y >= barRect.top && y <= barRect.bottom
  );
  
  const isOverPanel = (
    x >= panelRect.left && x <= panelRect.right &&
    y >= panelRect.top && y <= panelRect.bottom
  );

  const isOverToggleBtn = !settingsToggleBtn.classList.contains('hidden') && (
    x >= toggleBtnRect.left && x <= toggleBtnRect.right &&
    y >= toggleBtnRect.top && y <= toggleBtnRect.bottom
  );

  if (isOverBar || isOverPanel || isOverToggleBtn) {
    if (isMouseIgnored) {
      ipcRenderer.send('set-ignore-mouse-events', false);
      isMouseIgnored = false;
    }
  } else {
    if (!isMouseIgnored) {
      ipcRenderer.send('set-ignore-mouse-events', true, { forward: true });
      isMouseIgnored = true;
    }
  }
}

function updateDragGuides(e) {
  const hGuide = document.querySelector('.horizontal-guide');
  const vGuide = document.querySelector('.vertical-guide');
  if (orientation === 'horizontal') {
    hGuide.style.top = e.clientY + 'px';
    hGuide.style.display = 'block';
    vGuide.style.display = 'none';
  } else {
    vGuide.style.left = e.clientX + 'px';
    vGuide.style.display = 'block';
    hGuide.style.display = 'none';
  }
}

// --- Toggle / Panel Actions ---
function toggleSettingsPanel() {
  if (settingsPanel.classList.contains('hidden')) {
    showSettingsPanel();
  } else {
    hideSettingsPanel();
  }
}

function showSettingsPanel() {
  settingsPanel.classList.remove('hidden');
  settingsToggleBtn.classList.add('hidden');
  ipcRenderer.send('set-ignore-mouse-events', false); // clickable settings
  isMouseIgnored = false;
}

function hideSettingsPanel() {
  settingsPanel.classList.add('hidden');
  settingsToggleBtn.classList.remove('hidden');
  // Immediately evaluate click-through state
  ipcRenderer.send('set-ignore-mouse-events', true, { forward: true });
  isMouseIgnored = true;
}

// --- Timer Control Functions ---
function sanitizeInputs() {
  hoursInput.value = Math.max(0, Math.min(23, parseInt(hoursInput.value) || 0));
  minutesInput.value = Math.max(0, Math.min(59, parseInt(minutesInput.value) || 0));
  secondsInput.value = Math.max(0, Math.min(59, parseInt(secondsInput.value) || 0));
}

function calculateDuration() {
  const h = parseInt(hoursInput.value) || 0;
  const m = parseInt(minutesInput.value) || 0;
  const s = parseInt(secondsInput.value) || 0;
  totalDuration = h * 3600 + m * 60 + s;
  
  if (!isRunning) {
    remainingTime = totalDuration;
    updateBarPercentage(100);
    updateTextDisplay();
  }
}

function toggleTimer() {
  if (totalDuration <= 0) {
    calculateDuration();
    if (totalDuration <= 0) return;
  }

  if (isRunning) {
    // Pause
    isRunning = false;
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    playPauseBtn.querySelector('.btn-text').textContent = "Продолжить";
    playPauseBtn.querySelector('.btn-icon').textContent = "▶";
    playPauseBtn.classList.add('paused');
  } else {
    // Start / Resume
    isRunning = true;
    endTime = Date.now() + remainingTime * 1000;
    
    // Reset the warning tick scheduler
    nextTickTime = null;
    
    animationFrameId = requestAnimationFrame(tick);
    playPauseBtn.querySelector('.btn-text').textContent = "Пауза";
    playPauseBtn.querySelector('.btn-icon').textContent = "⏸";
    playPauseBtn.classList.remove('paused');
    
    // Resume audio context if needed
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }
}

function resetTimer() {
  isRunning = false;
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  
  timerBar.classList.remove('flash-tick');
  nextTickTime = null;
  
  calculateDuration();
  remainingTime = totalDuration;
  
  playPauseBtn.querySelector('.btn-text').textContent = "Старт";
  playPauseBtn.querySelector('.btn-icon').textContent = "▶";
  playPauseBtn.classList.remove('paused');
  
  updateBarPercentage(100);
  updateTextDisplay();
}

// The main loop
function tick() {
  if (!isRunning) return;

  const now = Date.now();
  remainingTime = (endTime - now) / 1000;

  if (remainingTime <= 0) {
    remainingTime = 0;
    isRunning = false;
    updateBarPercentage(0);
    updateTextDisplay();
    
    // Completion Effects
    playAlarmSound();
    triggerCompletionFlash();
    
    resetTimer();
    return;
  }

  // Update visual bar
  const percent = (remainingTime / totalDuration) * 100;
  updateBarPercentage(percent);
  updateTextDisplay();

  // Custom warning flash & audio ticks
  handleWarnings();

  animationFrameId = requestAnimationFrame(tick);
}

// Warning system: Stage 1 & Stage 2 scheduling
function handleWarnings() {
  let activeInterval = null;
  let activeWarningThreshold = null;

  if (remainingTime <= w2Time) {
    activeInterval = w2Rate;
    activeWarningThreshold = w2Time;
  } else if (remainingTime <= w1Time) {
    activeInterval = w1Rate;
    activeWarningThreshold = w1Time;
  }

  if (activeInterval !== null) {
    // If scheduler not initialized, or we transitioned from Stage 1 to Stage 2
    if (nextTickTime === null || (nextTickTime > w2Time && remainingTime <= w2Time)) {
      nextTickTime = Math.min(remainingTime, activeWarningThreshold);
    }

    if (remainingTime <= nextTickTime) {
      triggerWarningTick(activeInterval);
      
      // Calculate next tick (stepping back by interval)
      nextTickTime = nextTickTime - activeInterval;
      // Safety step to avoid duplicate triggers
      if (nextTickTime >= remainingTime) {
        nextTickTime = remainingTime - activeInterval;
      }
    }
  } else {
    // Not in warning zone, ensure class is removed
    timerBar.classList.remove('flash-tick');
    nextTickTime = null;
  }
}

// Triggers visual bar pulsing and play tick audio
function triggerWarningTick(rate) {
  playTickSound();

  // Reset and restart the keyframe animation
  timerBar.classList.remove('flash-tick');
  void timerBar.offsetWidth; // force browser layout reflow
  
  // Set duration of flashing glow. We want it to be visual for a portion of the interval.
  const flashDur = Math.max(0.1, Math.min(0.5, rate / 2));
  timerBar.style.setProperty('--flash-duration', flashDur + 's');
  timerBar.classList.add('flash-tick');
}

// Screen flash/burst when timer completes
function triggerCompletionFlash() {
  const flashOverlay = document.createElement('div');
  flashOverlay.style.position = 'absolute';
  flashOverlay.style.top = '0';
  flashOverlay.style.left = '0';
  flashOverlay.style.width = '100vw';
  flashOverlay.style.height = '100vh';
  flashOverlay.style.background = '#fff';
  flashOverlay.style.zIndex = '99999';
  flashOverlay.style.pointerEvents = 'none';
  flashOverlay.style.opacity = '0.8';
  flashOverlay.style.transition = 'opacity 0.8s ease-out';
  document.body.appendChild(flashOverlay);

  // Fade out and remove
  setTimeout(() => {
    flashOverlay.style.opacity = '0';
    setTimeout(() => {
      flashOverlay.remove();
    }, 800);
  }, 50);
}

// --- UI Updates ---
function updateBarPercentage(pct) {
  if (orientation === 'horizontal') {
    timerBar.style.width = pct + '%';
    timerBar.style.height = '100%';
  } else {
    timerBar.style.width = '100%';
    timerBar.style.height = pct + '%';
  }
}

function formatTime(seconds) {
  if (seconds <= 0) return "00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  
  let result = "";
  if (h > 0) {
    result += h + ":" + (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
  } else {
    result += (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
  }
  
  // Show decimals under 10 seconds for urgency
  if (seconds < 10 && seconds > 0) {
    const tenths = Math.floor((seconds % 1) * 10);
    result += "." + tenths;
  }
  return result;
}

function updateTextDisplay() {
  if (showText) {
    timerText.textContent = formatTime(remainingTime);
  }
}

function updateUIFromState() {
  const root = document.documentElement;
  
  // 1. Thickness
  root.style.setProperty('--bar-thickness', thickness + 'px');
  
  // 2. Glow
  root.style.setProperty('--bar-glow', glow + 'px');
  
  // 3. Background opacity
  root.style.setProperty('--bg-opacity', bgOpacity / 100);
  
  // 4. Text Size
  root.style.setProperty('--text-size', textSize + 'px');

  // 5. Theme Color
  let barColorVal = 'linear-gradient(90deg, #ff416c, #ff4b2b)';
  let glowColorVal = 'rgba(255, 75, 43, 0.5)';
  
  if (theme === 'sunset') {
    barColorVal = 'linear-gradient(90deg, #ff416c, #ff4b2b)';
    glowColorVal = 'rgba(255, 75, 43, 0.5)';
  } else if (theme === 'ocean') {
    barColorVal = 'linear-gradient(90deg, #00c6ff, #0072ff)';
    glowColorVal = 'rgba(0, 114, 255, 0.5)';
  } else if (theme === 'neon') {
    barColorVal = 'linear-gradient(90deg, #00ffff, #ff00ff)';
    glowColorVal = 'rgba(255, 0, 255, 0.5)';
  } else if (theme === 'forest') {
    barColorVal = 'linear-gradient(90deg, #11998e, #38ef7d)';
    glowColorVal = 'rgba(56, 239, 125, 0.5)';
  } else if (theme === 'gold') {
    barColorVal = 'linear-gradient(90deg, #f857a6, #ff5858)';
    glowColorVal = 'rgba(248, 87, 166, 0.5)';
  } else if (theme === 'solid') {
    barColorVal = customColor;
    glowColorVal = convertHexToRgba(customColor, 0.5);
  }
  
  root.style.setProperty('--bar-color', barColorVal);
  root.style.setProperty('--glow-color', glowColorVal);
  
  // 6. Text configuration position classes
  timerText.className = '';
  if (!showText) timerText.classList.add('hidden');
  timerText.classList.add('pos-' + textPos);

  // 7. Orientation layouts
  if (orientation === 'horizontal') {
    timerBarContainer.className = 'horizontal';
    positionSliderLabel.textContent = "Положение по вертикали (Y):";
    
    // Map position percentage to available screen height minus thickness
    const verticalPos = `calc( (${positionPercent} / 1000) * (100vh - var(--bar-thickness)) )`;
    timerBarContainer.style.top = verticalPos;
    timerBarContainer.style.left = '0';
  } else {
    timerBarContainer.className = 'vertical';
    positionSliderLabel.textContent = "Положение по горизонтали (X):";
    
    // Map position percentage to available screen width minus thickness
    const horizontalPos = `calc( (${positionPercent} / 1000) * (100vw - var(--bar-thickness)) )`;
    timerBarContainer.style.left = horizontalPos;
    timerBarContainer.style.top = '0';
  }

  // Update progress bar width/height percent
  const percent = (remainingTime / totalDuration) * 100;
  updateBarPercentage(percent);
}

// Utility to convert hex to RGBA for glow effects
function convertHexToRgba(hex, alpha) {
  hex = hex.replace('#', '');
  if (hex.length === 3) {
    hex = hex.split('').map(char => char + char).join('');
  }
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
