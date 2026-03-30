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
import { playAlertSound, logOperation } from "./app.js";
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
            } else { showPreBookingFallback(`أنت تبعد ${Math.round(dist)} متر عن المكان. متاح الحجز المسبق فقط.`); }
        },
        () => { showPreBookingFallback("تعذر الوصول لموقعك الجغرافي. تأكد من تفعيل الـ GPS بدقة عالية."); },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
}

export function showPreBookingFallback(reasonMsg) {
    if (reasonMsg && !reasonMsg.includes('تخطي')) showMsg(reasonMsg, "error");
    document.getElementById('locationCheckState')?.classList.add('hidden');
    document.getElementById('loginForm')?.classList.add('hidden');
    document.getElementById('preBookingForm')?.classList.remove('hidden');
}

export function resetLocationCheck() {
    document.getElementById('preBookingForm')?.classList.add('hidden');
    document.getElementById('loginForm')?.classList.add('hidden');
    document.getElementById('locationCheckState')?.classList.remove('hidden');
}

export function checkNewUser(val, _profiles) {
    const p = val.trim();
    const nField = document.getElementById('nameField');
    if (nField) {
        if (p.length >= 10 && !_profiles[p]) nField.classList.remove('hidden');
        else if (p.length >= 10 && _profiles[p]) nField.classList.add('hidden');
    }
}

// ─── Pre-booking ──────────────────────────────────────────────────────────────
export async function submitPreBooking(db, appId) {
    if (!db) return showMsg("غير متصل بقاعدة البيانات", "error");
    const name = document.getElementById('pbName')?.value.trim();
    const phone = document.getElementById('pbPhone')?.value.trim();
    const time = document.getElementById('pbTime')?.value;
    if (!name || !phone || !time) return showMsg("برجاء إكمال بيانات الحجز", "error");
    if (typeof window.grecaptcha === 'undefined') return showMsg("تعذر تحميل نظام الحماية، حدث الصفحة.", "error");
    let responseToken = '';
    if (document.getElementById('recaptcha-prebook')) {
        const iframes = document.querySelectorAll('iframe[title="reCAPTCHA"]');
        if (iframes.length > 1) responseToken = window.grecaptcha.getResponse(1);
        else responseToken = window.grecaptcha.getResponse();
    } else { responseToken = window.grecaptcha.getResponse(); }
    if (responseToken.length === 0) return showMsg("برجاء تأكيد أنك لست روبوت (reCAPTCHA)", "error");
    try {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'prebookings'), { name, phone, expectedTime: time, status: 'pending', createdAt: Date.now() });
        document.getElementById('preBookingForm').innerHTML = `<div class="text-center py-6"><div class="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-4xl mx-auto mb-4"><i class="fa-solid fa-check-double"></i></div><h3 class="text-xl font-black text-hola-purple mb-2">تم استلام حجزك بنجاح!</h3><p class="text-gray-600 font-bold leading-relaxed">سوف نقوم بالتواصل معك خلال ساعه من الان.</p><button onclick="location.reload()" class="mt-6 text-hola-orange font-bold text-sm hover:underline">العودة للرئيسية</button></div>`;
        playAlertSound('congrats'); window.grecaptcha.reset();
    } catch (e) { console.error(e); showMsg("حدث خطأ أثناء الحجز", "error"); }
}

export async function submitInternalPreBooking(type, db, appId, myProfile) {
    if (!db || !myProfile) return;
    const time = document.getElementById('internalPbTime')?.value;
    if (type === 'seat' && !time) return showMsg("اختر موعد الحجز", "error");
    try {
        const reqType = type === 'room' ? 'حجز غرفة خاصة' : 'حجز مقعد';
        const eTime = type === 'room' ? 'سيتم التنسيق' : time;
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'prebookings'), { name: `${myProfile.name} (${reqType})`, phone: myProfile.phone, expectedTime: eTime, status: 'pending', createdAt: Date.now() });
        showMsg("تم إرسال طلب الحجز بنجاح، سنتواصل معك للتأكيد!", "success");
        document.getElementById('internalPbTime').value = '';
    } catch (e) { showMsg("حدث خطأ", "error"); }
}

// ─── Login ────────────────────────────────────────────────────────────────────
export async function handleLogin(db, appId, _profiles, _sessions, sysSettings) {
    if (!db) return showMsg("غير متصل بقاعدة البيانات", "error");
    const p = document.getElementById('loginPhone')?.value.trim();
    const n = document.getElementById('loginName')?.value.trim();
    if (!p || p.length < 10) return showMsg("برجاء إدخال رقم موبايل صحيح", "error");
    if (window._bannedPhones && window._bannedPhones[p]) { playAlertSound('high'); return showMsg("تم حظر هذا الرقم أمنياً. راجع الإدارة.", "error"); }
    if (typeof window.grecaptcha === 'undefined') return showMsg("تعذر تحميل نظام الحماية، يرجى إيقاف AdBlocker.", "error");
    let recaptchaResponse = window.grecaptcha.getResponse(0);
    if (recaptchaResponse.length === 0) recaptchaResponse = window.grecaptcha.getResponse();
    let isError = false; let errorMsg = "";
    if (recaptchaResponse.length === 0) { isError = true; errorMsg = "برجاء تأكيد أنك لست روبوت (reCAPTCHA)"; }
    else if (!_profiles[p] && !n) { document.getElementById('nameField')?.classList.remove('hidden'); isError = true; errorMsg = "برجاء إدخال اسمك الثنائي للتسجيل"; }
    if (isError) {
        window._loginAttempts[p] = (window._loginAttempts[p] || 0) + 1; showMsg(errorMsg, "error");
        if (window._loginAttempts[p] >= 3) {
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'banned_phones', p), { phone: p, timestamp: Date.now(), reason: "تجاوز الحد المسموح من محاولات الدخول الخاطئة (Spam)" });
            await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'notifications'), { phone: 'admin', msg: `تم حظر الرقم ${p} أمنياً!`, type: "high", isRead: false, timestamp: Date.now() });
            showMsg("تم حظر الرقم. راجع الإدارة.", "error"); window.grecaptcha.reset();
        }
        return;
    }
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
        delete window._loginAttempts[p]; window.grecaptcha.reset();
        const exist = Object.values(_sessions).find(s => s.phone === prof.phone && s.status === 'active');
        if (exist) {
            setActiveSessionId(exist.id); setSessionStartTime(exist.startTime); setSessionItems(exist.items || []);
            document.getElementById('navPublic')?.classList.add('hidden'); document.getElementById('navClient')?.classList.remove('hidden');
            switchClientTab('session'); switchView('client'); updateClientHeaderUI(prof, _profiles, sysSettings); window._startTimer(); window.renderSessionItemsList();
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
        // Check subscription code
        const subCodeInput = document.getElementById('loginSubCode');
        const subCode = subCodeInput?.value?.trim()?.toUpperCase();
        if (subCode) {
            // Validate and apply subscription code
            import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js").then(async ({collection: col, query, where, getDocs}) => {
                try {
                    const q = query(col(db, 'artifacts', appId, 'public', 'data', 'subscriptions'), where('code', '==', subCode), where('phone', '==', p), where('status', '==', 'active'));
                    const snap = await getDocs(q);
                    if (!snap.empty) showMsg('✅ كود الاشتراك تم التحقق منه! اليوم سيُخصم من اشتراكك.', 'success');
                    else showMsg('⚠️ كود الاشتراك غير صحيح أو غير مرتبط بهذا الرقم', 'error');
                } catch(e) {}
            }).catch(() => {});
            if (subCodeInput) subCodeInput.value = '';
        }
        const docRef = await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'sessions'), { phone: prof.phone, name: prof.name, startTime: Date.now(), status: 'active', items: [] });
        setActiveSessionId(docRef.id); setSessionStartTime(Date.now()); setSessionItems([]);
        document.getElementById('navPublic')?.classList.add('hidden'); document.getElementById('navClient')?.classList.remove('hidden');
        switchClientTab('session'); switchView('client'); updateClientHeaderUI(prof, _profiles, sysSettings);
        renderClientLoyalty(prof, _profiles, {}, sysSettings); renderClientHistory(prof, _sessions); window._startTimer(); window.renderSessionItemsList();
    } catch (e) { console.error(e); showMsg("خطأ", "error"); }
}

// ─── Admin Auth ───────────────────────────────────────────────────────────────
export function showAdminLoginModal() { document.getElementById('adminLoginModal')?.classList.remove('hidden'); }

export function verifyAdminPin(db, appId, sysSettings, activeSessionId) {
    const pass = document.getElementById('adminPinInput')?.value;
    const sName = document.getElementById('adminShiftName')?.value || "مدير النظام";
    if (pass === sysSettings.adminPin) {
        setCurrentShiftAdmin(sName);
        document.getElementById('currentAdminNameLabel') && (document.getElementById('currentAdminNameLabel').innerText = sName);
        logOperation(db, appId, sName, 'تسجيل دخول/شفت', `استلام شفت: ${sName}`);
        document.getElementById('navAdminBtn')?.classList.add('hidden');
        document.getElementById('navAdminActiveBtn')?.classList.remove('hidden');
        document.getElementById('navPublic')?.classList.add('hidden');
        document.getElementById('adminLoginModal')?.classList.add('hidden');
        switchView('admin'); window.switchAdminTab('live'); playAlertSound('normal');
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
    showMsg("تم تسجيل الخروج", "info");
}
