// =====================================================
// js/cards.js — Internet Cards Management Module
// =====================================================

import { collection, addDoc, updateDoc, doc, deleteDoc, getDocs, query, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { showMsg } from "./ui.js";
import { logOperation } from "./app.js";

// ─── Code Generation Helpers ──────────────────────────────────────────────────
function randomSegment(length = 4) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1 to avoid confusion
    let result = '';
    for (let i = 0; i < length; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    return result;
}

function generateCode(prefix = 'HOLA') {
    return `${prefix}-${randomSegment(4)}-${randomSegment(4)}`;
}

// ─── Generate Multiple Cards ───────────────────────────────────────────────────
// Creates `count` new card documents in Firestore and returns the card objects.
export async function generateCards(db, appId, { count = 1, quotaGB = 5, validityDays = 30, prefix = 'HOLA' } = {}) {
    if (!db) return showMsg("قاعدة البيانات غير متصلة", "error");
    if (count < 1 || count > 100) return showMsg("العدد يجب أن يكون بين 1 و 100", "error");

    const now = Date.now();
    const expiresAt = now + validityDays * 86400000;
    const quotaMB = quotaGB * 1024;
    const generated = [];

    for (let i = 0; i < count; i++) {
        const code = generateCode(prefix);
        const cardData = {
            code,
            quotaGB,
            validityDays,
            status: 'active',
            usedMB: 0,
            quotaMB,
            createdAt: now,
            expiresAt,
            boundDevice: null,
            boundDeviceInfo: null,
            boundAt: null,
            lastUsed: null,
            prefix
        };
        const ref = await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'internet_cards'), cardData);
        generated.push({ id: ref.id, ...cardData });
    }

    logOperation(db, appId, window._currentShiftAdmin || "الإدارة", 'إنشاء كروت إنترنت', `${count} كرت - ${quotaGB}GB لمدة ${validityDays} يوم`);
    showMsg(`تم إنشاء ${count} كرت بنجاح`, "success");
    return generated;
}

// ─── Activate / Deactivate a Card ─────────────────────────────────────────────
// status: 'active' | 'inactive' | 'suspended'
export async function setCardStatus(db, appId, cardId, status) {
    if (!db) return;
    const allowed = ['active', 'inactive', 'suspended'];
    if (!allowed.includes(status)) return showMsg("حالة غير صالحة", "error");
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'internet_cards', cardId), { status });
    showMsg(`تم تغيير حالة الكرت إلى: ${status}`, "success");
    logOperation(db, appId, window._currentShiftAdmin || "الإدارة", 'تغيير حالة كرت', `${cardId} → ${status}`);
}

// ─── Delete a Card ────────────────────────────────────────────────────────────
export async function deleteCard(db, appId, cardId) {
    if (!db) return;
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'internet_cards', cardId));
    showMsg("تم حذف الكرت", "success");
    logOperation(db, appId, window._currentShiftAdmin || "الإدارة", 'حذف كرت إنترنت', cardId);
}

// ─── Get Card by Code (User Login) ────────────────────────────────────────────
// Searches the internet_cards collection for a card matching the given code.
export async function getCardByCode(db, appId, code) {
    if (!db) return null;
    const q = query(
        collection(db, 'artifacts', appId, 'public', 'data', 'internet_cards'),
        where('code', '==', code.trim().toUpperCase())
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const docSnap = snap.docs[0];
    return { id: docSnap.id, ...docSnap.data() };
}

// ─── Bind Card to Device (First Login) ────────────────────────────────────────
// Locks the card to the first device that uses it, preventing sharing.
export async function bindCardToDevice(db, appId, cardId, deviceId, deviceInfo) {
    if (!db) return;
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'internet_cards', cardId), {
        boundDevice: deviceId,
        boundDeviceInfo: deviceInfo || null,
        boundAt: Date.now(),
        lastUsed: Date.now()
    });
}

// ─── Update Card Usage (Deduct MB) ────────────────────────────────────────────
// Adds usedMB to the running total; marks card as expired if quota exhausted.
export async function updateCardUsage(db, appId, cardId, usedMB) {
    if (!db) return;
    // We read the card first to compute the new total
    const { getDoc } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
    const cardRef = doc(db, 'artifacts', appId, 'public', 'data', 'internet_cards', cardId);
    const snap = await getDoc(cardRef);
    if (!snap.exists()) return;

    const card = snap.data();
    const newUsedMB = (card.usedMB || 0) + usedMB;
    const updates = { usedMB: newUsedMB, lastUsed: Date.now() };

    if (newUsedMB >= card.quotaMB) updates.status = 'expired';

    await updateDoc(cardRef, updates);
}

// ─── Check if Card is Valid ────────────────────────────────────────────────────
// Pure function — no Firebase needed. Returns true only if the card can be used.
export function isCardValid(card) {
    if (!card) return false;
    if (card.status !== 'active') return false;
    if (Date.now() > card.expiresAt) return false;
    if (card.usedMB >= card.quotaMB) return false;
    return true;
}

// ─── Reset Card Device Binding (Admin Action) ─────────────────────────────────
// Clears device lock so the card can be used on a different device.
export async function resetCardBinding(db, appId, cardId) {
    if (!db) return;
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'internet_cards', cardId), {
        boundDevice: null,
        boundDeviceInfo: null,
        boundAt: null
    });
    showMsg("تم إعادة تعيين الجهاز المرتبط", "success");
    logOperation(db, appId, window._currentShiftAdmin || "الإدارة", 'إعادة ربط كرت', cardId);
}

// ─── Render Admin Cards Table ──────────────────────────────────────────────────
// Returns an HTML string for the admin cards management table.
export function renderAdminCards(cards) {
    if (!cards || cards.length === 0) {
        return '<p class="text-center text-gray-400 py-6">لا يوجد كروت إنترنت بعد.</p>';
    }

    const statusBadge = (status) => {
        const map = {
            active:    'bg-green-100 text-green-700',
            inactive:  'bg-gray-100 text-gray-500',
            suspended: 'bg-yellow-100 text-yellow-700',
            expired:   'bg-red-100 text-red-500'
        };
        const labels = { active: 'نشط', inactive: 'غير نشط', suspended: 'موقوف', expired: 'منتهي' };
        const cls = map[status] || 'bg-gray-100 text-gray-500';
        return `<span class="px-2 py-0.5 rounded-full text-xs font-bold ${cls}">${labels[status] || status}</span>`;
    };

    const rows = cards.map(card => {
        const usedGB   = (card.usedMB / 1024).toFixed(2);
        const quotaGB  = (card.quotaMB / 1024).toFixed(0);
        const pct      = Math.min(100, Math.round((card.usedMB / card.quotaMB) * 100));
        const expDate  = new Date(card.expiresAt).toLocaleDateString('ar-EG');
        const barColor = pct >= 90 ? 'bg-red-400' : pct >= 60 ? 'bg-yellow-400' : 'bg-green-400';

        return `
        <tr class="border-b hover:bg-gray-50 transition-colors text-sm">
            <td class="px-3 py-2 font-mono font-bold select-all text-hola-purple">${card.code}</td>
            <td class="px-3 py-2 text-center">${statusBadge(card.status)}</td>
            <td class="px-3 py-2 text-center">
                <div class="flex items-center gap-2">
                    <div class="flex-1 bg-gray-200 rounded-full h-2">
                        <div class="${barColor} h-2 rounded-full" style="width:${pct}%"></div>
                    </div>
                    <span class="text-xs text-gray-500 whitespace-nowrap">${usedGB}/${quotaGB} GB</span>
                </div>
            </td>
            <td class="px-3 py-2 text-center text-gray-500">${expDate}</td>
            <td class="px-3 py-2 text-center text-xs text-gray-400">${card.boundDevice ? `<span title="${card.boundDevice}">🔒 مرتبط</span>` : '—'}</td>
            <td class="px-3 py-2 text-center">
                <div class="flex gap-1 justify-center flex-wrap">
                    ${card.status === 'active'
                        ? `<button onclick="window.cardAction('suspend','${card.id}')" class="text-xs bg-yellow-100 hover:bg-yellow-200 text-yellow-700 px-2 py-1 rounded">إيقاف</button>`
                        : `<button onclick="window.cardAction('activate','${card.id}')" class="text-xs bg-green-100 hover:bg-green-200 text-green-700 px-2 py-1 rounded">تفعيل</button>`
                    }
                    ${card.boundDevice
                        ? `<button onclick="window.cardAction('resetBind','${card.id}')" class="text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 px-2 py-1 rounded">فك الربط</button>`
                        : ''
                    }
                    <button onclick="window.cardAction('delete','${card.id}')" class="text-xs bg-red-100 hover:bg-red-200 text-red-600 px-2 py-1 rounded">حذف</button>
                </div>
            </td>
        </tr>`;
    }).join('');

    return `
    <table class="w-full text-right border-collapse">
        <thead>
            <tr class="bg-gray-100 text-xs text-gray-600">
                <th class="px-3 py-2 text-right">الكود</th>
                <th class="px-3 py-2 text-center">الحالة</th>
                <th class="px-3 py-2 text-center">الاستهلاك</th>
                <th class="px-3 py-2 text-center">ينتهي</th>
                <th class="px-3 py-2 text-center">الجهاز</th>
                <th class="px-3 py-2 text-center">إجراء</th>
            </tr>
        </thead>
        <tbody>${rows}</tbody>
    </table>`;
}

// ─── Render Card Login Result (User View) ─────────────────────────────────────
// Returns an HTML string showing card status to the user after they enter their code.
export function renderCardLoginResult(card) {
    if (!card) {
        return `
        <div class="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
            <span class="text-3xl">❌</span>
            <div>
                <p class="font-bold text-red-700">الكود غير موجود</p>
                <p class="text-sm text-red-500">تأكد من الكود وحاول مرة أخرى</p>
            </div>
        </div>`;
    }

    const valid      = isCardValid(card);
    const usedGB     = (card.usedMB / 1024).toFixed(2);
    const quotaGB    = (card.quotaMB / 1024).toFixed(0);
    const remainMB   = Math.max(0, card.quotaMB - card.usedMB);
    const remainGB   = (remainMB / 1024).toFixed(2);
    const pct        = Math.min(100, Math.round((card.usedMB / card.quotaMB) * 100));
    const expDate    = new Date(card.expiresAt).toLocaleDateString('ar-EG');
    const barColor   = pct >= 90 ? 'bg-red-400' : pct >= 60 ? 'bg-yellow-400' : 'bg-green-400';

    const statusMessages = {
        inactive:  { icon: '⏸️', title: 'الكرت غير مفعّل', sub: 'تواصل مع الإدارة لتفعيل الكرت', cls: 'bg-gray-50 border-gray-200' },
        suspended: { icon: '🚫', title: 'الكرت موقوف مؤقتاً', sub: 'تواصل مع الإدارة', cls: 'bg-yellow-50 border-yellow-200' },
        expired:   { icon: '⌛', title: 'انتهت صلاحية الكرت', sub: 'الكوتا أو مدة الصلاحية انتهت', cls: 'bg-red-50 border-red-200' }
    };

    if (!valid) {
        const now = Date.now();
        const key = card.status !== 'active' ? card.status : (now > card.expiresAt || card.usedMB >= card.quotaMB ? 'expired' : 'inactive');
        const msg = statusMessages[key] || statusMessages['expired'];
        return `
        <div class="flex items-center gap-3 ${msg.cls} border rounded-xl p-4">
            <span class="text-3xl">${msg.icon}</span>
            <div>
                <p class="font-bold text-gray-800">${msg.title}</p>
                <p class="text-sm text-gray-500">${msg.sub}</p>
            </div>
        </div>`;
    }

    return `
    <div class="bg-green-50 border border-green-200 rounded-xl p-4 space-y-3">
        <div class="flex items-center gap-3">
            <span class="text-3xl">✅</span>
            <div>
                <p class="font-bold text-green-800">الكرت نشط وصالح للاستخدام</p>
                <p class="font-mono text-sm text-gray-500">${card.code}</p>
            </div>
        </div>
        <div class="bg-white rounded-lg p-3 space-y-2">
            <div class="flex justify-between text-sm">
                <span class="text-gray-500">الكوتا المتبقية</span>
                <span class="font-bold text-green-700">${remainGB} GB</span>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-2">
                <div class="${barColor} h-2 rounded-full transition-all" style="width:${pct}%"></div>
            </div>
            <div class="flex justify-between text-xs text-gray-400">
                <span>مُستخدم: ${usedGB} GB</span>
                <span>الإجمالي: ${quotaGB} GB</span>
            </div>
        </div>
        <div class="flex justify-between text-xs text-gray-500 border-t pt-2">
            <span>📅 ينتهي: ${expDate}</span>
            ${card.boundDevice ? '<span>🔒 مرتبط بجهازك</span>' : '<span>🔓 سيُربط بجهازك عند الاتصال</span>'}
        </div>
    </div>`;
}
