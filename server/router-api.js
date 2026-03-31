// =====================================================
// server/router-api.js — Zyxel VMG3625-T50B Integration
// Session-based HTTP interaction with the router admin UI.
// =====================================================
//
// The Zyxel VMG3625-T50B does not expose a public REST API.
// All interactions mimic browser form submissions to the router's
// built-in web management interface (default: http://192.168.1.1).
//
// IMPORTANT: These endpoints are firmware-dependent.
//   Firmware tested: V5.50(ABPM.6)b4
//   If your firmware differs, inspect the admin UI with browser DevTools
//   (Network tab) to find the correct paths and form fields.
// =====================================================

'use strict';

require('dotenv').config();

const axios = require('axios');

const ROUTER_HOST     = process.env.ROUTER_HOST     || '192.168.1.1';
const ROUTER_USERNAME = process.env.ROUTER_USERNAME  || 'admin';
const ROUTER_PASSWORD = process.env.ROUTER_PASSWORD  || 'admin';
const BASE_URL        = `http://${ROUTER_HOST}`;

// Shared axios instance — preserves cookies for the session.
const client = axios.create({
    baseURL:        BASE_URL,
    timeout:        10000,
    // The router uses self-signed HTTPS on some models; disable TLS verification.
    httpsAgent:     new (require('https').Agent)({ rejectUnauthorized: false }),
    maxRedirects:   5,
    withCredentials: true
});

// Active session cookie storage (simple in-memory).
let sessionCookie = null;

// ─── Login to Router ───────────────────────────────────────────────────────────
// Calls: POST http://{ROUTER_HOST}/login.cgi
// The Zyxel admin login page submits a form to /login.cgi with
// fields `username` and `password`. On success the router sets a
// session cookie (e.g. `zyxel_sess_id`) that must accompany all
// subsequent requests.
//
// Returns true on success, throws on failure.
async function login() {
    console.log(`[Router] Logging in to ${BASE_URL} as ${ROUTER_USERNAME} ...`);
    try {
        const params = new URLSearchParams();
        params.append('username', ROUTER_USERNAME);
        params.append('password', ROUTER_PASSWORD);

        const res = await client.post('/login.cgi', params.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        // Extract and store the session cookie from the response headers.
        const setCookie = res.headers['set-cookie'];
        if (setCookie && setCookie.length > 0) {
            // Take the first cookie value (session ID).
            sessionCookie = setCookie[0].split(';')[0];
            console.log('[Router] Login successful, session cookie stored.');
            return true;
        }
        throw new Error('No session cookie returned — login may have failed.');
    } catch (err) {
        console.error('[Router] Login failed:', err.message);
        throw err;
    }
}

// ─── Authenticated Request Helper ─────────────────────────────────────────────
// Injects the stored session cookie into every request.
// Re-authenticates automatically if the session has expired (401/302).
async function authedGet(path, retried = false) {
    if (!sessionCookie) await login();
    try {
        const res = await client.get(path, {
            headers: { Cookie: sessionCookie }
        });
        return res.data;
    } catch (err) {
        // Session may have expired — re-login once and retry.
        if (!retried && (err.response?.status === 401 || err.response?.status === 302)) {
            sessionCookie = null;
            return authedGet(path, true);
        }
        throw err;
    }
}

async function authedPost(path, body, retried = false) {
    if (!sessionCookie) await login();
    try {
        const res = await client.post(path, body, {
            headers: {
                Cookie:         sessionCookie,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        return res.data;
    } catch (err) {
        if (!retried && (err.response?.status === 401 || err.response?.status === 302)) {
            sessionCookie = null;
            return authedPost(path, body, true);
        }
        throw err;
    }
}

// ─── Get Connected Clients ─────────────────────────────────────────────────────
// Calls: GET http://{ROUTER_HOST}/getConnectedDevices.cgi
//        (or /cgi-bin/wl_clients.asp on some firmware versions)
//
// Returns a JSON array of connected client objects, each containing:
//   { mac, ip, hostname, interface }
//
// Note: The exact endpoint varies by firmware. Inspect the "Connected Devices"
// or "LAN > DHCP" page in the admin UI to find the correct path.
async function getConnectedClients() {
    try {
        // Try the common JSON endpoint first.
        const data = await authedGet('/getConnectedDevices.cgi');
        if (Array.isArray(data)) return data;
        // Some firmware returns XML or HTML — parse as needed.
        console.warn('[Router] getConnectedClients: unexpected response format, returning raw data.');
        return data;
    } catch (err) {
        console.error('[Router] getConnectedClients failed:', err.message);
        throw err;
    }
}

// ─── Block a MAC Address ───────────────────────────────────────────────────────
// Calls: POST http://{ROUTER_HOST}/wlMacFilter.cgi
//
// Adds the given MAC address to the router's MAC filter deny-list.
// In the Zyxel admin UI this corresponds to:
//   Wireless > MAC Authentication > Add (deny mode)
//
// Parameters posted:
//   action=add, mac=<MAC>, type=deny
//
// NOTE: This only affects the WiFi interface (SSID-level filtering).
// For wired or per-SSID control see the router's Parental Controls section.
async function blockMac(mac) {
    console.log(`[Router] Blocking MAC: ${mac}`);
    const params = new URLSearchParams();
    params.append('action', 'add');
    params.append('mac',    mac.toUpperCase());
    params.append('type',   'deny');
    return authedPost('/wlMacFilter.cgi', params.toString());
}

// ─── Unblock a MAC Address ────────────────────────────────────────────────────
// Calls: POST http://{ROUTER_HOST}/wlMacFilter.cgi
//
// Removes the MAC address from the deny-list, restoring internet access.
//
// Parameters posted:
//   action=delete, mac=<MAC>, type=deny
async function unblockMac(mac) {
    console.log(`[Router] Unblocking MAC: ${mac}`);
    const params = new URLSearchParams();
    params.append('action', 'delete');
    params.append('mac',    mac.toUpperCase());
    params.append('type',   'deny');
    return authedPost('/wlMacFilter.cgi', params.toString());
}

// ─── Get Bandwidth Usage per MAC ──────────────────────────────────────────────
// Calls: GET http://{ROUTER_HOST}/getTrafficStats.cgi?mac=<MAC>
//
// Returns real-time TX/RX byte counters for the specified MAC address.
// These counters are reset when the device disconnects or the router reboots.
//
// Response shape (approximate):
//   { mac, txBytes, rxBytes, txPackets, rxPackets }
//
// NOTE: Not all Zyxel firmware versions expose per-client traffic stats via
// a simple CGI endpoint. If this call fails, consult the "Traffic Monitor"
// section in the admin UI (Maintenance > Traffic Monitor) and capture the
// network requests with browser DevTools.
async function getBandwidthUsage(mac) {
    try {
        const data = await authedGet(`/getTrafficStats.cgi?mac=${encodeURIComponent(mac.toUpperCase())}`);
        return data;
    } catch (err) {
        console.error(`[Router] getBandwidthUsage(${mac}) failed:`, err.message);
        throw err;
    }
}

// ─── Get MAC for Device (ARP Lookup) ──────────────────────────────────────────
// Calls: GET http://{ROUTER_HOST}/getArpTable.cgi
//
// Fetches the router's ARP table and returns the MAC address for the given
// IP address or hostname. Useful when you only know the device's IP.
//
// Returns the MAC string (uppercase, colon-separated) or null if not found.
async function getMacForDevice(ipOrHostname) {
    try {
        const arpTable = await authedGet('/getArpTable.cgi');
        // Expected structure: [{ ip, mac, hostname, interface }, ...]
        if (!Array.isArray(arpTable)) return null;
        const entry = arpTable.find(
            e => e.ip === ipOrHostname || (e.hostname && e.hostname.toLowerCase() === ipOrHostname.toLowerCase())
        );
        return entry ? entry.mac.toUpperCase() : null;
    } catch (err) {
        console.error('[Router] getMacForDevice failed:', err.message);
        return null;
    }
}

// ─── Reboot Router (Admin) ────────────────────────────────────────────────────
// Calls: POST http://{ROUTER_HOST}/reboot.cgi
//
// Triggers a router reboot. Use sparingly — this disconnects all clients.
// In the admin UI: Maintenance > Reboot > Reboot button.
async function reboot() {
    console.warn('[Router] Sending reboot command...');
    const params = new URLSearchParams();
    params.append('action', 'reboot');
    return authedPost('/reboot.cgi', params.toString());
}

module.exports = {
    login,
    getConnectedClients,
    blockMac,
    unblockMac,
    getBandwidthUsage,
    getMacForDevice,
    reboot
};
