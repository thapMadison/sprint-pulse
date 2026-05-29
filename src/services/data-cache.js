// Per-source data cache.
//
// Two layers, both keyed by the active data source so switching sources never
// re-fetches data that was already loaded this session, and a refresh restores
// the source the user was last on:
//   1. In-memory `Map` — instant source switching within a session.
//   2. IndexedDB — survives a page refresh.
//
// Jira (api) and file data are namespaced per signed-in user (`u:<uid>:…`) and
// are only persisted while logged in, so one user's data never leaks to another
// on a shared machine. The demo source carries no data and is never persisted —
// only the "last source" pointer records that demo was active.

import { getCurrentUser } from './auth.js';

const DB_NAME = 'sprint-pulse';
const DB_VERSION = 1;
const STORE = 'sources';
// Small localStorage pointer (not the data) recording the last active source so
// the next page load can restore it.
const POINTER_KEY = 'sprint_pulse_last_source';
// How long to coalesce rapid putCached() calls (lazy issue/epic loads) before
// the IndexedDB write actually happens.
const PERSIST_DEBOUNCE_MS = 600;

// ───────────────────────────── key helpers ─────────────────────────────

// uid of the signed-in user, or null when logged out. Used to namespace cache
// entries so api/file data is private per user.
export function userScope() {
  const u = getCurrentUser();
  return u && u.uid ? u.uid : null;
}

// Build the cache key for a source descriptor. Returns null when an api/file
// source has no signed-in user (we never cache that data anonymously).
export function cacheKeyFor({ sourceKey, sourceId, uid }) {
  if (sourceKey === 'demo') return 'demo';
  if (!uid || sourceId == null || sourceId === '') return null;
  if (sourceKey === 'api') return `u:${uid}:api:${sourceId}`;
  if (sourceKey === 'file') return `u:${uid}:file:${sourceId}`;
  return null;
}

// ──────────────────────────── in-memory layer ───────────────────────────

const mem = new Map();
const pendingTimers = new Map();

// ──────────────────────────── IndexedDB layer ───────────────────────────

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') { resolve(null); return; }
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (e) {
      console.warn('[cache] indexedDB.open threw:', e);
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      console.warn('[cache] IndexedDB open failed:', req.error);
      resolve(null);
    };
  });
  return dbPromise;
}

async function idbPut(record) {
  const db = await openDb();
  if (!db) return;
  await new Promise((resolve) => {
    let tx;
    try {
      tx = db.transaction(STORE, 'readwrite');
    } catch { resolve(); return; }
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => { console.warn('[cache] IndexedDB put failed:', tx.error); resolve(); };
    tx.onabort = () => resolve();
  });
}

async function idbGet(key) {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    let tx;
    try {
      tx = db.transaction(STORE, 'readonly');
    } catch { resolve(null); return; }
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
  });
}

async function idbGetAll() {
  const db = await openDb();
  if (!db) return [];
  return new Promise((resolve) => {
    let tx;
    try {
      tx = db.transaction(STORE, 'readonly');
    } catch { resolve([]); return; }
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });
}

async function idbDeleteByPrefix(prefix) {
  const db = await openDb();
  if (!db) return;
  await new Promise((resolve) => {
    let tx;
    try {
      tx = db.transaction(STORE, 'readwrite');
    } catch { resolve(); return; }
    const req = tx.objectStore(STORE).openCursor();
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) { resolve(); return; }
      if (String(cur.key).startsWith(prefix)) cur.delete();
      cur.continue();
    };
    req.onerror = () => resolve();
  });
}

// ───────────────────────────── public API ──────────────────────────────

// Write a snapshot into the cache. `record` must already include its `key`.
// In-memory write is synchronous; the IndexedDB write is debounced so a burst
// of lazy-load updates collapses into a single persist. Demo is never stored.
export function putCached(record) {
  if (!record || !record.key || record.key === 'demo') return;
  mem.set(record.key, record);
  const existing = pendingTimers.get(record.key);
  if (existing) clearTimeout(existing);
  pendingTimers.set(record.key, setTimeout(() => {
    pendingTimers.delete(record.key);
    idbPut(mem.get(record.key) || record).catch(() => {});
  }, PERSIST_DEBOUNCE_MS));
}

// Read a snapshot by key — memory first, then IndexedDB (populating memory).
export async function getCached(key) {
  if (!key || key === 'demo') return null;
  if (mem.has(key)) return mem.get(key);
  const rec = await idbGet(key);
  if (rec) mem.set(key, rec);
  return rec;
}

// List the api boards this user has cached, most-recent first. Merges any
// not-yet-flushed in-memory entries so a board loaded moments ago still shows.
export async function listBoards(uid) {
  if (!uid) return [];
  const prefix = `u:${uid}:api:`;
  const byKey = new Map();
  for (const rec of await idbGetAll()) {
    if (String(rec.key).startsWith(prefix)) byKey.set(rec.key, rec);
  }
  for (const [key, rec] of mem) {
    if (String(key).startsWith(prefix)) byKey.set(key, rec);
  }
  return [...byKey.values()]
    .map((r) => ({ boardId: r.sourceId, label: r.sourceLabel, updatedAt: r.updatedAt || 0 }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

// Remove all of a user's cached api/file data (called on logout for privacy).
export async function clearUser(uid) {
  if (!uid) return;
  const prefix = `u:${uid}:`;
  for (const key of [...mem.keys()]) {
    if (key.startsWith(prefix)) {
      mem.delete(key);
      const t = pendingTimers.get(key);
      if (t) { clearTimeout(t); pendingTimers.delete(key); }
    }
  }
  await idbDeleteByPrefix(prefix);
}

// Force any debounced writes to disk now (call on tab hide / unload).
export function flush() {
  for (const [key, timer] of [...pendingTimers]) {
    clearTimeout(timer);
    pendingTimers.delete(key);
    const rec = mem.get(key);
    if (rec) idbPut(rec).catch(() => {});
  }
}

// ───────────────────────── last-source pointer ─────────────────────────

export function setLastSource(desc) {
  try { localStorage.setItem(POINTER_KEY, JSON.stringify(desc)); } catch { /* quota / private mode */ }
}

export function getLastSource() {
  try { return JSON.parse(localStorage.getItem(POINTER_KEY) || 'null'); } catch { return null; }
}

export function clearLastSource() {
  try { localStorage.removeItem(POINTER_KEY); } catch { /* ignore */ }
}
