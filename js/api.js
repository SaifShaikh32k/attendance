/**
 * ============================================================================
 * API — thin client around the Apps Script backend.
 * Handles: session token storage, offline queueing for write actions,
 * and automatic sync when connectivity returns.
 * ============================================================================
 */
const Api = (() => {
  const cfg = window.APP_CONFIG;

  // Actions that mutate data — safe to queue offline and replay later.
  const QUEUEABLE_ACTIONS = new Set([
    'updateStatus', 'startTask', 'completeTask', 'uploadSnapshot',
    'lunchOut', 'lunchIn', 'pingLocation'
  ]);

  function getToken() {
    return localStorage.getItem(cfg.SESSION_STORAGE_KEY + '_token') || '';
  }
  function setSession(data) {
    localStorage.setItem(cfg.SESSION_STORAGE_KEY + '_token', data.token || '');
    localStorage.setItem(cfg.SESSION_STORAGE_KEY + '_profile', JSON.stringify({
      employeeId: data.employeeId, name: data.name, role: data.role
    }));
  }
  function getProfile() {
    try { return JSON.parse(localStorage.getItem(cfg.SESSION_STORAGE_KEY + '_profile') || 'null'); }
    catch (e) { return null; }
  }
  function clearSession() {
    localStorage.removeItem(cfg.SESSION_STORAGE_KEY + '_token');
    localStorage.removeItem(cfg.SESSION_STORAGE_KEY + '_profile');
  }

  async function rawCall(action, payload) {
    const res = await fetch(cfg.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // avoids CORS preflight on Apps Script
      body: JSON.stringify({ action, payload, token: getToken() })
    });
    if (!res.ok) throw new Error('Network error: ' + res.status);
    return res.json();
  }

  // Public call(): tries the network; if offline and the action is queueable,
  // stores it in localStorage and returns an optimistic "queued" result.
  async function call(action, payload = {}) {
    if (!navigator.onLine && QUEUEABLE_ACTIONS.has(action)) {
      queueAction(action, payload);
      return { success: true, queued: true, data: {} };
    }
    try {
      return await rawCall(action, payload);
    } catch (err) {
      if (QUEUEABLE_ACTIONS.has(action)) {
        queueAction(action, payload);
        return { success: true, queued: true, data: {} };
      }
      return { success: false, error: err.message || 'Request failed.' };
    }
  }

  function queueAction(action, payload) {
    const queue = getQueue();
    queue.push({ action, payload, ts: Date.now() });
    localStorage.setItem(cfg.OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  }
  function getQueue() {
    try { return JSON.parse(localStorage.getItem(cfg.OFFLINE_QUEUE_KEY) || '[]'); }
    catch (e) { return []; }
  }
  function queueLength() { return getQueue().length; }

  async function syncQueue() {
    let queue = getQueue();
    if (!queue.length) return { synced: 0 };
    let synced = 0;
    const remaining = [];
    for (const item of queue) {
      try {
        const res = await rawCall(item.action, item.payload);
        if (res.success) synced++; else remaining.push(item);
      } catch (e) {
        remaining.push(item); // still offline / server unreachable — keep for later
      }
    }
    localStorage.setItem(cfg.OFFLINE_QUEUE_KEY, JSON.stringify(remaining));
    return { synced, remaining: remaining.length };
  }

  // Auto-sync whenever the browser regains connectivity.
  window.addEventListener('online', async () => {
    const result = await syncQueue();
    if (result.synced > 0) Utils.toast(`Synced ${result.synced} offline update(s).`, 'success');
  });

  return { call, getToken, setSession, getProfile, clearSession, queueLength, syncQueue };
})();
