/**
 * ============================================================================
 * ADMIN (admin dashboard controller)
 * ============================================================================
 */
(() => {
  const $ = (id) => document.getElementById(id);
  let profile = null;
  let liveTimer = null;
  let employeesCache = [];

  async function init() {
    profile = Api.getProfile();
    if (!Api.getToken() || !profile || profile.role !== 'admin') {
      window.location.href = 'index.html';
      return;
    }
    $('adminWelcome').textContent = `Signed in as ${profile.name}`;
    applyTheme();
    $('themeToggle').addEventListener('click', toggleTheme);
    $('logoutBtn').addEventListener('click', () => { Api.clearSession(); window.location.href = 'index.html'; });

    document.querySelectorAll('.admin-nav button').forEach((b) => b.addEventListener('click', () => switchView(b.dataset.view)));
    document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => $(b.dataset.close).classList.remove('open')));

    $('addEmployeeBtn').addEventListener('click', () => $('modalAddEmployee').classList.add('open'));
    $('submitAddEmployee').addEventListener('click', submitAddEmployee);
    $('empSearch').addEventListener('input', renderEmployeesTable);

    $('attFilterBtn').addEventListener('click', loadAttendance);
    $('movFilterBtn').addEventListener('click', loadMovement);
    $('taskFilterBtn').addEventListener('click', loadTasks);
    $('genExcelBtn').addEventListener('click', () => generateReport('excel'));
    $('genPdfBtn').addEventListener('click', () => generateReport('pdf'));

    await loadKpis();
    await loadLive();
    liveTimer = setInterval(loadLive, 30000);
  }

  function applyTheme() {
    const dark = localStorage.getItem('wt_theme') === 'dark';
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  }
  function toggleTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    localStorage.setItem('wt_theme', isDark ? 'light' : 'dark');
    applyTheme();
  }

  const VIEW_TITLES = { live: 'Live Employees', employees: 'Employee List', attendance: 'Attendance', movement: 'Movement History', tasks: 'Task Progress', kpis: 'Performance & KPIs', reports: 'Reports' };
  function switchView(view) {
    document.querySelectorAll('.admin-nav button').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
    document.querySelectorAll('[data-section]').forEach((s) => s.style.display = s.dataset.section === view ? 'block' : 'none');
    $('viewTitle').textContent = VIEW_TITLES[view];
    if (view === 'employees') loadEmployees();
    if (view === 'attendance') loadAttendance();
    if (view === 'movement') loadMovement();
    if (view === 'tasks') loadTasks();
    if (view === 'kpis') loadKpis();
  }

  // -------------------------------------------------------------------
  // KPIs
  // -------------------------------------------------------------------
  async function loadKpis() {
    const res = await Api.call('adminGetKpis');
    if (!res.success) return;
    const k = res.data;
    $('kpiStrip').innerHTML = `
      <div class="stat-card"><div class="value">${k.presentToday}</div><div class="label">Present Today</div></div>
      <div class="stat-card"><div class="value">${k.tasksCompletedToday}/${k.tasksCreatedToday}</div><div class="label">Tasks Completed</div></div>
      <div class="stat-card"><div class="value">${k.completionRate}%</div><div class="label">Completion Rate</div></div>
      <div class="stat-card"><div class="value">${k.avgWorkingHoursToday}h</div><div class="label">Avg Working Hours</div></div>
    `;
    drawKpiChart(k);
  }
  function drawKpiChart(k) {
    const canvas = $('kpiChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.clientWidth; canvas.height = 220;
    const values = [k.presentToday, k.tasksCreatedToday, k.tasksCompletedToday, k.completionRate, k.avgWorkingHoursToday * 10];
    const labels = ['Present', 'Created', 'Completed', 'Rate%', 'AvgHrs×10'];
    const max = Math.max(...values, 1);
    const barW = canvas.width / values.length - 24;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    values.forEach((v, i) => {
      const h = (v / max) * (canvas.height - 40);
      const x = i * (barW + 24) + 12;
      const y = canvas.height - h - 24;
      ctx.fillStyle = '#1E6FEB';
      roundRect(ctx, x, y, barW, h, 6); ctx.fill();
      ctx.fillStyle = '#64748B';
      ctx.font = '12px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(labels[i], x + barW / 2, canvas.height - 6);
      ctx.fillStyle = '#0B2545';
      ctx.fillText(String(Math.round(v * 10) / 10), x + barW / 2, y - 6);
    });
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // -------------------------------------------------------------------
  // Live employees
  // -------------------------------------------------------------------
  async function loadLive() {
    const res = await Api.call('adminGetLiveEmployees');
    if (!res.success) return;
    const tbody = document.querySelector('#liveTable tbody');
    tbody.innerHTML = res.data.map((e) => `
      <tr>
        <td>${e.name} <span class="muted">(${e.employeeId})</span></td>
        <td>${e.department || '—'}</td>
        <td><span class="badge badge-success">${e.status}</span></td>
        <td>${Utils.formatTime(e.loginTime)}</td>
        <td>${e.lat ? `${Number(e.lat).toFixed(4)}, ${Number(e.lng).toFixed(4)}` : '—'}</td>
        <td>${Utils.formatDateTime(e.lastPing)}</td>
      </tr>`).join('') || `<tr><td colspan="6" class="muted">No employees currently on shift.</td></tr>`;
  }

  // -------------------------------------------------------------------
  // Employees
  // -------------------------------------------------------------------
  async function loadEmployees() {
    const res = await Api.call('adminGetEmployees');
    if (!res.success) return;
    employeesCache = res.data;
    renderEmployeesTable();
  }
  function renderEmployeesTable() {
    const q = ($('empSearch').value || '').toLowerCase();
    const filtered = employeesCache.filter((e) => e.name.toLowerCase().includes(q) || e.employeeId.toLowerCase().includes(q));
    document.querySelector('#employeesTable tbody').innerHTML = filtered.map((e) => `
      <tr><td>${e.employeeId}</td><td>${e.name}</td><td>${e.role}</td><td>${e.department || '—'}</td><td>${e.shift || '—'}</td>
      <td><span class="badge ${e.active ? 'badge-success' : 'badge-danger'}">${e.active ? 'Active' : 'Inactive'}</span></td></tr>`
    ).join('') || `<tr><td colspan="6" class="muted">No employees found.</td></tr>`;
  }
  async function submitAddEmployee() {
    const res = await Api.call('adminAddEmployee', {
      employeeId: $('newEmpId').value.trim(),
      name: $('newEmpName').value.trim(),
      password: $('newEmpPassword').value,
      department: $('newEmpDept').value.trim(),
      shift: $('newEmpShift').value.trim()
    });
    if (!res.success) { Utils.toast(res.error, 'error'); return; }
    Utils.toast('Employee added.', 'success');
    $('modalAddEmployee').classList.remove('open');
    ['newEmpId', 'newEmpName', 'newEmpPassword', 'newEmpDept', 'newEmpShift'].forEach((id) => $(id).value = '');
    loadEmployees();
  }

  // -------------------------------------------------------------------
  // Attendance
  // -------------------------------------------------------------------
  async function loadAttendance() {
    const res = await Api.call('adminGetAttendance', { employeeId: $('attEmpFilter').value.trim(), date: $('attDateFilter').value });
    if (!res.success) return;
    document.querySelector('#attendanceTable tbody').innerHTML = res.data.map((a) => `
      <tr>
        <td>${a.EmployeeID}</td><td>${Utils.formatDateTime(a.LoginTime)}</td><td>${a.LogoutTime ? Utils.formatDateTime(a.LogoutTime) : '—'}</td>
        <td>${a.TotalWorkingHours || '—'}</td><td><span class="badge badge-info">${a.Status}</span></td>
        <td>${a.SelfieURL ? `<a href="${a.SelfieURL}" target="_blank">View</a>` : '—'}</td>
        <td>${a.Device || '—'}</td><td>${a.Battery !== '' ? a.Battery + '%' : '—'}</td>
      </tr>`).join('') || `<tr><td colspan="8" class="muted">No records found.</td></tr>`;
  }

  // -------------------------------------------------------------------
  // Movement history
  // -------------------------------------------------------------------
  async function loadMovement() {
    const res = await Api.call('adminGetMovementHistory', { employeeId: $('movEmpFilter').value.trim(), date: $('movDateFilter').value });
    if (!res.success) return;
    document.querySelector('#movementTable tbody').innerHTML = res.data.map((m) => `
      <tr><td>${m.EmployeeID}</td><td>${Number(m.Latitude).toFixed(5)}</td><td>${Number(m.Longitude).toFixed(5)}</td>
      <td>${m.Accuracy || '—'}</td><td>${m.Speed || '0'}</td><td>${Utils.formatDateTime(m.Timestamp)}</td></tr>`
    ).join('') || `<tr><td colspan="6" class="muted">No location pings found.</td></tr>`;
  }

  // -------------------------------------------------------------------
  // Tasks
  // -------------------------------------------------------------------
  async function loadTasks() {
    const res = await Api.call('adminGetTasks', { employeeId: $('taskEmpFilter').value.trim(), date: $('taskDateFilter').value });
    if (!res.success) return;
    document.querySelector('#tasksTable tbody').innerHTML = res.data.map((t) => `
      <tr>
        <td>${t.EmployeeID}</td><td>${t.TaskType}</td><td>${t.TaskName || '—'}</td>
        <td>${Utils.formatDateTime(t.StartTime)}</td><td>${t.EndTime ? Utils.formatDateTime(t.EndTime) : '—'}</td>
        <td><span class="badge ${t.Status === 'Completed' ? 'badge-success' : 'badge-warning'}">${t.Status}</span></td>
        <td>${t.PhotoURL ? `<a href="${t.PhotoURL}" target="_blank">View</a>` : '—'}</td>
      </tr>`).join('') || `<tr><td colspan="7" class="muted">No tasks found.</td></tr>`;
  }

  // -------------------------------------------------------------------
  // Reports
  // -------------------------------------------------------------------
  async function generateReport(format) {
    $('reportStatus').textContent = 'Generating report…';
    const res = await Api.call('adminGenerateReport', { reportType: $('reportType').value, format });
    if (!res.success) { $('reportStatus').textContent = res.error || 'Failed to generate report.'; return; }
    $('reportStatus').innerHTML = `Report ready (${res.data.rowCount} rows): <a href="${res.data.url}" target="_blank">Download</a>`;
    window.open(res.data.url, '_blank');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
