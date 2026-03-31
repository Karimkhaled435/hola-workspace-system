// =====================================================
// server/server.js — Hola Workspace Local Server
// Express + Firebase Admin + Router Control
// =====================================================

'use strict';

require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const cron       = require('node-cron');
const admin      = require('firebase-admin');
const routerApi  = require('./router-api');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Firebase Admin Initialization ────────────────────────────────────────────
let db;
try {
    const serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './service-account.json');
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    db = admin.firestore();
    console.log('[Firebase] Admin SDK initialized successfully.');
} catch (err) {
    console.error('[Firebase] Failed to initialize Admin SDK:', err.message);
    console.error('  → Make sure service-account.json exists and FIREBASE_SERVICE_ACCOUNT_PATH is set correctly.');
    process.exit(1);
}

const APP_ID = process.env.FIREBASE_APP_ID || 'hola-v20';

// Firestore collection helper
const cardsCol = () => db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection('internet_cards');

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({
    // Restrict to the explicitly configured origin.
    // If CORS_ORIGIN is not set the server refuses cross-origin requests rather
    // than defaulting to the permissive wildcard '*'.
    origin: process.env.CORS_ORIGIN || false,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-admin-secret']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logger
app.use((req, _res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

// ─── Admin Auth Middleware ─────────────────────────────────────────────────────
// Protects admin-only routes by checking the x-admin-secret header.
function requireAdmin(req, res, next) {
    const secret = req.headers['x-admin-secret'];
    if (!secret || secret !== process.env.ADMIN_SECRET) {
        return res.status(401).json({ ok: false, error: 'Unauthorized — invalid admin secret.' });
    }
    next();
}

// ─── Card Helpers ──────────────────────────────────────────────────────────────
// Validates a card object: active status, not expired, quota remaining.
function isCardValid(card) {
    if (!card) return false;
    if (card.status !== 'active') return false;
    if (Date.now() > card.expiresAt) return false;
    if (card.usedMB >= card.quotaMB) return false;
    return true;
}

// Fetches a card document by its code field.
async function getCardByCode(code) {
    const snap = await cardsCol()
        .where('code', '==', code.trim().toUpperCase())
        .limit(1)
        .get();
    if (snap.empty) return null;
    return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /status — Health check endpoint
app.get('/status', (_req, res) => {
    res.json({
        ok:      true,
        service: 'Hola Workspace Server',
        version: '1.0.0',
        time:    new Date().toISOString()
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /login
// Body: { code: "HOLA-XXXX-XXXX", deviceId: "...", deviceInfo: "..." }
//
// Validates the card, enforces device binding, and (when router is configured)
// allowlists the device's MAC address on the router.
// ─────────────────────────────────────────────────────────────────────────────
app.post('/login', async (req, res) => {
    const { code, deviceId, deviceInfo } = req.body;
    if (!code)     return res.status(400).json({ ok: false, error: 'code is required.' });
    if (!deviceId) return res.status(400).json({ ok: false, error: 'deviceId is required.' });

    try {
        const card = await getCardByCode(code);

        if (!card) return res.status(404).json({ ok: false, error: 'Card not found.' });

        if (!isCardValid(card)) {
            return res.status(403).json({
                ok:     false,
                error:  'Card is not valid.',
                status: card.status,
                reason: card.status !== 'active'
                    ? `Card is ${card.status}.`
                    : Date.now() > card.expiresAt
                        ? 'Card has expired.'
                        : 'Quota exhausted.'
            });
        }

        // Enforce single-device binding
        if (card.boundDevice && card.boundDevice !== deviceId) {
            return res.status(403).json({
                ok:    false,
                error: 'This card is already bound to a different device.'
            });
        }

        // Bind card to device on first use
        if (!card.boundDevice) {
            await cardsCol().doc(card.id).update({
                boundDevice:     deviceId,
                boundDeviceInfo: deviceInfo || null,
                boundAt:         Date.now(),
                lastUsed:        Date.now()
            });
            console.log(`[Login] Card ${card.code} bound to device ${deviceId}`);
        } else {
            await cardsCol().doc(card.id).update({ lastUsed: Date.now() });
        }

        // ── Router Integration (stub) ─────────────────────────────────────────
        // When the router API is fully configured, allowlist the MAC address here.
        //
        //   const mac = req.body.mac; // pass MAC from client or derive from ARP table
        //   await routerApi.unblockMac(mac);
        //
        // For now we skip this step and rely on voucher/SSID-level access.
        // ─────────────────────────────────────────────────────────────────────

        return res.json({
            ok:       true,
            cardId:   card.id,
            code:     card.code,
            quotaMB:  card.quotaMB,
            usedMB:   card.usedMB,
            remainMB: Math.max(0, card.quotaMB - card.usedMB),
            expiresAt: card.expiresAt
        });

    } catch (err) {
        console.error('[Login] Error:', err);
        return res.status(500).json({ ok: false, error: 'Internal server error.' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /activate-card  [Admin]
// Body: { cardId: "...", status: "active" | "inactive" | "suspended" }
//
// Changes the status of a card. Requires x-admin-secret header.
// ─────────────────────────────────────────────────────────────────────────────
app.post('/activate-card', requireAdmin, async (req, res) => {
    const { cardId, status } = req.body;
    const allowed = ['active', 'inactive', 'suspended'];
    if (!cardId)            return res.status(400).json({ ok: false, error: 'cardId is required.' });
    if (!allowed.includes(status)) return res.status(400).json({ ok: false, error: `status must be one of: ${allowed.join(', ')}.` });

    try {
        await cardsCol().doc(cardId).update({ status });
        console.log(`[Admin] Card ${cardId} status set to ${status}`);
        return res.json({ ok: true, cardId, status });
    } catch (err) {
        console.error('[activate-card] Error:', err);
        return res.status(500).json({ ok: false, error: 'Internal server error.' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /usage/:cardCode
// Returns current usage stats for a card by its code.
// ─────────────────────────────────────────────────────────────────────────────
app.get('/usage/:cardCode', async (req, res) => {
    const { cardCode } = req.params;
    try {
        const card = await getCardByCode(cardCode);
        if (!card) return res.status(404).json({ ok: false, error: 'Card not found.' });

        return res.json({
            ok:        true,
            code:      card.code,
            status:    card.status,
            usedMB:    card.usedMB,
            quotaMB:   card.quotaMB,
            remainMB:  Math.max(0, card.quotaMB - card.usedMB),
            expiresAt: card.expiresAt,
            lastUsed:  card.lastUsed
        });
    } catch (err) {
        console.error('[usage] Error:', err);
        return res.status(500).json({ ok: false, error: 'Internal server error.' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /disconnect-user  [Admin]
// Body: { cardId: "..." }
//
// Suspends a card and (when router is configured) blocks the device's MAC.
// ─────────────────────────────────────────────────────────────────────────────
app.post('/disconnect-user', requireAdmin, async (req, res) => {
    const { cardId } = req.body;
    if (!cardId) return res.status(400).json({ ok: false, error: 'cardId is required.' });

    try {
        const snap = await cardsCol().doc(cardId).get();
        if (!snap.exists) return res.status(404).json({ ok: false, error: 'Card not found.' });

        const card = snap.data();
        await cardsCol().doc(cardId).update({ status: 'suspended' });

        // ── Router Integration (stub) ─────────────────────────────────────────
        // Block the MAC address associated with this device on the router.
        //
        //   if (card.boundDevice) {
        //       const mac = await routerApi.getMacForDevice(card.boundDevice);
        //       if (mac) await routerApi.blockMac(mac);
        //   }
        // ─────────────────────────────────────────────────────────────────────

        console.log(`[Admin] Card ${cardId} disconnected (suspended).`);
        return res.json({ ok: true, cardId, suspended: true });
    } catch (err) {
        console.error('[disconnect-user] Error:', err);
        return res.status(500).json({ ok: false, error: 'Internal server error.' });
    }
});

// ─── Scheduled Jobs ───────────────────────────────────────────────────────────
// Runs every hour to mark expired cards automatically.
cron.schedule('0 * * * *', async () => {
    console.log('[Cron] Checking for expired cards...');
    try {
        const now  = Date.now();
        const snap = await cardsCol()
            .where('status', '==', 'active')
            .where('expiresAt', '<', now)
            .get();

        if (snap.empty) {
            console.log('[Cron] No expired cards found.');
            return;
        }

        const batch = db.batch();
        snap.docs.forEach(d => batch.update(d.ref, { status: 'expired' }));
        await batch.commit();
        console.log(`[Cron] Marked ${snap.size} card(s) as expired.`);
    } catch (err) {
        console.error('[Cron] Error checking expired cards:', err);
    }
});

// ─── 404 Fallback ─────────────────────────────────────────────────────────────
app.use((req, res) => {
    res.status(404).json({ ok: false, error: `Route not found: ${req.method} ${req.path}` });
});

// ─── Start Server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`\n🚀 Hola Workspace Server running on port ${PORT}`);
    console.log(`   Health check → http://localhost:${PORT}/status\n`);
});

module.exports = app; // for testing
