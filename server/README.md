# Hola Workspace Server

Node.js Express server that bridges the Hola Workspace web app with Firebase Admin SDK and the local Zyxel VMG3625-T50B router.

---

## 1. Prerequisites

| Requirement | Version |
|---|---|
| Node.js | ≥ 18 LTS |
| npm | ≥ 9 |
| Firebase project | hola-workspace-system |
| Zyxel VMG3625-T50B | Firmware V5.50+ |
| Network | Server must be on the same LAN as the router |

---

## 2. Installation

```bash
cd server
npm install
```

---

## 3. Firebase Setup (Service Account)

1. Go to the [Firebase Console](https://console.firebase.google.com/) → **Project Settings** → **Service Accounts**.
2. Click **Generate new private key** and download the JSON file.
3. Rename the file to `service-account.json` and place it in the `server/` directory.

> ⚠️ **Never commit `service-account.json` to version control.** It is already listed in `.gitignore`.

---

## 4. Environment Configuration

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
FIREBASE_SERVICE_ACCOUNT_PATH=./service-account.json
FIREBASE_APP_ID=hola-v20

ROUTER_HOST=192.168.1.1
ROUTER_USERNAME=admin
ROUTER_PASSWORD=your_router_password

PORT=3000
ADMIN_SECRET=change-this-to-a-strong-secret

CORS_ORIGIN=https://your-app.netlify.app
```

---

## 5. Router Setup (Zyxel Access)

The server communicates with the Zyxel admin UI over HTTP on port 80. Ensure:

1. The server machine is on the same LAN (wired preferred).
2. The router admin interface is reachable at `http://192.168.1.1` from the server.
3. Remote management is **disabled** on the router WAN interface (security best practice).
4. The router admin password is set in `.env`.

> **Firmware note:** Router API endpoints in `router-api.js` were identified from Zyxel firmware V5.50(ABPM.6)b4. If your firmware differs, use browser DevTools (Network tab) while navigating the router admin UI to find the correct CGI endpoint paths.

---

## 6. Running the Server

### Development (auto-restart on changes)

```bash
npm run dev
```

### Production

```bash
npm start
```

The server starts on `http://localhost:3000` (or the port in `.env`).

Verify it is running:

```bash
curl http://localhost:3000/status
```

Expected response:

```json
{ "ok": true, "service": "Hola Workspace Server", "version": "1.0.0", "time": "..." }
```

---

## 7. API Endpoints

### Public Endpoints

#### `GET /status`
Health check. Returns server version and timestamp.

```json
{ "ok": true, "service": "Hola Workspace Server", "version": "1.0.0", "time": "2026-01-01T00:00:00.000Z" }
```

---

#### `POST /login`
Validates an internet card and binds it to the calling device.

**Request body:**
```json
{
  "code":       "HOLA-ABCD-EFGH",
  "deviceId":   "unique-device-fingerprint",
  "deviceInfo": "Chrome 120 / Windows 11"
}
```

**Success response (`200`):**
```json
{
  "ok":        true,
  "cardId":    "firestore-doc-id",
  "code":      "HOLA-ABCD-EFGH",
  "quotaMB":   5120,
  "usedMB":    128,
  "remainMB":  4992,
  "expiresAt": 1767225600000
}
```

**Error responses:**
| Status | Reason |
|---|---|
| `400` | Missing `code` or `deviceId` |
| `403` | Card inactive / expired / quota exhausted / bound to another device |
| `404` | Card code not found |

---

#### `GET /usage/:cardCode`
Returns current usage statistics for a card.

```bash
curl http://localhost:3000/usage/HOLA-ABCD-EFGH
```

**Response:**
```json
{
  "ok":        true,
  "code":      "HOLA-ABCD-EFGH",
  "status":    "active",
  "usedMB":    128,
  "quotaMB":   5120,
  "remainMB":  4992,
  "expiresAt": 1767225600000,
  "lastUsed":  1700000000000
}
```

---

### Admin Endpoints

All admin endpoints require the `x-admin-secret` header:

```
x-admin-secret: your-secret-from-env
```

---

#### `POST /activate-card`
Changes the status of a card.

**Request body:**
```json
{ "cardId": "firestore-doc-id", "status": "active" }
```
Valid statuses: `active`, `inactive`, `suspended`.

**Response:**
```json
{ "ok": true, "cardId": "...", "status": "active" }
```

---

#### `POST /disconnect-user`
Suspends a card immediately, cutting off the user's internet access.

**Request body:**
```json
{ "cardId": "firestore-doc-id" }
```

**Response:**
```json
{ "ok": true, "cardId": "...", "suspended": true }
```

---

## 8. Deployment Options

### Option A — PM2 (recommended for Linux VPS / Raspberry Pi)

```bash
npm install -g pm2

# Start the server
pm2 start server.js --name hola-server

# Auto-start on reboot
pm2 startup
pm2 save
```

Useful commands:
```bash
pm2 status          # check running processes
pm2 logs hola-server # tail logs
pm2 restart hola-server
pm2 stop hola-server
```

---

### Option B — systemd Service (Linux)

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

## 9. Security Recommendations

1. **Change `ADMIN_SECRET`** — use a long random string (≥ 32 characters).
2. **Restrict `CORS_ORIGIN`** — set it to your exact Netlify app URL, not `*`.
3. **Keep `service-account.json` private** — never commit it; add it to `.gitignore`.
4. **Run behind a reverse proxy** (nginx/Caddy) if exposing to the internet; terminate TLS there.
5. **Firewall the router admin port** — only the server's LAN IP should reach port 80 on the router.
6. **Keep Node.js updated** — run `npm audit` regularly and update dependencies.
7. **Use environment variables** for all secrets — never hardcode credentials in source files.
