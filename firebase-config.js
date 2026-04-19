const firebaseConfig = {
  apiKey: "AIzaSyBa0vxnw1S0kuxm2b2TzFxgP4SYLjVE5Ac",
  authDomain: "esteticaromina-6be97.firebaseapp.com",
  projectId: "esteticaromina-6be97",
  storageBucket: "esteticaromina-6be97.firebasestorage.app",
  messagingSenderId: "565048699537",
  appId: "1:565048699537:web:f49d68e356893c447ead30",
};

// Inicializar Firebase
if (!window.firebase.apps.length) {
  window.firebase.initializeApp(firebaseConfig);
}

// Exportar globalmente para que app.js pueda usarlos
window.auth = window.firebase.auth();
window.db = window.firebase.firestore();
