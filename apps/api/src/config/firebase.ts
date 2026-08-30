import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { resolve } from 'path';

if (!process.env.FIREBASE_AUTH_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR === '1') {
  process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
}

// verifyIdToken() needs to resolve the project id. When we init without a
// service account (projectId only), make sure the SDK's ADC lookup agrees.
if (process.env.FIREBASE_PROJECT_ID && !process.env.GOOGLE_CLOUD_PROJECT) {
  process.env.GOOGLE_CLOUD_PROJECT = process.env.FIREBASE_PROJECT_ID;
}

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const credentialsFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (serviceAccountJson) {
  const cert = JSON.parse(serviceAccountJson);
  console.log('[firebase] init via FIREBASE_SERVICE_ACCOUNT_JSON, project:', cert.project_id);
  admin.initializeApp({
    credential: admin.credential.cert(cert),
  });
} else if (credentialsFile) {
  const absPath = resolve(credentialsFile);
  const cert = JSON.parse(readFileSync(absPath, 'utf-8'));
  console.log('[firebase] init via GOOGLE_APPLICATION_CREDENTIALS', absPath, 'project:', cert.project_id);
  admin.initializeApp({
    credential: admin.credential.cert(cert),
  });
} else {
  console.log('[firebase] init with projectId only:', process.env.FIREBASE_PROJECT_ID);
  admin.initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID,
  });
}

export const firebaseAdmin = admin;
