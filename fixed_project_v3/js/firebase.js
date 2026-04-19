// =====================================================
// js/firebase.js — Firebase Initialization
// =====================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, getDoc, doc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { netlifyFirebaseConfig, DEFAULT_APP_ID } from "../config/constants.js";
import { setupListeners } from "./sessions.js";

export let app, auth, db, appId, currentUser;

export async function initFirebase() {
    try {
        let firebaseConfig = (typeof __firebase_config !== 'undefined' && __firebase_config)
            ? JSON.parse(__firebase_config)
            : netlifyFirebaseConfig;

        if (!firebaseConfig || firebaseConfig.apiKey === "YOUR_API_KEY") {
            window.showMsg("تأكد من إضافة إعدادات Firebase.", "error");
            return;
        }

        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
        appId = typeof __app_id !== 'undefined' ? __app_id : DEFAULT_APP_ID;

        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            await signInWithCustomToken(auth, __initial_auth_token);
        } else {
            await signInAnonymously(auth);
        }

        onAuthStateChanged(auth, (user) => {
            if (user) {
                currentUser = user;
                // Expose globally for inline scripts
                window.db = db;
                window.appId = appId;
                setupListeners(db, appId, user.uid);
                // NOTE: Device ban system disabled — ban is by phone number only
                // Phone ban is checked during login in auth.js
            }
        });
    } catch (error) {
        console.error("Firebase Init Error:", error);
    }
}
