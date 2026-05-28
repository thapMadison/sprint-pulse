const firebaseConfig = {
  apiKey: 'AIzaSyA3DYLOwCpH5gRBbUFjNrGs1ObRs-jJrqQ',
  authDomain: 'dc1-tool.firebaseapp.com',
  databaseURL: 'https://dc1-tool-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'dc1-tool',
  storageBucket: 'dc1-tool.firebasestorage.app',
  messagingSenderId: '27467886077',
  appId: '1:27467886077:web:f1792f18a5f5f5a7d3bd94',
  // reCAPTCHA v3 site key for App Check (public — safe to commit).
  // Covers all tool domains registered at https://www.google.com/recaptcha/admin
  appCheckSiteKey: '6LfwAfMsAAAAALaOyFaWAgofFAjLJEOYkM8BwLwz',
};

export default firebaseConfig;

// Azure AD tenant — Microsoft sign-in is scoped to this tenant.
export const AZURE_TENANT_ID = 'fa190090-4fc1-416a-bd41-a480b5dad5b7';

// Realtime Database path: /tools/{TOOL_ID}/config/...
export const TOOL_ID = 'sprint-pulse';
