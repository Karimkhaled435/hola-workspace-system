// =====================================================
// js/print.js — Invoice & Report Print Logic
// =====================================================

/* global scrollTo, print, open, confirm, alert, prompt, setTimeout, setInterval, clearTimeout, clearInterval, localStorage, sessionStorage, navigator, location, history, performance, fetch, URL, URLSearchParams */
/* eslint-disable no-undef */
import { safeSet } from "./ui.js";
import { _sessions } from "./sessions.js";

function calculateTimeCost(diffMs, sysSettings) {
    if (diffMs <= 0) return 0;
    const hours = Math.ceil(diffMs / 3600000);
    let cost = 0;
    if (hours >= 1) cost += sysSettings.pricingTier1;
    if (hours >= 2) cost += sysSettings.pricingTier2;
    if (hours >= 3) cost += sysSettings.pricingTier3;
    return cost;
}

export function printInvoice(id, _sessions, sysSettings) {
    // ★ حاول الحصول على الجلسة من المرجع المحلي أو من window._allSessionsRef
    let s = _sessions ? _sessions[id] : null;
    if (!s && window._allSessionsRef) s = window._allSessionsRef[id];
    if (!s) { console.warn('printInvoice: session not found', id); window.showMsg && window.showMsg('لم يتم العثور على الجلسة', 'error'); return; }

    safeSet('printDate', 'innerText', new Date(s.endTime || Date.now()).toLocaleString('ar-EG'));
    safeSet('printClientName', 'innerText', s.name || '---');
    safeSet('printClientPhone', 'innerText', s.phone || '---');
    safeSet('printAdminName', 'innerText', s.shiftAdmin || "الإدارة");

    const durMs = s.durationMs || (s.endTime ? s.endTime - s.startTime : 0);
    const durH = Math.floor(durMs / 3600000);
    const durM = Math.floor((durMs % 3600000) / 60000);
    safeSet('printDuration', 'innerText', `${durH} ساعة و ${durM} دقيقة`);

    const tCost = calculateTimeCost(durMs, sysSettings);
    safeSet('printTimeCost', 'innerText', `${tCost} ج.م`);
    const iCost = (s.items || []).reduce((sum, item) => sum + item.price, 0);
    safeSet('printItemsTotal', 'innerText', `${iCost} ج.م`);

    const elItems = document.getElementById('printItemsList');
    if (elItems) {
        elItems.innerHTML = (s.items || []).length > 0
            ? (s.items || []).map(i => `<tr><td class="p-3 border font-bold">${i.name}</td><td class="p-3 border text-center font-bold">${i.price} ج</td></tr>`).join('')
            : '<tr><td colspan="2" class="p-3 border text-center text-gray-400">لا يوجد طلبات</td></tr>';
    }

    const finalCost = s.finalCost ?? (tCost + iCost);
    const dis = Math.max(0, (tCost + iCost) - finalCost);
    safeSet('printDiscount', 'innerText', `${dis} ج.م`);
    safeSet('printFinalCost', 'innerText', `${finalCost} ج.م`);
    safeSet('printPaymentMethod', 'innerText', s.paymentMethod || 'كاش');

    // ★ عرض كود الخصم في الفاتورة المطبوعة
    const printDiscRow = document.getElementById('printDiscountCodeRow');
    const printDiscCode = document.getElementById('printDiscountCode');
    if (printDiscRow && printDiscCode) {
        if (s.discountCode) { printDiscCode.innerText = s.discountCode; printDiscRow.classList.remove('hidden'); }
        else printDiscRow.classList.add('hidden');
    }

    // ★ عرض قسمة الأصحاب في الفاتورة
    const groupCount = s.groupCount ? parseInt(s.groupCount) : 1;
    const printGroupRow = document.getElementById('printGroupRow');
    const printGroupPP   = document.getElementById('printGroupPerPerson');
    if (printGroupRow && printGroupPP) {
        if (groupCount > 1) {
            printGroupPP.innerText = `${Math.ceil(finalCost/groupCount)} ج.م (${groupCount} أشخاص)`;
            printGroupRow.classList.remove('hidden');
        } else printGroupRow.classList.add('hidden');
    }

    // رقم المرجع
    const refRow = document.getElementById('printPayRefRow');
    const refEl = document.getElementById('printPayRef');
    if (refRow && refEl) {
        if (s.paymentRef && s.paymentMethod && s.paymentMethod !== 'كاش') {
            refEl.innerText = s.paymentRef; refRow.classList.remove('hidden');
        } else refRow.classList.add('hidden');
    }

    const area = document.getElementById('invoicePrintArea');
    if (!area) { console.error('invoicePrintArea not found'); return; }
    document.body.classList.add('printing-invoice');
    area.classList.remove('hidden');
    setTimeout(() => {
        window.print();
        setTimeout(() => {
            document.body.classList.remove('printing-invoice');
            area.classList.add('hidden');
        }, 500);
    }, 400);
}

export function showEndDaySummary(_sessions, sysSettings) {
    const todayStr = new Date().toLocaleDateString('ar-EG');
    safeSet('summaryDate', 'innerText', todayStr);
    const todaySessions = Object.values(_sessions).filter(s => s.status === 'completed' && new Date(s.endTime).toLocaleDateString('ar-EG') === todayStr);

    let totalRev = 0; let barRev = 0; let timeRev = 0;
    todaySessions.forEach(s => { totalRev += s.finalCost; barRev += (s.items || []).reduce((sum, item) => sum + item.price, 0); });
    timeRev = totalRev - barRev; if (timeRev < 0) timeRev = 0;

    safeSet('sumTotalRev', 'innerText', totalRev);
    safeSet('sumTotalSessions', 'innerText', todaySessions.length);
    safeSet('sumTotalBar', 'innerText', barRev);

    const ctx = document.getElementById('dailySummaryChart')?.getContext('2d');
    if (ctx) {
        if (window._dailyChartInstance) window._dailyChartInstance.destroy();
        window._dailyChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: { labels: ['إيرادات الوقت', 'إيرادات البار'], datasets: [{ data: [timeRev, barRev], backgroundColor: ['#301043', '#f17200'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { family: 'Cairo', weight: 'bold' } } } } }
        });
    }
    document.getElementById('endDayModal')?.classList.remove('hidden');
}

export function closeEndDaySummary() { document.getElementById('endDayModal')?.classList.add('hidden'); }

export function printEndDaySummary() {
    document.body.classList.add('printing-report');
    setTimeout(() => {
        window.print();
        setTimeout(() => { document.body.classList.remove('printing-report'); }, 500);
    }, 300);
}
