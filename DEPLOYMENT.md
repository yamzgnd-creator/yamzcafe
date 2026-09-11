# YAMZ CAFE - Hostinger Deployment Guide

## Project Overview
YAMZ CAFE is a school cafeteria POS system with:
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Node.js + Express API server
- **Database**: PostgreSQL (hosted separately)

In production, the Express server serves both the API and the built frontend static files.

---

## Prerequisites
- **Hostinger VPS** with Node.js 18+ installed
- **PostgreSQL** database (hosted separately — already configured)
- **SSH access** to your Hostinger VPS
- **Git** installed on the VPS (optional, for cloning)

---

## Step 1: Prepare the Build Locally

Before uploading to Hostinger, build the frontend:

```bash
# Install dependencies
pnpm install

# Build the frontend (outputs to /dist folder)
pnpm run build:prod
```

This creates a `dist/` folder with the optimized static frontend files.

---

## Step 2: Files to Upload to Hostinger

Upload the following files/folders to your VPS (e.g., to `/home/your-user/yamz-cafe/`):

```
yamz-cafe/
├── server.cjs              # Express server (entry point)
├── package.production.json  # Rename to package.json on server
├── .env                    # Environment variables (create from .env.example)
├── dist/                   # Built frontend files (from Step 1)
├── server/                 # Backend API code
│   ├── config/
│   │   ├── database.js
│   │   └── seed.js
│   ├── middleware/
│   │   └── auth.js
│   ├── routes/
│   │   ├── auth.js
│   │   ├── dietary.js
│   │   ├── inventory.js
│   │   ├── menu.js
│   │   ├── notifications.js
│   │   ├── payments.js
│   │   ├── preOrders.js
│   │   ├── reports.js
│   │   ├── scheduledMenus.js
│   │   ├── settings.js
│   │   ├── students.js
│   │   ├── transactions.js
│   │   ├── uploads.js
│   │   └── users.js
│   ├── services/
│   │   ├── balanceReportService.js
│   │   └── emailService.js
│   └── package.json
└── public/
    └── uploads/            # For user-uploaded files
```

**Do NOT upload:**
- `node_modules/`
- `src/` (source code — already compiled into `dist/`)
- `vite.config.ts`
- `tsconfig*.json`
- `eslint.config.js`
- `postcss.config.js`
- `tailwind.config.ts`
- `components.json`
- `pnpm-lock.yaml` (use `package.production.json` instead)
- `seo-scripts/`
- `template_config.json`

---

## Step 3: Set Up on Hostinger VPS

### 3.1 SSH into your VPS
```bash
ssh your-user@your-vps-ip
```

### 3.2 Install Node.js 18+ (if not already installed)
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 3.3 Install PM2 (process manager)
```bash
sudo npm install -g pm2
```

### 3.4 Upload your files
Use SCP, SFTP, or FileZilla to upload the files listed in Step 2:
```bash
# Example using SCP from your local machine
scp -r ./yamz-cafe your-user@your-vps-ip:/home/your-user/yamz-cafe
```

### 3.5 Set up the project on the VPS
```bash
cd /home/your-user/yamz-cafe

# Rename production package.json
cp package.production.json package.json

# Install production dependencies only
npm install --production

# Create and configure .env file
cp .env.example .env
nano .env  # Edit with your actual values
```

### 3.6 Configure .env
Edit the `.env` file with your actual values:
```env
# Server
PORT=3000
NODE_ENV=production
JWT_SECRET=your-very-long-random-secret-key-here

# PostgreSQL Database
DB_HOST=your-postgres-host
DB_PORT=5432
DB_NAME=yamz_cafe
DB_USER=yamzadmin
DB_PASSWORD=your-db-password

# CORS (set to your domain)
CORS_ORIGIN=https://yourdomain.com
```

### 3.7 Create uploads directory
```bash
mkdir -p public/uploads
```

### 3.8 Test the server
```bash
node server.cjs
```
You should see:
```
========================================
🚀 YAMZ Cafe Server Starting...
========================================
📡 Server running on: http://0.0.0.0:3000
✅ Database connected successfully
========================================
```

Press `Ctrl+C` to stop the test.

---

## Step 4: Run with PM2 (Production)

```bash
# Start the application with PM2
pm2 start server.cjs --name "yamz-cafe" --env production

# Save PM2 process list (survives reboot)
pm2 save

# Set PM2 to start on system boot
pm2 startup
# Follow the instructions it prints
```

### Useful PM2 Commands
```bash
pm2 status              # Check app status
pm2 logs yamz-cafe      # View logs
pm2 restart yamz-cafe   # Restart app
pm2 stop yamz-cafe      # Stop app
pm2 delete yamz-cafe    # Remove from PM2
```

---

## Step 5: Set Up Nginx Reverse Proxy

### 5.1 Install Nginx
```bash
sudo apt-get install -y nginx
```

### 5.2 Create Nginx config
```bash
sudo nano /etc/nginx/sites-available/yamz-cafe
```

Paste this configuration:
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Max upload size (for file uploads)
    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 5.3 Enable the site
```bash
sudo ln -s /etc/nginx/sites-available/yamz-cafe /etc/nginx/sites-enabled/
sudo nginx -t          # Test config
sudo systemctl restart nginx
```

---

## Step 6: Set Up SSL (HTTPS) with Let's Encrypt

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

Follow the prompts. Certbot will automatically configure Nginx for HTTPS.

---

## Step 7: Set Up Firewall

```bash
sudo ufw allow 22       # SSH
sudo ufw allow 80       # HTTP
sudo ufw allow 443      # HTTPS
sudo ufw enable
```

---

## Updating the Application

When you need to deploy updates:

```bash
# On your local machine: rebuild the frontend
pnpm run build:prod

# Upload the new dist/ folder and any changed server files to the VPS

# On the VPS:
cd /home/your-user/yamz-cafe
npm install --production  # If dependencies changed
pm2 restart yamz-cafe
```

---

## Troubleshooting

### App won't start
```bash
pm2 logs yamz-cafe --lines 50   # Check recent logs
node server.cjs                  # Run directly to see errors
```

### Database connection issues
- Verify your PostgreSQL server allows connections from your VPS IP
- Check `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` in `.env`
- Ensure PostgreSQL `pg_hba.conf` allows remote connections

### Port already in use
```bash
lsof -i :3000                   # Find what's using port 3000
kill -9 <PID>                   # Kill the process
pm2 restart yamz-cafe
```

### Permission issues with uploads
```bash
sudo chown -R your-user:your-user /home/your-user/yamz-cafe/public/uploads
chmod 755 /home/your-user/yamz-cafe/public/uploads
```