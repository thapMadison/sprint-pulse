// Firebase Authentication (Microsoft Provider) + Realtime Database helpers.
import firebaseConfig, { AZURE_TENANT_ID, TOOL_ID } from './firebase-config.js';

const SDK_BASE = 'https://www.gstatic.com/firebasejs/10.8.0';

let app = null;
let auth = null;
let database = null;
let currentUser = null;
let authStateListeners = [];

// Cache dynamic imports of Firebase SDK chunks.
let appModule, authModule, dbModule, appCheckModule;
const loadApp = () => (appModule ??= import(`${SDK_BASE}/firebase-app.js`));
const loadAuth = () => (authModule ??= import(`${SDK_BASE}/firebase-auth.js`));
const loadDb = () => (dbModule ??= import(`${SDK_BASE}/firebase-database.js`));
const loadAppCheck = () => (appCheckModule ??= import(`${SDK_BASE}/firebase-app-check.js`));

export async function initFirebase() {
  if (app) return;
  const [{ initializeApp }, appCheckMod, authMod, dbMod] = await Promise.all([
    loadApp(), loadAppCheck(), loadAuth(), loadDb(),
  ]);
  app = initializeApp(firebaseConfig);

  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }
  appCheckMod.initializeAppCheck(app, {
    provider: new appCheckMod.ReCaptchaV3Provider(firebaseConfig.appCheckSiteKey),
    isTokenAutoRefreshEnabled: true,
  });

  auth = authMod.getAuth(app);
  database = dbMod.getDatabase(app);
  authMod.onAuthStateChanged(auth, (user) => {
    currentUser = user;
    authStateListeners.forEach((fn) => fn(user));
  });
}

export function onAuthStateChange(callback) {
  authStateListeners.push(callback);
  if (currentUser !== null) callback(currentUser);
  return () => {
    authStateListeners = authStateListeners.filter((fn) => fn !== callback);
  };
}

export async function signInWithMicrosoft() {
  if (!auth) await initFirebase();
  const { OAuthProvider, signInWithPopup } = await loadAuth();
  const provider = new OAuthProvider('microsoft.com');
  provider.setCustomParameters({ prompt: 'select_account', tenant: AZURE_TENANT_ID });
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

export async function signOut() {
  if (!auth) return;
  const { signOut: firebaseSignOut } = await loadAuth();
  await firebaseSignOut(auth);
}

export function getCurrentUser() {
  return currentUser;
}

export function isAuthenticated() {
  return currentUser !== null;
}

// Read Worker URL from /tools/{TOOL_ID}/config/worker-url.
export async function getWorkerUrl() {
  if (!database) await initFirebase();
  if (!currentUser) throw new Error('Must be logged in to access Worker configuration');

  const { ref, get } = await loadDb();
  const snapshot = await get(ref(database, `tools/${TOOL_ID}/config/worker-url`));
  if (!snapshot.exists()) throw new Error('Worker URL not found in database');
  return snapshot.val();
}
