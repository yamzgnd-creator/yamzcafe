#!/bin/bash
# ============================================
# YAMZ CAFE - Hostinger VPS Deployment Script
# ============================================
# Run this script on your Hostinger VPS as root or with sudo

set -e

# ---- CONFIGURATION ----
DOMAIN="yourdomain.com"          # <-- CHANGE THIS to your actual domain
APP_DIR="/var/www/yamz-cafe"
NODE_VERSION="20"

echo "============================================"
echo "  YAMZ CAFE - Deployment Starting"
echo "  Domain: $DOMAIN"
echo "============================================"

# 1. Update system
echo ""
echo "📦 [1/8] Updating system packages..."
apt update && apt upgrade -y

# 2. Install Node.js
echo ""
echo "📦 [2/8] Installing Node.js $NODE_VERSION..."
if ! command -v node &> /dev/null || [[ $(node -v | cut -d. -f1 | tr -d 'v') -lt $NODE_VERSION ]]; then
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
    apt install -y nodejs
fi
echo "   Node.js: $(node -v)"
echo "   npm: $(npm -v)"

# 3. Install PM2
echo ""
echo "📦 [3/8] Installing PM2..."
npm install -g pm2

# 4. Install Nginx
echo ""
echo "📦 [4/8] Installing Nginx..."
apt install -y nginx
systemctl enable nginx

# 5. Setup application directory
echo ""
echo "📁 [5/8] Setting up application..."
mkdir -p $APP_DIR/logs
mkdir -p $APP_DIR/public/uploads

# Install dependencies
cd $APP_DIR
npm install --production --legacy-peer-deps

# 6. Configure Nginx
echo ""
echo "🌐 [6/8] Configuring Nginx..."
cp $APP_DIR/nginx.conf /etc/nginx/sites-available/yamz-cafe
sed -i "s/yourdomain.com/$DOMAIN/g" /etc/nginx/sites-available/yamz-cafe
ln -sf /etc/nginx/sites-available/yamz-cafe /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test and reload Nginx
nginx -t && systemctl reload nginx

# 7. Configure Firewall
echo ""
echo "🔒 [7/8] Configuring firewall..."
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# 8. Start application with PM2
echo ""
echo "🚀 [8/8] Starting application..."
cd $APP_DIR

# Stop existing instance if running
pm2 delete yamz-cafe 2>/dev/null || true

# Start with PM2
pm2 start ecosystem.config.cjs --env production
pm2 save

# Setup PM2 to start on boot
env PATH=$PATH:/usr/bin pm2 startup systemd -u root --hp /root
pm2 save

echo ""
echo "============================================"
echo "  ✅ DEPLOYMENT COMPLETE!"
echo "============================================"
echo ""
echo "  🌐 Your app should be live at: http://$DOMAIN"
echo ""
echo "  📝 NEXT STEPS:"
echo "  1. Edit .env file:  nano $APP_DIR/.env"
echo "     - Set JWT_SECRET to a random string"
echo "     - Set CORS_ORIGIN to https://$DOMAIN"
echo "     - Verify DB credentials"
echo ""
echo "  2. Restart after .env changes:"
echo "     pm2 restart yamz-cafe"
echo ""
echo "  3. Setup SSL (HTTPS):"
echo "     apt install -y certbot python3-certbot-nginx"
echo "     certbot --nginx -d $DOMAIN -d www.$DOMAIN"
echo ""
echo "  4. Check health:"
echo "     curl http://localhost:3000/api/health"
echo ""
echo "  5. View logs:"
echo "     pm2 logs yamz-cafe"
echo "============================================"