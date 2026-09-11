const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Serve uploaded files statically.
// Path is derived from __dirname so it always matches where server/routes/uploads.js
// writes files, regardless of the process working directory (PM2, systemd, etc).
const UPLOADS_ROOT = path.join(__dirname, 'public', 'uploads');
app.use('/uploads', express.static(UPLOADS_ROOT, {
  maxAge: '7d',
  fallthrough: true
}));

// If an uploaded file does not exist, return a genuine 404 instead of falling
// through to the SPA catch-all (which would serve index.html and make the
// browser render a silently broken image).
app.use('/uploads', (req, res) => {
  res.status(404).json({
    error: 'Uploaded file not found',
    requested: `/uploads${req.path}`,
    searchedIn: UPLOADS_ROOT
  });
});

// API Routes
app.use('/api/auth', require('./server/routes/auth'));
app.use('/api/students', require('./server/routes/students'));
app.use('/api/transactions', require('./server/routes/transactions'));
app.use('/api/menu', require('./server/routes/menu'));
app.use('/api/scheduled-menus', require('./server/routes/scheduledMenus'));
app.use('/api/pre-orders', require('./server/routes/preOrders'));
app.use('/api/dietary', require('./server/routes/dietary'));
app.use('/api/notifications', require('./server/routes/notifications'));
app.use('/api/reports', require('./server/routes/reports'));
app.use('/api/settings', require('./server/routes/settings'));
app.use('/api/users', require('./server/routes/users'));
app.use('/api/inventory', require('./server/routes/inventory'));
app.use('/api/payments', require('./server/routes/payments'));
app.use('/api/uploads', require('./server/routes/uploads'));
app.use('/api/aftercare', require('./server/routes/aftercare'));
app.use('/api/aftercare-billing', require('./server/routes/aftercareBilling'));
app.use('/api/aftercare-enrollment', require('./server/routes/aftercareEnrollment'));
app.use('/api/meal-subscriptions', require('./server/routes/mealSubscriptions'));

// Config endpoint for frontend runtime configuration
app.get('/api/config', (req, res) => {
  res.json({
    API_BASE_URL: '/',
  });
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    const { testConnection } = require('./server/config/database');
    const dbStatus = await testConnection();
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: dbStatus ? 'connected (PostgreSQL)' : 'disconnected',
      version: process.env.npm_package_version || '1.0.0'
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

// Serve static files from Vite build output
// Vite config sets outDir to 'build', fallback to 'dist' if 'build' doesn't exist
const fs = require('fs');
const buildPath = path.join(__dirname, 'build');
const distPath = path.join(__dirname, 'dist');
const staticPath = fs.existsSync(buildPath) ? buildPath : distPath;
app.use(express.static(staticPath));

// Serve React app for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(staticPath, 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Gracefully free the port by sending SIGTERM to existing processes
// This is safe: the platform starts a new `node server.js` to replace the old one
function freePort(port) {
  return new Promise((resolve) => {
    const { execSync } = require('child_process');
    try {
      const pids = execSync(`lsof -ti:${port}`, { encoding: 'utf-8' }).trim();
      if (!pids) {
        resolve();
        return;
      }
      const pidList = pids.split('\n').filter(Boolean);
      const selfPid = process.pid.toString();
      const otherPids = pidList.filter(p => p !== selfPid);

      if (otherPids.length === 0) {
        resolve();
        return;
      }

      console.log(`⚠️  Port ${port} in use (PIDs: ${otherPids.join(', ')}). Requesting graceful shutdown...`);

      // Send SIGTERM (graceful) to each process
      for (const pid of otherPids) {
        try {
          process.kill(parseInt(pid), 'SIGTERM');
        } catch {
          // Process may have already exited
        }
      }

      // Poll until the port is free (up to 6 seconds)
      let elapsed = 0;
      const interval = 500;
      const maxWait = 6000;
      const timer = setInterval(() => {
        elapsed += interval;
        let stillInUse = false;
        for (const pid of otherPids) {
          try {
            process.kill(parseInt(pid), 0); // Check if alive (signal 0)
            stillInUse = true;
          } catch {
            // Process exited
          }
        }
        if (!stillInUse || elapsed >= maxWait) {
          clearInterval(timer);
          if (stillInUse) {
            console.log(`⚠️  Processes did not exit after ${maxWait / 1000}s. Proceeding anyway...`);
          } else {
            console.log(`✅ Port ${port} freed successfully.`);
          }
          // Small extra delay to ensure OS releases the port
          setTimeout(resolve, 500);
        }
      }, interval);
    } catch {
      // lsof returns non-zero if no process found — port is free
      resolve();
    }
  });
}

// Graceful shutdown handler
let isShuttingDown = false;
function gracefulShutdown(signal, server) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n${signal} received: shutting down gracefully...`);

  server.close(() => {
    console.log('✅ HTTP server closed');
    const { pool } = require('./server/config/database');
    pool.end().then(() => {
      console.log('✅ Database pool closed');
      process.exit(0);
    }).catch(() => {
      process.exit(0);
    });
  });

  // Force exit after 5 seconds if graceful shutdown hangs
  setTimeout(() => {
    console.error('⚠️  Forced shutdown after timeout');
    process.exit(1);
  }, 5000);
}

// Start server
async function startServer() {
  try {
    // Gracefully free the port if another instance is running
    await freePort(PORT);

    // Try to initialize database, but don't block server startup
    let dbConnected = false;
    try {
      const { getDB, testConnection } = require('./server/config/database');
      await getDB();

      // Test database connection
      dbConnected = await testConnection();

      if (dbConnected) {
        // Seed database with demo data
        const { seedDatabase } = require('./server/config/seed');
        await seedDatabase();
      }
    } catch (dbError) {
      console.error('⚠️  Database initialization failed:', dbError.message);
      console.log('⚠️  Server will start without database. API calls requiring DB will fail.');
    }

    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log('\n========================================');
      console.log('🚀 YAMZ Cafe Server Starting...');
      console.log('========================================');
      console.log(`📡 Server running on: http://0.0.0.0:${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`💾 Database: PostgreSQL @ ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);

      if (dbConnected) {
        console.log('✅ Database connected successfully');
      } else {
        console.log('⚠️  Database not connected - server running in degraded mode');
      }

      console.log(`📊 Memory: ${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB RSS`);
      console.log('========================================\n');

      // Start auto-invoice scheduler
      try {
        const { startScheduler } = require('./server/scheduler/autoInvoice');
        startScheduler();
        console.log('📅 Auto-invoice scheduler initialized');
      } catch (schedErr) {
        console.error('⚠️  Auto-invoice scheduler failed to start:', schedErr.message);
      }
    });

    // Set keep-alive timeout
    server.keepAliveTimeout = 65000;
    server.headersTimeout = 66000;

    // Handle EADDRINUSE — exit cleanly so the platform can retry
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is still in use after cleanup attempt.`);
        process.exit(1);
      } else {
        console.error('Server error:', err);
        process.exit(1);
      }
    });

    // Register graceful shutdown handlers
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM', server));
    process.on('SIGINT', () => gracefulShutdown('SIGINT', server));

    // Handle uncaught exceptions
    process.on('uncaughtException', (err) => {
      console.error('💥 Uncaught Exception:', err.message);
      console.error(err.stack);
      gracefulShutdown('uncaughtException', server);
    });

    process.on('unhandledRejection', (reason) => {
      console.error('💥 Unhandled Rejection:', reason);
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

module.exports = app;