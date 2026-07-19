// Desktop Firestore data layer. Loads firebase-js-sdk from the CDN (Tauri CSP is
// disabled, so external ESM is allowed) and talks to the same "markets"
// collection the mobile app uses.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {
  getFirestore, collection, query, orderBy, onSnapshot,
  doc, getDoc, setDoc, deleteDoc, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { firebaseConfig, syncAccount } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const COL = "markets";

const NET_RETRIES = 4;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isNetErr = (e) => (e?.code || "") === "auth/network-request-failed";

// Signs into the shared account so desktop + mobile share one dataset.
// Retries on auth/network-request-failed — on a fresh app launch the webview's
// network stack can be slow/not-ready, so the first attempt often flakes out.
export async function signInShared() {
  const { email, password } = syncAccount;
  for (let attempt = 0; ; attempt++) {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      return;
    } catch (e) {
      const code = e?.code || "";
      // First ever run: the shared account may not exist yet — create it.
      if (code === "auth/user-not-found" || code === "auth/invalid-credential") {
        try {
          await createUserWithEmailAndPassword(auth, email, password);
          return;
        } catch (e2) {
          if (e2?.code === "auth/email-already-in-use") {
            await signInWithEmailAndPassword(auth, email, password);
            return;
          }
          if (isNetErr(e2) && attempt < NET_RETRIES) { await sleep(600 * 2 ** attempt); continue; }
          throw e2;
        }
      }
      if (isNetErr(e) && attempt < NET_RETRIES) { await sleep(600 * 2 ** attempt); continue; }
      throw e;
    }
  }
}

// Live subscription. cb receives the markets array on every change (local or
// from another device). Returns an unsubscribe function.
export function subscribeMarkets(cb) {
  const q = query(collection(db, COL), orderBy("name"));
  return onSnapshot(q, (snap) => {
    const out = [];
    snap.forEach((d) => {
      const data = d.data();
      out.push({ id: d.id, ...data, modifiedMs: data.updatedAt?.toMillis?.() ?? null });
    });
    cb(out);
  });
}

function slugify(name) {
  const s = String(name).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s || "market";
}

async function uniqueId(base) {
  let id = base, n = 2;
  while ((await getDoc(doc(db, COL, id))).exists()) id = `${base}-${n++}`;
  return id;
}

const FIELDS = ["name", "symbol", "quote", "category", "target",
  "price", "changeDay", "changeWeek", "changeMonth", "change3d", "body"];

function clean(m) {
  const out = {};
  for (const k of FIELDS) out[k] = m[k] != null ? m[k] : "";
  return out;
}

export async function createMarket({ name, symbol = "", quote = "", category = "", target = "" }) {
  const id = await uniqueId(slugify(name));
  const data = { ...clean({ name, symbol, quote, category, target }), updatedAt: serverTimestamp() };
  await setDoc(doc(db, COL, id), data);
  return { id, ...data, modifiedMs: Date.now() };
}

export async function saveMarket(m) {
  await setDoc(doc(db, COL, m.id), { ...clean(m), updatedAt: serverTimestamp() }, { merge: true });
}

export async function deleteMarket(id) {
  await deleteDoc(doc(db, COL, id));
}
