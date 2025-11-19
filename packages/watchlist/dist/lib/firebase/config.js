import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};
// Check if Firebase is configured
const isFirebaseConfigured = !!(firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId);
// Debug: Log config to verify it's loaded
if (typeof window !== 'undefined') {
    console.log('Firebase config loaded:', {
        isConfigured: isFirebaseConfigured,
        hasApiKey: !!firebaseConfig.apiKey,
        hasAuthDomain: !!firebaseConfig.authDomain,
        hasProjectId: !!firebaseConfig.projectId,
    });
    if (!isFirebaseConfigured) {
        console.warn('Firebase is not configured. Watchlist persistence features will be disabled.');
    }
}
// Initialize Firebase only if configured and it hasn't been initialized
let app = null;
let auth = null;
let db = null;
if (isFirebaseConfigured) {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    auth = getAuth(app);
    db = getFirestore(app);
}
export { auth, db };
// Enable persistence for offline support (to be added later)
// enableIndexedDbPersistence(db).catch((err) => {
//   console.warn('Firebase persistence failed:', err)
// })
export default app;
