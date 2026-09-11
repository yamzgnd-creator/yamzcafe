# Deploying YAMZ Cafe to Hostinger

## IMPORTANT: Which Hostinger plan do you need?

This app is **not** a static website. It is a Node.js/Express server that talks to
PostgreSQL. That means:

| Hostinger Plan | Works? | Why |
|---|---|---|
| Shared Hosting (Premium / Business) | **No** | No Node.js runtime, no long-running processes, no PM2 |
| Cloud Hosting | **No** | Same limitation as shared (PHP/Apache only) |
| **VPS** (KVM 1 or higher) | **Yes** | Full root access, Node.js, PM2, Nginx |

If you are currently on shared hosting you must upgrade to a **VPS** plan.
Everything below assumes a Hostinger VPS running Ubuntu 22.04 or 24.04.

---

## Step 1 — Download the project

In the Atoms platform, use the download/export button to get the project as a ZIP.
You only need the `frontend_v54/` folder.

Do **not** include these in the upload (they are rebuilt on the server):

```
node_modules/
dist/
logs/
.env          <- create a fresh one on the server, never reuse a local one
```

---

## Step 2 — Prepare the VPS

SSH into your VPS (Hostinger gives you the IP and root password in hPanel):

```bash
ssh root@YOUR_VPS_IP
```

Install Node.js 20, pnpm, PM2 and Nginx:

```bash
apt update && apt upgrade -y

# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs nginx unzip

# pnpm + pm2 globally
npm install -g pnpm pm2

# verify
node -v && pnpm -v && pm2 -v
```

---

## Step 3 — Upload the code

**Option A — SCP from your computer (simplest):**

```bash
# run this on YOUR computer, not the VPS
scp yamz-cafe.zip root@YOUR_VPS_IP:/var/www/
```

Then on the VPS:

```bash
mkdir -p /var/www
cd /var/www
unzip yamz-cafe.zip -d yamz-cafe
cd yamz-cafe/frontend_v54   # adjust if your zip nests differently
```

**Option B — Git (better for future updates):**

```bash
cd /var/www
git clone YOUR_REPO_URL yamz-cafe
cd yamz-cafe/frontend_v54
```

---

## Step 4 — Create the `.env` file

```bash
nano /var/www/yamz-cafe/frontend_v54/.env
```

Paste and fill in your real values:

```env
NODE_ENV=production
PORT=3000

# PostgreSQL
DB_HOST=187.124.229.196
DB_PORT=5432
DB_NAME=your_database_name
DB_USER=your_db_user
DB_PASSWORD=your_db_password

# Auth — MUST be a long random string, generate a new one for production
JWT_SECRET=paste_a_long_random_string_here

# Email (only if password reset / notifications are used)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=

# Stripe (only if online payments are enabled)
STRIPE_SECRET_KEY=
```

Generate a strong JWT secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Lock the file down so other users cannot read your credentials:

```bash
chmod 600 .env
```

### Database note

Your PostgreSQL server is external (`187.124.229.196`). You must whitelist the
**Hostinger VPS IP address** in that database server's firewall / `pg_hba.conf`,
otherwise the app will start but every API call will fail with a connection error.

Test the connection from the VPS before continuing:

```bash
apt install -y postgresql-client
psql -h 187.124.229.196 -U your_db_user -d your_database_name -c "SELECT 1;"
```

---

## Step 5 — Install, build, and start

```bash
cd /var/www/yamz-cafe/frontend_v54

pnpm install
pnpm run build          # produces dist/ — the Express server serves this
mkdir -p logs uploads

pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup             # run the command it prints, so the app survives reboots
```

Check that it is alive:

```bash
pm2 status
pm2 logs yamz-cafe --lines 50
curl http://localhost:3000/api/config
```

---

## Step 6 — Point your domain at the VPS

In Hostinger hPanel → **Domains → DNS Zone**, create an `A` record:

| Type | Name | Points to |
|---|---|---|
| A | @ | YOUR_VPS_IP |
| A | www | YOUR_VPS_IP |

DNS can take 15 minutes to a few hours to propagate.

---

## Step 7 — Nginx reverse proxy

```bash
nano /etc/nginx/sites-available/yamz-cafe
```

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # allow menu image / receipt uploads
    client_max_body_size 20M;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable it and reload:

```bash
ln -s /etc/nginx/sites-available/yamz-cafe /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t          # must say "syntax is ok"
systemctl reload nginx
```

---

## Step 8 — Free HTTPS certificate

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

Choose the "redirect HTTP to HTTPS" option. Auto-renewal is installed
automatically; verify with `certbot renew --dry-run`.

---

## Step 9 — Firewall

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable
```

Note that port 3000 is intentionally **not** opened — only Nginx talks to it.

---

## Updating the app later

```bash
cd /var/www/yamz-cafe/frontend_v54

git pull                 # or re-upload and unzip the new files
pnpm install
pnpm run build
pm2 restart yamz-cafe
```

---

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| 502 Bad Gateway | Node process is down. `pm2 status`, then `pm2 logs yamz-cafe` |
| Site loads but all data fails | DB not reachable. Whitelist the VPS IP on the PostgreSQL server; re-test with `psql` |
| Login always fails | `JWT_SECRET` missing or changed. Set it in `.env` and `pm2 restart yamz-cafe` |
| Refreshing a sub-page gives 404 | Nginx must proxy everything to Node (do not add a `try_files` root) |
| Image uploads fail | `public/uploads/` folder missing or unwritable; raise `client_max_body_size` |
| Uploaded image not displaying | See "Uploaded images not showing" below |
| App dies after reboot | You skipped `pm2 save` + `pm2 startup` |

---

## Uploaded images not showing

The upload seems to succeed, but the menu image renders blank or broken.

### Step 1 — ask the server where it is looking

Log in as an admin, then open this URL in the same browser tab:

```
https://YOUR_DOMAIN/api/uploads/debug/paths
```

It reports the exact folder the server reads and writes, how many files are in
each category, and whether that folder is writable. Check that:

- `uploadsRootWritable` is `true`
- `categories.menu.fileCount` is greater than `0` after an upload

### Step 2 — confirm the folder exists and is writable

```bash
cd /var/www/yamz-cafe/frontend_v54
ls -la public/uploads/menu

# create it and give the Node process ownership if missing
mkdir -p public/uploads/menu public/uploads/students public/uploads/logos public/uploads/backgrounds
chown -R $(whoami) public/uploads
chmod -R 755 public/uploads
pm2 restart yamz-cafe
```

### Step 3 — request the image directly

Copy an image path from the debug output, for example
`/uploads/menu/1712345678-123456789.jpg`, and open it directly in the browser:

```
https://YOUR_DOMAIN/uploads/menu/1712345678-123456789.jpg
```

| What you see | Meaning | Fix |
|---|---|---|
| The image | Serving works. Hard refresh the app to clear the cached broken image |
| `Uploaded file not found` JSON | The file was never written to disk. Recheck Step 2 permissions, then re-upload |
| Nginx `413` error | File too large. Set `client_max_body_size 20M;` then run `nginx -s reload` |
| The app HTML instead of the image | Old build still running. Redeploy, then `pm2 restart yamz-cafe` |

### Step 4 — check the startup log

On boot the server prints the folder it uses:

```bash
pm2 logs yamz-cafe --lines 50 | grep uploads
```

Confirm that path matches where the files actually are on disk.

---

## Quick reference

```bash
pm2 status                     # is it running?
pm2 logs yamz-cafe             # live logs
pm2 restart yamz-cafe          # restart after changes
pm2 monit                      # CPU / memory
systemctl status nginx         # web server health
nginx -t                       # validate nginx config
```