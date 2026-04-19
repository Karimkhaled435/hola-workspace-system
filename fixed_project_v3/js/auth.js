// =====================================================
// js/auth.js — Location Check, Login & Admin Auth
// v4: Single-device enforcement, auto-sync on login
// =====================================================
/* global scrollTo, print, open, confirm, alert, prompt, setTimeout, setInterval, clearTimeout, clearInterval, localStorage, sessionStorage, navigator, location, history, performance, fetch, URL, URLSearchParams */
/* eslint-disable no-undef */

import { collection, addDoc, updateDoc, doc, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { showMsg, switchView, switchClientTab, updateClientHeaderUI } from "./ui.js";
import {
    sysSettings, _profiles, _sessions, _discounts,
    myProfile, activeSessionId, sessionItems,
    setMyProfile, setActiveSessionId, setSessionStartTime, setSessionItems,
    setCurrentShiftAdmin, currentShiftAdmin,
    syncAllClientData, registerUserDeviceSession, unregisterUserDeviceSession
} from "./sessions.js";
import { playAlertSound, logOperation, startLocationTracking, registerAdminSession } from "./app.js";
import { renderClientLoyalty, renderClientHistory, renderShiftManagers } from "./ui.js";

// ─── Admin Token Helpers (Firestore-based role check) ─────────────────────────
// بعد إدخال PIN صح، بنكتب document في admin_tokens/{uid}
// الـ Firestore Rules بتتحقق من وجوده قبل أي write حساس
async function _writeAdminToken(db, appId, pin) {
    try {
        const { auth } = await import("./firebase.js");
        const uid = auth?.currentUser?.uid;
        if (!uid || !db || !pin) return;
        // ✅ SECURITY: بنبعت الـ PIN في الـ token
        // الـ Rules بتتحقق إنه يساوي adminPin في settings
        // + expiresAt بعد 8 ساعات (shift طويل)
        await setDoc(
            doc(db, 'artifacts', appId, 'admin_tokens', uid),
            {
                pin: pin,
                grantedAt: Date.now(),
                expiresAt: Date.now() + (8 * 60 * 60 * 1000), // 8 hours
                deviceId: window._getDeviceId?.() || 'unknown'
            }
        );
        window._adminUid = uid;
        console.log('[AdminToken] ✅ Token written for uid:', uid, '| expires in 8h');
    } catch(e) {
        console.error('[AdminToken] ❌ Failed to write token — PIN mismatch or Rules blocked:', e);
    }
}

async function _deleteAdminToken(db, appId) {
    try {
        const { auth } = await import("./firebase.js");
        const uid = auth?.currentUser?.uid;
        if (!uid || !db) return;
        await deleteDoc(doc(db, 'artifacts', appId, 'admin_tokens', uid));
        window._adminUid = null;
        console.log('[AdminToken] ✅ Token removed');
    } catch(e) {}
}


// ─── Location Helpers ─────────────────────────────────────────────────────────
function getDistanceFromLatLonInM(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function checkLocationForLogin() {
    // Block if place is closed — allow remote profile only
    if (sysSettings.placeClosed) {
        showMsg('المكان مغلق حالياً. يمكنك فقط الوصول للملف الشخصي البعيد.', 'error');
        window._enterRemoteFromClosed && window._enterRemoteFromClosed();
        return;
    }
    if (!navigator.geolocation) { showPreBookingFallback("متصفحك لا يدعم تحديد الموقع، يرجى الحجز المسبق."); return; }
    showMsg("جاري التحقق من موقعك الفعلي بدقة...", "info");
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude; const lng = position.coords.longitude; const acc = position.coords.accuracy;
            if (acc > 500) { showPreBookingFallback("إشارة الـ GPS غير دقيقة (تلاعب محتمل). استخدم الحجز المسبق."); return; }
            const now = Date.now(); const lastLocStr = localStorage.getItem('hola_last_loc');
            if (lastLocStr) {
                const lastLoc = JSON.parse(lastLocStr); const timeDiffSecs = (now - lastLoc.time) / 1000;
                if (timeDiffSecs > 0 && timeDiffSecs < 600) {
                    const distJump = getDistanceFromLatLonInM(lat, lng, lastLoc.lat, lastLoc.lng); const speed = distJump / timeDiffSecs;
                    if (speed > 30) { showPreBookingFallback("تم رصد تغيير غير منطقي في موقعك. متاح الحجز المسبق فقط."); return; }
                }
            }
            localStorage.setItem('hola_last_loc', JSON.stringify({ lat, lng, time: now }));
            const targetLat = parseFloat(sysSettings.workspaceLat); const targetLng = parseFloat(sysSettings.workspaceLng); const radius = parseFloat(sysSettings.workspaceRadius);
            const dist = getDistanceFromLatLonInM(lat, lng, targetLat, targetLng);
            if (dist <= radius) {
                document.getElementById('locationCheckState')?.classList.add('hidden');
                document.getElementById('loginForm')?.classList.remove('hidden');
                showMsg("تم التأكد من موقعك بنجاح! تفضل بتسجيل الدخول.", "success");
            } else {
                showOutsideLoginOption(dist);
            }
        },
        () => { 
            // ★ رسالة فشل تحديد الموقع الواضحة
            showPreBookingFallback("فشل في تحديد الموقع — إذا كنت متواجداً في المكان توجّه للإدارة لحل هذه المشكلة");
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
}

function showOutsideLoginOption(dist) {
    document.getElementById('locationCheckState')?.classList.add('hidden');
    document.getElementById('loginForm')?.classList.add('hidden');
    document.getElementById('preBookingForm')?.classList.add('hidden');
    const container = document.getElementById('authContainer');
    if (!container) return;
    container.innerHTML = `
        <div class="bg-gradient-to-br from-gray-700 to-gray-900 p-5 text-white text-center">
            <div class="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center text-2xl mx-auto mb-2"><i class="fa-solid fa-location-dot-slash"></i></div>
            <h3 class="font-black text-lg">أنت خارج المكان</h3>
            <p class="text-xs text-gray-300">تبعد ${Math.round(dist)} متر — صلاحيات عرض فقط</p>
        </div>
        <div class="p-5 space-y-3">
            <p class="text-xs text-gray-500 text-center font-bold">يمكنك عرض فاتورتك، اشتراكاتك، والفعاليات فقط</p>
            <div>
                <label class="block text-xs font-bold text-gray-700 mb-1">رقم هاتفك المسجّل</label>
                <input type="tel" id="remoteLoginPhone" class="w-full border-2 border-gray-200 rounded-xl px-4 py-3 font-mono font-bold text-center focus:outline-none focus:border-gray-500" placeholder="010..." dir="ltr">
            </div>
            <button onclick="window.handleRemoteLogin()" class="w-full bg-gray-800 text-white font-black py-3.5 rounded-xl shadow-lg hover:bg-gray-900 transition">
                <i class="fa-solid fa-eye ml-2"></i>عرض ملفي
            </button>
            <div class="border-t pt-3 space-y-2">
                <button onclick="window.showPreBookingFallback('حجز مسبق')" class="w-full text-sm font-bold text-hola-orange hover:underline">حجز مسبق بدلاً من ذلك</button>
                <button onclick="window.resetLocationCheck()" class="w-full text-xs font-bold text-gray-400 hover:text-gray-600 flex items-center justify-center gap-1">
                    <i class="fa-solid fa-chevron-right text-xs"></i> العودة
                </button>
            </div>
        </div>`;
}

window.handleRemoteLogin = async () => {
    const phone = document.getElementById('remoteLoginPhone')?.value.trim();
    if (!phone || phone.length < 10) return showMsg("أدخل رقم هاتفك المسجّل بشكل صحيح", "error");
    const prof = _profiles[phone];
    if (!prof) return showMsg("هذا الرقم غير مسجّل. يجب التسجيل أولاً من داخل المكان.", "error");
    setMyProfile({ ...prof, isRemote: true });
    window.myProfile = { ...prof, isRemote: true }; // expose to window
    window._currentUserIsRemote = true;
    document.getElementById('navPublic')?.classList.add('hidden');
    document.getElementById('navClient')?.classList.remove('hidden');
    window.switchView && window.switchView('client');
    showMsg(`أهلاً ${prof.name}! صلاحية عرض فقط`, "info");
    if (window.activateRemoteMode) window.activateRemoteMode(phone);
    else {
        window.switchClientTab && window.switchClientTab('remote');
        if (window.populateRemoteProfile) window.populateRemoteProfile(phone);
    }
};

export function showPreBookingFallback(reasonMsg) {
    document.getElementById('locationCheckState')?.classList.add('hidden');
    document.getElementById('loginForm')?.classList.add('hidden');
    const preBookingForm = document.getElementById('preBookingForm');
    // ★ إذا كانت الرسالة تحتوي "فشل في تحديد الموقع" نعرض رسالة واضحة مع زر حجز صغير
    if (reasonMsg && reasonMsg.includes('فشل في تحديد الموقع')) {
        const container = document.getElementById('authContainer');
        if (container) {
            container.innerHTML = `
            <div class="bg-gradient-to-br from-red-600 to-red-800 p-5 text-white text-center">
                <div class="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center text-2xl mx-auto mb-2"><i class="fa-solid fa-location-xmark"></i></div>
                <h3 class="font-black text-lg">فشل في تحديد الموقع</h3>
            </div>
            <div class="p-5 space-y-4">
                <div class="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center">
                    <p class="text-sm font-black text-amber-800">إذا كنت متواجداً في المكان</p>
                    <p class="text-xs text-amber-600 mt-1 font-bold">توجّه للإدارة لحل هذه المشكلة</p>
                </div>
                <div class="flex items-center justify-between gap-2">
                    <button onclick="window.resetLocationCheck()" class="flex-1 bg-hola-purple text-white font-bold py-2.5 rounded-xl text-sm hover:bg-hola-dark transition flex items-center justify-center gap-1">
                        <i class="fa-solid fa-rotate-right text-xs"></i> إعادة المحاولة
                    </button>
                    <button onclick="window.showPreBookingFallback('حجز مسبق')" class="bg-gray-100 text-gray-600 font-bold px-3 py-2.5 rounded-xl text-xs hover:bg-gray-200 transition border border-gray-200" style="font-size:10px;">
                        <i class="fa-solid fa-calendar-plus ml-1"></i>حجز مسبق
                    </button>
                </div>
                <button onclick="window.resetLocationCheck()" class="w-full text-xs font-bold text-gray-400 hover:text-gray-600 flex items-center justify-center gap-1 mt-1">
                    <i class="fa-solid fa-chevron-right text-xs"></i> العودة
                </button>
            </div>`;
            return;
        }
    }
    if (reasonMsg && !reasonMsg.includes('تخطي') && !reasonMsg.includes('حجز مسبق')) showMsg(reasonMsg, "error");
    if (preBookingForm) preBookingForm.classList.remove('hidden');
}

export function resetLocationCheck() {
    const container = document.getElementById('authContainer');
    if (container && !container.querySelector('#locationCheckState')) { location.reload(); return; }
    document.getElementById('preBookingForm')?.classList.add('hidden');
    document.getElementById('loginForm')?.classList.add('hidden');
    document.getElementById('locationCheckState')?.classList.remove('hidden');
}

export function checkNewUser(val, _profiles) {
    const p = val.trim();
    const nField = document.getElementById('nameField');
    if (nField) {
        if (p.length >= 10 && !_profiles[p]) nField.classList.remove('hidden');
        else nField.classList.add('hidden');
    }
}

// ─── Pre-booking ──────────────────────────────────────────────────────────────
export async function submitPreBooking(db, appId) {
    if (!db) return showMsg("غير متصل بقاعدة البيانات", "error");
    const name = document.getElementById('pbName')?.value.trim();
    const phone = document.getElementById('pbPhone')?.value.trim();
    const time = document.getElementById('pbTime')?.value;
    if (!name || !phone || !time) return showMsg("برجاء إكمال بيانات الحجز", "error");
    if (typeof window.grecaptcha !== 'undefined') {
        let responseToken = '';
        try {
            const iframes = document.querySelectorAll('iframe[title="reCAPTCHA"]');
            if (iframes.length > 1) responseToken = window.grecaptcha.getResponse(1);
            else responseToken = window.grecaptcha.getResponse();
        } catch (e) {}
        if (responseToken.length === 0) return showMsg("برجاء تأكيد أنك لست روبوت (reCAPTCHA)", "error");
    }
    try {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'prebookings'), { name, phone, expectedTime: time, status: 'pending', createdAt: Date.now() });
        const form = document.getElementById('preBookingForm');
        if (form) form.innerHTML = `<div class="text-center py-6"><div class="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-4xl mx-auto mb-4"><i class="fa-solid fa-check-double"></i></div><h3 class="text-xl font-black text-hola-purple mb-2">تم استلام حجزك بنجاح!</h3><p class="text-gray-600 font-bold leading-relaxed">سوف نقوم بالتواصل معك خلال ساعة من الآن.</p><button onclick="location.reload()" class="mt-6 text-hola-orange font-bold text-sm hover:underline">العودة للرئيسية</button></div>`;
        playAlertSound('congrats');
        if (typeof window.grecaptcha !== 'undefined') { try { window.grecaptcha.reset(); } catch (e) {} }
    } catch (e) { console.error(e); showMsg("حدث خطأ أثناء الحجز", "error"); }
}

export async function submitInternalPreBooking(type, db, appId, myProfile) {
    if (!db || !myProfile) return;
    const existingPending = Object.values(window._prebookings || {}).find(b =>
        b.phone === myProfile.phone && b.status === 'pending' &&
        (type === 'room' ? b.type === 'حجز غرفة خاصة' : b.type === 'حجز مقعد')
    );
    if (existingPending) return showMsg("لديك طلب حجز معلق بالفعل. انتظر رد الإدارة.", "error");
    const time = document.getElementById('internalPbTime')?.value;
    if (type === 'seat' && !time) return showMsg("اختر موعد الحجز", "error");
    try {
        const reqType = type === 'room' ? 'حجز غرفة خاصة' : 'حجز مقعد';
        const eTime = type === 'room' ? 'سيتم التنسيق' : time;
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'prebookings'), { name: `${myProfile.name} (${reqType})`, phone: myProfile.phone, expectedTime: eTime, type: reqType, status: 'pending', createdAt: Date.now() });
        showMsg("تم إرسال طلب الحجز بنجاح، سنتواصل معك للتأكيد!", "success");
        const el = document.getElementById('internalPbTime'); if (el) el.value = '';
    } catch (e) { showMsg("حدث خطأ", "error"); }
}

// ─── Login ────────────────────────────────────────────────────────────────────
export async function handleLogin(db, appId, _profiles, _sessions, sysSettings) {
    if (!db) return showMsg("غير متصل بقاعدة البيانات", "error");
    // Block session login when place is closed
    if (sysSettings.placeClosed) {
        showMsg('المكان مغلق حالياً — تسجيل الجلسات غير متاح. يمكنك الدخول للملف الشخصي البعيد فقط.', 'error');
        return;
    }
    const p = document.getElementById('loginPhone')?.value.trim();
    const n = document.getElementById('loginName')?.value.trim();
    if (!p || p.length < 10) return showMsg("برجاء إدخال رقم موبايل صحيح", "error");
    if (window._bannedPhones && window._bannedPhones[p]) { playAlertSound('high'); return showMsg("تم حظر هذا الرقم أمنياً. راجع الإدارة.", "error"); }

    // Generate strong fingerprint on every login attempt (captures incognito)
    if (window._getStrongDeviceId) await window._getStrongDeviceId();

    if (typeof window.grecaptcha !== 'undefined') {
        let recaptchaResponse = '';
        try {
            recaptchaResponse = window.grecaptcha.getResponse(0);
            if (!recaptchaResponse) recaptchaResponse = window.grecaptcha.getResponse();
        } catch (e) {}
        if (!recaptchaResponse) return showMsg("برجاء تأكيد أنك لست روبوت (reCAPTCHA)", "error");
    }

    if (!_profiles[p] && !n) {
        document.getElementById('nameField')?.classList.remove('hidden');
        return showMsg("برجاء إدخال اسمك الثنائي للتسجيل", "error");
    }

    // Show loading
    const loginBtn = document.querySelector('[onclick="window.handleLogin()"]');
    if (loginBtn) { loginBtn.disabled = true; loginBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin ml-2"></i> جاري تسجيل الدخول...'; }

    if (!window._loginAttempts) window._loginAttempts = {};
    try {
        let prof;
        if (!_profiles[p]) {
            const newProfile = { name: n, phone: p, walletBalance: 0, stamps: [], joinedAt: Date.now() };
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'profiles', p), newProfile);
            prof = newProfile; _profiles[p] = newProfile; showMsg("تم إنشاء حسابك بنجاح!", "success");
        } else {
            prof = _profiles[p]; showMsg(`أهلاً بك مجدداً يا ${prof.name}!`, "success");
        }
        setMyProfile(prof);
        window.myProfile = prof; // expose to window for inline scripts
        // Save phone for auto-resume on page reload
        localStorage.setItem('hola_saved_phone', p);
        delete window._loginAttempts[p];
        if (typeof window.grecaptcha !== 'undefined') { try { window.grecaptcha.reset(); } catch (e) {} }

        // Register device session (single-device enforcement)
        await registerUserDeviceSession(db, appId, p);

        const exist = Object.values(_sessions).find(s => s.phone === prof.phone && s.status === 'active');
        if (exist) {
            setActiveSessionId(exist.id); setSessionStartTime(exist.startTime); setSessionItems(exist.items || []);
            document.getElementById('navPublic')?.classList.add('hidden'); document.getElementById('navClient')?.classList.remove('hidden');
            switchClientTab('session'); switchView('client'); updateClientHeaderUI(prof, _profiles, sysSettings);
            window._startTimer && window._startTimer();
            window.renderSessionItemsList && window.renderSessionItemsList();
            // Sync all tabs immediately after login
            syncAllClientData();
            showMsg("تم استعادة جلستك النشطة", "info");
            // Run login modals — wait for sysSettings to be fully populated
        (function(){
            var _att = 0;
            var _poll = function() {
                var ssOk = window.sysSettings && Object.keys(window.sysSettings).length > 2;
                var profOk = !!(window.myProfile && window.myProfile.phone);
                if (ssOk && profOk) {
                    // ★ إصلاح: نُعيد تعيين الـ flag حتى تظهر modals عند كل دخول جديد
                    window._loginModalsShown = false;
                    if (typeof window._runLoginModals === "function") window._runLoginModals();
                }
                else if (++_att < 25) { setTimeout(_poll, 200); }
            };
            setTimeout(_poll, 300);
        })();
            return;
        }

        const todayStr = new Date().toLocaleDateString('ar-EG'); let userStamps = prof.stamps || [];
        let lastStampDate = userStamps.length > 0 ? new Date(userStamps[userStamps.length - 1]).toLocaleDateString('ar-EG') : null;
        if (lastStampDate !== todayStr) {
            userStamps.push(Date.now());
            const stampsReq = sysSettings.stampsRequired || 7;
            if (userStamps.length >= stampsReq) {
                const code = "RWD" + Math.random().toString(36).substring(2, 6).toUpperCase();
                await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'discounts'), { code, value: 100, isPercentage: true, assignedTo: prof.phone, title: "مكافأة الختم", isUsed: false, createdAt: Date.now() });
                await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'notifications'), {
                    phone: prof.phone,
                    msg: `🏆 مبروك يا ${prof.name}! كملت كل الأختام!\nالنهاردة يومك علينا 💚\nكله علينا ما عدا المشروبات 😉\n\nكودك الخاص: ${code}\nاضغط لنسخه!`,
                    type: 'congrats',
                    discountCode: code,
                    isRead: false,
                    timestamp: Date.now()
                });
                userStamps = [];
                // ★ إطلاق popup الاحتفال بعد الدخول
                setTimeout(() => {
                    if (window._showStampsCelebration) {
                        window._showStampsCelebration(prof.name, stampsReq);
                    }
                }, 1200);
            }
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'profiles', prof.phone), { stamps: userStamps }); prof.stamps = userStamps;
        } else {
            // ★ إذا كان عدد الأختام الحالي = المطلوب (من جلسة سابقة لم يُعرض لها popup)
            const stampsReq = sysSettings.stampsRequired || 7;
            if (userStamps.length >= stampsReq) {
                setTimeout(() => {
                    if (window._showStampsCelebration) {
                        window._showStampsCelebration(prof.name, stampsReq);
                    }
                }, 1200);
            }
        }

        const docRef = await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'sessions'), { phone: prof.phone, name: prof.name, startTime: Date.now(), status: 'active', items: [] });
        setActiveSessionId(docRef.id); setSessionStartTime(Date.now()); setSessionItems([]);
        document.getElementById('navPublic')?.classList.add('hidden'); document.getElementById('navClient')?.classList.remove('hidden');
        switchClientTab('session'); switchView('client'); updateClientHeaderUI(prof, _profiles, sysSettings);
        // Run login modals — wait for sysSettings to be fully populated
        (function(){
            var _att = 0;
            var _poll = function() {
                var ssOk = window.sysSettings && Object.keys(window.sysSettings).length > 2;
                var profOk = !!(window.myProfile && window.myProfile.phone);
                if (ssOk && profOk) {
                    // ★ reset flag حتى تظهر modals دائماً عند كل دخول
                    window._loginModalsShown = false;
                    if (typeof window._runLoginModals === "function") window._runLoginModals();
                }
                else if (++_att < 25) { setTimeout(_poll, 200); }
            };
            setTimeout(_poll, 300);
        })();

        // Sync ALL data immediately on first login
        syncAllClientData();
        renderClientLoyalty(prof, _profiles, {}, sysSettings);
        renderClientHistory(prof, _sessions);

        window._startTimer && window._startTimer();
        window.renderSessionItemsList && window.renderSessionItemsList();
        if (window.startLocationTracking) window.startLocationTracking();
    } catch (e) {
        console.error(e); showMsg("خطأ أثناء تسجيل الدخول", "error");
    } finally {
        if (loginBtn) { loginBtn.disabled = false; loginBtn.innerHTML = '<i class="fa-solid fa-door-open text-sm ml-2"></i> دخول وابدأ جلستك'; }
    }
}

// ─── Admin Auth ───────────────────────────────────────────────────────────────
export function showAdminLoginModal() { document.getElementById('adminLoginModal')?.classList.remove('hidden'); }

export function verifyAdminPin(db, appId, sysSettings, activeSessionId) {
    const pass = document.getElementById('adminPinInput')?.value;
    const sName = document.getElementById('adminShiftName')?.value || "مدير النظام";
    const correctPin = sysSettings?.adminPin;
    if (!correctPin) return showMsg("لم يتم تعيين رقم سري للإدارة. تواصل مع المسؤول.", "error");

    // ✅ SECURITY: Rate limiting — max 5 attempts then 3-minute lockout
    const MAX_ATTEMPTS = 5;
    const LOCKOUT_MS = 3 * 60 * 1000;
    if (!window._adminPinAttempts) window._adminPinAttempts = { count: 0, lockedUntil: 0 };
    const _now = Date.now();
    if (window._adminPinAttempts.lockedUntil > _now) {
        const secsLeft = Math.ceil((window._adminPinAttempts.lockedUntil - _now) / 1000);
        return showMsg(`تم تجاوز عدد المحاولات. حاول مجدداً بعد ${secsLeft} ثانية.`, "error");
    }

    if (pass === correctPin) {
        window._adminPinAttempts = { count: 0, lockedUntil: 0 }; // reset on success
        // ✅ SECURITY: كتابة admin token في Firestore — الـ Rules بتتحقق من PIN + expiry
        _writeAdminToken(db, appId, pass);
        setCurrentShiftAdmin(sName);
        const label = document.getElementById('currentAdminNameLabel');
        if (label) label.innerText = sName;
        logOperation(db, appId, sName, 'تسجيل دخول/شفت', `استلام شفت: ${sName}`);
        // ★ استخدام window.registerAdminSession الذي يتضمن db و appId
        if (window.registerAdminSession) window.registerAdminSession(sName);
        else registerAdminSession(db, appId, sName);
        document.getElementById('navAdminBtn')?.classList.add('hidden');
        document.getElementById('navAdminActiveBtn')?.classList.remove('hidden');
        document.getElementById('navPublic')?.classList.add('hidden');
        document.getElementById('adminLoginModal')?.classList.add('hidden');
        // Hide closed screen so admin panel is visible, and prevent it from reappearing
        window._adminSessionActive = true;
        const closedScreen = document.getElementById('placeClosedScreen');
        if (closedScreen) closedScreen.classList.add('hidden');
        switchView('admin');
        window.switchAdminTab && window.switchAdminTab('live');
        playAlertSound('normal');
        showMsg("تم استلام الشفت", "success");
    } else {
        // ✅ SECURITY: Track failed attempts and lock after MAX_ATTEMPTS
        window._adminPinAttempts.count = (window._adminPinAttempts.count || 0) + 1;
        const remaining = MAX_ATTEMPTS - window._adminPinAttempts.count;
        if (window._adminPinAttempts.count >= MAX_ATTEMPTS) {
            window._adminPinAttempts.lockedUntil = Date.now() + LOCKOUT_MS;
            window._adminPinAttempts.count = 0;
            showMsg("تم قفل الوصول لمدة 3 دقائق بسبب تجاوز عدد المحاولات.", "error");
        } else {
            showMsg(`كلمة مرور غير صحيحة — متبقي ${remaining} محاولة.`, "error");
        }
        const pinInput = document.getElementById('adminPinInput');
        if (pinInput) pinInput.value = '';
    }
}

export function logoutAdmin(activeSessionId, currentShiftAdmin, db, appId) {
    logOperation(db, appId, currentShiftAdmin, 'تسجيل خروج/شفت', `تسليم شفت: ${currentShiftAdmin}`);
    window._adminSessionActive = false;
    // ✅ حذف admin token عند تسليم الشفت
    _deleteAdminToken(db, appId);
    document.getElementById('navAdminBtn')?.classList.remove('hidden');
    document.getElementById('navAdminActiveBtn')?.classList.add('hidden');
    // Re-apply closed screen if place is still closed
    if (window._applyPlaceClosed && window.sysSettings?.placeClosed) {
        window._applyPlaceClosed(true);
    }
    if (activeSessionId) {
        document.getElementById('navClient')?.classList.remove('hidden');
        document.getElementById('navPublic')?.classList.add('hidden');
        switchView('client');
    } else {
        document.getElementById('navPublic')?.classList.remove('hidden');
        switchView('public');
    }
    showMsg("تم تسليم الشفت", "info");
}
