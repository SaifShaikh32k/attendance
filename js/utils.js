/**
 * ============================================================================
 * UTILS — device metadata, camera capture, GPS, image compression, toasts.
 * Everything here is dependency-free vanilla JS.
 * ============================================================================
 */
const Utils = (() => {

  // ---- Toasts --------------------------------------------------------
  function toast(message, type = 'info', duration = 3200) {
    let root = document.getElementById('toast-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'toast-root';
      document.body.appendChild(root);
    }
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    const icon = type === 'success' ? 'check_circle' : type === 'error' ? 'error' : type === 'warning' ? 'warning' : 'info';
    el.innerHTML = `<span class="material-icons">${icon}</span><span>${message}</span>`;
    root.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .25s'; setTimeout(() => el.remove(), 250); }, duration);
  }

  // ---- Device / browser metadata --------------------------------------
  function getDeviceInfo() {
    const ua = navigator.userAgent;
    let device = 'Desktop';
    if (/Android/i.test(ua)) device = 'Android';
    else if (/iPhone|iPad|iPod/i.test(ua)) device = 'iOS';
    else if (/Mobile/i.test(ua)) device = 'Mobile';
    return `${device} (${screen.width}x${screen.height})`;
  }

  function getBrowserInfo() {
    const ua = navigator.userAgent;
    if (ua.includes('Chrome') && !ua.includes('Edg')) return 'Chrome';
    if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Edg')) return 'Edge';
    return 'Unknown';
  }

  async function getBatteryLevel() {
    try {
      if (navigator.getBattery) {
        const battery = await navigator.getBattery();
        return Math.round(battery.level * 100);
      }
    } catch (e) { /* not supported */ }
    return 'N/A';
  }

  function getInternetStatus() {
    if (!navigator.onLine) return 'Offline';
    const conn = navigator.connection || navigator.webkitConnection || navigator.mozConnection;
    return conn && conn.effectiveType ? conn.effectiveType.toUpperCase() : 'Online';
  }

  // ---- GPS --------------------------------------------------------------
  function getCurrentPosition(options = { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 }) {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('Geolocation not supported on this device.'));
      navigator.geolocation.getCurrentPosition(
        pos => resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          speed: pos.coords.speed || 0
        }),
        err => reject(new Error('GPS permission denied or unavailable: ' + err.message)),
        options
      );
    });
  }

  // ---- Camera -------------------------------------------------------------
  async function startCamera(videoEl, facingMode = 'user') {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode, width: { ideal: 720 }, height: { ideal: 960 } },
      audio: false
    });
    videoEl.srcObject = stream;
    await videoEl.play();
    return stream;
  }

  function stopCamera(stream) {
    if (stream) stream.getTracks().forEach(t => t.stop());
  }

  function captureFrame(videoEl) {
    const canvas = document.createElement('canvas');
    canvas.width = videoEl.videoWidth;
    canvas.height = videoEl.videoHeight;
    canvas.getContext('2d').drawImage(videoEl, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.85);
  }

  // ---- Image compression (resize + re-encode before upload) --------------
  function compressImage(dataUrl, maxDim = window.APP_CONFIG.IMAGE_MAX_DIMENSION, quality = window.APP_CONFIG.IMAGE_JPEG_QUALITY) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDim) { height = Math.round(height * (maxDim / width)); width = maxDim; }
        else if (height > maxDim) { width = Math.round(width * (maxDim / height)); height = maxDim; }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // ---- Formatting ---------------------------------------------------------
  function formatTime(date) {
    if (!date) return '--:--';
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  function formatDate(date) {
    return new Date(date).toLocaleDateString([], { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  }
  function formatDateTime(date) {
    if (!date) return '—';
    return new Date(date).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
  function hoursMinutes(decimalHours) {
    if (!decimalHours) return '0h 0m';
    const h = Math.floor(decimalHours);
    const m = Math.round((decimalHours - h) * 60);
    return `${h}h ${m}m`;
  }

  return {
    toast, getDeviceInfo, getBrowserInfo, getBatteryLevel, getInternetStatus,
    getCurrentPosition, startCamera, stopCamera, captureFrame, compressImage, fileToDataUrl,
    formatTime, formatDate, formatDateTime, hoursMinutes
  };
})();
