# YAMZ Cafe POS — Hostinger VPS Deployment Guide

Complete step-by-step guide to deploy YAMZ Cafe POS on a Hostinger VPS.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Hostinger VPS Setup](#2-hostinger-vps-setup)
3. [Upload Files to VPS](#3-upload-files-to-vps)
4. [Automated Deployment](#4-automated-deployment)
5. [Manual Deployment](#5-manual-deployment)
6. [SSL Certificate (HTTPS)](#6-ssl-certificate-https)
7. [Database Configuration](#7-database-configuration)
8. [Domain & DNS Setup](#8-domain--dns-setup)
9. [Monitoring & Maintenance](#9-monitoring--maintenance)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Prerequisites

| Requirement | Details |
|---|---|
| **Hostinger VPS Plan** | KVM 1 or higher (minimum 1GB RAM, 1 vCPU) |
| **Operating System** | Ubuntu 22.04 LTS (recommended) |
| **Domain Name** | Pointed to your VPS IP address |
| **SSH Access** | Terminal/PuTTY with root or sudo access |

### What's Included in This Package

```
yamz-cafe/
├── server.cjs                # Express.js backend server
├── server/                   # Backend routes, middleware, config
│   ├── config/               # Database connection
│   ├── middleware/            # Auth middleware
│   ├── routes/               # API routes
│   └── services/             # Email, CSV import, etc.
├── dist/                     # Pre-built React frontend (ready to serve)
│   ├── index.html
│   └── assets/
├── package.json              # Node.js dependencies
├── ecosystem.config.cjs      # PM2 process manager config
├── nginx.conf                # Nginx reverse proxy config
├── .env.production           # Production env template
├── deploy.sh                 # Automated deployment script
└── HOSTINGER_VPS_DEPLOY.md   # This guide
```

---

## 2. Hostinger VPS Setup

### 2.1 Purchase & Access VPS

1. Go to [Hostinger VPS](https://www.hostinger.com/vps-hosting)
2. Choose **KVM 1** plan or higher
3. Select **Ubuntu 22.04** as the OS
4. After purchase, go to **hPanel → VPS → Manage**
5. Note your **VPS IP Address** and **root password**

### 2.2 Connect via SSH

```bash
# From your local machine (Mac/Linux)
ssh root@YOUR_VPS_IP

# From Windows, use PuTTY or Windows Terminal
ssh root@YOUR_VPS_IP
```

### 2.3 Create a Non-Root User (Recommended)

```bash
# On the VPS
adduser yamzadmin
usermod -aG sudo yamzadmin

# Switch to the new user
su - yamzadmin
```

---

## 3. Upload Files to VPS

### Option A: Download from Atoms (Recommended)

1. In your Atoms chat, click **Share** (top-right corner)
2. Click **Export** to download all code files as a ZIP
3. Upload the ZIP to your VPS:

```bash
# From your local machine
scp yamz-cafe-export.zip root@YOUR_VPS_IP:/tmp/

# On the VPS
ssh root@YOUR_VPS_IP
mkdir -p /var/www/yamz-cafe
cd /tmp
unzip yamz-cafe-export.zip -d /var/www/yamz-cafe/
cp /var/www/yamz-cafe/.env.production /var/www/yamz-cafe/.env
```

### Option B: Using SCP (from your local machine)

```bash
# Upload the entire project folder
scp -r ./yamz-cafe root@YOUR_VPS_IP:/tmp/yamz-cafe-upload

# Then on the VPS:
ssh root@YOUR_VPS_IP
mkdir -p /var/www/yamz-cafe
cp -r /tmp/yamz-cafe-upload/* /var/www/yamz-cafe/
cp /var/www/yamz-cafe/.env.production /var/www/yamz-cafe/.env
```

### Option C: Using FileZilla (SFTP)

1. Open FileZilla
2. Connect: Host=`YOUR_VPS_IP`, Username=`root`, Port=`22`
3. Navigate to `/var/www/yamz-cafe/` on the remote side
4. Upload all files from your exported project folder

---

## 4. Automated Deployment

The easiest way — run the included deployment script:

```bash
# On the VPS, navigate to the uploaded files
cd /var/www/yamz-cafe

# Make the script executable
chmod +x deploy.sh

# Edit the DOMAIN variable in the script first
nano deploy.sh
# Change: DOMAIN="yourdomain.com" → DOMAIN="your-actual-domain.com"

# Run the deployment
sudo bash deploy.sh
```

The script will:
- ✅ Update system packages
- ✅ Install Node.js 20 LTS
- ✅ Install PM2 (process manager)
- ✅ Install & configure Nginx
- ✅ Install Node.js dependencies
- ✅ Configure firewall
- ✅ Start the application

After the script completes, edit your `.env` file:

```bash
nano /var/www/yamz-cafe/.env
```

**Required changes:**
- `JWT_SECRET` → Change to a strong random string (run: `openssl rand -hex 32`)
- `CORS_ORIGIN` → Set to `https://yourdomain.com`
- `APP_URL` → Set to `https://yourdomain.com`
- Verify `DB_HOST`, `DB_PASSWORD` are correct

Then restart:
```bash
pm2 restart yamz-cafe
```

---

## 5. Manual Deployment

If you prefer to do it step by step:

### 5.1 Install Node.js 20 LTS

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v  # Should show v20.x.x
npm -v   # Should show v10.x.x
```

### 5.2 Install PM2

```bash
sudo npm install -g pm2
```

### 5.3 Install Nginx

```bash
sudo apt install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

### 5.4 Setup Application

```bash
# Create app directory
sudo mkdir -p /var/www/yamz-cafe/logs
sudo mkdir -p /var/www/yamz-cafe/public/uploads

# Set ownership
sudo chown -R $USER:$USER /var/www/yamz-cafe

# Install dependencies
cd /var/www/yamz-cafe
npm install --production --legacy-peer-deps
```

### 5.5 Configure Environment

```bash
# Copy production template
cp .env.production .env

# Edit with your actual values
nano .env
```

### 5.6 Configure Nginx

```bash
# Copy nginx config
sudo cp /var/www/yamz-cafe/nginx.conf /etc/nginx/sites-available/yamz-cafe

# Replace domain placeholder
sudo sed -i 's/yourdomain.com/your-actual-domain.com/g' /etc/nginx/sites-available/yamz-cafe

# Enable the site
sudo ln -sf /etc/nginx/sites-available/yamz-cafe /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test and reload
sudo nginx -t
sudo systemctl reload nginx
```

### 5.7 Start with PM2

```bash
cd /var/www/yamz-cafe
pm2 start ecosystem.config.cjs --env production
pm2 save
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u $USER --hp $HOME
pm2 save
```

### 5.8 Configure Firewall

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
```

---

## 6. SSL Certificate (HTTPS)

### Using Let's Encrypt (Free)

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Get certificate (replace with your domain)
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Certbot will:
# - Obtain the certificate
# - Automatically update your Nginx config
# - Set up auto-renewal

# Verify auto-renewal
sudo certbot renew --dry-run
```

After SSL is set up, update your `.env`:
```bash
nano /var/www/yamz-cafe/.env
# Change:
# CORS_ORIGIN=https://yourdomain.com
# APP_URL=https://yourdomain.com
```

Restart the app:
```bash
pm2 restart yamz-cafe
```

---

## 7. Database Configuration

The app connects to a **remote PostgreSQL database**. The connection details are in `.env`:

```
DB_HOST=187.124.229.196
DB_PORT=5432
DB_NAME=yamz_cafe
DB_USER=yamzadmin
DB_PASSWORD=0+k2!#9C6
```

### Verify Database Connection

```bash
# From your VPS, test the connection
curl http://localhost:3000/api/health
```

Expected response:
```json
{
  "status": "healthy",
  "database": "connected (PostgreSQL)"
}
```

### If Database is Unreachable

1. Check if the PostgreSQL server allows connections from your VPS IP
2. Check firewall rules on the database server
3. Verify credentials in `.env`

### Optional: Install PostgreSQL Locally

If you want to run the database on the same VPS:

```bash
sudo apt install -y postgresql postgresql-contrib
sudo -u postgres createuser --interactive  # Create yamzadmin
sudo -u postgres createdb yamz_cafe
sudo -u postgres psql -c "ALTER USER yamzadmin WITH PASSWORD 'your-secure-password';"

# Update .env
# DB_HOST=localhost
```

---

## 8. Domain & DNS Setup

### 8.1 Point Domain to VPS

In your domain registrar (Hostinger, Namecheap, GoDaddy, etc.):

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | @ | YOUR_VPS_IP | 3600 |
| A | www | YOUR_VPS_IP | 3600 |

### 8.2 Verify DNS Propagation

```bash
# Check if DNS is pointing to your VPS
dig yourdomain.com +short
# Should return your VPS IP

# Or use online tool: https://dnschecker.org
```

---

## 9. Monitoring & Maintenance

### PM2 Commands

```bash
pm2 status                    # View app status
pm2 logs yamz-cafe            # View real-time logs
pm2 logs yamz-cafe --lines 100  # View last 100 lines
pm2 monit                     # Monitor CPU/Memory
pm2 restart yamz-cafe         # Restart app
pm2 stop yamz-cafe            # Stop app
pm2 delete yamz-cafe          # Delete app from PM2
```

### Nginx Commands

```bash
sudo nginx -t                        # Test configuration
sudo systemctl reload nginx          # Reload (no downtime)
sudo systemctl restart nginx         # Restart
sudo tail -f /var/log/nginx/error.log   # View error logs
sudo tail -f /var/log/nginx/access.log  # View access logs
```

### Updating the Application

```bash
# 1. Upload new files to /var/www/yamz-cafe/
# 2. Install any new dependencies
cd /var/www/yamz-cafe
npm install --production --legacy-peer-deps

# 3. Restart
pm2 restart yamz-cafe
```

### Backup

```bash
# Backup app files
tar -czf yamz-cafe-backup-$(date +%Y%m%d).tar.gz /var/www/yamz-cafe/

# Backup database (if running locally)
pg_dump -U yamzadmin yamz_cafe > yamz_cafe_backup_$(date +%Y%m%d).sql
```

---

## 10. Troubleshooting

### App Not Starting

```bash
pm2 logs yamz-cafe --lines 50    # Check PM2 logs
lsof -i :3000                    # Check if port 3000 is in use
cd /var/www/yamz-cafe && node server.cjs  # Try running directly
```

### 502 Bad Gateway

```bash
pm2 status                       # Check if app is running
pm2 restart yamz-cafe            # Restart app
sudo tail -20 /var/log/nginx/error.log  # Check Nginx errors
```

### Database Connection Failed

```bash
curl http://localhost:3000/api/health   # Test health endpoint
nc -zv 187.124.229.196 5432            # Check if DB port is reachable
cat /var/www/yamz-cafe/.env | grep DB_  # Verify credentials
```

### Permission Denied

```bash
sudo chown -R $USER:$USER /var/www/yamz-cafe
mkdir -p /var/www/yamz-cafe/logs
chmod 755 /var/www/yamz-cafe/logs
```

### SSL Certificate Issues

```bash
sudo certbot renew                # Renew certificate
sudo certbot certificates         # Check certificate status
sudo certbot renew --force-renewal  # Force renewal
```

### Memory Issues

```bash
free -h                           # Check memory usage

# Add swap if needed:
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## Quick Reference

| Action | Command |
|--------|---------|
| Start app | `pm2 start ecosystem.config.cjs --env production` |
| Stop app | `pm2 stop yamz-cafe` |
| Restart app | `pm2 restart yamz-cafe` |
| View logs | `pm2 logs yamz-cafe` |
| Monitor | `pm2 monit` |
| Nginx test | `sudo nginx -t` |
| Nginx reload | `sudo systemctl reload nginx` |
| SSL setup | `sudo certbot --nginx -d yourdomain.com` |
| Health check | `curl http://localhost:3000/api/health` |
| Edit env | `nano /var/www/yamz-cafe/.env` |

---

## Architecture (Production)

```
┌──────────────────────────────────────────────────────────┐
│                    Internet / Browser                     │
│                 https://yourdomain.com                    │
└──────────────────────────┬───────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────┐
│                  Nginx (port 80/443)                      │
│                  SSL termination                          │
│                  Gzip compression                         │
│                  Static file serving                      │
│                                                           │
│   /api/*  ──→  proxy to Node.js :3000                    │
│   /*      ──→  serve dist/index.html (React SPA)         │
│   /assets ──→  serve dist/assets/ (cached 1 year)        │
└──────────────────────────┬───────────────────────────────┘
                           │ (API requests only)
┌──────────────────────────▼───────────────────────────────┐
│           Node.js / Express (port 3000)                   │
│           Managed by PM2                                  │
│           /var/www/yamz-cafe/server.cjs                   │
└──────────────────────────┬───────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────┐
│           PostgreSQL Database                             │
│           Remote: 187.124.229.196:5432                    │
│           Database: yamz_cafe                             │
└──────────────────────────────────────────────────────────┘
```