import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  initializeAuth,
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  GithubAuthProvider,
  getAdditionalUserInfo,
  signOut,
  onAuthStateChanged,
  updateProfile,
  connectAuthEmulator,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  browserPopupRedirectResolver,
  type Auth,
  type User,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
};

const placeholder = (v?: string) =>
  !v || v.startsWith('your-') || v.includes('your-project');

export const firebaseConfigured = !placeholder(firebaseConfig.apiKey) && !placeholder(firebaseConfig.appId);

export const usingAuthEmulator =
  import.meta.env.DEV && import.meta.env.VITE_FIREBASE_AUTH_EMULATOR === 'true';

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let googleProvider: GoogleAuthProvider | null = null;
let githubProvider: GithubAuthProvider | null = null;

if (firebaseConfigured) {
  app = getApps()[0] ?? initializeApp(firebaseConfig);
  try {
    auth = initializeAuth(app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence],
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  } catch {
    auth = getAuth(app);
  }
  if (usingAuthEmulator) {
    try {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    } catch {
      // Vite HMR may already have connected.
    }
  }
  googleProvider = new GoogleAuthProvider();
  githubProvider = new GithubAuthProvider();
  githubProvider.addScope('read:user');
}

export { auth, googleProvider, githubProvider, browserPopupRedirectResolver };

export {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GithubAuthProvider,
  getAdditionalUserInfo,
  signOut,
  onAuthStateChanged,
  updateProfile,
};
export type { User };
