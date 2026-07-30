/**
 * ============================================================================
 * CONFIG — one place to point the frontend at your Apps Script backend.
 * ============================================================================
 * 1. Deploy Code.gs as a Web App (Execute as: Me, Access: Anyone).
 * 2. Paste the /exec URL below.
 * ============================================================================
 */
window.APP_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbwnutkpCiS5uCwuvIvXDHSGoaYDEywMMgzt38niIV4k4tzAGnewBVlZjs29Tpzq6Y_n/exec',
  LOCATION_PING_INTERVAL_MS: 60 * 1000, // 60 seconds, per spec
  SESSION_STORAGE_KEY: 'wt_session',
  OFFLINE_QUEUE_KEY: 'wt_offline_queue',
  IMAGE_MAX_DIMENSION: 900,   // px, longest side, before upload
  IMAGE_JPEG_QUALITY: 0.7,
  APP_NAME: 'Warehouse Tracker'
};
