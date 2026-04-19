/**
 * Firebase v10 (compat) vía imports ESM — compatible con GitHub Pages (sin build).
 * Sustituye TU_LLAVE_AQUI por tu Web API Key en la consola de Firebase.
 */
import firebase from 'https://esm.sh/firebase@10.14.1/compat/app';
import 'https://esm.sh/firebase@10.14.1/compat/auth';
import 'https://esm.sh/firebase@10.14.1/compat/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyBa0vxnw1S0kuxm2b2TzFxgP4SYLjVE5Ac',
  authDomain: 'esteticaromina-6be97.firebaseapp.com',
  projectId: 'esteticaromina-6be97',
  storageBucket: 'esteticaromina-6be97.firebasestorage.app',
  messagingSenderId: '565048699537',
  appId: '1:565048699537:web:f49d68e356893c447ead30',
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

globalThis.firebase = firebase;
globalThis.auth = firebase.auth();
globalThis.db = firebase.firestore();
