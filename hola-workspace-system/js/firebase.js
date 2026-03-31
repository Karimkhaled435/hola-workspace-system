// =====================================================
// js/firebase.js — Firebase Initialization (Merged Clean)
// =====================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import {
    getAuth,
    signInAnonymously,
    signInWithCustomToken,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";

import { getFirestore } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

import { DEFAULT_APP_ID } from "../config/constants.js";
import { setupListeners } from "./sessions.js";

// ============================
// Firebase Config (Your Project)
// ============================

const firebaseConfig = {
    apiKey: "AIzaSyDe6Q82taE7_BRCqUsHcaLBCvheKBLIZzY",
    authDomain: "hola-workspace-system.firebaseapp.com",
    databaseURL: "https://hola-workspace-system-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "hola-workspace-system",
    storageBucket: "hola-workspace-system.firebasestorage.app",
    messagingSenderId: "920702716632",
    appId: "1:920702716632:web:d1f9be05cc48f69e1ce5ad"
};

// ============================
// Exports
// ============================

export let app, auth, db, appId, currentUser;

// ============================
// Init Function
// ============================

export async function initFirebase() {
    try {
        // Initialize Firebase
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);

        // App ID
        appId = typeof __app_id !== 'undefined'
            ? __app_id
            : DEFAULT_APP_ID;

        // ============================
        // Authentication
        // ============================

        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            await signInWithCustomToken(auth, __initial_auth_token);
        } else {
            await signInAnonymously(auth);
        }

        // ============================
        // Auth State Listener
        // ============================

        onAuthStateChanged(auth, (user) => {
            if (user) {
                currentUser = user;

                console.log("Firebase Ready:", user.uid);

                // Start real-time listeners
                setupListeners(db, appId);
            } else {
                console.warn("No user authenticated");
            }
        });

    } catch (error) {
        console.error("Firebase Init Error:", error);
        if (window.showMsg) {
            window.showMsg("حدث خطأ في تشغيل Firebase", "error");
        }
    }
}
