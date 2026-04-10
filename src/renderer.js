// ===== Constants =====
const PRESETS = {
  email:   { quality: '30', resolution: '720',      codec: 'h264', speed: 'fast',   audioCodec: 'aac', audioBitrate: '96k'  },
  youtube: { quality: '23', resolution: '1080',     codec: 'h264', speed: 'medium', audioCodec: 'aac', audioBitrate: '128k' },
  archive: { quality: '18', resolution: 'original', codec: 'h265', speed: 'slow',   audioCodec: 'aac', audioBitrate: '192k' },
  mobile:  { quality: '28', resolution: '720',      codec: 'h264', speed: 'medium', audioCodec: 'aac', audioBitrate: '96k'  },
};

const VIDEO_EXTS = new Set(['.mp4', '.mov', '.mkv', '.avi', '.webm', '.m4v', '.3gp']);

// ===== State =====
const state = {
  files: [],        // { id, path, name, size, info }
  outputFolder: null,
  settings: loadSettings(),
  running: false,
  nextId: 1,
};

// ===== DOM refs =====
const $ = (id) => document.getElementById(id);
const dropzone        = $('dropzone');
const queueSection    = $('queue-section');
const queueList       = $('queue-list');
const queueCount      = $('queue-count');
const batchSummary    = $('batch-summary');
const summarySaved    = $('summary-saved');
const summarySizes    = $('summary-sizes');
const btnCompress     = $('btn-compress');
const btnCancel       = $('btn-cancel');
const btnAddMore      = $('btn-add-more');
const btnClearAll     = $('btn-clear-all');
const btnBrowse       = $('btn-browse');
const fileInput       = $('file-input');
const btnSelectFolder = $('btn-select-folder');
const btnResetFolder  = $('btn-reset-folder');
const outputFolderLabel = $('output-folder-label');
const presetGrid        = $('preset-grid');
const speedControl      = $('speed-control');
const profileNameInput  = $('profile-name-input');
const btnSaveProfile    = $('btn-save-profile');
const profileListEl     = $('profile-list');
const advancedToggle    = $('advanced-toggle');
const advancedPanel     = $('advanced-panel');
const crfSlider         = $('crf-slider');
const crfValueDisplay   = $('crf-value-display');
const speedSelect       = $('speed-select');
const codecSelect       = $('codec-select');
const audioCodecSelect  = $('audio-codec-select');
const audioBitrateSelect = $('audio-bitrate-select');
const audioBitrateGroup = $('audio-bitrate-group');
const fpsSelect         = $('fps-select');
const customArgs        = $('custom-args');
const cmdPreview        = $('cmd-preview');

// ===== Init =====
applySettings(state.settings);
renderProfiles();
setupEventListeners();

function setupEventListeners() {
  // Drag & drop on dropzone
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('drag-over');
  });

  dropzone.addEventListener('dragleave', (e) => {
    if (!dropzone.contains(e.relatedTarget)) {
      dropzone.classList.remove('drag-over');
    }
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    const paths = Array.from(e.dataTransfer.files).map((f) => window.api.getFilePath(f));
    addFiles(paths);
  });

  // Also allow drop anywhere on app while queue is visible
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    if (state.running) return;
    const paths = Array.from(e.dataTransfer.files).map((f) => window.api.getFilePath(f));
    addFiles(paths);
  });

  async function pickFiles() {
    const paths = await window.api.openFiles();
    if (paths && paths.length) addFiles(paths);
  }

  btnBrowse.addEventListener('click', pickFiles);
  btnAddMore.addEventListener('click', pickFiles);

  btnClearAll.addEventListener('click', () => {
    if (state.running) return;
    state.files = [];
    renderQueue();
  });

  btnCompress.addEventListener('click', startCompression);
  btnCancel.addEventListener('click', () => window.api.cancelCompression());

  btnSelectFolder.addEventListener('click', async () => {
    const folder = await window.api.selectOutputFolder();
    if (folder) {
      state.outputFolder = folder;
      outputFolderLabel.textContent = truncatePath(folder, 22);
      btnResetFolder.classList.remove('hidden');
    }
  });

  btnResetFolder.addEventListener('click', () => {
    state.outputFolder = null;
    outputFolderLabel.textContent = 'Obok oryginału';
    btnResetFolder.classList.add('hidden');
  });

  // Presets
  presetGrid.querySelectorAll('.preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const preset = PRESETS[btn.dataset.preset];
      applySettings(preset);
      presetGrid.querySelectorAll('.preset-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Speed segmented control
  speedControl.querySelectorAll('.seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      speedControl.querySelectorAll('.seg-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.settings.speed = btn.dataset.value;
      saveSettings();
    });
  });

  // Quality / resolution / codec radios
  document.querySelectorAll('input[name="quality"]').forEach((r) => {
    r.addEventListener('change', () => {
      state.settings.quality = r.value;
      clearPresetHighlight();
      saveSettings();
    });
  });

  document.querySelectorAll('input[name="resolution"]').forEach((r) => {
    r.addEventListener('change', () => {
      state.settings.resolution = r.value;
      clearPresetHighlight();
      saveSettings();
    });
  });

  document.querySelectorAll('input[name="codec"]').forEach((r) => {
    r.addEventListener('change', () => {
      state.settings.codec = r.value;
      clearPresetHighlight();
      saveSettings();
    });
  });

  // ---- Profiles ----
  btnSaveProfile.addEventListener('click', () => {
    const name = profileNameInput.value.trim();
    if (!name) return;
    saveProfile(name, state.settings);
    profileNameInput.value = '';
    renderProfiles();
  });

  profileNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnSaveProfile.click();
  });

  // ---- Advanced panel ----
  advancedToggle.addEventListener('click', () => {
    const open = advancedPanel.classList.toggle('hidden') === false;
    advancedToggle.classList.toggle('open', open);
    setBasicControlsDisabled(open);
    if (open) updateCmdPreview();
  });

  crfSlider.addEventListener('input', () => {
    state.settings.quality = crfSlider.value;
    crfValueDisplay.textContent = crfSlider.value;
    // sync quality radio if matching
    const matching = document.querySelector(`input[name="quality"][value="${crfSlider.value}"]`);
    document.querySelectorAll('input[name="quality"]').forEach((r) => (r.checked = false));
    if (matching) matching.checked = true;
    clearPresetHighlight();
    updateCmdPreview();
    saveSettings();
  });

  speedSelect.addEventListener('change', () => {
    state.settings.speed = speedSelect.value;
    // sync segmented control
    speedControl.querySelectorAll('.seg-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.value === speedSelect.value);
    });
    clearPresetHighlight();
    updateCmdPreview();
    saveSettings();
  });

  codecSelect.addEventListener('change', () => {
    state.settings.codec = codecSelect.value;
    // sync radio
    const r = document.querySelector(`input[name="codec"][value="${codecSelect.value}"]`);
    document.querySelectorAll('input[name="codec"]').forEach((x) => (x.checked = false));
    if (r) r.checked = true;
    clearPresetHighlight();
    updateCmdPreview();
    saveSettings();
  });

  audioCodecSelect.addEventListener('change', () => {
    state.settings.audioCodec = audioCodecSelect.value;
    const noBitrate = audioCodecSelect.value === 'copy' || audioCodecSelect.value === 'none';
    audioBitrateGroup.classList.toggle('hidden', noBitrate);
    updateCmdPreview();
    saveSettings();
  });

  audioBitrateSelect.addEventListener('change', () => {
    state.settings.audioBitrate = audioBitrateSelect.value;
    updateCmdPreview();
    saveSettings();
  });

  fpsSelect.addEventListener('change', () => {
    state.settings.fps = fpsSelect.value;
    updateCmdPreview();
    saveSettings();
  });

  customArgs.addEventListener('input', () => {
    state.settings.customArgs = customArgs.value.trim();
    updateCmdPreview();
    saveSettings();
  });

  // IPC listeners
  window.api.onProgress(({ id, percent }) => {
    updateItemProgress(id, percent);
  });

  window.api.onDone(({ id, outputPath, originalSize, compressedSize }) => {
    updateItemDone(id, outputPath, originalSize, compressedSize);
  });

  window.api.onError(({ id, error }) => {
    updateItemError(id, error);
  });
}

// ===== File management =====
async function addFiles(paths) {
  const validPaths = paths.filter((p) => {
    if (!p) return false;
    const ext = p.slice(p.lastIndexOf('.')).toLowerCase();
    return VIDEO_EXTS.has(ext);
  });

  if (!validPaths.length) return;

  // Deduplicate
  const existingPaths = new Set(state.files.map((f) => f.path));
  const newPaths = validPaths.filter((p) => !existingPaths.has(p));

  for (const filePath of newPaths) {
    const name = filePath.split('/').pop();
    const id = state.nextId++;
    const entry = { id, path: filePath, name, size: 0, info: null };
    state.files.push(entry);
    renderQueue();

    // Fetch info asynchronously
    window.api.getFileInfo(filePath).then((info) => {
      entry.size = info.size || 0;
      entry.info = info;
      updateItemInfo(id, entry);
    }).catch(() => {});
  }

  renderQueue();
  batchSummary.classList.add('hidden');
}

// ===== Compression =====
function startCompression() {
  if (!state.files.length || state.running) return;
  state.running = true;

  const options = {
    crf: parseInt(state.settings.quality, 10),
    codec: state.settings.codec,
    resolution: state.settings.resolution,
    preset: state.settings.speed,
    audioCodec: state.settings.audioCodec || 'aac',
    audioBitrate: state.settings.audioBitrate || '96k',
    customArgs: state.settings.customArgs || '',
    fps: state.settings.fps || 'original',
    profileName: state.settings.profileName || '',
    outputFolder: state.outputFolder || null,
  };

  // Reset items to waiting
  state.files.forEach((f) => setItemStatus(f.id, 'waiting', 0));
  batchSummary.classList.add('hidden');

  btnCompress.classList.add('hidden');
  btnCancel.classList.remove('hidden');
  btnAddMore.disabled = true;
  btnClearAll.disabled = true;

  window.api.startCompression(
    state.files.map((f) => ({ id: f.id, path: f.path })),
    options
  );

  // Poll for completion
  checkCompletionLoop();
}

function checkCompletionLoop() {
  const interval = setInterval(() => {
    const allDone = state.files.every((f) => {
      const item = queueList.querySelector(`[data-id="${f.id}"]`);
      if (!item) return false;
      const badge = item.querySelector('.status-badge');
      return badge && (badge.classList.contains('done') || badge.classList.contains('error'));
    });

    if (allDone) {
      clearInterval(interval);
      finishCompression();
    }
  }, 500);
}

function finishCompression() {
  state.running = false;
  btnCompress.classList.remove('hidden');
  btnCancel.classList.add('hidden');
  btnAddMore.disabled = false;
  btnClearAll.disabled = false;

  showBatchSummary();
}

function showBatchSummary() {
  let totalOriginal = 0;
  let totalCompressed = 0;
  let hasDone = false;

  state.files.forEach((f) => {
    const item = queueList.querySelector(`[data-id="${f.id}"]`);
    if (!item) return;
    const orig = parseInt(item.dataset.originalSize || '0', 10);
    const comp = parseInt(item.dataset.compressedSize || '0', 10);
    if (comp > 0) {
      totalOriginal += orig;
      totalCompressed += comp;
      hasDone = true;
    }
  });

  if (!hasDone) return;

  const saved = totalOriginal - totalCompressed;
  const pct = totalOriginal > 0 ? Math.round((saved / totalOriginal) * 100) : 0;

  summarySaved.textContent = `${formatBytes(saved)} (${pct}%)`;
  summarySizes.textContent = `${formatBytes(totalOriginal)} → ${formatBytes(totalCompressed)}`;
  batchSummary.classList.remove('hidden');
}

// ===== Render =====
function renderQueue() {
  if (!state.files.length) {
    dropzone.classList.remove('hidden');
    queueSection.classList.add('hidden');
    btnCompress.disabled = true;
    return;
  }

  dropzone.classList.add('hidden');
  queueSection.classList.remove('hidden');
  btnCompress.disabled = false;

  queueCount.textContent = `${state.files.length} ${state.files.length === 1 ? 'plik' : state.files.length < 5 ? 'pliki' : 'plików'}`;

  // Rebuild only new items
  const existingIds = new Set(
    Array.from(queueList.querySelectorAll('.queue-item')).map((el) => parseInt(el.dataset.id, 10))
  );

  state.files.forEach((f) => {
    if (!existingIds.has(f.id)) {
      queueList.appendChild(createQueueItem(f));
    }
  });

  // Remove items not in state
  queueList.querySelectorAll('.queue-item').forEach((el) => {
    const id = parseInt(el.dataset.id, 10);
    if (!state.files.find((f) => f.id === id)) {
      el.remove();
    }
  });
}

function createQueueItem(file) {
  const div = document.createElement('div');
  div.className = 'queue-item';
  div.dataset.id = file.id;
  div.dataset.originalSize = '0';
  div.dataset.compressedSize = '0';

  div.innerHTML = `
    <div class="queue-item-header">
      <span class="queue-item-name" title="${escapeHtml(file.path)}">${escapeHtml(file.name)}</span>
      <span class="queue-item-meta">${file.size ? formatBytes(file.size) : '…'}</span>
      <span class="status-badge waiting">oczekuje</span>
      <div class="queue-item-actions">
        <button class="btn-icon btn-remove" title="Usuń">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    </div>
    <div class="queue-item-info"></div>
    <div class="progress-bar-wrap">
      <div class="progress-bar-fill" style="width:0%"></div>
    </div>
  `;

  div.querySelector('.btn-remove').addEventListener('click', () => {
    if (state.running) return;
    state.files = state.files.filter((f) => f.id !== file.id);
    renderQueue();
  });

  return div;
}

function updateItemInfo(id, file) {
  const item = queueList.querySelector(`[data-id="${id}"]`);
  if (!item) return;

  item.querySelector('.queue-item-meta').textContent = file.size ? formatBytes(file.size) : '';
  item.dataset.originalSize = file.size || 0;

  const infoEl = item.querySelector('.queue-item-info');
  if (file.info && file.info.video) {
    const v = file.info.video;
    const dur = formatDuration(file.info.duration);
    const fps = v.fps ? Math.round(parseFraction(v.fps)) : '?';
    infoEl.innerHTML = `
      <span class="info-tag">${v.width}×${v.height}</span>
      <span class="info-tag">${v.codec.toUpperCase()}</span>
      <span class="info-tag">${fps} fps</span>
      <span class="info-tag">${dur}</span>
    `;
  }
}

function setItemStatus(id, status, percent) {
  const item = queueList.querySelector(`[data-id="${id}"]`);
  if (!item) return;
  const badge = item.querySelector('.status-badge');
  const fill = item.querySelector('.progress-bar-fill');

  badge.className = `status-badge ${status}`;
  const labels = { waiting: 'oczekuje', compressing: `${percent}%`, done: 'gotowe', error: 'błąd' };
  badge.textContent = labels[status] || status;

  fill.style.width = `${percent}%`;
  fill.classList.toggle('success', status === 'done');
  fill.classList.toggle('error', status === 'error');
}

function updateItemProgress(id, percent) {
  setItemStatus(id, 'compressing', percent);
}

function updateItemDone(id, outputPath, originalSize, compressedSize) {
  const item = queueList.querySelector(`[data-id="${id}"]`);
  if (!item) return;

  item.dataset.compressedSize = compressedSize;
  setItemStatus(id, 'done', 100);

  const saved = originalSize - compressedSize;
  const pct = originalSize > 0 ? Math.round((saved / originalSize) * 100) : 0;
  const grown = compressedSize > originalSize;

  const infoEl = item.querySelector('.queue-item-info');
  const sizeHtml = `
    <span class="size-comparison">
      ${formatBytes(originalSize)} → <strong>${formatBytes(compressedSize)}</strong>
      <span class="${grown ? 'size-grown' : 'size-saved'}">
        ${grown ? '⚠️ +' : ''}${grown ? formatBytes(compressedSize - originalSize) : formatBytes(saved)} (${grown ? '+' : '-'}${Math.abs(pct)}%)
      </span>
    </span>
  `;
  infoEl.innerHTML = sizeHtml + `<button class="btn btn-ghost btn-xs btn-open-finder">Otwórz w Finderze</button>`;
  infoEl.querySelector('.btn-open-finder').addEventListener('click', () => {
    window.api.openInFinder(outputPath);
  });
}

function updateItemError(id, error) {
  const item = queueList.querySelector(`[data-id="${id}"]`);
  if (!item) return;
  setItemStatus(id, 'error', 0);

  const infoEl = item.querySelector('.queue-item-info');
  infoEl.innerHTML = `<span style="color:var(--error);font-size:11px">${escapeHtml(error)}</span>`;

  // Retry button
  const actionsEl = item.querySelector('.queue-item-actions');
  const retryBtn = document.createElement('button');
  retryBtn.className = 'btn-icon';
  retryBtn.title = 'Retry';
  retryBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.15"/></svg>`;
  retryBtn.addEventListener('click', () => {
    if (state.running) return;
    const file = state.files.find((f) => f.id === id);
    if (file) {
      setItemStatus(id, 'waiting', 0);
    }
  });
  actionsEl.prepend(retryBtn);
}

// ===== Panel switching =====
function setBasicControlsDisabled(disabled) {
  const basicPanel = document.getElementById('basic-settings-panel');
  basicPanel.classList.toggle('panel-disabled', disabled);
  basicPanel.querySelectorAll('input, button').forEach((el) => {
    el.disabled = disabled;
  });
}

// ===== Settings =====
function applySettings(s) {
  state.settings = { ...state.settings, ...s };

  // Basic panel
  const qualityRadio = document.querySelector(`input[name="quality"][value="${s.quality}"]`);
  if (qualityRadio) qualityRadio.checked = true;

  const resRadio = document.querySelector(`input[name="resolution"][value="${s.resolution}"]`);
  if (resRadio) resRadio.checked = true;

  const codecRadio = document.querySelector(`input[name="codec"][value="${s.codec}"]`);
  if (codecRadio) codecRadio.checked = true;

  speedControl.querySelectorAll('.seg-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.value === s.speed);
  });

  // Advanced panel
  crfSlider.value = s.quality || '23';
  crfValueDisplay.textContent = s.quality || '23';

  if (s.speed) speedSelect.value = s.speed;
  if (s.codec) codecSelect.value = s.codec;
  if (s.audioCodec) {
    audioCodecSelect.value = s.audioCodec;
    const noBitrate = s.audioCodec === 'copy' || s.audioCodec === 'none';
    audioBitrateGroup.classList.toggle('hidden', noBitrate);
  }
  if (s.audioBitrate) audioBitrateSelect.value = s.audioBitrate;
  if (s.fps) fpsSelect.value = s.fps;
  if (s.customArgs !== undefined) customArgs.value = s.customArgs;

  updateCmdPreview();
  saveSettings();
}

function updateCmdPreview() {
  const s = state.settings;
  const codecMap = { h264: 'libx264', h265: 'libx265', vp9: 'libvpx-vp9' };
  const vc = codecMap[s.codec] || 'libx264';
  const audioNone = s.audioCodec === 'none';
  const audioCopy = s.audioCodec === 'copy';

  let parts = ['ffmpeg', '-i', '<input>'];
  parts.push('-vcodec', vc);
  parts.push('-crf', s.quality || '23');
  if (s.codec !== 'vp9') parts.push('-preset', s.speed || 'medium');
  if (s.resolution && s.resolution !== 'original') parts.push('-vf', `scale=-2:${s.resolution}`);
  if (s.fps && s.fps !== 'original') parts.push('-r', s.fps);
  if (audioNone) {
    parts.push('-an');
  } else if (audioCopy) {
    parts.push('-acodec', 'copy');
  } else {
    const acMap = { aac: 'aac', mp3: 'libmp3lame', opus: 'libopus' };
    parts.push('-acodec', acMap[s.audioCodec] || 'aac');
    parts.push('-b:a', s.audioBitrate || '96k');
  }
  if (s.customArgs) parts.push(...s.customArgs.split(' ').filter(Boolean));
  parts.push('<output>');

  cmdPreview.textContent = parts.join(' ');
}

function clearPresetHighlight() {
  presetGrid.querySelectorAll('.preset-btn').forEach((b) => b.classList.remove('active'));
}

function loadSettings() {
  try {
    const raw = localStorage.getItem('vs-settings');
    if (raw) return JSON.parse(raw);
  } catch {}
  return PRESETS.mobile;
}

function saveSettings() {
  try {
    localStorage.setItem('vs-settings', JSON.stringify(state.settings));
  } catch {}
}

// ===== Profiles =====
function loadProfiles() {
  try {
    return JSON.parse(localStorage.getItem('vs-profiles') || '[]');
  } catch { return []; }
}

function saveProfile(name, settings) {
  const profiles = loadProfiles().filter((p) => p.name !== name);
  profiles.unshift({ name, settings: { ...settings, profileName: name } });
  localStorage.setItem('vs-profiles', JSON.stringify(profiles.slice(0, 20)));
}

function deleteProfile(name) {
  const profiles = loadProfiles().filter((p) => p.name !== name);
  localStorage.setItem('vs-profiles', JSON.stringify(profiles));
}

function settingsTag(s) {
  const res = s.resolution && s.resolution !== 'original' ? `${s.resolution}p` : 'orig';
  return `${s.codec} · CRF${s.quality} · ${res}`;
}

function renderProfiles() {
  const profiles = loadProfiles();
  profileListEl.innerHTML = '';

  if (!profiles.length) {
    profileListEl.innerHTML = '<span style="font-size:11px;color:var(--text-muted);padding:2px 0">Brak zapisanych profili</span>';
    return;
  }

  profiles.forEach(({ name, settings }) => {
    const row = document.createElement('div');
    row.className = 'profile-item';
    row.innerHTML = `
      <span class="profile-item-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
      <span class="profile-item-tag">${escapeHtml(settingsTag(settings))}</span>
      <button class="btn-icon btn-load-profile" title="Wczytaj">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
      <button class="btn-icon btn-delete-profile" title="Usuń">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    `;

    row.querySelector('.btn-load-profile').addEventListener('click', () => {
      applySettings(settings);
      clearPresetHighlight();
      // Highlight active profile
      profileListEl.querySelectorAll('.profile-item').forEach((el) => el.classList.remove('active'));
      row.classList.add('active');
    });

    row.querySelector('.btn-delete-profile').addEventListener('click', () => {
      deleteProfile(name);
      renderProfiles();
    });

    profileListEl.appendChild(row);
  });
}

// ===== Utils =====
function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let val = bytes;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDuration(seconds) {
  if (!seconds) return '?';
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

function truncatePath(p, maxLen) {
  if (p.length <= maxLen) return p;
  return '…' + p.slice(-(maxLen - 1));
}

function parseFraction(str) {
  const parts = String(str).split('/');
  if (parts.length === 2) return Number(parts[0]) / Number(parts[1]);
  return Number(str);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
