// =====================================================
// js/vouchers.js — Discounts, Vouchers & Menu Management
// =====================================================

import { collection, addDoc, updateDoc, doc, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { showMsg } from "./ui.js";
import { logOperation } from "./app.js";
import { _discounts, _sessions, _profiles, myProfile, activeSessionId, appliedDiscountVal, setAppliedDiscountVal, sessionItems } from "./sessions.js";

// ─── Discount Code Apply ──────────────────────────────────────────────────────
export async function applyDiscountCode() {
    const uPhone = myProfile?.phone || (_sessions[activeSessionId]?.phone);
    const cEl = document.getElementById('discountCode');
    const code = cEl ? cEl.value.trim().toUpperCase() : '';
    const dDoc = Object.values(_discounts).find(d => d.code === code);
    if (!dDoc) return showMsg("كود خاطئ", "error");
    if (dDoc.isUsed) return showMsg("كود مُستخدم مسبقاً", "error");
    if (dDoc.assignedTo && dDoc.assignedTo !== uPhone) return showMsg("هذا الكود لعميل آخر", "error");
    const tC = parseInt(document.getElementById('clientTimeCost')?.innerText) || 0;
    const iC = parseInt(document.getElementById('clientItemsCost')?.innerText) || 0;
    const baseTotal = tC + iC;
    let discVal = dDoc.isPercentage ? Math.floor(baseTotal * (dDoc.value / 100)) : dDoc.value;
    setAppliedDiscountVal(discVal);
    if (cEl) cEl.dataset.appliedId = dDoc.id;
    window.recalcTotal();
    const msgEl = document.getElementById('discountMsg');
    if (msgEl) { msgEl.innerText = `تم تطبيق خصم: ${discVal} ج!`; msgEl.classList.remove('hidden'); }
}

// ─── Save / Delete Discount ───────────────────────────────────────────────────
export async function saveDiscount(db, appId) {
    if (!db) return;
    const c = document.getElementById('newDiscountCode')?.value.toUpperCase();
    const v = parseInt(document.getElementById('newDiscountValue')?.value);
    const p = (document.getElementById('newDiscountType')?.value === 'percent');
    if (!c || !v) return showMsg("أكمل البيانات", "error");
    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'discounts'), { code: c, value: v, isPercentage: p, assignedTo: null, isUsed: false, createdAt: Date.now() });
    document.getElementById('discountModal')?.classList.add('hidden');
    showMsg("تم إنشاء الكود", "success");
    logOperation(db, appId, window._currentShiftAdmin || "الإدارة", 'كود خصم عام', c);
}

export async function deleteDiscount(id, db, appId) {
    if (!db) return;
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'discounts', id));
}

export function showDiscountModal() { document.getElementById('discountModal')?.classList.remove('hidden'); }

// ─── Menu Management ──────────────────────────────────────────────────────────
export async function saveMenuItem(db, appId) {
    if (!db) return;
    const n = document.getElementById('menuName')?.value;
    const p = parseInt(document.getElementById('menuPrice')?.value);
    const t = document.getElementById('menuType')?.value;
    const i = document.getElementById('menuIcon')?.value;
    if (!n || !p) return showMsg("أكمل البيانات", "error");
    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'menu'), { name: n, price: p, type: t, icon: i });
    document.getElementById('menuModal')?.classList.add('hidden');
    showMsg("تم الإضافة", "success");
    logOperation(db, appId, window._currentShiftAdmin || "الإدارة", 'إضافة للمنيو', n);
}

export async function deleteMenuItem(id, db, appId) {
    if (!db) return;
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'menu', id));
    logOperation(db, appId, window._currentShiftAdmin || "الإدارة", 'حذف من المنيو', id);
}

export function showMenuModal() { document.getElementById('menuModal')?.classList.remove('hidden'); }

// ─── User Wallet & Notifications (Admin) ─────────────────────────────────────
export function openUserManage(phone, _profiles, setCurrentManageUserPhone) {
    setCurrentManageUserPhone(phone);
    const prof = _profiles[phone];
    const safeSet = (id, prop, val) => { const el = document.getElementById(id); if (el) el[prop] = val; };
    safeSet('manageUserName', 'innerText', `إجراء سريع: ${prof.name}`);
    safeSet('manageUserPhone', 'innerText', prof.phone);
    safeSet('manageUserWallet', 'value', prof.walletBalance || 0);
    safeSet('manageUserMsg', 'value', '');
    safeSet('manageUserDiscountVal', 'value', '');
    document.getElementById('userManageModal')?.classList.remove('hidden');
}

export async function saveUserWallet(db, appId, currentManageUserPhone, _profiles) {
    if (!db) return;
    const mWallet = document.getElementById('manageUserWallet');
    const newBal = mWallet ? (parseInt(mWallet.value) || 0) : 0;
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'profiles', currentManageUserPhone), { walletBalance: newBal });
    showMsg("تم تحديث الفكة للعميل", "success");
    logOperation(db, appId, window._currentShiftAdmin || "الإدارة", 'تعديل محفظة', `فكة العميل ${currentManageUserPhone} بقت ${newBal} ج`);
}

export async function sendUserMsgOnly(db, appId, currentManageUserPhone) {
    if (!db) return;
    const m = document.getElementById('manageUserMsg')?.value.trim();
    const t = document.getElementById('manageUserNotifType')?.value || 'normal';
    const img = document.getElementById('manageUserImgUrl')?.value.trim() || '';
    const lnk = document.getElementById('manageUserLinkUrl')?.value.trim() || '';
    const embedCode = document.getElementById('manageUserEmbedUrl')?.value.trim() || '';
    if (!m) return showMsg("اكتب رسالة", "error");
    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'notifications'), {
        phone: currentManageUserPhone, msg: m, type: t,
        imgUrl: img || null, linkUrl: lnk || null,
        embedCode: embedCode || null,
        isRead: false, timestamp: Date.now()
    });
    showMsg("تم الإرسال", "success");
    const msgEl = document.getElementById('manageUserMsg'); if (msgEl) msgEl.value = '';
    const imgEl = document.getElementById('manageUserImgUrl'); if (imgEl) imgEl.value = '';
    const lnkEl = document.getElementById('manageUserLinkUrl'); if (lnkEl) lnkEl.value = '';
    const emEl = document.getElementById('manageUserEmbedUrl'); if (emEl) emEl.value = '';
}

export async function sendUserDiscountOnly(db, appId, currentManageUserPhone) {
    if (!db) return;
    const v = parseInt(document.getElementById('manageUserDiscountVal')?.value);
    const t = document.getElementById('manageUserDiscountType')?.value === 'percent';
    if (!v) return showMsg("أدخل قيمة", "error");
    const c = "VIP" + Math.random().toString(36).substring(2, 6).toUpperCase();
    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'discounts'), { code: c, value: v, isPercentage: t, assignedTo: currentManageUserPhone, title: "كود خاص", isUsed: false, createdAt: Date.now() });
    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'notifications'), { phone: currentManageUserPhone, msg: `كود خصم خاص كهدية من الإدارة بقيمة ${t ? `%${v}` : `${v}ج`} 🎁، تحقق من أكوادك!`, type: "congrats", discountCode: c, isRead: false, timestamp: Date.now() });
    showMsg(`تم الإرسال`, "success");
    logOperation(db, appId, window._currentShiftAdmin || "الإدارة", 'إرسال كود', `كود ${c} للعميل ${currentManageUserPhone}`);
}

export function openUserDetails(phone, _profiles, _sessions, _discounts) {
    const prof = _profiles[phone]; if (!prof) return;
    const safeSet = (id, prop, val) => { const el = document.getElementById(id); if (el) el[prop] = val; };
    safeSet('detailsName', 'innerText', prof.name); safeSet('detailsPhone', 'innerText', prof.phone);
    safeSet('detailsWallet', 'innerText', `${prof.walletBalance || 0} ج`); safeSet('detailsStamps', 'innerText', prof.stamps?.length || 0);
    const wa = document.getElementById('detailsWhatsapp');
    if (wa) wa.href = `https://wa.me/${phone.startsWith('0') ? '2' + phone : phone}`;
    const uSes = Object.values(_sessions).filter(s => s.phone === phone).sort((a, b) => b.startTime - a.startTime);
    const sesL = document.getElementById('detailsSessionsList');
    if (sesL) {
        if (uSes.length === 0) sesL.innerHTML = '<p class="text-sm text-gray-500 text-center py-2">لا يوجد جلسات.</p>';
        else sesL.innerHTML = uSes.map(s =>
            `<div class="bg-gray-50 border p-3 rounded-lg">
                <div class="flex justify-between border-b pb-1 mb-1">
                    <span class="font-bold text-hola-purple">${new Date(s.startTime).toLocaleDateString('ar-EG')}</span>
                    ${s.status === 'active' ? '<span class="text-green-500 text-xs font-bold">نشط الآن</span>' : `<span class="text-gray-500 text-xs font-bold">دفع: ${s.finalCost} ج</span>`}
                </div>
                <p class="text-xs text-gray-600 leading-relaxed">الطلبات: ${s.items?.map(i => i.name).join(', ') || 'لا يوجد'}</p>
            </div>`
        ).join('');
    }
    const uDisc = Object.values(_discounts).filter(d => d.assignedTo === phone).sort((a, b) => b.createdAt - a.createdAt);
    const discL = document.getElementById('detailsDiscountsList');
    if (discL) {
        if (uDisc.length === 0) discL.innerHTML = '<p class="col-span-full text-sm text-gray-500 text-center py-2">لا يوجد أكواد.</p>';
        else discL.innerHTML = uDisc.map(d =>
            `<div class="bg-orange-50 border border-orange-100 p-2 rounded-lg flex justify-between items-center">
                <span class="font-mono font-bold text-sm select-all">${d.code}</span>
                <div class="text-left">
                    <p class="font-black text-hola-orange text-sm">${d.isPercentage ? `%${d.value}` : `${d.value}ج`}</p>
                    ${d.isUsed ? '<span class="text-red-500 text-[10px]">مُستخدم</span>' : '<span class="text-green-500 text-[10px]">متاح</span>'}
                </div>
            </div>`
        ).join('');
    }
    document.getElementById('userDetailsModal')?.classList.remove('hidden');
}

export async function unbanPhone(phone, db, appId) {
    if (!db) return;
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'banned_phones', phone));
    showMsg("تم فك الحظر بنجاح", "success");
}

export async function markPreBookingDone(id, db, appId) {
    if (!db) return;
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'prebookings', id), { status: 'contacted' });
    showMsg("تم أرشفة الحجز", "success");
}

export async function deleteAllHistory(db, appId, _sessions) {
    if (!db || !confirm("هل أنت متأكد من مسح السجل بالكامل؟ لا يمكن التراجع عن هذا!")) return;
    const completed = Object.values(_sessions).filter(s => s.status === 'completed');
    for (let s of completed) await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'sessions', s.id));
    showMsg("تم تنظيف السجل بنجاح", "success");
}

export async function deleteAllArchivedBookings(db, appId, _prebookings) {
    if (!db || !confirm("هل أنت متأكد من مسح أرشيف الحجوزات؟")) return;
    const archived = Object.values(_prebookings).filter(p => p.status === 'contacted');
    for (let p of archived) await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'prebookings', p.id));
    showMsg("تم تنظيف الأرشيف", "success");
}

export function exportTableToCSV(tableId, filename) {
    const table = document.getElementById(tableId); if (!table) return;
    let csv = [];
    for (let i = 0; i < table.rows.length; i++) {
        let row = [], cols = table.rows[i].querySelectorAll("td, th");
        for (let j = 0; j < cols.length; j++) {
            if (!cols[j].querySelector('button') && cols[j].innerText.trim() !== "إجراء" && cols[j].innerText.trim() !== "طباعة") {
                row.push('"' + cols[j].innerText.replace(/"/g, '""') + '"');
            }
        }
        if (row.length > 0) csv.push(row.join(","));
    }
    const blob = new Blob(["\uFEFF" + csv.join("\n")], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob); link.download = filename + ".csv"; link.click();
}
