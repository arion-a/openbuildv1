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
