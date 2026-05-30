import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const credentialsFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (serviceAccountJson) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(serviceAccountJson)),
  });
} else if (credentialsFile) {
  const absPath = resolve(credentialsFile);
  const cert = JSON.parse(readFileSync(absPath, 'utf-8'));
  admin.initializeApp({
    credential: admin.credential.cert(cert),
  });
} else {
  admin.initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID,
  });
}

export const firebaseAdmin = admin;
