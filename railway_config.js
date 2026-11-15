// Railway Server Configuration
// Set USE_RAILWAY to true to enable the Railway server integration

// Toggle this to enable/disable Railway server
// 2026-11 (simplify plan D3): OFF. Worksheet answers are saved to the roster ledger
// only; the second copy to the answer server (socket, health check, per-answer POST,
// the per-blank "Class" chart) is retired. RAILWAY_SERVER_URL below must stay: AI
// grading and the hourly FRQ regrade still use it. Flip back to true to restore.
window.USE_RAILWAY = false;

// Your Railway server URL (update after deployment)
window.RAILWAY_SERVER_URL = 'https://curriculumrender-production.up.railway.app'; // Change to your Railway URL like 'https://your-app.up.railway.app'

// This configuration allows you to easily switch between:
// - Direct Supabase connection (USE_RAILWAY = false)
// - Railway server proxy (USE_RAILWAY = true)