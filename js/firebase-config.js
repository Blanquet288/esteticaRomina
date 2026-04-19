/* Firebase App + Auth + Firestore (compat)
 * Credenciales: archivo js/firebase-config.auto.js generado con `npm run config` desde .env
 * En Node/build se usa process.env (ver scripts/generate-firebase-config.cjs).
 */
var auth, db;

(function initFirebaseFromEnv() {
  if (typeof firebase === 'undefined') {
    console.error('[Firebase] No está cargado el SDK. Revisa el orden de los <script> en index.html.');
    return;
  }
  var cfg = typeof window !== 'undefined' ? window.__FIREBASE_CONFIG__ : null;
  if (!cfg || !cfg.apiKey) {
    console.error(
      '[Firebase] Falta window.__FIREBASE_CONFIG__. Crea .env (copia de .env.example), ejecuta: npm install && npm run config'
    );
    return;
  }
  firebase.initializeApp(cfg);
  auth = firebase.auth();
  db = firebase.firestore();
})();
