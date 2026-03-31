# HOLA Workspace System 🚀

A smart and modern workspace management system designed to handle client sessions, WiFi voucher (internet card) access, and real-time operations using Firebase — with deep integration into the **Zyxel VMG3625-T50B** router for real-world access control.

---

## 🔒 Private Project Notice

This project is private and proprietary.
Unauthorized use, copying, or distribution of any part of this code is strictly prohibited.

---

## ✨ Features

* 🔐 Secure client login system
* 🎫 WiFi voucher / internet card system
* ⏱️ Real-time session tracking
* 📊 Admin dashboard with full control
* 🧾 Invoice generation and printing (PDF optimized)
* 🔄 Firebase Firestore integration
* 📍 Location-based validation (anti-fake GPS logic)
* 💬 Live chat between client and admin
* 🎯 Loyalty system (stamps & rewards)
* 🌐 Zyxel VMG3625-T50B router integration (MAC-level access control)

---

## 🛠️ Tech Stack

* HTML5
* CSS3 (Tailwind + Custom Styles)
* Vanilla JavaScript (Modular Structure)
* Firebase (Firestore)
* Netlify (Frontend Deployment)
* Node.js / Express (Local Server)
* Zyxel VMG3625-T50B (Router / Access Control)

---

## ⚙️ System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client Device                            │
│              (phone / laptop connected to WiFi)                 │
└──────────────────────────┬──────────────────────────────────────┘
                           │  HTTP (card code + deviceId)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Local Express Server                        │
│            (runs on a PC/Raspberry Pi on the LAN)               │
│                                                                 │
│  • Validates card against Firebase Firestore                    │
│  • Enforces single-device binding                               │
│  • Calls Zyxel router API to block / unblock MAC addresses      │
│  • Runs a scheduled job every hour to expire old cards          │
└────────────┬────────────────────────────┬───────────────────────┘
             │  Firebase Admin SDK        │  HTTP CGI (LAN only)
             ▼                            ▼
┌────────────────────────┐   ┌───────────────────────────────────┐
│   Firebase Firestore   │   │    Zyxel VMG3625-T50B Router      │
│   (internet_cards)     │   │    http://192.168.1.1             │
│                        │   │                                   │
│  card code             │   │  • MAC filter deny-list           │
│  status                │   │  • DHCP leases                    │
│  quotaMB / usedMB      │   │  • ARP table                      │
│  expiresAt             │   │  • Traffic stats                  │
│  boundDevice (MAC)     │   └───────────────────────────────────┘
└────────────────────────┘
```

---

## 🌐 Connecting the Zyxel VMG3625-T50B Router

### Overview

The system uses the router's built-in web management interface (CGI endpoints) to control which devices have internet access. When a user activates a valid internet card, their device's MAC address is removed from the router's deny-list. When a card expires or is suspended, the MAC address is added back to the deny-list — cutting off internet access instantly.

---

### Step 1 — Physical & Network Setup

1. Connect the **Zyxel VMG3625-T50B** to your ISP's modem/ONT via the WAN port.
2. Connect the **server machine** (PC or Raspberry Pi) to the router using an **Ethernet cable** (wired connection is strongly recommended for reliability).
3. Ensure all client devices (phones, laptops) connect to the router's **WiFi SSID** that the voucher system controls.

> **Tip:** Create a dedicated SSID (e.g., `HOLA-Internet`) for voucher clients. Keep the admin/staff SSID separate.

---

### Step 2 — Router Admin Interface

1. Open a browser on the server machine and navigate to **http://192.168.1.1**.
2. Log in with your admin credentials (default: `admin` / `admin` — **change this immediately**).
3. Verify the router admin panel loads correctly.

> ⚠️ **Security:** Disable remote management on the WAN interface. The server only needs LAN access to port 80.

---

### Step 3 — Configure MAC Authentication (Deny Mode)

The system controls internet access by adding/removing MAC addresses from a WiFi deny-list.

1. In the router admin UI, navigate to **Wireless → MAC Authentication**.
2. Set the mode to **Deny** (block listed MACs; allow everything else by default).
3. Leave the list empty initially — the server will populate it dynamically as cards are suspended or expired.

> **How it works:** When a card is valid, the device's MAC is *not* on the deny-list → internet works. When a card is suspended/expired, the server POSTs the MAC to the deny-list → internet is blocked immediately.

---

### Step 4 — Configure DHCP (Assign IPs to Clients)

1. Navigate to **Network → LAN → DHCP Server**.
2. Ensure DHCP is **enabled** for the LAN/WiFi interface used by clients.
3. Set the DHCP range to cover all expected client devices (e.g., `192.168.1.100` – `192.168.1.200`).
4. Set the **lease time** to a short value (e.g., 1 hour) so IP addresses recycle quickly when clients disconnect.

> The server uses the router's ARP table (`/getArpTable.cgi`) to resolve a device's IP address to its MAC address when needed.

---

### Step 5 — Verify Router API Access from the Server

SSH into your server machine (or open a terminal) and test that the router is reachable:

```bash
# Basic connectivity
ping 192.168.1.1

# Test login endpoint (replace 'admin' with your actual password)
curl -s -X POST http://192.168.1.1/login.cgi \
     -d "username=admin&password=admin" \
     -c /tmp/zyxel-cookies.txt \
     -v 2>&1 | grep -E "< HTTP|Set-Cookie"
```

You should receive an HTTP 200 response and a `Set-Cookie` header containing a session ID. If you see a redirect to `/login.asp`, the credentials are incorrect.

---

### Step 6 — Configure the Server Environment

```bash
cd server
cp .env.example .env
nano .env   # or use any text editor
```

Set these values in `.env`:

```env
# Firebase
FIREBASE_SERVICE_ACCOUNT_PATH=./service-account.json
FIREBASE_APP_ID=hola-v20

# Router
ROUTER_HOST=192.168.1.1
ROUTER_USERNAME=admin
ROUTER_PASSWORD=your_router_password_here

# Server
PORT=3000
ADMIN_SECRET=replace-with-a-long-random-secret

# Your web app URL (no trailing slash)
CORS_ORIGIN=https://your-app.netlify.app
```

> Set `ROUTER_ALLOW_SELF_SIGNED=true` only if your router uses HTTPS with a self-signed certificate on the LAN.

---

### Step 7 — Start the Server

```bash
cd server
npm install
npm start
```

Verify the server is running:

```bash
curl http://localhost:3000/status
```

Expected response:

```json
{ "ok": true, "service": "Hola Workspace Server", "version": "1.0.0", "time": "..." }
```

---

## 🔗 How MAC Address Binding Works with Cards

```
User enters card code  ──►  POST /login
                                │
                    ┌───────────▼────────────────┐
                    │  Server looks up card code  │
                    │  in Firebase Firestore      │
                    └───────────┬────────────────┘
                                │ Card found & valid
                    ┌───────────▼────────────────┐
                    │  Is card already bound      │
                    │  to a device?               │
                    └──┬────────────────────┬─────┘
                       │ No                 │ Yes
              ┌────────▼───────┐   ┌────────▼────────────────────┐
              │ Bind card to   │   │ Is deviceId the same as the  │
              │ this device    │   │ bound device?                │
              │ (store MAC/ID) │   └──┬──────────────────────┬────┘
              └────────┬───────┘      │ Yes                  │ No
                       │              │                       │
                       │      ┌───────▼──────┐    ┌──────────▼────────┐
                       │      │ Allow login  │    │ Reject: "Card is  │
                       │      │ (same device)│    │ bound to another  │
                       │      └──────────────┘    │ device."          │
                       │                          └───────────────────┘
              ┌────────▼───────────────────────┐
              │  Unblock MAC on router         │
              │  POST /wlMacFilter.cgi         │
              │  action=delete, type=deny      │
              └────────────────────────────────┘
```

**Key rules:**
- Each internet card can only be bound to **one device** (enforced by `boundDevice` field in Firestore).
- Binding happens on first use — the device ID (browser fingerprint) and optionally the MAC address are stored.
- Subsequent logins from the same device succeed; from any other device, they are rejected.
- When a card is suspended or expires, the bound device's MAC is added to the router deny-list.

---

## 👥 How Users Are Controlled

### DHCP (IP Assignment)

| Role | Mechanism |
|---|---|
| Client connects to WiFi | Router assigns IP via DHCP |
| Server needs MAC for a device | Queries `/getArpTable.cgi` using the device's IP |
| Card expires | Server adds MAC to deny-list; DHCP keeps assigning IPs but traffic is dropped |

### MAC Filtering (Access Control)

| Action | Router CGI Call | Effect |
|---|---|---|
| Card activated / user logs in | `POST /wlMacFilter.cgi` `action=delete, type=deny` | MAC removed from deny-list → internet restored |
| Card suspended by admin | `POST /wlMacFilter.cgi` `action=add, type=deny` | MAC added to deny-list → internet blocked |
| Card expires (cron job) | Card marked `expired` in Firestore; MAC blocked | Internet blocked automatically |

### Scheduled Access Control

A cron job runs **every hour** inside the server and automatically:

1. Queries Firestore for all `active` cards where `expiresAt < now`.
2. Marks them as `expired`.
3. (When router integration is active) Blocks the MAC address of the bound device.

### Admin Manual Control

Admins can immediately disconnect a user via:

```bash
curl -X POST http://localhost:3000/disconnect-user \
     -H "Content-Type: application/json" \
     -H "x-admin-secret: your-admin-secret" \
     -d '{ "cardId": "firestore-doc-id" }'
```

---

## 🔄 How the System Communicates with the Router

The server mimics browser form submissions to the router's CGI admin interface. No special router firmware or open API is required.

| Operation | HTTP Method | Endpoint | Key Parameters |
|---|---|---|---|
| Login / authenticate | `POST` | `/login.cgi` | `username`, `password` |
| Get connected devices | `GET` | `/getConnectedDevices.cgi` | — |
| Block a MAC | `POST` | `/wlMacFilter.cgi` | `action=add`, `mac=XX:XX:XX:XX:XX:XX`, `type=deny` |
| Unblock a MAC | `POST` | `/wlMacFilter.cgi` | `action=delete`, `mac=XX:XX:XX:XX:XX:XX`, `type=deny` |
| Get traffic stats | `GET` | `/getTrafficStats.cgi` | `mac=XX:XX:XX:XX:XX:XX` |
| Get ARP table (IP→MAC) | `GET` | `/getArpTable.cgi` | — |
| Reboot router | `POST` | `/reboot.cgi` | `action=reboot` |

**Session management:**
1. Server logs in via `POST /login.cgi` and stores the session cookie in memory.
2. All subsequent requests include the session cookie in the `Cookie` header.
3. If a request returns `401` or `302`, the server automatically re-authenticates and retries once.

> **Firmware note:** These endpoints were verified against Zyxel firmware `V5.50(ABPM.6)b4`. If your firmware version differs, open the router admin UI in a browser, open **DevTools → Network tab**, and observe the form submissions to find the correct endpoint paths.

---

## 🚀 Running the Server in Production

### Option A — PM2 (Recommended)

```bash
npm install -g pm2

# Start the server
pm2 start server.js --name hola-server

# Auto-start on system reboot
pm2 startup
pm2 save
```

Useful PM2 commands:

```bash
pm2 status             # Show running processes
pm2 logs hola-server   # Tail live logs
pm2 restart hola-server
pm2 stop hola-server
```

### Option B — systemd (Linux)

Create `/etc/systemd/system/hola-server.service`:

```ini
[Unit]
Description=Hola Workspace Server
After=network.target

[Service]
Type=simple
User=your-linux-user
WorkingDirectory=/path/to/hola-workspace-system/server
ExecStart=/usr/bin/node server.js
Restart=on-failure
EnvironmentFile=/path/to/hola-workspace-system/server/.env

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable hola-server
sudo systemctl start hola-server
sudo systemctl status hola-server
```

---

## 🔧 Troubleshooting Common Problems

### ❌ "Cannot connect to router admin panel"

**Symptoms:** `curl http://192.168.1.1` times out or is refused.

**Solutions:**
1. Confirm the server machine is connected to the router via Ethernet.
2. Check the router IP — it may be `192.168.0.1` on some configurations. Look at your network adapter's default gateway:
   ```bash
   ip route show default   # Linux
   ipconfig                # Windows
   ```
3. Ensure no firewall on the server is blocking outbound traffic to `192.168.1.1:80`.
4. Verify the router admin interface is enabled: **Administration → Remote Management → LAN** should be enabled.

---

### ❌ "Login failed — no session cookie returned"

**Symptoms:** Server log shows `[Router] Login failed: No session cookie returned`.

**Solutions:**
1. Double-check `ROUTER_USERNAME` and `ROUTER_PASSWORD` in `.env`.
2. Confirm the router has not locked out the admin account after too many failed attempts (check the router UI directly from a browser).
3. Inspect the exact login form fields using DevTools: navigate to `http://192.168.1.1`, open **DevTools → Network**, submit the login form, and check the form data sent to `/login.cgi`.

---

### ❌ "MAC address not being blocked/unblocked"

**Symptoms:** Server logs show success but the user still has/loses internet unexpectedly.

**Solutions:**
1. Verify the correct SSID interface is being filtered. In the router UI go to **Wireless → MAC Authentication** and confirm the deny-list is populated correctly after blocking.
2. Some firmware versions use a different endpoint path. Use DevTools to inspect the network request when manually adding a MAC in the router UI.
3. Ensure MAC addresses are in the correct format (`AA:BB:CC:DD:EE:FF` uppercase with colons). The server normalises MACs automatically.
4. Check that the device MAC matches what was bound to the card in Firestore (`boundDevice` field).

---

### ❌ "getConnectedDevices.cgi returns unexpected data"

**Symptoms:** Server log shows `[Router] getConnectedClients: unexpected response format`.

**Solutions:**
1. The endpoint path may differ on your firmware version. Use **DevTools → Network** while viewing the **LAN → DHCP** or **Connected Devices** page in the router UI to find the correct path.
2. Update the `getConnectedClients` function in `router-api.js` with the correct CGI path for your firmware.

---

### ❌ "Firebase Admin SDK initialization failed"

**Symptoms:** Server exits immediately with `[Firebase] Failed to initialize Admin SDK`.

**Solutions:**
1. Confirm `service-account.json` exists inside the `server/` directory.
2. Verify `FIREBASE_SERVICE_ACCOUNT_PATH` in `.env` points to the correct file.
3. Ensure the service account has **Firestore Read/Write** permissions in the Firebase Console.
4. Regenerate the service account key if it has been revoked: **Firebase Console → Project Settings → Service Accounts → Generate new private key**.

---

### ❌ "CORS error in the browser"

**Symptoms:** Browser console shows `Access-Control-Allow-Origin` error.

**Solutions:**
1. Ensure `CORS_ORIGIN` in `.env` is set to your exact web app URL (e.g., `https://your-app.netlify.app`) with **no trailing slash**.
2. If running locally for testing, temporarily set `CORS_ORIGIN=http://localhost:5500` or the port your development server uses.

---

### ❌ "Card shows as active but internet doesn't work"

**Symptoms:** Card is `active` in Firestore, login succeeds, but the device has no internet.

**Solutions:**
1. Check that the MAC unblock call is actually being triggered. The router integration stub in the `POST /login` endpoint handler in `server.js` must be uncommented and wired up.
2. Manually test the unblock call:
   ```bash
   # First get a session cookie
   curl -s -X POST http://192.168.1.1/login.cgi \
        -d "username=admin&password=admin" \
        -c /tmp/zyxel-sess.txt

   # Then unblock a MAC
   curl -s -X POST http://192.168.1.1/wlMacFilter.cgi \
        -b /tmp/zyxel-sess.txt \
        -d "action=delete&mac=AA:BB:CC:DD:EE:FF&type=deny"
   ```
3. Confirm the device MAC in the deny-list matches the actual device MAC (use `ip link show` on Linux or check device Wi-Fi settings).

---

## ⚠️ Security Notes

* **Change the default router password** immediately (`admin`/`admin` is insecure).
* **Keep `service-account.json` private** — it is already in `.gitignore`; never commit it.
* **Set a strong `ADMIN_SECRET`** — use a random string of at least 32 characters.
* **Restrict `CORS_ORIGIN`** — set it to your exact Netlify URL, not the wildcard `*`.
* **Firewall the router admin port** — only the server's LAN IP should be able to reach port 80 on the router.
* **Disable WAN-side remote management** on the router — admin access should only be possible from the LAN.
* Run `npm audit` regularly and keep dependencies updated.

---

## 👨‍💻 Author

**Kareem Khaled**
Frontend Developer & UI Designer

---

## 📌 Status

> 🚧 In active development and continuous improvement
