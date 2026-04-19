/**
 * Lee variables de entorno desde .env (process.env vía dotenv)
 * y genera js/firebase-config.auto.js para el navegador.
 */
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const keys = {
  FIREBASE_API_KEY: 'apiKey',
  FIREBASE_AUTH_DOMAIN: 'authDomain',
  FIREBASE_PROJECT_ID: 'projectId',
  FIREBASE_STORAGE_BUCKET: 'storageBucket',
  FIREBASE_MESSAGING_SENDER_ID: 'messagingSenderId',
  FIREBASE_APP_ID: 'appId',
};

const firebaseConfig = {};
for (const [envName, prop] of Object.entries(keys)) {
  const v = process.env[envName];
  if (!v || !String(v).trim()) {
    console.error('[generate-firebase-config] Falta la variable de entorno:', envName);
    console.error('  Crea un archivo .env en la raíz (puedes copiar .env.example) y vuelve a ejecutar: npm run config');
    process.exit(1);
  }
  firebaseConfig[prop] = String(v).trim();
}

const outPath = path.join(__dirname, '..', 'js', 'firebase-config.auto.js');
const banner = '/* Generado por npm run config — no editar a mano. Origen: variables FIREBASE_* en .env */\n';
const body = `window.__FIREBASE_CONFIG__ = ${JSON.stringify(firebaseConfig, null, 2)};\n`;

fs.writeFileSync(outPath, banner + body, 'utf8');
console.log('[generate-firebase-config] Escrito:', outPath);
