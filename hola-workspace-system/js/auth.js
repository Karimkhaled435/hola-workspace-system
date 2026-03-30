// =====================================================
// js/auth.js — Location Check, Login & Admin Auth
// =====================================================

import { collection, addDoc, doc, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { db, appId } from "./firebase.js";
import { showMsg, switchView, switchClientTab, updateClientHeaderUI, renderClientLoyalty, renderClientHistory } from "./ui.js";
import {
    sysSettings, _profiles, _sessions, _discounts,
    myProfile, activeSessionId, currentShiftAdmin,
    setMyProfile, setActiveSessionId, setSessionStartTime, setSessionItems, setCurrentShiftAdmin
} from "./sessions.js";
import { playAlertSound, logOperation } from "./app.js";

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
    const checkState = document.getElementById('locationCheckState');
    const loginForm = document.getElementById('loginForm');

    if (!navigator.geolocation) {
        showPreBookingFallback("متصفحك لا يدعم تحديد الموقع، يرجى الحجز المسبق.");
        return;
    }
    showMsg("جاري التحقق من موقعك الفعلي بدقة...", "info");
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const userLat = position.coords.latitude;
            const userLng = position.coords.longitude;
            const workLat = (sysSettings && sysSettings.workspaceLat) ? sysSettings.workspaceLat : 26.5590;
            const workLng = (sysSettings && sysSettings.workspaceLng) ? sysSettings.workspaceLng : 31.6957;
            const maxRadius = (sysSettings && sysSettings.workspaceRadius) ? sysSettings.workspaceRadius : 500;

            const dist = getDistanceFromLatLonInM(userLat, userLng, workLat, workLng);

            if (checkState) checkState.classList.add('hidden');
            if (loginForm) loginForm.classList.remove('hidden');

            if (dist <= maxRadius) {
                window._isRemoteMode = false;
                const header = loginForm.querySelector('.bg-gradient-to-br');
                if(header) {
                    header.className = 'bg-gradient-to-br from-green-600 to-green-700 p-4 text-white text-center';
                    header.innerHTML = '<div class="flex items-center justify-center gap-2 font-black"><i class="fa-solid fa-circle-check text-xl" aria-hidden="true"></i> تم تأكيد موقعك داخل المكان</div>';
                }
                showMsg("تم التأكد من موقعك بنجاح! تفضل بتسجيل الدخول.", "success");
            } else {
                window._isRemoteMode = true;
                const header = loginForm.querySelector('.bg-gradient-to-br');
                if(header) {
                    header.className = 'bg-gradient-to-br from-gray-600 to-gray-800 p-4 text-white text-center';
                    header.innerHTML = '<div class="flex items-center justify-center gap-2 font-black"><i class="fa-solid fa-user-clock text-xl" aria-hidden="true"></i> أنت خارج نطاق المكان (عن بُعد)</div><p class="text-xs mt-1">يُسمح بدخول العملاء المسجلين مسبقاً فقط للاستعلام</p>';
                }
            }
        },
        (error) => {
            showPreBookingFallback("تعذر الوصول لموقعك الجغرافي. تأكد من تفعيل الـ GPS بدقة عالية.");
        },
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

export function checkNewUser(val) {
    if (!val) return;
    const p = val.trim();
    const nField = document.getElementById('nameField');
    if (!nField) return;
    if (p.length >= 10) {
        if (_profiles && _profiles[p]) {
            nField.classList.add('hidden');
        } else {
            if (window._isRemoteMode) {
                nField.classList.add('hidden');
                showMsg("لا يمكنك التسجيل لأول مرة وأنت خارج نطاق المكان", "error");
            } else {
                nField.classList.remove('hidden');
            }
        }
    } else {
        nField.classList.add('hidden');
    }
}

// ─── Pre-booking & Quick Booking ──────────────────────────────────────────────
export async function submitPreBooking() {
    if (!db) return showMsg("غير متصل بقاعدة البيانات", "error");
    const name = document.getElementById('pbName')?.value.trim();
    const phone = document.getElementById('pbPhone')?.value.trim();
    const time = document.getElementById('pbTime')?.value;
    if (!name || !phone || !time) return showMsg("برجاء إكمال بيانات الحجز", "error");
    
    try {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'prebookings'), { name, phone, expectedTime: time, status: 'pending', createdAt: Date.now() });
        document.getElementById('preBookingForm').innerHTML = `<div class="text-center py-6"><div class="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-4xl mx-auto mb-4"><i class="fa-solid fa-check-double" aria-hidden="true"></i></div><h3 class="text-xl font-black text-hola-purple mb-2">تم استلام حجزك بنجاح!</h3><p class="text-gray-600 font-bold leading-relaxed">سوف نقوم بالتواصل معك لتأكيد الحجز.</p><button data-action="reset-location-check" class="mt-6 text-hola-orange font-bold text-sm hover:underline">العودة للرئيسية</button></div>`;
        playAlertSound('congrats');
    } catch (e) { console.error(e); showMsg("حدث خطأ أثناء الحجز", "error"); }
}

export async function submitInternalPreBooking(type) {
    if (!db || !myProfile) return;
    const time = document.getElementById('internalPbTime')?.value;
    if (type === 'seat' && !time) return showMsg("اختر موعد الحجز", "error");
    try {
        const reqType = type === 'room' ? 'حجز غرفة خاصة' : 'حجز مقعد';
        const eTime = type === 'room' ? 'سيتم التنسيق' : time;
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'prebookings'), { name: `${myProfile.name} (${reqType})`, phone: myProfile.phone, expectedTime: eTime, status: 'pending', createdAt: Date.now() });
        showMsg("تم إرسال طلب الحجز بنجاح، سنتواصل معك للتأكيد!", "success");
        const tEl = document.getElementById('internalPbTime'); if(tEl) tEl.value = '';
    } catch (e) { showMsg("حدث خطأ", "error"); }
}

export function showQuickBookModal() {
    const today = new Date().toLocaleDateString('ar-EG');
    const key = `hola_quickbook_${today}`;
    const count = parseInt(localStorage.getItem(key) || '0');
    if (count >= 2) {
        showMsg("لقد استخدمت هذا الخيار مرتين اليوم. حاول غداً أو استخدم الحجز المسبق.", "error");
        return;
    }
    document.getElementById('quickBookModal')?.classList.remove('hidden');
}

export async function submitQuickBook() {
    if (!db) return showMsg("غير متصل بقاعدة البيانات", "error");
    const phone = document.getElementById('quickBookPhone')?.value.trim();
    const type = document.getElementById('quickBookType')?.value;
    const note = document.getElementById('quickBookNote')?.value.trim() || '';
    if (!phone || phone.length < 10) return showMsg("أدخل رقم هاتف صحيح", "error");
    const today = new Date().toLocaleDateString('ar-EG');
    const key = `hola_quickbook_${today}`;
    const count = parseInt(localStorage.getItem(key) || '0');
    if (count >= 2) return showMsg("وصلت للحد الأقصى (2 مرات يومياً)", "error");
    try {
        const typeLabel = type === 'room' ? 'حجز غرفة خاصة' : 'حجز مقعد عادي';
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'prebookings'), {
            name: `حجز سريع (${phone})`, phone, type: typeLabel, note,
            expectedTime: 'سيتم التنسيق', status: 'pending', isQuickBook: true, createdAt: Date.now()
        });
        localStorage.setItem(key, String(count + 1));
        document.getElementById('quickBookModal').innerHTML = `
            <div class="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 text-center border-t-8 border-green-500">
                <div class="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-4xl mx-auto mb-4"><i class="fa-solid fa-check-double" aria-hidden="true"></i></div>
                <h3 class="text-xl font-black text-hola-purple mb-3">تم استلام حجزك!</h3>
                <p class="text-gray-600 font-bold leading-relaxed text-sm">سنقوم بالتواصل معك على رقم <span class="text-hola-purple font-black">${phone}</span> قريباً لتأكيد الحجز.</p>
                <p class="text-[10px] text-gray-400 mt-2">متبقي لك ${1 - count} حجز سريع اليوم</p>
                <button data-action="close-quick-book-reload" class="mt-6 text-hola-orange font-bold text-sm hover:underline">إغلاق</button>
            </div>`;
        playAlertSound('congrats');
    } catch (e) { showMsg("حدث خطأ أثناء الحجز", "error"); }
}

// ─── Login ────────────────────────────────────────────────────────────────────
export async function handleLogin() {
    if (!db) return showMsg("غير متصل بقاعدة البيانات", "error");
    const p = document.getElementById('loginPhone')?.value.trim();
    const n = document.getElementById('loginName')?.value.trim();
    const nameEl = document.getElementById('loginName');
    const nameField = document.getElementById('nameField');
    
    if (!p || p.length < 10) return showMsg("برجاء إدخال رقم موبايل صحيح", "error");
    if (window._bannedPhones && window._bannedPhones[p]) { playAlertSound('high'); return showMsg("تم حظر هذا الرقم أمنياً. راجع الإدارة.", "error"); }

    const userExists = _profiles && _profiles[p];

    // Remote Mode Restrictions
    if (window._isRemoteMode) {
        if (!userExists) {
            showMsg("عذراً، أنت خارج المكان. يجب الحضور لمساحة العمل أول مرة لتفعيل حسابك.", "error");
            return;
        }
        // User exists, allow remote viewing
        setMyProfile(userExists);
        if(window.renderRemoteProfileData) window.renderRemoteProfileData(p);
        document.getElementById('remoteProfileModal')?.classList.remove('hidden');
        return;
    }

    // Normal Login
    if (!userExists && (!n || n.trim() === "")) {
        if(nameField) nameField.classList.remove('hidden');
        showMsg("برجاء إدخال اسمك الثنائي للتسجيل", "error");
        if (nameEl) nameEl.focus();
        return;
    }

    try {
        let prof;
        if (!userExists) {
            const newProfile = { name: n, phone: p, walletBalance: 0, stamps: [], joinedAt: Date.now() };
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'profiles', p), newProfile);
            prof = newProfile; _profiles[p] = newProfile; showMsg("تم إنشاء حسابك بنجاح!", "success");
        } else {
            prof = _profiles[p]; showMsg(`أهلاً بك مجدداً يا ${window.maskName(prof.name)}!`, "success");
        }
        setMyProfile(prof);

        const exist = Object.values(_sessions).find(s => s.phone === prof.phone && s.status === 'active');
        if (exist) {
            setActiveSessionId(exist.id); setSessionStartTime(exist.startTime); setSessionItems(exist.items || []);
            document.getElementById('navPublic')?.classList.add('hidden'); document.getElementById('navClient')?.classList.remove('hidden');
            switchClientTab('session'); switchView('client'); updateClientHeaderUI(prof, _profiles, sysSettings); window._startTimer(); window.renderSessionItemsList();
            const eBanner = document.getElementById('eventBanner'); if (eBanner && sysSettings && sysSettings.evActive) eBanner.classList.remove('hidden');
            showMsg("تم استعادة جلستك النشطة", "info"); return;
        }

        const todayStr = new Date().toLocaleDateString('ar-EG'); let userStamps = prof.stamps || [];
        let lastStampDate = userStamps.length > 0 ? new Date(userStamps[userStamps.length - 1]).toLocaleDateString('ar-EG') : null;
        if (lastStampDate !== todayStr) {
            userStamps.push(Date.now());
            if (userStamps.length >= (sysSettings?.stampsRequired || 7)) {
                const code = "RWD" + Math.random().toString(36).substring(2, 6).toUpperCase();
                await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'discounts'), { code, value: 100, isPercentage: true, assignedTo: prof.phone, title: "مكافأة الختم", isUsed: false, createdAt: Date.now() });
                userStamps = [];
            }
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'profiles', prof.phone), { ...prof, stamps: userStamps }); 
            prof.stamps = userStamps;
        }

        const docRef = await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'sessions'), { phone: prof.phone, name: prof.name, startTime: Date.now(), status: 'active', items: [] });
        setActiveSessionId(docRef.id); setSessionStartTime(Date.now()); setSessionItems([]);
        
        document.getElementById('navPublic')?.classList.add('hidden'); document.getElementById('navClient')?.classList.remove('hidden');
        switchClientTab('session'); switchView('client'); updateClientHeaderUI(prof, _profiles, sysSettings);
        renderClientLoyalty(prof, _profiles, _discounts, sysSettings); renderClientHistory(prof, _sessions); window._startTimer(); window.renderSessionItemsList();
        
        document.getElementById('loginPhone').value = "";
        if (nameEl) nameEl.value = "";
        document.getElementById('locationCheckState')?.classList.remove('hidden');
        document.getElementById('loginForm')?.classList.add('hidden');
    } catch (e) { console.error(e); showMsg("خطأ", "error"); }
}

// ─── Admin Auth ───────────────────────────────────────────────────────────────
export function showAdminLoginModal() { document.getElementById('adminLoginModal')?.classList.remove('hidden'); }

export function verifyAdminPin() {
    const pass = document.getElementById('adminPinInput')?.value;
    const sName = document.getElementById('adminShiftName')?.value || "مدير النظام";
    
    if (sysSettings && pass === sysSettings.adminPin) {
        setCurrentShiftAdmin(sName);
        document.getElementById('currentAdminNameLabel') && (document.getElementById('currentAdminNameLabel').innerText = sName);
        logOperation(db, appId, sName, 'تسجيل دخول/شفت', `استلام شفت: ${sName}`);
        document.getElementById('navAdminBtn')?.classList.add('hidden');
        document.getElementById('navAdminActiveBtn')?.classList.remove('hidden');
        document.getElementById('navPublic')?.classList.add('hidden');
        document.getElementById('adminLoginModal')?.classList.add('hidden');
        switchView('admin'); window.switchAdminTab('live'); playAlertSound('normal');
        showMsg("تم استلام الشفت", "success");
        if(document.getElementById('adminPinInput')) document.getElementById('adminPinInput').value = '';
    } else {
        showMsg("كلمة مرور غير صحيحة", "error");
    }
}

export function logoutAdmin() {
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
