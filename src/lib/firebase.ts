/**
 * ========================================
 * FIREBASE CONFIGURATION & HELPERS
 * ========================================
 * All Firebase services: Auth, Firestore, Storage
 * Connected to project: new-zyra
 */

import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as fbSignOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  where,
  onSnapshot,
  serverTimestamp,
  type DocumentData,
} from 'firebase/firestore';
import {
  getStorage,
  ref,
  uploadBytes,
  uploadString,
  getDownloadURL,
} from 'firebase/storage';

// Firebase configuration
const firebaseConfig = {
  apiKey: 'AIzaSyBVf4zLq6OTfTzdmYkPYwg3SL4i24RtUAc',
  authDomain: 'new-zyra.firebaseapp.com',
  projectId: 'new-zyra',
  storageBucket: 'new-zyra.firebasestorage.app',
  messagingSenderId: '789799381038',
  appId: '1:789799381038:web:b9f7bcf64b16d9501797bf',
  measurementId: 'G-7J4QPEZ16J',
};

let app: ReturnType<typeof initializeApp>;
let auth: ReturnType<typeof getAuth>;
let db: ReturnType<typeof getFirestore>;
let storage: ReturnType<typeof getStorage>;

try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
} catch (e) {
  console.warn('Firebase init error:', e);
}

// ─── AUTH ────────────────────────────────────
export function onAuthChange(cb: (user: User | null) => void) {
  if (!auth) { cb(null); return () => {}; }
  return onAuthStateChanged(auth, cb);
}

export async function signInEmail(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function signUpEmail(email: string, password: string) {
  return createUserWithEmailAndPassword(auth, email, password);
}

export async function signInGoogle() {
  return signInWithPopup(auth, new GoogleAuthProvider());
}

export async function signOut() {
  return fbSignOut(auth);
}

// ─── FIRESTORE ───────────────────────────────
export async function saveDoc(path: string, data: Record<string, unknown>) {
  const ref = doc(db, path);
  await setDoc(ref, { ...data, updatedAt: serverTimestamp() }, { merge: true });
  return ref.id;
}

export async function addDocument(collectionPath: string, data: Record<string, unknown>) {
  const ref = collection(db, collectionPath);
  const docRef = await addDoc(ref, { ...data, createdAt: serverTimestamp() });
  return docRef.id;
}

export async function getDocument(path: string) {
  const snap = await getDoc(doc(db, path));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function getCollection(path: string, orderField?: string) {
  const q = orderField
    ? query(collection(db, path), orderBy(orderField, 'desc'))
    : collection(db, path);
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function updateDocument(path: string, data: Record<string, unknown>) {
  await updateDoc(doc(db, path), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteDocument(path: string) {
  await deleteDoc(doc(db, path));
}

export function subscribeCollection(
  path: string,
  cb: (docs: DocumentData[]) => void,
  orderField?: string
) {
  const q = orderField
    ? query(collection(db, path), orderBy(orderField, 'desc'))
    : collection(db, path);
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

// ─── STORAGE ─────────────────────────────────
export async function uploadFile(path: string, file: Blob) {
  const r = ref(storage, path);
  await uploadBytes(r, file);
  return getDownloadURL(r);
}

export async function uploadDataUrl(path: string, dataUrl: string) {
  const r = ref(storage, path);
  await uploadString(r, dataUrl, 'data_url');
  return getDownloadURL(r);
}

export {
  auth,
  db,
  storage,
  query,
  collection,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  doc,
  getDocs,
};
