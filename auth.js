/**
 * ============================================================================
 * AUTH (login page controller)
 * ============================================================================
 */
(() => {
  let mode = 'employee'; // 'employee' | 'admin'
  let cameraStream = null;
  let selfieDataUrl = null;
  let gpsCoords = null;

  const $ = (id) => document.getElementById(id);

  function init() {
    if (Api.getToken() && Api.getProfile()) {
      // Already logged in — go straight to the right dashboard.
      const profile = Api.getProfile();
      window.location.href = profile.role === 'admin' ? 'admin.html' : 'dashboard.html';
      return;
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('service-worker.js').catch(() => {});
    }

    $('tabEmployee').addEventListener('click', () => setMode('employee'));
    $('tabAdmin').addEventListener('click', () => setMode('admin'));
    $('startCameraBtn').addEventListener('click', startCamera);
    $('captureBtn').addEventListener('click', captureSelfie);
    $('retakeBtn').addEventListener('click', retake);
    $('loginForm').addEventListener('submit', onSubmit);

    window.addEventListener('online', updateOfflineBanner);
    window.addEventListener('offline', updateOfflineBanner);
    updateOfflineBanner();

    setMode('employee');
    requestGps();
  }

  function updateOfflineBanner() {
    $('offlineBanner').classList.toggle('show', !navigator.onLine);
  }

  function setMode(newMode) {
    mode = newMode;
    $('tabEmployee').className = mode === 'employee' ? 'btn btn-primary' : 'btn btn-outline';
    $('tabAdmin').className = mode === 'admin' ? 'btn btn-primary' : 'btn btn-outline';
    $('gpsSection').style.display = mode === 'employee' ? 'block' : 'none';
    $('selfieSection').style.display = mode === 'employee' ? 'block' : 'none';
    validateForm();
  }

  async function requestGps() {
    if (mode !== 'employee') return;
    try {
      gpsCoords = await Utils.getCurrentPosition();
      $('gpsStatusRow').className = 'gps-status-row ok';
      $('gpsStatusText').textContent = `GPS locked (±${Math.round(gpsCoords.accuracy)}m)`;
      $('gpsStatusRow').querySelector('.material-icons').textContent = 'gps_fixed';
    } catch (err) {
      $('gpsStatusRow').className = 'gps-status-row pending';
      $('gpsStatusText').textContent = 'GPS permission needed — tap to retry';
      $('gpsStatusRow').style.cursor = 'pointer';
      $('gpsStatusRow').onclick = requestGps;
      Utils.toast('Please allow location access to sign in.', 'warning');
    }
    validateForm();
  }

  async function startCamera() {
    try {
      cameraStream = await Utils.startCamera($('cameraVideo'), 'user');
      $('cameraPlaceholder').style.display = 'none';
      $('cameraVideo').style.display = 'block';
      $('selfiePreview').style.display = 'none';
      $('captureBtn').disabled = false;
      $('startCameraBtn').style.display = 'none';
    } catch (err) {
      Utils.toast('Camera access denied. It is required to sign in.', 'error');
    }
  }

  async function captureSelfie() {
    const raw = Utils.captureFrame($('cameraVideo'));
    selfieDataUrl = await Utils.compressImage(raw);
    $('selfiePreview').src = selfieDataUrl;
    $('selfiePreview').style.display = 'block';
    $('cameraVideo').style.display = 'none';
    Utils.stopCamera(cameraStream);
    $('captureBtn').style.display = 'none';
    $('retakeBtn').style.display = 'block';
    validateForm();
  }

  function retake() {
    selfieDataUrl = null;
    $('selfiePreview').style.display = 'none';
    $('retakeBtn').style.display = 'none';
    $('captureBtn').style.display = 'block';
    $('startCameraBtn').style.display = 'block';
    validateForm();
  }

  function validateForm() {
    const idOk = $('employeeId').value.trim().length > 0;
    const pwOk = $('password').value.length > 0;
    let ready = idOk && pwOk;
    if (mode === 'employee') ready = ready && !!selfieDataUrl && !!gpsCoords;
    $('loginBtn').disabled = !ready;
  }
  $('employeeId') && document.addEventListener('input', validateForm);

  async function onSubmit(e) {
    e.preventDefault();
    const employeeId = $('employeeId').value.trim();
    const password = $('password').value;
    const btn = $('loginBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Signing in…';

    try {
      let res;
      if (mode === 'admin') {
        res = await Api.call('loginAdmin', { employeeId, password });
      } else {
        const [device, browser, battery] = [Utils.getDeviceInfo(), Utils.getBrowserInfo(), await Utils.getBatteryLevel()];
        res = await Api.call('loginEmployee', {
          employeeId, password,
          selfie: selfieDataUrl,
          lat: gpsCoords.lat, lng: gpsCoords.lng,
          device, browser, battery,
          internetStatus: Utils.getInternetStatus()
        });
      }

      if (!res.success) {
        Utils.toast(res.error || 'Login failed.', 'error');
        btn.disabled = false;
        btn.innerHTML = '<span class="material-icons">login</span> Sign In';
        return;
      }

      Api.setSession(res.data);
      Utils.toast('Welcome, ' + res.data.name + '!', 'success', 1500);
      setTimeout(() => {
        window.location.href = mode === 'admin' ? 'admin.html' : 'dashboard.html';
      }, 500);
    } catch (err) {
      Utils.toast('Something went wrong: ' + err.message, 'error');
      btn.disabled = false;
      btn.innerHTML = '<span class="material-icons">login</span> Sign In';
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
