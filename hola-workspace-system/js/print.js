// =====================================================
// js/print.js — Invoice & Report Print Logic
// =====================================================

import { safeSet } from "./ui.js";
import { _sessions } from "./sessions.js";

function calculateTimeCost(diffMs, sysSettings) {
    if (diffMs <= 0) return 0;
    const totalHours = diffMs / 3600000;
    const includedHours = Math.max(0, Number(sysSettings.pricingIncludedHours ?? 3));
    const extraHourPrice = Math.max(0, Number(sysSettings.pricingExtraHourPrice ?? 5));
    const roundingMode = String(sysSettings.pricingExtraHourRounding || "started_hour");
    const baseCost =
        Number(sysSettings.pricingTier1 || 0) +
        Number(sysSettings.pricingTier2 || 0) +
        Number(sysSettings.pricingTier3 || 0);
    const extraRawHours = Math.max(0, totalHours - includedHours);
    const extraHours = roundingMode === "exact"
        ? extraRawHours
        : Math.ceil(extraRawHours);
    return Math.round(baseCost + (extraHours * extraHourPrice));
}

export function printInvoice(id, _sessions, sysSettings) {
    const s = _sessions[id]; if (!s) return;

    safeSet('printDate', 'innerText', new Date(s.endTime).toLocaleString('ar-EG'));
    safeSet('printClientName', 'innerText', s.name);
    safeSet('printClientPhone', 'innerText', s.phone);
    safeSet('printAdminName', 'innerText', s.shiftAdmin || "الإدارة");

    const durH = Math.floor(s.durationMs / 3600000);
    const durM = Math.floor((s.durationMs % 3600000) / 60000);
    safeSet('printDuration', 'innerText', `${durH} ساعة و ${durM} دقيقة`);

    const tCost = calculateTimeCost(s.durationMs, sysSettings);
    safeSet('printTimeCost', 'innerText', `${tCost} ج.م`);
    const iCost = (s.items || []).reduce((sum, item) => sum + item.price, 0);
    safeSet('printItemsTotal', 'innerText', `${iCost} ج.م`);

    const elItems = document.getElementById('printItemsList');
    if (elItems) {
        elItems.innerHTML = (s.items || []).map(i =>
            `<tr><td class="p-3 border font-bold">${i.name}</td><td class="p-3 border text-center font-bold">${i.price}</td></tr>`
        ).join('') || '<tr><td colspan="2" class="p-3 border text-center">لا يوجد</td></tr>';
    }

    const dis = (tCost + iCost) - s.finalCost;
    safeSet('printDiscount', 'innerText', `${dis} ج.م`);
    safeSet('printFinalCost', 'innerText', `${s.finalCost} ج.م`);
    safeSet('printPaymentMethod', 'innerText', s.paymentMethod || 'كاش');

    document.body.classList.add('printing-invoice');
    document.getElementById('invoicePrintArea').classList.remove('hidden');
    setTimeout(() => {
        window.print();
        document.body.classList.remove('printing-invoice');
        document.getElementById('invoicePrintArea').classList.add('hidden');
    }, 300);
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
