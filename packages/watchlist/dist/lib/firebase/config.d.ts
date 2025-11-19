import { FirebaseApp } from 'firebase/app';
import { Auth } from 'firebase/auth';
import { Firestore } from 'firebase/firestore';
declare let app: FirebaseApp | null;
declare let auth: Auth | null;
declare let db: Firestore | null;
export { auth, db };
export default app;
