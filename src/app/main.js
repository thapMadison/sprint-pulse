import { initFirebase, onAuthStateChange } from '../services/auth.js';
import { setState, subscribe } from './state.js';
import { render } from './render.js';

subscribe(render);

initFirebase().then(() => {
  onAuthStateChange((user) => setState({ user }));
}).catch((e) => {
  console.error('Firebase init error:', e);
});

render();
