// =====================================================
// js/auth.js — Location Check, Login & Admin Auth
// =====================================================

import { collection, addDoc, updateDoc, doc, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { showMsg, switchView, switchClientTab, updateClientHeaderUI } from "./ui.js";
import {
    sysSettings, _profiles, _sessions, _discounts,
    myProfile, activeSessionId, sessionItems,
    setMyProfile, setActiveSessionId, setSessionStartTime, setSessionItems,
    setCurrentShiftAdmin, currentShiftAdmin
} from "./sessions.js";
import { playAlertSound, logOperation, startLocationTracking, registerAdminSession } from "./app.js";
import { renderClientLoyalty, renderClientHistory, renderShiftManagers } from "./ui.js";

// ─── Location Helpers ─────────────────────────────────────────────────────────
function getDistanceFromLatLonInM(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

export function checkLocationForLogin() {
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
                // Outside workspace — offer remote login
                showOutsideLoginOption(dist);
            }
        },
        () => { showPreBookingFallback("تعذر الوصول لموقعك الجغرافي. تأكد من تفعيل الـ GPS بدقة عالية."); },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
}

// ─── Outside Location: Limited Access ────────────────────────────────────────
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
    // Set limited profile
    setMyProfile({ ...prof, isRemote: true });
    window._currentUserIsRemote = true;
    document.getElementById('navPublic')?.classList.add('hidden');
    document.getElementById('navClient')?.classList.remove('hidden');
    window.switchView && window.switchView('client');
    showMsg(`أهلاً ${prof.name}! صلاحية عرض فقط`, "info");
    // Activate remote-only mode
    if (window.activateRemoteMode) window.activateRemoteMode(phone);
    else {
        window.switchClientTab && window.switchClientTab('remote');
        if (window.populateRemoteProfile) window.populateRemoteProfile(phone);
    }
};

export function showPreBookingFallback(reasonMsg) {
    if (reasonMsg && !reasonMsg.includes('تخطي')) showMsg(reasonMsg, "error");
    document.getElementById('locationCheckState')?.classList.add('hidden');
    document.getElementById('loginForm')?.classList.add('hidden');
    document.getElementById('preBookingForm')?.classList.remove('hidden');
}

export function resetLocationCheck() {
    // Rebuild authContainer to original state if it was replaced
    const container = document.getElementById('authContainer');
    if (container && !container.querySelector('#locationCheckState')) {
        switchView('public');
        return;
    }
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
    // reCAPTCHA check (graceful if unavailable)
    if (typeof window.grecaptcha !== 'undefined') {
        let responseToken = '';
        try {
            const iframes = document.querySelectorAll('iframe[title="reCAPTCHA"]');
            if (iframes.length > 1) responseToken = window.grecaptcha.getResponse(1);
            else responseToken = window.grecaptcha.getResponse();
        } catch(e) {}
        if (responseToken.length === 0) return showMsg("برجاء تأكيد أنك لست روبوت (reCAPTCHA)", "error");
    }
    try {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'prebookings'), { name, phone, expectedTime: time, status: 'pending', createdAt: Date.now() });
        const form = document.getElementById('preBookingForm');
        if (form) form.innerHTML = `<div class="text-center py-6"><div class="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-4xl mx-auto mb-4"><i class="fa-solid fa-check-double"></i></div><h3 class="text-xl font-black text-hola-purple mb-2">تم استلام حجزك بنجاح!</h3><p class="text-gray-600 font-bold leading-relaxed">سوف نقوم بالتواصل معك خلال ساعة من الآن.</p><button onclick="window.switchView('public')" class="mt-6 text-hola-orange font-bold text-sm hover:underline">العودة للرئيسية</button></div>`;
        playAlertSound('congrats');
        if (typeof window.grecaptcha !== 'undefined') { try { window.grecaptcha.reset(); } catch(e) {} }
    } catch (e) { console.error(e); showMsg("حدث خطأ أثناء الحجز", "error"); }
}

export async function submitInternalPreBooking(type, db, appId, myProfile) {
    if (!db || !myProfile) return;
    // Check for existing pending booking of same type
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
    const p = document.getElementById('loginPhone')?.value.trim();
    const n = document.getElementById('loginName')?.value.trim();
    if (!p || p.length < 10) return showMsg("برجاء إدخال رقم موبايل صحيح", "error");
    if (window._bannedPhones && window._bannedPhones[p]) { playAlertSound('high'); return showMsg("تم حظر هذا الرقم أمنياً. راجع الإدارة.", "error"); }

    // reCAPTCHA check (graceful)
    if (typeof window.grecaptcha !== 'undefined') {
        let recaptchaResponse = '';
        try {
            recaptchaResponse = window.grecaptcha.getResponse(0);
            if (!recaptchaResponse) recaptchaResponse = window.grecaptcha.getResponse();
        } catch(e) {}
        if (!recaptchaResponse) return showMsg("برجاء تأكيد أنك لست روبوت (reCAPTCHA)", "error");
    }

    if (!_profiles[p] && !n) {
        document.getElementById('nameField')?.classList.remove('hidden');
        return showMsg("برجاء إدخال اسمك الثنائي للتسجيل", "error");
    }

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
        delete window._loginAttempts[p];
        if (typeof window.grecaptcha !== 'undefined') { try { window.grecaptcha.reset(); } catch(e) {} }

        const exist = Object.values(_sessions).find(s => s.phone === prof.phone && s.status === 'active');
        if (exist) {
            setActiveSessionId(exist.id); setSessionStartTime(exist.startTime); setSessionItems(exist.items || []);
            document.getElementById('navPublic')?.classList.add('hidden'); document.getElementById('navClient')?.classList.remove('hidden');
            switchClientTab('session'); switchView('client'); updateClientHeaderUI(prof, _profiles, sysSettings);
            window._startTimer && window._startTimer();
            window.renderSessionItemsList && window.renderSessionItemsList();
            const eBanner = document.getElementById('eventBanner'); if (eBanner && sysSettings.evActive) eBanner.classList.remove('hidden');
            showMsg("تم استعادة جلستك النشطة", "info"); return;
        }

        const todayStr = new Date().toLocaleDateString('ar-EG'); let userStamps = prof.stamps || [];
        let lastStampDate = userStamps.length > 0 ? new Date(userStamps[userStamps.length - 1]).toLocaleDateString('ar-EG') : null;
        if (lastStampDate !== todayStr) {
            userStamps.push(Date.now());
            if (userStamps.length >= sysSettings.stampsRequired) {
                const code = "RWD" + Math.random().toString(36).substring(2, 6).toUpperCase();
                await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'discounts'), { code, value: 100, isPercentage: true, assignedTo: prof.phone, title: "مكافأة الختم", isUsed: false, createdAt: Date.now() });
                await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'notifications'), { phone: prof.phone, msg: `أكملت ${sysSettings.stampsRequired} زيارات وحصلت على خصم %100 🎁 راجع أكوادك!`, type: "congrats", discountCode: code, isRead: false, timestamp: Date.now() });
                userStamps = [];
            }
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'profiles', prof.phone), { stamps: userStamps }); prof.stamps = userStamps;
        }

        const docRef = await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'sessions'), { phone: prof.phone, name: prof.name, startTime: Date.now(), status: 'active', items: [] });
        setActiveSessionId(docRef.id); setSessionStartTime(Date.now()); setSessionItems([]);
        document.getElementById('navPublic')?.classList.add('hidden'); document.getElementById('navClient')?.classList.remove('hidden');
        switchClientTab('session'); switchView('client'); updateClientHeaderUI(prof, _profiles, sysSettings);
        renderClientLoyalty(prof, _profiles, {}, sysSettings); renderClientHistory(prof, _sessions);
        window._startTimer && window._startTimer();
        window.renderSessionItemsList && window.renderSessionItemsList();
        // بدء تتبع الموقع كل 5 دقائق
        if (window.startLocationTracking) window.startLocationTracking();
    } catch (e) { console.error(e); showMsg("خطأ أثناء تسجيل الدخول", "error"); }
}

// ─── Admin Auth ───────────────────────────────────────────────────────────────
export function showAdminLoginModal() { document.getElementById('adminLoginModal')?.classList.remove('hidden'); }

export function verifyAdminPin(db, appId, sysSettings, activeSessionId) {
    const pass = document.getElementById('adminPinInput')?.value;
    const sName = document.getElementById('adminShiftName')?.value || "مدير النظام";
    // sysSettings.adminPin may not be set yet — fallback to default
    const correctPin = sysSettings?.adminPin || "hola2026";
    if (pass === correctPin) {
        setCurrentShiftAdmin(sName);
        const label = document.getElementById('currentAdminNameLabel');
        if (label) label.innerText = sName;
        logOperation(db, appId, sName, 'تسجيل دخول/شفت', `استلام شفت: ${sName}`);
        // تسجيل جلسة المسؤول في Firebase للسماح بدخول اثنين في وقت واحد
        registerAdminSession(sName);
        document.getElementById('navAdminBtn')?.classList.add('hidden');
        document.getElementById('navAdminActiveBtn')?.classList.remove('hidden');
        document.getElementById('navPublic')?.classList.add('hidden');
        document.getElementById('adminLoginModal')?.classList.add('hidden');
        switchView('admin');
        window.switchAdminTab && window.switchAdminTab('live');
        playAlertSound('normal');
        showMsg("تم استلام الشفت", "success");
    } else showMsg("كلمة مرور غير صحيحة", "error");
}

export function logoutAdmin(activeSessionId, currentShiftAdmin, db, appId) {
    logOperation(db, appId, currentShiftAdmin, 'تسجيل خروج/شفت', `تسليم شفت: ${currentShiftAdmin}`);
    document.getElementById('navAdminBtn')?.classList.remove('hidden');
    document.getElementById('navAdminActiveBtn')?.classList.add('hidden');
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
