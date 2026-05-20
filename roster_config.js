// roster_config.js — sets window.ROSTER_SERVICE_URL for every client.
//
// Resolution order (first non-empty wins):
//   1. Anything that ran before this script and pre-set window.ROSTER_SERVICE_URL.
//   2. localStorage['roster_service_url_override'] — teacher-local
//      backend override. Set this in DevTools to point every page at a
//      local roster-server during development:
//        localStorage.setItem('roster_service_url_override', 'http://localhost:8091')
//      Clear it with:
//        localStorage.removeItem('roster_service_url_override')
//      The override is intentionally NOT exposed as a UI on student-
//      facing pages — only the teacher-roster-console and teacher-dashboard
//      surface a dropdown for switching environments.
//   3. The committed production URL.
window.ROSTER_SERVICE_URL = window.ROSTER_SERVICE_URL
  || (function () {
    try { return localStorage.getItem('roster_service_url_override') || null; }
    catch (_) { return null; }
  })()
  || 'https://roster-production-12c1.up.railway.app';
