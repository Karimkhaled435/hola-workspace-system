// =====================================================
// js/ui.js — UI Helpers, Render Functions, Navigation
// =====================================================

/* global scrollTo, print, open, confirm, alert, prompt, setTimeout, setInterval, clearTimeout, clearInterval, localStorage, sessionStorage, navigator, location, history, performance, fetch, URL, URLSearchParams */
/* eslint-disable no-undef */
// ─── Toast ─────────────────────────────────────────
export function showMsg(text, type = 'info') {
    const box = document.getElementById('msgBox'); if (!box) return;
    document.getElementById('msgText').innerText = text;
    const icon = document.getElementById('msgIcon');
    if (icon) icon.className = type === 'success' ? 'fa-solid fa-circle-check text-green-400'
        : type === 'error' ? 'fa-solid fa-circle-exclamation text-red-400'
        : 'fa-solid fa-circle-info text-blue-400';
    box.classList.remove('hidden');
    setTimeout(() => box.classList.add('hidden'), 3500);
}
window.showMsg = showMsg;

export function safeSet(id, prop, val) { const el = document.getElementById(id); if (el) el[prop] = val; }
window.safeSet = safeSet;

export function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => showMsg("تم نسخ الكود بنجاح!", "success"))
    .catch(() => {
        const t = document.createElement("input"); t.value = text;
        document.body.appendChild(t); t.select(); document.execCommand("copy"); document.body.removeChild(t);
        showMsg("تم نسخ الكود!", "success");
    });
}
window.copyToClipboard = copyToClipboard;

// ─── View / Tab Switching ───────────────────────────
export function switchView(viewName) {
    ['viewPublic','viewClient','viewAdmin'].forEach(v => { const el=document.getElementById(v); if(el) el.classList.add('hidden'); });
    const map = {public:'viewPublic',client:'viewClient',admin:'viewAdmin'};
    const tgt = document.getElementById(map[viewName]); if(tgt) tgt.classList.remove('hidden');
}
window.switchView = switchView;

export function switchClientTab(tabName) {
    document.querySelectorAll('.client-tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('[id^="c-tab-"]').forEach(el => { el.classList.remove('client-tab-active','text-white'); el.classList.add('text-gray-600'); });
    const c = document.getElementById(`client-${tabName}`); if(c) c.classList.remove('hidden');
    const b = document.getElementById(`c-tab-${tabName}`); if(b) { b.classList.add('client-tab-active','text-white'); b.classList.remove('text-gray-600'); }
}
window.switchClientTab = switchClientTab;

export function switchAdminTab(tabName) {
    document.querySelectorAll('.admin-tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('[id^="tab-"]').forEach(el => el.classList.remove('tab-active'));
    const c = document.getElementById(`admin-${tabName}`); if(c) c.classList.remove('hidden');
    const b = document.getElementById(`tab-${tabName}`); if(b) b.classList.add('tab-active');
}
window.switchAdminTab = switchAdminTab;

export function exportTableToCSV(tableId, filename) {
    const table = document.getElementById(tableId); if(!table) return;
    let csv = [];
    for(let i=0;i<table.rows.length;i++){
        let row=[],cols=table.rows[i].querySelectorAll("td,th");
        for(let j=0;j<cols.length;j++){
            if(!cols[j].querySelector('button')&&cols[j].innerText.trim()!=="إجراء"&&cols[j].innerText.trim()!=="طباعة")
                row.push('"'+cols[j].innerText.replace(/"/g,'""')+'"');
        }
        if(row.length>0) csv.push(row.join(","));
    }
    const blob=new Blob(["\uFEFF"+csv.join("\n")],{type:'text/csv;charset=utf-8;'});
    const link=document.createElement("a"); link.href=URL.createObjectURL(blob); link.download=filename+".csv"; link.click();
}
window.exportTableToCSV = exportTableToCSV;

// ─── Client UI ─────────────────────────────────────
// ★ Escape helper (mirrors app.js)
function _esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');
}

export function updateClientHeaderUI(myProfile, _profiles, sysSettings) {
    if(!myProfile) return;
    const prof = _profiles[myProfile.phone]||myProfile;
    safeSet('clientWelcomeName','innerText',`أهلاً، ${prof.name}`);
    safeSet('clientWelcomePhone','innerText',prof.phone);
    safeSet('clientWallet','innerText',prof.walletBalance||0);
    safeSet('checkoutWalletBalance','innerText',prof.walletBalance||0);
    safeSet('clientHeaderStampsCount','innerText',prof.stamps?.length||0);
    // تحديث شريط المستخدم في الهيدر على الموبايل
    if (window._updateHeaderUserStrip) {
        const hasSession = !!(window.activeSessionId || (window._sessionsState && window._sessionsState.activeId));
        window._updateHeaderUserStrip(prof, hasSession);
    }
}
window.updateClientHeaderUI = updateClientHeaderUI;

export function updateCapacityUI(_sessions, sysSettings) {
    const activeCount = Object.values(_sessions).filter(s=>s.status==='active').length;
    const ratio = activeCount/(sysSettings.maxCapacity||50);
    let gaugePct = Math.min(ratio*100,100);
    let text="هادئ"; let color="text-green-600"; let dotColor="bg-green-400";
    if(ratio>=0.9){text="ممتلئ";color="text-red-600";dotColor="bg-red-400";} else if(ratio>=0.5){text="شبه ممتلئ";color="text-yellow-600";dotColor="bg-yellow-400";}
    const elStatus=document.getElementById('publicStatusText');
    if(elStatus) elStatus.innerHTML=`<span class="${color}">${text}</span>`;
    const gauge=document.getElementById('capacityGauge');
    if(gauge) gauge.style.width=`${gaugePct}%`;
    const dot=document.getElementById('placeStatusDot');
    if(dot){ dot.className=`w-2.5 h-2.5 rounded-full ${dotColor} animate-pulse flex-shrink-0`; }
}
window.updateCapacityUI = updateCapacityUI;

export function renderShiftManagers(sysSettings) {
    const sel=document.getElementById('adminShiftName');
    if(sel) sel.innerHTML=(sysSettings.shiftManagers||["مدير النظام"]).map(m=>`<option value="${m}">${m}</option>`).join('');
    const list=document.getElementById('managersList');
    if(list) list.innerHTML=(sysSettings.shiftManagers||["مدير النظام"]).map(m=>`<span class="bg-gray-100 px-2 py-1 rounded text-sm border flex items-center gap-2">${m} <button onclick="window.removeShiftManager('${m}')" class="text-red-500 hover:text-red-700"><i class="fa-solid fa-xmark"></i></button></span>`).join('');
}
window.renderShiftManagers = renderShiftManagers;

// ─── Client Render Functions ────────────────────────
export function renderClientMenu(_menu) {
    const grid=document.getElementById('dynamicMenuGrid'); if(!grid) return;
    const items=Object.values(_menu); if(items.length===0) return;
    // Cache menu data for features.js free drink handling
    window._menuData = {};
    items.forEach(item => window._menuData[item.id] = item);
    
    if(window.renderClientMenuWithFreeDrink && window._sessionIdRef) {
        window.renderClientMenuWithFreeDrink(_menu, window._sessionIdRef);
        return;
    }
    grid.innerHTML=items.map(item=>`<button onclick="window.orderItem('${item.id}')" class="bg-white p-4 rounded-xl border border-gray-100 shadow-sm text-center transition transform hover:-translate-y-1 hover:bg-orange-50"><i class="fa-solid ${item.icon||'fa-mug-hot'} text-3xl text-hola-purple mb-3"></i><p class="font-bold text-sm text-gray-800">${_esc(item.name)}</p><p class="text-sm font-black text-hola-orange mt-1">${_esc(String(item.price))} ج</p></button>`).join('');
}
window.renderClientMenu = renderClientMenu;

export function renderClientHistory(myProfile, _sessions) {
    if(!myProfile) return; const list=document.getElementById('clientHistoryTableList'); if(!list) return;
    const hist=Object.values(_sessions).filter(s=>s.phone===myProfile.phone&&s.status==='completed').sort((a,b)=>b.endTime-a.endTime);
    if(hist.length===0){list.innerHTML='<tr><td colspan="6" class="text-center p-4 text-gray-500">لا يوجد سجل.</td></tr>';return;}
    list.innerHTML=hist.map(s=>{
        const dDate=new Date(s.endTime).toLocaleDateString('ar-EG');const dTime=new Date(s.endTime).toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'});
        const durH=Math.floor(s.durationMs/3600000);const durM=Math.floor((s.durationMs%3600000)/60000);
        const itemsStr=(s.items&&s.items.length>0)?s.items.map(i=>i.name).join('، '):'لا يوجد';
        let pMeth=s.paymentMethod||'كاش';let pBadge='bg-gray-100 text-gray-700';
        if(pMeth==='فودافون كاش') pBadge='bg-red-100 text-red-700';if(pMeth==='إنستاباي') pBadge='bg-purple-100 text-purple-700';
        return `<tr class="hover:bg-gray-50 border-b"><td class="p-3"><p class="font-bold text-hola-purple">${dDate}</p><p class="text-[10px] text-gray-500">${dTime}</p></td><td class="p-3 text-sm">${durH}س و ${durM}د</td><td class="p-3 font-black text-hola-orange">${s.finalCost} ج</td><td class="p-3"><span class="px-2 py-1 rounded text-[10px] font-bold ${pBadge}">${pMeth}</span></td><td class="p-3 text-xs text-gray-500 max-w-[120px] truncate" title="${itemsStr}">${itemsStr}</td><td class="p-3 text-center"><button onclick="window.printInvoice('${s.id}')" class="bg-gray-800 text-white hover:bg-black px-3 py-1.5 rounded-lg text-xs font-bold transition"><i class="fa-solid fa-print"></i></button></td></tr>`;
    }).join('');
}
window.renderClientHistory = renderClientHistory;

export function renderClientLoyalty(myProfile, _profiles, _discounts, sysSettings) {
    if(!myProfile) return;
    const prof=_profiles[myProfile.phone]||myProfile;const stamps=prof.stamps||[];const req=parseInt(sysSettings.stampsRequired)||7;
    // Stamps — smaller & clear
    let html='';
    for(let i=0;i<req;i++){
        if(i<stamps.length) html+=`<div class="stamp-item"><div class="stamp-circle bg-hola-purple text-white flex items-center justify-center text-base shadow-md border-2 border-hola-orange"><i class="fa-solid fa-stamp text-sm"></i></div><span class="stamp-label text-[8px] text-gray-500">${new Date(stamps[i]).toLocaleDateString('ar-EG',{month:'numeric',day:'numeric'})}</span></div>`;
        else if(i===req-1) html+=`<div class="stamp-item"><div class="stamp-circle border-2 border-dashed border-hola-orange text-hola-orange flex items-center justify-center text-base bg-orange-50 animate-pulse"><i class="fa-solid fa-gift text-sm"></i></div><span class="stamp-label text-[8px] text-hola-orange font-black">مجاني</span></div>`;
        else html+=`<div class="stamp-item"><div class="stamp-circle border-2 border-dashed border-gray-200 text-gray-300 flex items-center justify-center text-base bg-gray-50"><i class="fa-solid fa-stamp text-sm"></i></div><span class="stamp-label text-[8px]">·</span></div>`;
    }
    const elC=document.getElementById('stampsContainer'); if(elC) { elC.innerHTML=html; elC.className='flex flex-wrap justify-center gap-2'; }

    // Discount codes — compact voucher-mini style
    const myDisc=Object.values(_discounts).filter(d=>d.assignedTo===myProfile.phone).sort((a,b)=>b.createdAt-a.createdAt);
    const dList=document.getElementById('clientDiscountsList');
    if(dList){
        if(myDisc.length===0){
            dList.innerHTML='<div class="col-span-full text-center py-6"><i class="fa-solid fa-ticket text-gray-200 text-4xl mb-2 block"></i><p class="text-sm text-gray-400 font-bold">لا يوجد كود</p></div>';
        } else {
            // Show active code prominently + list of all
            const activeCode=myDisc.find(d=>!d.isUsed);
            let topHtml='';
            if(activeCode){
                const vStr=activeCode.isPercentage?`${activeCode.value}%`:`${activeCode.value} ج`;
                topHtml=`<div class="col-span-full bg-gradient-to-l from-orange-50 to-purple-50 border-2 border-hola-orange rounded-2xl p-4 text-center cursor-pointer hover:shadow-md transition" onclick="window._showVoucherDetail('${_esc(activeCode.code)}')">
                    <p class="text-xs text-gray-500 font-bold mb-1"><i class="fa-solid fa-ticket text-hola-orange ml-1"></i>${_esc(activeCode.title)||'كود خصم'}</p>
                    <p class="font-mono font-black text-2xl tracking-[0.3em] text-hola-purple mb-1">${_esc(activeCode.code)}</p>
                    <p class="text-hola-orange font-black text-sm mb-3">خصم ${vStr}</p>
                    <button onclick="event.stopPropagation();window.copyToClipboard('${_esc(activeCode.code)}')" class="inline-flex items-center gap-2 bg-hola-orange text-white font-black text-sm px-4 py-2 rounded-xl hover:bg-orange-600 transition shadow-md">
                        <i class="fa-regular fa-copy"></i> نسخ الكود
                    </button>
                </div>`;
            } else {
                topHtml=`<div class="col-span-full text-center py-3 text-sm font-bold text-gray-400"><i class="fa-solid fa-ban ml-1"></i>لا يوجد كود نشط حالياً</div>`;
            }
            dList.innerHTML=topHtml+myDisc.map(d=>{
                const vStr=d.isPercentage?`${d.value}%`:`${d.value} ج`;
                return `<div class="voucher-mini" onclick="window._showVoucherDetail('${_esc(d.code)}')">
                    <div class="v-status-dot ${d.isUsed?'used':'active'}"></div>
                    <div class="v-info"><div class="v-title">${d.title||'كود'}</div><div class="v-val">خصم ${vStr}</div></div>
                    <div class="v-code">${_esc(d.code)}</div>
                </div>`;
            }).join('');
        }
    }
}
window.renderClientLoyalty = renderClientLoyalty;

// Show voucher detail modal
window._showVoucherDetail = function(code) {
    const disc=Object.values(window._discounts||{}).find(d=>d.code===code);
    if(!disc) return;
    const modal=document.getElementById('voucherDetailModal'); if(!modal) return;
    const vStr=disc.isPercentage?`${disc.value}%`:`${disc.value} ج`;
    safeSet('vModalTitle','textContent',disc.title||'كود خصم');
    safeSet('vModalSubtitle','textContent',disc.isUsed?'تم استخدام هذا الكود':'اضغط لنسخ الكود');
    safeSet('vModalCode','textContent',disc.code);
    safeSet('vModalVal','textContent',`الخصم: ${vStr}`);
    const statusEl=document.getElementById('vModalStatus');
    if(statusEl) statusEl.innerHTML=disc.isUsed
        ?'<span class="text-red-500"><i class="fa-solid fa-ban ml-1"></i>مُستخدم</span>'
        :'<span class="text-green-500"><i class="fa-solid fa-circle-check ml-1"></i>نشط ومتاح للاستخدام</span>';
    // History of used codes
    const myDisc=Object.values(window._discounts||{}).filter(d=>d.assignedTo===disc.assignedTo&&d.isUsed);
    const histEl=document.getElementById('vModalHistory');
    const histList=document.getElementById('vModalHistoryList');
    if(myDisc.length>0&&histEl&&histList){
        histList.innerHTML=myDisc.map(d=>`<div class="flex justify-between items-center text-xs bg-gray-50 rounded-lg px-3 py-2 border"><span class="font-mono font-bold text-gray-500 line-through">${_esc(d.code)}</span><span class="text-red-400 font-bold"><i class="fa-solid fa-ban ml-1"></i>مُستخدم</span></div>`).join('');
        histEl.classList.remove('hidden');
    } else if(histEl) histEl.classList.add('hidden');
    window._currentVoucherCode=disc.code;
    modal.classList.remove('hidden');
};
window._copyVoucherCode = function() {
    if(window._currentVoucherCode) window.copyToClipboard(window._currentVoucherCode);
};

export function renderClientNotifications(myProfile, _notifications) {
    if(!myProfile) return; const list=document.getElementById('clientNotifsList'); if(!list) return;
    const notifs=Object.values(_notifications).filter(n=>n.phone===myProfile.phone).sort((a,b)=>b.timestamp-a.timestamp);
    if(notifs.length===0){list.innerHTML='<p class="text-center text-sm text-gray-400 py-4">لا توجد إشعارات.</p>';return;}
    list.innerHTML=notifs.map(n=>{
        const d=new Date(n.timestamp).toLocaleString('ar-EG',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
        let i='fa-envelope text-hola-purple';if(n.type==='high') i='fa-bell text-red-500';if(n.type==='congrats') i='fa-gift text-hola-orange';
        let msgHtml=n.msg.replace(/(%\d+|\d+\s*ج|\d+%)/g,"<span class='text-2xl text-hola-orange font-black bg-orange-100 px-2 py-1 rounded-lg shadow-sm mx-1 inline-block'>$1</span>");
        const act=n.discountCode?`onclick="window.goToLoyaltyAndPulse('${n.discountCode}')"` : '';
        let extraHtml='';
        if(n.imgUrl) extraHtml+=`<img src="${n.imgUrl}" class="w-full max-h-48 object-cover rounded-lg mb-2 mt-2 border cursor-pointer" onclick="window.openNotifFullImg('${n.imgUrl}')" title="اضغط للعرض الكامل">`;
        if(n.embedCode) extraHtml+=`<div class="w-full overflow-hidden rounded-lg mt-2 border">${n.embedCode}</div>`;
        if(n.linkUrl){
            // Smart platform detection
            const platformMap = {
                'facebook.com':'fa-brands fa-facebook','fb.com':'fa-brands fa-facebook','fb.watch':'fa-brands fa-facebook',
                'instagram.com':'fa-brands fa-instagram','instagr.am':'fa-brands fa-instagram',
                'linkedin.com':'fa-brands fa-linkedin','behance.net':'fa-brands fa-behance',
                'twitter.com':'fa-brands fa-x-twitter','x.com':'fa-brands fa-x-twitter',
                'youtube.com':'fa-brands fa-youtube','youtu.be':'fa-brands fa-youtube',
                'tiktok.com':'fa-brands fa-tiktok','wa.me':'fa-brands fa-whatsapp',
                'whatsapp.com':'fa-brands fa-whatsapp'
            };
            const colorMap = {
                'facebook':'bg-blue-600','fb.com':'bg-blue-600','fb.watch':'bg-blue-600',
                'instagram':'bg-gradient-to-r from-purple-600 to-pink-500',
                'linkedin':'bg-blue-700','behance':'bg-blue-500',
                'twitter':'bg-gray-900','x.com':'bg-gray-900',
                'youtube':'bg-red-600','youtu.be':'bg-red-600',
                'tiktok':'bg-gray-900','wa.me':'bg-green-600','whatsapp':'bg-green-600'
            };
            let icon='fa-arrow-up-right-from-square', label='عرض التفاصيل', color='bg-gray-700';
            const u=n.linkUrl.toLowerCase();
            for(const [domain,ic] of Object.entries(platformMap)){
                if(u.includes(domain)){icon=ic;break;}
            }
            for(const [domain,cl] of Object.entries(colorMap)){
                if(u.includes(domain)){color=cl;break;}
            }
            if(u.includes('facebook')||u.includes('fb.')) label='عرض على فيسبوك';
            else if(u.includes('instagram')) label='عرض على إنستاغرام';
            else if(u.includes('linkedin')) label='عرض على لينكد إن';
            else if(u.includes('whatsapp')||u.includes('wa.me')) label='تواصل عبر واتساب';
            else if(u.includes('youtube')||u.includes('youtu.be')) label='مشاهدة على يوتيوب';
            extraHtml+=`<a href="${n.linkUrl}" target="_blank" class="inline-flex items-center gap-2 ${color} text-white text-xs font-bold px-3 py-2 rounded-lg mt-2 hover:opacity-90 transition shadow-sm"><i class="${icon}"></i> ${label}</a>`;
        }
        return `<div ${act} class="bg-gray-50 border border-gray-100 p-4 rounded-xl flex gap-4 items-start shadow-sm ${n.discountCode?'cursor-pointer hover:bg-gray-100 transition':''}"><div class="mt-1"><i class="fa-solid ${i} text-lg"></i></div><div class="flex-grow"><p class="text-sm font-bold text-gray-800 mb-1 leading-relaxed">${msgHtml}</p>${extraHtml}<p class="text-[10px] text-gray-400 font-bold mt-1">${d}</p></div></div>`;
    }).join('');
}
window.renderClientNotifications = renderClientNotifications;

export function showClientNotification(msg, type, docId, imgUrl, linkUrl, db, appId) {
    const elMsg=document.getElementById('clientNotifMsg');
    if(elMsg) elMsg.innerHTML=msg.replace(/(%\d+|\d+\s*ج|\d+%)/g,"<span class='text-3xl text-hola-orange font-black bg-orange-100 px-2 py-1 rounded-xl shadow-sm mx-1 inline-block'>$1</span>");
    const box=document.getElementById('clientNotifBox');const iconBox=document.getElementById('clientNotifIconBox');
    const icon=document.getElementById('clientNotifIcon');const btn=document.getElementById('clientNotifBtn');const title=document.getElementById('clientNotifTitle');
    const imgEl=document.getElementById('clientNotifImg');const linkEl=document.getElementById('clientNotifLink');
    if(box&&iconBox&&icon&&btn&&title){
        box.className="bg-white rounded-3xl p-8 w-full max-w-sm text-center shadow-2xl border-4 transform transition-all scale-105";
        iconBox.className="w-16 h-16 rounded-full flex items-center justify-center text-3xl mx-auto mb-4 shadow-inner";
        btn.className="w-full py-3 rounded-xl font-black text-lg shadow-lg text-white";
        if(type==='high'){box.classList.add('border-red-500');iconBox.classList.add('bg-red-100','text-red-500');icon.className="fa-solid fa-triangle-exclamation";btn.classList.add('bg-red-500');title.innerText="تنبيه هام";title.className="font-black text-2xl mb-2 text-red-500";}
        else if(type==='congrats'){box.classList.add('border-hola-orange');iconBox.classList.add('bg-orange-100','text-hola-orange','animate-pulse');icon.className="fa-solid fa-gift";btn.classList.add('bg-hola-orange');title.innerText="تهانينا!";title.className="font-black text-2xl mb-2 text-hola-orange";}
        else{box.classList.add('border-hola-purple');iconBox.classList.add('bg-purple-100','text-hola-purple');icon.className="fa-solid fa-envelope-open-text";btn.classList.add('bg-hola-purple');title.innerText="إشعار جديد";title.className="font-black text-2xl mb-2 text-hola-purple";}
    }
    if(imgEl&&imgUrl){imgEl.src=imgUrl;imgEl.classList.remove('hidden');}else if(imgEl) imgEl.classList.add('hidden');
    if(linkEl&&linkUrl){linkEl.href=linkUrl;linkEl.classList.remove('hidden');}else if(linkEl) linkEl.classList.add('hidden');
    const modal=document.getElementById('clientNotifModal');
    if(modal){
        if (window._clientNotifAutoDismissTimer) {
            clearTimeout(window._clientNotifAutoDismissTimer);
            window._clientNotifAutoDismissTimer = null;
        }
        if (box) {
            box.style.opacity = '0';
            box.style.transform = 'translateY(14px) scale(0.98)';
            box.style.transition = 'opacity .25s ease, transform .25s ease';
            requestAnimationFrame(() => {
                box.style.opacity = '1';
                box.style.transform = 'translateY(0) scale(1)';
            });
        }
        modal.classList.remove('hidden');
        window._clientNotifAutoDismissTimer = setTimeout(() => {
            if (typeof window.closeClientNotif === 'function') window.closeClientNotif();
        }, 8000);
    }
    if(docId&&db){
        import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js").then(({updateDoc,doc})=>{
            updateDoc(doc(db,'artifacts',appId,'public','data','notifications',docId),{isRead:true});
        });
    }
}
window.showClientNotification = showClientNotification;

// ─── Chat Render ────────────────────────────────────
export function renderClientChatMessages(myProfile, _chats) {
    const list=document.getElementById('clientChatMessages');if(!list||!myProfile) return;
    const myMsgs=Object.values(_chats).filter(c=>c.phone===myProfile.phone).sort((a,b)=>a.timestamp-b.timestamp);
    list.innerHTML=myMsgs.map(m=>{
        const isMe=m.sender==='client';
        const style=isMe?'bg-hola-purple text-white self-end rounded-br-none':'bg-gray-200 text-gray-800 self-start rounded-bl-none';
        return `<div class="max-w-[80%] px-4 py-2 rounded-2xl shadow-sm font-bold text-sm ${style}">${_esc(m.text)}<span class="block text-[8px] opacity-60 mt-1">${new Date(m.timestamp).toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'})}</span></div>`;
    }).join('');
    if(document.getElementById('clientChatModal')?.classList.contains('hidden')&&myMsgs.length>0&&myMsgs[myMsgs.length-1].sender==='admin'){
        document.getElementById('chatBadge')?.classList.remove('hidden');
    }
    list.scrollTop=list.scrollHeight;
}
window.renderClientChatMessages = renderClientChatMessages;

export function renderAdminChatUsersList(_chats, _profiles, currentChatPhone, _sessions) {
    const list=document.getElementById('adminChatUsersList');if(!list) return;
    const usersWithChats=[...new Set(Object.values(_chats).map(c=>c.phone))];
    if(usersWithChats.length===0){list.innerHTML='<p class="text-xs text-gray-400 text-center py-4">لا توجد رسائل</p>';return;}
    // Build active sessions map
    const activeSessions = _sessions ? Object.values(_sessions).filter(s=>s.status==='active') : [];
    const activePhones = new Set(activeSessions.map(s=>s.phone));
    list.innerHTML=usersWithChats.map(phone=>{
        const name=_profiles[phone]?.name||phone;
        const msgs=Object.values(_chats).filter(c=>c.phone===phone).sort((a,b)=>a.timestamp-b.timestamp);
        const lastMsg=msgs[msgs.length-1];
        const isActive=currentChatPhone===phone?'bg-purple-100 border-hola-purple':'bg-gray-50 border-transparent hover:bg-gray-100';
        const bold=lastMsg.sender==='client'?'font-black text-hola-purple':'font-bold text-gray-500';
        const unreadCount = msgs.filter(m => m.sender === 'client' && (Date.now() - m.timestamp) < 300000).length;
        const unreadBadge = unreadCount > 0 && currentChatPhone !== phone
            ? `<span class="bg-red-500 text-white text-[9px] px-1.5 py-0.5 rounded-full font-black ml-1">${unreadCount}</span>`
            : '';
        const timeStr = lastMsg ? new Date(lastMsg.timestamp).toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'}) : '';
        // Active session badge
        const activeSessionBadge = activePhones.has(phone)
            ? `<span class="inline-flex items-center bg-green-100 px-1.5 py-0.5 rounded-full mr-1"><span class="w-2 h-2 bg-green-500 rounded-full inline-block animate-pulse"></span></span>`
            : '';
        // Delete chat button (shows only when this chat is selected)
        const deleteChatBtn = currentChatPhone === phone
            ? `<button onclick="event.stopPropagation();window.clearAllChatsForPhone('${phone}')" class="text-red-400 hover:text-red-600 text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-50 hover:bg-red-100 transition ml-1" title="حذف المحادثة"><i class="fa-solid fa-trash"></i></button>`
            : '';
        return `<div onclick="window.openAdminChat('${phone}')" class="p-3 border-2 rounded-xl cursor-pointer transition ${isActive}">
            <div class="flex justify-between items-center mb-0.5">
                <h4 class="text-sm font-black text-hola-orange flex items-center flex-wrap gap-0.5">${name}${activeSessionBadge}${unreadBadge}</h4>
                <div class="flex items-center gap-1">${deleteChatBtn}<span class="text-[9px] text-gray-400">${timeStr}</span></div>
            </div>
            <p class="text-xs truncate ${bold}">${lastMsg.sender==='admin'?'أنت: ':''} ${lastMsg.text}</p>
        </div>`;
    }).join('');
    const hasUnread=Object.values(_chats).some(c=>c.sender==='client'&&(Date.now()-c.timestamp<60000));
    if(hasUnread) document.getElementById('adminChatBadge')?.classList.remove('hidden');
    else document.getElementById('adminChatBadge')?.classList.add('hidden');
}
window.renderAdminChatUsersList = renderAdminChatUsersList;

export function renderAdminChatMessages(phone, _chats) {
    const list=document.getElementById('adminChatMessages');if(!list) return;
    const msgs=Object.values(_chats).filter(c=>c.phone===phone).sort((a,b)=>a.timestamp-b.timestamp);
    list.innerHTML=msgs.map(m=>{
        const isMe=m.sender==='admin';
        const style=isMe?'bg-hola-orange text-white self-end rounded-br-none':'bg-gray-200 text-gray-800 self-start rounded-bl-none';
        const delBtn=`<button onclick="window.deleteAdminChat('${m.id}')" class="absolute -top-2 ${isMe?'-left-6':'-right-6'} opacity-0 group-hover:opacity-100 transition text-red-400 hover:text-red-600 text-xs bg-white rounded-full w-5 h-5 flex items-center justify-center shadow-sm"><i class="fa-solid fa-trash text-[9px]"></i></button>`;
        return `<div class="relative group max-w-[80%] px-4 py-2 rounded-2xl shadow-sm font-bold text-sm ${style}">${_esc(m.text)}${delBtn}<span class="block text-[8px] opacity-60 mt-1">${new Date(m.timestamp).toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'})}</span></div>`;
    }).join('');
    list.scrollTop=list.scrollHeight;
}
window.renderAdminChatMessages = renderAdminChatMessages;

// ─── Admin Render Functions ─────────────────────────
export function renderAdminSessions(_sessions, _profiles) {
    const aRaw=Object.values(_sessions).filter(s=>s.status==='active');
    const aMap={};aRaw.forEach(s=>{if(!aMap[s.phone]||aMap[s.phone].startTime<s.startTime) aMap[s.phone]=s;});
    const list=document.getElementById('adminSessionsList');
    if(list){
        const active=Object.values(aMap);
        if(active.length===0) list.innerHTML='<tr><td colspan="4" class="text-center p-4 text-gray-500">لا يوجد نشاط حالي</td></tr>';
        else list.innerHTML=active.map(s=>{
            const isRemote = s.isRemote;
            const statusBadge = isRemote
                ? '<span class="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs font-bold border">🌐 بعيد</span>'
                : '<span class="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold"><span class="inline-block w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse"></span></span>';
            return `<tr class="hover:bg-gray-50 border-b transition cursor-pointer" onclick="window.openAdminLiveSession('${s.id}')">
                <td class="p-3 font-bold text-hola-purple">${s.name||s.phone.substring(0,6)}</td>
                <td class="p-3 text-gray-500 text-xs" dir="ltr">${new Date(s.startTime).toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'})}</td>
                <td class="p-3 text-hola-orange font-mono font-bold admin-timer" data-start="${s.startTime}">00:00</td>
                <td class="p-3">${statusBadge}</td>
            </tr>`;
        }).join('');
    }
    const todayStr=new Date().toLocaleDateString('ar-EG');
    const todayCompleted=Object.values(_sessions).filter(s=>s.status==='completed'&&new Date(s.endTime).toLocaleDateString('ar-EG')===todayStr).sort((a,b)=>b.endTime-a.endTime);
    const todayList=document.getElementById('adminTodayCompletedList');
    if(todayList){
        if(todayCompleted.length===0){todayList.innerHTML='<tr><td colspan="6" class="text-center p-4 text-gray-500 text-xs">لا يوجد جلسات مكتملة اليوم</td></tr>';}
        else todayList.innerHTML=todayCompleted.map(s=>{
            const durH=Math.floor(s.durationMs/3600000);const durM=Math.floor((s.durationMs%3600000)/60000);
            const itemsStr=(s.items&&s.items.length>0)?s.items.map(i=>i.name).join('، '):'بدون طلبات';
            let pMeth=s.paymentMethod||'تحديد الدفع';let pBadge='bg-gray-200 text-gray-700 hover:bg-gray-300';
            if(pMeth==='كاش') pBadge='bg-green-100 text-green-700';if(pMeth==='فودافون كاش') pBadge='bg-red-100 text-red-700';if(pMeth==='إنستاباي') pBadge='bg-purple-100 text-purple-700';
            return `<tr class="hover:bg-gray-50 border-b">
                <td class="p-3 font-bold text-hola-purple cursor-pointer" onclick="window.openPaymentMethodModal('${s.id}')">${s.name||s.phone.substring(0,6)}</td>
                <td class="p-3 text-xs text-gray-500">${durH}س و ${durM}د</td>
                <td class="p-3 font-black text-hola-orange">${s.finalCost} ج</td>
                <td class="p-3"><span class="px-2 py-1 rounded text-[10px] font-bold ${pBadge} transition cursor-pointer" onclick="window.openPaymentMethodModal('${s.id}')">${pMeth}</span></td>
                <td class="p-3 text-xs text-gray-500 truncate max-w-[100px]" title="${itemsStr}">${itemsStr}</td>
                <td class="p-3"><div class="flex gap-1">
                    <button onclick="event.stopPropagation();window.openCompletedSessionEdit('${s.id}')" class="bg-blue-50 hover:bg-blue-100 text-blue-600 text-[10px] px-2 py-1.5 rounded-lg font-bold transition flex items-center gap-1"><i class="fa-solid fa-pen-to-square"></i> تعديل</button>
                    <button onclick="event.stopPropagation();window.resumeCompletedSession('${s.id}')" class="bg-green-50 hover:bg-green-100 text-green-600 text-[10px] px-2 py-1.5 rounded-lg font-bold transition flex items-center gap-1" title="استئناف الجلسة"><i class="fa-solid fa-rotate-right"></i> استئناف</button>
                </div></td>
            </tr>`;
        }).join('');
        let tot=0;todayCompleted.forEach(s=>tot+=s.finalCost);
        safeSet('adminTodayTotalUsers','innerText',todayCompleted.length);
        safeSet('adminTodayTotalCash','innerText',`${tot}`);
    }
    const hList=document.getElementById('adminHistoryList');
    if(hList){
        const history=Object.values(_sessions).filter(s=>s.status==='completed').sort((a,b)=>b.endTime-a.endTime).slice(0,50);
        if(history.length===0) hList.innerHTML='<tr><td colspan="7" class="text-center p-4">لا يوجد سجلات</td></tr>';
        else hList.innerHTML=history.map(s=>{
            let pMeth=s.paymentMethod||'كاش';let pBadge='bg-gray-100 text-gray-700';
            if(pMeth==='فودافون كاش') pBadge='bg-red-100 text-red-700';if(pMeth==='إنستاباي') pBadge='bg-purple-100 text-purple-700';
            const discBadge = s.discountCode ? `<span class="text-[9px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded font-bold ml-1">${s.discountCode}</span>` : '';
            return `<tr class="hover:bg-gray-50 border-b"><td class="p-3 font-bold text-hola-purple cursor-pointer" onclick="window.openUserDetails('${_esc(s.phone)}')">${_esc(s.name||s.phone)}</td><td class="p-3 text-gray-500 text-xs">${new Date(s.endTime).toLocaleString('ar-EG')}</td><td class="p-3 text-xs font-bold text-gray-700">${s.shiftAdmin||"الإدارة"}</td><td class="p-3">${Math.floor(s.durationMs/3600000)}س و ${Math.floor((s.durationMs%3600000)/60000)}د</td><td class="p-3 text-hola-orange font-black">${s.finalCost} ج ${discBadge}</td><td class="p-3"><span class="px-2 py-1 rounded text-[10px] font-bold ${pBadge}">${pMeth}</span></td><td class="p-3 text-center flex gap-1 justify-center"><button onclick="window.printInvoice('${s.id}')" class="bg-gray-800 text-white hover:bg-black px-2 py-1.5 rounded-lg text-xs font-bold transition"><i class="fa-solid fa-print"></i></button><button onclick="window.resumeCompletedSession('${s.id}')" class="bg-green-600 text-white hover:bg-green-700 px-2 py-1.5 rounded-lg text-xs font-bold transition" title="استئناف"><i class="fa-solid fa-rotate-right"></i></button></td></tr>`;
        }).join('');
    }
}
window.renderAdminSessions = renderAdminSessions;

export function renderAdminGroupedOrders(alerts, _profiles) {
    const grp={};alerts.forEach(a=>{if(!grp[a.phone]) grp[a.phone]=[];grp[a.phone].push(a);});
    const list=document.getElementById('adminGroupedAlertsList');if(!list) return;
    const keys=Object.keys(grp);
    if(keys.length===0){list.innerHTML='<p class="text-sm text-gray-400 text-center py-4">لا يوجد طلبات معلقة</p>';return;}
    list.innerHTML=keys.map(phone=>{
        const arr=grp[phone];const name=(_profiles[phone]?.name)||phone;
        const idsStr=arr.map(a=>a.id).join(',');
        const itemsHtml=arr.map(a=>`<div class="flex justify-between items-center border-b border-gray-100 py-1"><span class="text-xs font-bold text-gray-700">${a.itemName} <span class="text-[10px] text-gray-400 ml-1">(${new Date(a.timestamp).toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'})})</span></span><button onclick="window.markOrderDone('${a.id}')" class="text-green-600 hover:text-green-800"><i class="fa-solid fa-check"></i></button></div>`).join('');
        return `<div class="bg-gray-50 border p-3 rounded-lg"><div class="flex justify-between items-center mb-2"><span class="font-bold text-hola-purple">${name} <span class="bg-hola-orange text-white text-[10px] px-1.5 py-0.5 rounded ml-1">${arr.length}</span></span><button onclick="window.markMultipleOrdersDone('${idsStr}')" class="text-[10px] bg-green-100 text-green-700 px-2 py-1 rounded font-bold hover:bg-green-200">إنهاء الكل</button></div><div class="space-y-1 bg-white p-2 rounded border">${itemsHtml}</div></div>`;
    }).join('');
}
window.renderAdminGroupedOrders = renderAdminGroupedOrders;

export function renderAdminPreBookings(_prebookings) {
    const list=document.getElementById('adminPreBookingsList');if(!list) return;
    const bookings=Object.values(_prebookings).filter(b=>b.status==='pending').sort((a,b)=>b.createdAt-a.createdAt);
    if(bookings.length===0){list.innerHTML='<tr><td colspan="4" class="text-center p-4 text-gray-500 text-xs">لا يوجد حجوزات معلقة</td></tr>';}
    else list.innerHTML=bookings.map(b=>{
        const tDate=b.expectedTime==='سيتم التنسيق'?b.expectedTime:new Date(b.expectedTime).toLocaleString('ar-EG',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
        return `<tr class="hover:bg-orange-100 transition"><td class="p-3 font-bold">${_esc(b.name)}</td><td class="p-3 font-mono text-xs">${_esc(b.phone)}</td><td class="p-3 text-xs" dir="ltr">${tDate}</td><td class="p-3"><button onclick="window.markPreBookingDone('${b.id}')" class="bg-green-500 hover:bg-green-600 text-white px-2 py-1 rounded text-[10px] font-bold shadow"><i class="fa-solid fa-check"></i> تم التواصل</button></td></tr>`;
    }).join('');
    const archList=document.getElementById('adminArchivedPreBookingsList');if(!archList) return;
    const archBookings=Object.values(_prebookings).filter(b=>b.status==='contacted').sort((a,b)=>b.createdAt-a.createdAt).slice(0,30);
    if(archBookings.length===0){archList.innerHTML='<tr><td colspan="4" class="text-center p-4 text-gray-500 text-xs">لا يوجد أرشيف</td></tr>';}
    else archList.innerHTML=archBookings.map(b=>{
        const tDate=b.expectedTime==='سيتم التنسيق'?b.expectedTime:new Date(b.expectedTime).toLocaleString('ar-EG',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
        return `<tr class="hover:bg-gray-50"><td class="p-3 font-bold">${_esc(b.name)}</td><td class="p-3 font-mono text-xs">${_esc(b.phone)}</td><td class="p-3 text-xs" dir="ltr">${tDate}</td><td class="p-3 text-green-600 text-xs font-bold"><i class="fa-solid fa-check-double"></i> تم</td></tr>`;
    }).join('');
}
window.renderAdminPreBookings = renderAdminPreBookings;

export function renderAdminEventAttendees(_eventAttendees) {
    const list=document.getElementById('adminEventAttendeesList');if(!list) return;
    const attendees=Object.values(_eventAttendees).sort((a,b)=>b.timestamp-a.timestamp);
    if(attendees.length===0) list.innerHTML='<tr><td colspan="4" class="text-center p-4 text-gray-500">لا يوجد مسجلين حتى الآن</td></tr>';
    else list.innerHTML=attendees.map(a=>`<tr class="hover:bg-purple-50 border-b"><td class="p-3 font-bold">${_esc(a.name)}</td><td class="p-3 font-mono text-xs">${_esc(a.phone)}</td><td class="p-3 text-xs" dir="ltr">${new Date(a.timestamp).toLocaleString('ar-EG')}</td><td class="p-3"><button onclick="window.deleteAttendee('${_esc(a.id)}')" class="text-red-500"><i class="fa-solid fa-trash"></i></button></td></tr>`).join('');
}
window.renderAdminEventAttendees = renderAdminEventAttendees;

export function renderAdminMenu(_menu) {
    const list=document.getElementById('adminMenuList');if(!list) return;
    list.innerHTML=Object.values(_menu).map(item=>{
        const isUnavail = item.unavailable === true;
        return `<div class="border ${isUnavail ? 'border-gray-300 bg-gray-50 opacity-70' : 'border-gray-200 bg-white'} rounded-xl p-4 flex flex-col items-center justify-center text-center relative hover:shadow-md transition">
            <button onclick="window.deleteMenuItem('${item.id}')" class="absolute top-2 right-2 text-red-400 hover:text-red-600"><i class="fa-solid fa-trash"></i></button>
            <button onclick="window.toggleMenuItemAvailability('${item.id}', ${isUnavail})" title="${isUnavail ? 'تفعيل المنتج' : 'تعليق المنتج'}" class="absolute top-2 left-2 text-[9px] px-1.5 py-0.5 rounded font-bold ${isUnavail ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'} hover:opacity-80 transition">
                ${isUnavail ? '✅ تفعيل' : '⏸ إيقاف'}
            </button>
            ${isUnavail ? '<div class="absolute top-0 left-0 right-0 bg-gray-400 text-white text-[8px] text-center py-0.5 rounded-t-xl font-bold">غير متوفر حالياً</div>' : ''}
            <i class="fa-solid ${item.icon||'fa-star'} text-2xl ${isUnavail ? 'text-gray-400' : 'text-hola-purple'} mb-2 mt-2"></i>
            <p class="font-bold text-sm mb-1 ${isUnavail ? 'text-gray-400 line-through' : ''}">${item.name}</p>
            <p class="${isUnavail ? 'text-gray-400' : 'text-hola-orange'} font-black text-sm">${item.price} ج</p>
            <span class="text-[10px] bg-gray-100 px-2 py-0.5 rounded mt-2">${item.type==='drink'?'مشروب':'واي فاي'}</span>
        </div>`;
    }).join('');
}
window.renderAdminMenu = renderAdminMenu;

export function renderAdminDiscounts(_discounts) {
    const list=document.getElementById('adminDiscountsList');if(!list) return;
    list.innerHTML=Object.values(_discounts).map(d=>`<tr class="hover:bg-gray-50 border-b"><td class="p-3 font-mono font-bold text-hola-purple">${_esc(d.code)}</td><td class="p-3 font-bold text-hola-orange">${_esc(String(d.value))} ${d.isPercentage?'%':'ج'}</td><td class="p-3 font-bold text-[10px]">${d.assignedTo?'<span class="text-blue-600">لعميل: '+_esc(d.assignedTo)+'</span>':'عام للكل'}</td><td class="p-3">${d.isUsed?'<span class="text-red-500 text-xs bg-red-50 px-2 py-1 rounded">مُستخدم</span>':'<span class="text-green-500 text-xs bg-green-50 px-2 py-1 rounded">متاح</span>'}</td><td class="p-3"><button onclick="window.deleteDiscount('${d.id}')" class="text-red-500 hover:text-red-700"><i class="fa-solid fa-trash"></i></button></td></tr>`).join('');
}
window.renderAdminDiscounts = renderAdminDiscounts;

export function renderAdminUsers(_profiles) {
    const list=document.getElementById('adminUsersList');if(!list) return;
    const sortedUsers=Object.values(_profiles).filter(u=>!u.isGuest).sort((a,b)=>(b.stamps?.length||0)-(a.stamps?.length||0));
    list.innerHTML=sortedUsers.map(u=>`<tr class="hover:bg-gray-50 border-b"><td class="p-3 font-bold text-hola-purple">${_esc(u.name)}</td><td class="p-3 font-mono text-xs">${_esc(u.phone)}</td><td class="p-3 font-black text-hola-orange"><i class="fa-solid fa-stamp text-[10px] mr-1"></i> ${u.stamps?.length||0}</td><td class="p-3 font-bold text-green-600">${u.walletBalance||0} ج</td><td class="p-3"><div class="flex gap-1 justify-end"><button onclick="window.openUserManage('${_esc(u.phone)}')" class="bg-gray-800 text-white text-[10px] px-2 py-1.5 rounded hover:bg-black transition"><i class="fa-solid fa-bolt"></i> إجراء</button><button onclick="window.openUserDetails('${_esc(u.phone)}')" class="bg-hola-purple text-white text-[10px] px-2 py-1.5 rounded hover:bg-hola-dark transition"><i class="fa-solid fa-eye"></i> تفاصيل</button></div></td></tr>`).join('');
}
window.renderAdminUsers = renderAdminUsers;

export function renderAdminBanned(_bannedPhones) {
    const list=document.getElementById('adminBannedList');if(!list) return;
    const banned=Object.values(_bannedPhones).sort((a,b)=>b.timestamp-a.timestamp);
    if(banned.length===0){list.innerHTML='<tr><td colspan="4" class="text-center p-4 text-gray-500 text-xs">لا يوجد أرقام محظورة حالياً</td></tr>';}
    else list.innerHTML=banned.map(b=>{
        const tDate=new Date(b.timestamp).toLocaleString('ar-EG',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
        const noteHtml=b.note?`<span class="block text-[9px] text-orange-600 mt-0.5 font-bold">📝 ${_esc(b.note)}</span>`:'';
        return `<tr class="hover:bg-red-50 transition">
            <td class="p-3 font-bold font-mono text-red-600" dir="ltr">${b.phone}${noteHtml}<span class="block text-[9px] text-gray-400 font-normal">${b.reason}</span></td>
            <td class="p-3 text-xs" dir="ltr">${tDate}</td>
            <td class="p-3">
                <div class="flex flex-col gap-1">
                    <input type="text" placeholder="أضف ملاحظة..." id="ban-note-${b.phone}" class="border rounded-lg px-2 py-1 text-[10px] w-full focus:border-orange-400 outline-none" value="${b.note||''}">
                    <button onclick="window.saveBanNote('${_esc(b.phone)}')" class="bg-orange-100 text-orange-700 px-2 py-1 rounded-lg text-[9px] font-bold hover:bg-orange-200 transition">💾 حفظ ملاحظة</button>
                </div>
            </td>
            <td class="p-3"><button onclick="window.unbanPhone('${_esc(b.phone)}')" class="bg-green-500 hover:bg-green-600 text-white px-3 py-2 rounded-lg text-[10px] font-bold shadow flex items-center gap-1 whitespace-nowrap"><i class="fa-solid fa-unlock"></i> رفع الحظر</button></td>
        </tr>`;
    }).join('');
}
window.renderAdminBanned = renderAdminBanned;

export function renderAdminOperations(_operations) {
    const list=document.getElementById('adminOperationsList');if(!list) return;
    const ops=Object.values(_operations).sort((a,b)=>b.timestamp-a.timestamp).slice(0,100);
    list.innerHTML=ops.map(o=>`<tr class="hover:bg-gray-50 border-b"><td class="p-3 text-xs text-gray-500" dir="ltr">${new Date(o.timestamp).toLocaleString('ar-EG',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</td><td class="p-3 font-bold text-hola-purple">${o.adminName}</td><td class="p-3 font-bold text-gray-800">${o.actionType}</td><td class="p-3 text-xs">${o.details}</td></tr>`).join('')||'<tr><td colspan="4" class="text-center p-4">لا يوجد عمليات</td></tr>';
}
window.renderAdminOperations = renderAdminOperations;

// ─── NEW: Public Events Render ─────────────────────────────────────────────────
export function renderPublicEvents(sysSettings, myProfile, activeSessionId, _smartEvents) {
    const container = document.getElementById('publicEventsBanners');
    const clientBanner = document.getElementById('eventBanner');
    // publicEventsBanners is removed from login page — only update clientBanner
    const evArr = _smartEvents ? Object.values(_smartEvents).filter(e => e.active).sort((a, b) => a.createdAt - b.createdAt) : [];
    let firstActiveEvent = evArr[0] || null;
    // Update client panel banner with first active event
    if (clientBanner && firstActiveEvent && myProfile && activeSessionId) {
        safeSet('eventBannerTitle', 'innerText', firstActiveEvent.title);
        safeSet('eventBannerDate', 'innerText', firstActiveEvent.evTime || 'اضغط لمعرفة التفاصيل');
        safeSet('eventBannerImg', 'src', firstActiveEvent.img || '');
        clientBanner.classList.remove('hidden');
    } else if (clientBanner) { clientBanner.classList.add('hidden'); }
    if (container) container.innerHTML = ''; // cleared — banners moved to auth card
}
window.renderPublicEvents = renderPublicEvents;

// ─── NEW: Client Subscriptions Render ────────────────────────────────────────
export function renderClientSubscriptions(myProfile, _subscriptions) {
    if (!myProfile) return;
    const list = document.getElementById('clientSubsList');
    const history = document.getElementById('clientSubsHistory');
    if (!list) return;
    const mySubs = Object.values(_subscriptions).filter(s => s.phone === myProfile.phone).sort((a, b) => b.createdAt - a.createdAt);
    if (mySubs.length === 0) {
        list.innerHTML = '<div class="text-center py-6"><div class="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center text-2xl mx-auto mb-3 text-gray-400"><i class="fa-solid fa-crown"></i></div><p class="text-gray-400 text-sm font-bold">لا توجد اشتراكات</p><p class="text-xs text-gray-400 mt-1">اضغط "اشترك الآن" لتفعيل باقة</p></div>';
        if (history) history.innerHTML = '<p class="text-center text-gray-400 text-sm py-4">لا يوجد سجل</p>';
        return;
    }
    const active = mySubs.filter(s => s.status === 'active');
    const pending = mySubs.filter(s => s.status === 'pending');
    const paused = mySubs.filter(s => s.status === 'paused');
    const others = mySubs.filter(s => !['active', 'pending', 'paused'].includes(s.status));

    // Render active subs — clean mobile card
    const activeHtml = active.map(s => {
        const totalDays = s.allowedDays || s.planDays || 30;
        // ★ استخدم usedDays المحفوظ إذا كان موجوداً، وإلا احسبه
        const usedDays = s.usedDays !== undefined ? s.usedDays : Math.max(0, totalDays - (s.daysLeft || 0));
        const pct = totalDays > 0 ? Math.min(100, Math.round((usedDays / totalDays) * 100)) : 0;
        const endDate = s.endDate ? new Date(s.endDate).toLocaleDateString('ar-EG') : (s.expiresAt ? new Date(s.expiresAt).toLocaleDateString('ar-EG') : '---');
        const urgency = (s.daysLeft || 0) <= 3 ? 'border-red-400' : (s.daysLeft || 0) <= 7 ? 'border-yellow-400' : 'border-green-400';
        return `<div class="active-sub-card border-r-4 ${urgency}" onclick="window.showSubCard && window.showSubCard('${s.id}')">
            <div class="sub-header">
                <span class="sub-name"><i class="fa-solid fa-crown text-hola-orange text-xs ml-1"></i>${s.planName}</span>
                <span class="sub-badge bg-green-100 text-green-700">✅ نشط</span>
            </div>
            ${s.code ? `<div class="flex items-center gap-2 mt-1">
                <span class="font-mono text-xs bg-purple-50 text-hola-purple px-2 py-1 rounded-lg border border-purple-100 font-black tracking-wider cursor-pointer select-all" onclick="event.stopPropagation();window.copyToClipboard('${s.code}')" title="اضغط للنسخ">${s.code} <i class="fa-regular fa-copy text-hola-orange text-[10px] mr-1"></i></span>
            </div>` : ''}
            <div class="sub-track-progress"><div class="sub-track-bar" style="width:${pct}%"></div></div>
            <div class="sub-meta">
                <span><i class="fa-solid fa-calendar-days ml-1 text-hola-orange"></i>ينتهي: ${endDate}</span>
                <span class="mr-auto font-black ${(s.daysLeft||0)<=3?'text-red-500':(s.daysLeft||0)<=7?'text-yellow-600':'text-hola-purple'}">${s.daysLeft || 0} يوم متبقي</span>
            </div>
        </div>`;
    }).join('');

    const pausedHtml = paused.map(s => `
        <div class="active-sub-card border-r-4 border-yellow-400 opacity-80">
            <div class="sub-header">
                <span class="sub-name"><i class="fa-solid fa-crown text-gray-400 text-xs ml-1"></i>${s.planName}</span>
                <span class="sub-badge bg-yellow-100 text-yellow-700">⏸ موقوف</span>
            </div>
            <div class="sub-meta"><span class="text-gray-500">متبقي: ${s.daysLeftBeforePause || s.daysLeft || 0} يوم</span></div>
        </div>`).join('');

    const pendingHtml = pending.map(s => `
        <div class="active-sub-card border-r-4 border-orange-300">
            <div class="sub-header">
                <span class="sub-name"><i class="fa-solid fa-clock text-orange-400 text-xs ml-1"></i>${s.planName}</span>
                <span class="sub-badge bg-orange-100 text-orange-600">⏳ قيد المراجعة</span>
            </div>
            <div class="sub-meta text-xs text-gray-400">في انتظار موافقة الإدارة</div>
        </div>`).join('');

    list.innerHTML = (activeHtml + pausedHtml + pendingHtml) || '<p class="text-center text-gray-400 text-sm py-4">لا توجد اشتراكات نشطة</p>';

    // Subscription tracker — interactive
    if (history) {
        if (active.length > 0) {
            const s = active[0];
            const totalDays = s.allowedDays || s.planDays || 30;
            const usedDays = s.usedDays !== undefined ? s.usedDays : Math.max(0, totalDays - (s.daysLeft||0));
            const pct = totalDays > 0 ? Math.min(100, Math.round((usedDays / totalDays) * 100)) : 0;
            const urgencyColor = (s.daysLeft||0) <= 3 ? '#ef4444' : (s.daysLeft||0) <= 7 ? '#f59e0b' : '#301043';
            history.innerHTML = `<div class="sub-track-card">
                <div class="flex justify-between items-center mb-2">
                    <span class="text-sm font-black text-hola-purple"><i class="fa-solid fa-route ml-1 text-hola-orange"></i>تتبع الاشتراك</span>
                    <span class="text-xs font-bold" style="color:${urgencyColor}">${pct}% مستخدم</span>
                </div>
                <div class="flex justify-between text-xs text-gray-400 font-bold mb-1">
                    <span>بداية الباقة</span>
                    <span>${usedDays} / ${totalDays} يوم</span>
                    <span>النهاية</span>
                </div>
                <div class="sub-track-progress"><div class="sub-track-bar" id="subTrackBarAnim" style="width:0%"></div></div>
                <div class="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div class="bg-gray-50 rounded-xl p-2 border"><p class="text-[10px] text-gray-400 font-bold">أيام مستخدمة</p><p class="font-black text-gray-700 text-lg">${usedDays}</p></div>
                    <div class="bg-purple-50 rounded-xl p-2 border border-purple-100"><p class="text-[10px] text-hola-orange font-bold">متبقي</p><p class="font-black text-hola-purple text-lg">${s.daysLeft||0}</p></div>
                    <div class="bg-gray-50 rounded-xl p-2 border"><p class="text-[10px] text-gray-400 font-bold">إجمالي</p><p class="font-black text-gray-700 text-lg">${totalDays}</p></div>
                </div>
                ${(s.daysLeft||0) <= 7 ? `<div class="mt-3 bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                    <p class="text-xs font-black text-red-600"><i class="fa-solid fa-triangle-exclamation ml-1"></i>اشتراكك ينتهي قريباً! جدد الآن.</p>
                    <button onclick="window.showSubscriptionModal && window.showSubscriptionModal()" class="mt-2 bg-hola-orange text-white text-xs font-black px-4 py-2 rounded-xl hover:bg-orange-600 transition">تجديد الاشتراك</button>
                </div>` : ''}
            </div>` + (others.length > 0 ? `<p class="text-xs text-gray-400 font-bold mt-4 mb-2"><i class="fa-solid fa-clock-rotate-left ml-1"></i>اشتراكات سابقة:</p>` + others.map(s2 => `
                <div class="flex justify-between items-center bg-gray-50 border p-3 rounded-xl text-sm">
                    <div><p class="font-bold text-gray-600">${s2.planName}</p><p class="text-xs text-gray-400">${new Date(s2.createdAt).toLocaleDateString('ar-EG')}</p></div>
                    <span class="text-xs font-bold ${s2.status==='expired'?'text-red-400':'text-gray-400'}">${s2.status==='expired'?'منتهي':'ملغي'}</span>
                </div>`).join('') : '');
            // Animate progress bar
            setTimeout(() => { const b = document.getElementById('subTrackBarAnim'); if(b) b.style.width = pct+'%'; }, 100);
        } else {
            history.innerHTML = others.map(s => `
                <div class="flex justify-between items-center bg-gray-50 border p-3 rounded-xl text-sm mb-2">
                    <div><p class="font-bold text-gray-600">${s.planName}</p><p class="text-xs text-gray-400">${new Date(s.createdAt).toLocaleDateString('ar-EG')}</p></div>
                    <span class="text-xs font-bold ${s.status==='expired'?'text-red-400':'text-gray-400'}">${s.status==='expired'?'منتهي':'ملغي'}</span>
                </div>`).join('') || '<p class="text-center text-gray-400 text-sm py-4">لا يوجد سجل</p>';
        }
    }
}
window.renderClientSubscriptions = renderClientSubscriptions;

// ─── NEW: Admin Subscriptions Render ─────────────────────────────────────────
export function renderAdminSubscriptions(_subscriptions, _plans) {
    const pendingList = document.getElementById('adminPendingSubsList');
    const activeList = document.getElementById('adminActiveSubsList');
    if (!pendingList || !activeList) return;
    const pending = Object.values(_subscriptions).filter(s => s.status === 'pending').sort((a, b) => b.createdAt - a.createdAt);
    const active = Object.values(_subscriptions).filter(s => s.status === 'active').sort((a, b) => b.createdAt - a.createdAt);
    pendingList.innerHTML = pending.length === 0 ? '<tr><td colspan="5" class="text-center p-4 text-gray-400 text-xs">لا توجد طلبات معلقة</td></tr>' :
        pending.map(s => `<tr class="hover:bg-gray-50 border-b">
            <td class="p-3 font-bold text-hola-purple">${s.name}</td>
            <td class="p-3 font-mono text-xs">${s.phone}</td>
            <td class="p-3 text-xs font-bold text-hola-orange">${s.planName}<br><span class="text-gray-400 font-normal">${s.planPrice || 0} ج.م</span></td>
            <td class="p-3 text-xs text-gray-500">${new Date(s.createdAt).toLocaleDateString('ar-EG')}</td>
            <td class="p-3"><div class="flex gap-1 flex-wrap">
                <button onclick="window.approveSubscription('${s.id}')" class="bg-green-500 text-white text-[10px] px-2 py-1.5 rounded font-bold hover:bg-green-600 transition shadow-sm"><i class="fa-solid fa-check ml-1"></i>قبول وتفعيل</button>
                <button onclick="window.rejectSubscription('${s.id}')" class="bg-red-500 text-white text-[10px] px-2 py-1.5 rounded font-bold hover:bg-red-600 transition"><i class="fa-solid fa-ban ml-1"></i>رفض</button>
            </div></td>
        </tr>`).join('');
    // Show active + paused subscriptions
    const activePaused = Object.values(_subscriptions).filter(s => s.status === 'active' || s.status === 'paused').sort((a, b) => b.createdAt - a.createdAt);
    activeList.innerHTML = activePaused.length === 0 ? '<tr><td colspan="7" class="text-center p-4 text-gray-400 text-xs">لا توجد اشتراكات نشطة</td></tr>' :
        activePaused.map(s => {
            const isPaused = s.status === 'paused';
            const statusBadge = isPaused
                ? '<span class="bg-yellow-100 text-yellow-700 text-[9px] px-1.5 py-0.5 rounded font-bold mr-1">⏸ موقوف</span>'
                : '<span class="bg-green-100 text-green-700 text-[9px] px-1.5 py-0.5 rounded font-bold mr-1">✅ نشط</span>';
            const actionBtns = isPaused
                ? `<button onclick="window.openSubActionModal('${s.id}')" class="bg-purple-100 text-hola-purple text-[10px] px-2 py-1 rounded font-bold hover:bg-purple-200 transition"><i class="fa-solid fa-sliders ml-1"></i>إجراء</button>
                   <button onclick="window.resumeSubscription('${s.id}')" class="bg-green-500 text-white text-[10px] px-2 py-1 rounded font-bold hover:bg-green-600 transition"><i class="fa-solid fa-play ml-1"></i>استئناف</button>`
                : `<button onclick="window.openSubActionModal('${s.id}')" class="bg-purple-100 text-hola-purple text-[10px] px-2 py-1 rounded font-bold hover:bg-purple-200 transition"><i class="fa-solid fa-sliders ml-1"></i>إجراء</button>`;
            return `<tr class="hover:bg-gray-50 border-b ${isPaused ? 'bg-yellow-50' : ''}">
                <td class="p-3 font-bold text-hola-purple">${s.name}${statusBadge}</td>
                <td class="p-3 font-mono text-xs">${s.phone}</td>
                <td class="p-3 text-xs font-bold text-hola-orange">${s.planName}</td>
                <td class="p-3 font-mono text-xs font-bold text-hola-purple">${s.code || '---'}</td>
                <td class="p-3">
                    <div class="flex items-center gap-1">
                        <input type="number" value="${isPaused ? (s.daysLeftBeforePause || s.daysLeft || 0) : (s.daysLeft || 0)}" min="0" max="365"
                            class="w-14 border rounded px-1 py-0.5 text-center font-black text-hola-orange text-sm"
                            onchange="window.updateSubDays('${s.id}', this.value)">
                        <span class="text-xs text-gray-400">يوم</span>
                    </div>
                </td>
                <td class="p-3 text-xs text-gray-400">${s.endDate ? new Date(s.endDate).toLocaleDateString('ar-EG') : (s.expiresAt ? new Date(s.expiresAt).toLocaleDateString('ar-EG') : '---')}</td>
                <td class="p-3"><div class="flex gap-1 flex-wrap">${actionBtns}</div></td>
            </tr>`;
        }).join('');
}
window.renderAdminSubscriptions = renderAdminSubscriptions;

// ─── NEW: Admin Plans Render ──────────────────────────────────────────────────
export function renderAdminPlans(_plans) {
    const list = document.getElementById('adminPlansList');
    if (!list) return;
    const plans = Object.values(_plans);
    list.innerHTML = plans.length === 0 ? '<p class="col-span-full text-center text-gray-400 text-sm py-6">لا توجد باقات — أضف باقة جديدة</p>' :
        plans.map(p => {
            const isActive = p.active !== false;
            const isUnavail = p.unavailable === true;
            return `
            <div class="border-2 ${isActive && !isUnavail ? 'border-green-200 bg-green-50' : isUnavail ? 'border-gray-300 bg-gray-100 opacity-70' : 'border-gray-200 bg-gray-50 opacity-60'} rounded-2xl p-4 relative hover:shadow-md transition">
                <div class="absolute top-2 left-2 flex gap-1 flex-wrap">
                    <button onclick="window.togglePlanActive('${p.id}', ${isActive})" class="text-[9px] px-2 py-1 rounded font-bold ${isActive ? 'bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-700' : 'bg-gray-200 text-gray-600 hover:bg-green-100 hover:text-green-700'} transition">
                        ${isActive ? '<i class="fa-solid fa-toggle-on"></i> نشط' : '<i class="fa-solid fa-toggle-off"></i> متوقف'}
                    </button>
                    <button onclick="window.togglePlanAvailability('${p.id}', ${isUnavail})" class="text-[9px] px-2 py-1 rounded font-bold ${isUnavail ? 'bg-blue-100 text-blue-700' : 'bg-orange-50 text-orange-600 hover:bg-orange-100'} transition" title="${isUnavail ? 'إتاحة الاشتراك' : 'إيقاف الاشتراك مؤقتاً'}">
                        ${isUnavail ? '✅ إتاحة' : '⏸ إيقاف'}
                    </button>
                    <button onclick="window.deletePlan('${p.id}')" class="text-red-400 hover:text-red-600 bg-red-50 w-6 h-6 rounded flex items-center justify-center"><i class="fa-solid fa-trash text-xs"></i></button>
                </div>
                ${isUnavail ? '<div class="bg-gray-400 text-white text-[9px] text-center py-0.5 rounded-t-xl font-bold -mx-4 -mt-4 mb-3">غير متوفر حالياً</div>' : ''}
                <div class="text-center mt-6">
                    ${p.headerImg ? `<img src="${p.headerImg}" class="w-full h-20 object-cover rounded-xl mb-2 border" onerror="this.style.display='none'">` : p.icon ? `<i class="fa-solid ${p.icon} text-3xl mb-2" style="color:${p.color||'#301043'}"></i>` : ''}
                    <p class="font-black text-lg mb-1" style="color:${p.color||'#301043'}">${p.name}</p>
                    <p class="text-2xl font-black text-hola-orange mb-2">${p.price} ج.م</p>
                    <p class="text-xs text-gray-500 mb-2">${p.desc || ''}</p>
                    <div class="flex justify-between text-xs font-bold text-gray-600 bg-white p-2 rounded-lg border">
                        <span><i class="fa-solid fa-calendar-days text-hola-orange ml-1"></i>${p.days} يوم</span>
                        <span><i class="fa-solid fa-check-circle text-green-500 ml-1"></i>${p.allowedDays || p.days} أيام استخدام</span>
                    </div>
                    <button onclick="window.showEditPlanModal('${p.id}')" class="mt-2 w-full bg-gray-100 text-gray-600 text-xs font-bold py-1.5 rounded-lg hover:bg-gray-200 transition"><i class="fa-solid fa-palette ml-1"></i> تخصيص المظهر</button>
                </div>
            </div>`; }).join('');
}
window.renderAdminPlans = renderAdminPlans;

export function renderAdminFeedback(_feedback) {
    const list = document.getElementById('adminFeedbackList');
    const badge = document.getElementById('feedbackBadge');
    if (!list) return;
    const items = Object.values(_feedback).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    if (badge) {
        const unread = items.filter(f => !f.isRead).length;
        badge.textContent = unread;
        badge.classList.toggle('hidden', unread === 0);
    }
    if (items.length === 0) {
        list.innerHTML = '<p class="text-center text-gray-400 text-sm py-10">لا توجد رسائل بعد</p>';
        return;
    }
    const stars = n => '★'.repeat(n || 0) + '☆'.repeat(5 - (n || 0));
    const typeLabel = t => ({ complaint: '😤 شكوى', suggestion: '💡 اقتراح', compliment: '🌟 إطراء' }[t] || '💬 رسالة');
    list.innerHTML = items.map(f => `
        <div class="bg-white rounded-2xl border-2 ${f.isRead ? 'border-gray-100' : 'border-hola-purple/40 bg-purple-50/30'} p-4 shadow-sm hover:shadow-md transition relative">
            ${!f.isRead ? '<span class="absolute top-3 left-3 w-2.5 h-2.5 bg-hola-purple rounded-full"></span>' : ''}
            <div class="flex items-start justify-between gap-3 mb-2">
                <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-xs font-black px-2.5 py-1 rounded-full bg-purple-100 text-hola-purple">${typeLabel(f.type)}</span>
                    ${f.stars ? `<span class="text-yellow-400 text-sm font-black" title="${f.stars} نجوم">${stars(f.stars)}</span>` : ''}
                </div>
                <span class="text-[10px] text-gray-400 font-bold whitespace-nowrap">${f.createdAt ? new Date(f.createdAt).toLocaleString('ar-EG') : ''}</span>
            </div>
            ${f.message ? `<p class="text-sm text-gray-700 font-bold leading-relaxed bg-gray-50 rounded-xl p-3 border border-gray-100">${f.message}</p>` : '<p class="text-xs text-gray-400 italic">بدون رسالة نصية</p>'}
            <div class="flex gap-2 mt-3">
                ${!f.isRead ? `<button onclick="window.markFeedbackRead('${f.id}')" class="text-xs bg-hola-purple text-white font-bold px-3 py-1.5 rounded-lg hover:bg-hola-dark transition"><i class="fa-solid fa-check ml-1"></i>تم القراءة</button>` : '<span class="text-xs text-gray-400 font-bold"><i class="fa-solid fa-check-double ml-1"></i>مقروءة</span>'}
                <button onclick="window.deleteFeedback('${f.id}')" class="text-xs bg-red-50 text-red-500 font-bold px-3 py-1.5 rounded-lg hover:bg-red-100 transition"><i class="fa-solid fa-trash ml-1"></i>حذف</button>
            </div>
        </div>`).join('');
}
window.renderAdminFeedback = renderAdminFeedback;
