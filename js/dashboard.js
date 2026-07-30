/**
 * ============================================================================
 * DASHBOARD (employee page controller)
 * ============================================================================
 */
(() => {
  const $ = (id) => document.getElementById(id);
  const STATUS_OPTIONS = ['Working', 'Inventory Counting', 'Picking', 'Packing', 'Meeting', 'Break', 'Lunch', 'Travel', 'Idle'];
  const STATUS_ICONS = { Working: 'engineering', 'Inventory Counting': 'inventory_2', Picking: 'shopping_basket', Packing: 'inventory', Meeting: 'groups', Break: 'free_breakfast', Lunch: 'lunch_dining', Travel: 'directions_car', Idle: 'pause_circle' };

  let profile = null;
  let currentTask = null;
  let locationTimer = null;
  let clockTimer = null;
  let loginTimeCache = null;
  let cameras = {}; // per-modal active MediaStream

  // -------------------------------------------------------------------
  // Init
  // -------------------------------------------------------------------
  async function init() {
    profile = Api.getProfile();
    if (!Api.getToken() || !profile || profile.role !== 'employee') {
      window.location.href = 'index.html';
      return;
    }
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js').catch(() => {});

    applyTheme();
    $('themeToggle').addEventListener('click', toggleTheme);

    $('employeeName').textContent = profile.name;
    $('avatarInitial').textContent = (profile.name || '?').charAt(0).toUpperCase();

    bindActionButtons();
    bindModalCloses();
    startClock();
    await loadDashboard();
    startLocationTracking();

    window.addEventListener('online', updateOfflineBanner);
    window.addEventListener('offline', updateOfflineBanner);
    updateOfflineBanner();
  }

  function updateOfflineBanner() {
    $('offlineBanner').classList.toggle('show', !navigator.onLine);
  }

  function applyTheme() {
    const dark = localStorage.getItem('wt_theme') === 'dark';
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    $('themeToggle').querySelector('.material-icons').textContent = dark ? 'light_mode' : 'dark_mode';
  }
  function toggleTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    localStorage.setItem('wt_theme', isDark ? 'light' : 'dark');
    applyTheme();
  }

  // -------------------------------------------------------------------
  // Clock + live working hours
  // -------------------------------------------------------------------
  function startClock() {
    tick();
    clockTimer = setInterval(tick, 1000);
  }
  function tick() {
    const now = new Date();
    $('currentTime').textContent = Utils.formatTime(now);
    $('currentDate').textContent = Utils.formatDate(now);
    if (loginTimeCache) {
      const hrs = (now - new Date(loginTimeCache)) / 3600000;
      $('workingHours').textContent = Utils.hoursMinutes(hrs);
    }
  }

  // -------------------------------------------------------------------
  // Load dashboard data from server
  // -------------------------------------------------------------------
  async function loadDashboard() {
    const res = await Api.call('getDashboard');
    if (!res.success) {
      Utils.toast(res.error || 'Could not load dashboard.', 'error');
      return;
    }
    const d = res.data;
    loginTimeCache = d.loginTime;
    $('loginTimeValue').textContent = Utils.formatTime(d.loginTime);
    $('completedTasks').textContent = `${d.todayCompletedTasks}/${d.todayTotalTasks}`;
    setStatusBadge(d.status);
    currentTask = d.currentTask;
    renderCurrentTask();
    tick();
    refreshGpsBadge();
  }

  function setStatusBadge(status) {
    const badge = $('statusBadge');
    badge.innerHTML = `<span class="badge-dot"></span> ${status || '—'}`;
    badge.className = 'badge ' + (status === 'Logged Out' ? 'badge-danger' : status === 'Break' || status === 'Lunch' ? 'badge-warning' : 'badge-success');
  }

  function renderCurrentTask() {
    const card = $('currentTaskCard');
    if (currentTask) {
      card.style.display = 'block';
      $('currentTaskName').textContent = currentTask.TaskName || currentTask.TaskType;
      $('currentTaskDesc').textContent = currentTask.Description || '';
    } else {
      card.style.display = 'none';
    }
  }

  async function refreshGpsBadge() {
    try {
      const pos = await Utils.getCurrentPosition();
      $('gpsStatusValue').textContent = `±${Math.round(pos.accuracy)}m`;
    } catch (e) {
      $('gpsStatusValue').textContent = 'Unavailable';
    }
  }

  // -------------------------------------------------------------------
  // Location tracking every 60s while logged in
  // -------------------------------------------------------------------
  function startLocationTracking() {
    pingOnce();
    locationTimer = setInterval(pingOnce, window.APP_CONFIG.LOCATION_PING_INTERVAL_MS);
  }
  async function pingOnce() {
    try {
      const pos = await Utils.getCurrentPosition();
      $('gpsStatusValue').textContent = `±${Math.round(pos.accuracy)}m`;
      await Api.call('pingLocation', pos);
    } catch (e) { /* GPS temporarily unavailable — silently skip this tick */ }
  }

  // -------------------------------------------------------------------
  // Modal plumbing
  // -------------------------------------------------------------------
  function openModal(id) { $(id).classList.add('open'); }
  function closeModal(id) {
    $(id).classList.remove('open');
    Object.keys(cameras).forEach((k) => { if (k.startsWith(id)) { Utils.stopCamera(cameras[k]); delete cameras[k]; } });
  }
  function bindModalCloses() {
    document.querySelectorAll('[data-close]').forEach((btn) => {
      btn.addEventListener('click', () => closeModal(btn.dataset.close));
    });
    document.querySelectorAll('.overlay').forEach((ov) => {
      ov.addEventListener('click', (e) => { if (e.target === ov) closeModal(ov.id); });
    });
  }

  function bindActionButtons() {
    $('btnStartTask').addEventListener('click', () => openModal('modalStartTask'));
    $('btnCompleteTask').addEventListener('click', openCompleteModal);
    $('btnSnapshot').addEventListener('click', () => openModal('modalSnapshot'));
    $('btnStatus').addEventListener('click', openStatusModal);
    $('btnLunchOut').addEventListener('click', doLunchOut);
    $('btnLunchIn').addEventListener('click', doLunchIn);
    $('btnHistory').addEventListener('click', openHistoryModal);
    $('btnLogout').addEventListener('click', doLogout);

    // Start Task camera + submit
    $('taskStartCam').addEventListener('click', () => genericStartCamera('task', 'environment'));
    $('taskCapture').addEventListener('click', () => genericCapture('task'));
    $('submitStartTask').addEventListener('click', submitStartTask);

    // Complete Task camera + submit
    $('completeStartCam').addEventListener('click', () => genericStartCamera('complete', 'environment'));
    $('completeCapture').addEventListener('click', () => genericCapture('complete'));
    $('submitCompleteTask').addEventListener('click', submitCompleteTask);

    // Snapshot camera + submit
    $('snapStartCam').addEventListener('click', () => genericStartCamera('snap', 'environment'));
    $('snapCapture').addEventListener('click', () => genericCapture('snap'));
    $('submitSnapshot').addEventListener('click', submitSnapshot);
  }

  // Generic camera helper shared by Start Task / Complete Task / Snapshot modals.
  const photoData = {};
  async function genericStartCamera(prefix, facing) {
    try {
      cameras[prefix] = await Utils.startCamera($(`${prefix}Video`), facing);
      $(`${prefix}CameraPlaceholder`).style.display = 'none';
      $(`${prefix}Video`).style.display = 'block';
      $(`${prefix}PhotoPreview`).style.display = 'none';
      $(`${prefix}Capture`).disabled = false;
    } catch (e) {
      Utils.toast('Camera access denied.', 'error');
    }
  }
  async function genericCapture(prefix) {
    const raw = Utils.captureFrame($(`${prefix}Video`));
    photoData[prefix] = await Utils.compressImage(raw);
    $(`${prefix}PhotoPreview`).src = photoData[prefix];
    $(`${prefix}PhotoPreview`).style.display = 'block';
    $(`${prefix}Video`).style.display = 'none';
    Utils.stopCamera(cameras[prefix]);
    if (prefix === 'snap') $('submitSnapshot').disabled = false;
  }

  // -------------------------------------------------------------------
  // Start Task
  // -------------------------------------------------------------------
  async function submitStartTask() {
    const btn = $('submitStartTask');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Starting…';
    let pos = {};
    try { pos = await Utils.getCurrentPosition(); } catch (e) { /* proceed without GPS if denied mid-session */ }

    const res = await Api.call('startTask', {
      taskType: $('taskType').value,
      taskName: $('taskName').value.trim(),
      description: $('taskDesc').value.trim(),
      photo: photoData.task || null,
      lat: pos.lat, lng: pos.lng
    });
    btn.disabled = false; btn.innerHTML = '<span class="material-icons">play_circle</span> Start Task';

    if (res.queued) { Utils.toast('Offline — task queued, will sync.', 'warning'); closeModal('modalStartTask'); return; }
    if (!res.success) { Utils.toast(res.error, 'error'); return; }
    Utils.toast('Task started.', 'success');
    closeModal('modalStartTask');
    resetTaskForm();
    loadDashboard();
  }
  function resetTaskForm() {
    $('taskName').value = ''; $('taskDesc').value = '';
    photoData.task = null;
    $('taskPhotoPreview').style.display = 'none';
    $('taskCameraPlaceholder').style.display = 'flex';
    $('taskCapture').disabled = true;
  }

  // -------------------------------------------------------------------
  // Complete Task
  // -------------------------------------------------------------------
  function openCompleteModal() {
    openModal('modalCompleteTask');
    const has = !!currentTask;
    $('noActiveTaskMsg').style.display = has ? 'none' : 'block';
    $('completeTaskForm').style.display = has ? 'block' : 'none';
  }
  async function submitCompleteTask() {
    if (!currentTask) return;
    const btn = $('submitCompleteTask');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Completing…';

    const res = await Api.call('completeTask', {
      taskId: currentTask.TaskID,
      remarks: $('completeRemarks').value.trim(),
      photo: photoData.complete || null
    });
    btn.disabled = false; btn.innerHTML = '<span class="material-icons">check_circle</span> Mark Complete';

    if (res.queued) { Utils.toast('Offline — will sync.', 'warning'); closeModal('modalCompleteTask'); return; }
    if (!res.success) { Utils.toast(res.error, 'error'); return; }
    Utils.toast('Task completed.', 'success');
    closeModal('modalCompleteTask');
    $('completeRemarks').value = ''; photoData.complete = null;
    $('completePhotoPreview').style.display = 'none';
    $('completeCameraPlaceholder').style.display = 'flex';
    loadDashboard();
  }

  // -------------------------------------------------------------------
  // Snapshot
  // -------------------------------------------------------------------
  async function submitSnapshot() {
    const btn = $('submitSnapshot');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Uploading…';
    let pos = {};
    try { pos = await Utils.getCurrentPosition(); } catch (e) {}

    const res = await Api.call('uploadSnapshot', { photo: photoData.snap, lat: pos.lat, lng: pos.lng });
    btn.disabled = false; btn.innerHTML = '<span class="material-icons">cloud_upload</span> Upload';

    if (res.queued) { Utils.toast('Offline — will sync.', 'warning'); closeModal('modalSnapshot'); return; }
    if (!res.success) { Utils.toast(res.error, 'error'); return; }
    Utils.toast('Snapshot uploaded.', 'success');
    closeModal('modalSnapshot');
    photoData.snap = null; $('snapPhotoPreview').style.display = 'none';
    $('snapCameraPlaceholder').style.display = 'flex'; $('submitSnapshot').disabled = true;
  }

  // -------------------------------------------------------------------
  // Status
  // -------------------------------------------------------------------
  function openStatusModal() {
    const list = $('statusOptionsList');
    list.innerHTML = STATUS_OPTIONS.map((s) => `
      <button class="btn btn-outline" data-status="${s}" style="justify-content:flex-start;">
        <span class="material-icons">${STATUS_ICONS[s] || 'circle'}</span> ${s}
      </button>`).join('');
    list.querySelectorAll('[data-status]').forEach((b) => b.addEventListener('click', () => setStatus(b.dataset.status)));
    openModal('modalStatus');
  }
  async function setStatus(status) {
    const res = await Api.call('updateStatus', { status });
    if (res.queued) { Utils.toast('Offline — status queued.', 'warning'); closeModal('modalStatus'); return; }
    if (!res.success) { Utils.toast(res.error, 'error'); return; }
    setStatusBadge(status);
    Utils.toast('Status updated to ' + status, 'success');
    closeModal('modalStatus');
  }

  // -------------------------------------------------------------------
  // Lunch
  // -------------------------------------------------------------------
  async function doLunchOut() {
    let pos = {};
    try { pos = await Utils.getCurrentPosition(); } catch (e) {}
    const res = await Api.call('lunchOut', pos);
    if (!res.success && !res.queued) { Utils.toast(res.error, 'error'); return; }
    Utils.toast(res.queued ? 'Queued — lunch out.' : 'Lunch break started.', 'success');
    setStatusBadge('Lunch');
  }
  async function doLunchIn() {
    let pos = {};
    try { pos = await Utils.getCurrentPosition(); } catch (e) {}
    const res = await Api.call('lunchIn', pos);
    if (!res.success && !res.queued) { Utils.toast(res.error, 'error'); return; }
    Utils.toast(res.queued ? 'Queued — lunch in.' : `Back from lunch (${res.data.durationMinutes || 0} min).`, 'success');
    setStatusBadge('Working');
  }

  // -------------------------------------------------------------------
  // History
  // -------------------------------------------------------------------
  async function openHistoryModal() {
    openModal('modalHistory');
    document.querySelectorAll('[data-htab]').forEach((b) => b.addEventListener('click', () => renderHistoryTab(b.dataset.htab, cachedHistory)));
    const res = await Api.call('getHistory');
    if (!res.success) { $('historyContent').innerHTML = `<p class="muted">${res.error}</p>`; return; }
    cachedHistory = res.data;
    renderHistoryTab('attendance', cachedHistory);
  }
  let cachedHistory = null;
  function renderHistoryTab(tab, data) {
    if (!data) return;
    const el = $('historyContent');
    if (tab === 'attendance') {
      el.innerHTML = data.attendance.slice().reverse().map((a) => `
        <div class="list-item">
          <div><div style="font-weight:600;">${Utils.formatDate(a.LoginTime)}</div>
          <div class="muted">${Utils.formatTime(a.LoginTime)} → ${a.LogoutTime ? Utils.formatTime(a.LogoutTime) : 'ongoing'}</div></div>
          <span class="badge badge-info">${a.TotalWorkingHours ? Utils.hoursMinutes(a.TotalWorkingHours) : '—'}</span>
        </div>`).join('') || '<p class="muted">No attendance records yet.</p>';
    } else {
      el.innerHTML = data.tasks.slice().reverse().map((t) => `
        <div class="list-item">
          <div><div style="font-weight:600;">${t.TaskName || t.TaskType}</div>
          <div class="muted">${Utils.formatDateTime(t.StartTime)}</div></div>
          <span class="badge ${t.Status === 'Completed' ? 'badge-success' : 'badge-warning'}">${t.Status}</span>
        </div>`).join('') || '<p class="muted">No tasks yet.</p>';
    }
  }

  // -------------------------------------------------------------------
  // Logout
  // -------------------------------------------------------------------
  async function doLogout() {
    if (!confirm('Log out now? This will end your shift.')) return;
    let pos = {};
    try { pos = await Utils.getCurrentPosition(); } catch (e) {}
    const res = await Api.call('logoutEmployee', pos);
    if (!res.success) { Utils.toast(res.error || 'Logout failed.', 'error'); return; }
    clearInterval(locationTimer); clearInterval(clockTimer);
    Utils.toast(`Shift ended. Total: ${Utils.hoursMinutes(res.data.totalWorkingHours)}`, 'success');
    Api.clearSession();
    setTimeout(() => { window.location.href = 'index.html'; }, 1200);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
