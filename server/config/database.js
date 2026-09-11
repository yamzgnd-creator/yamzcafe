const { Pool, types } = require('pg');

// Parse NUMERIC/DECIMAL (OID 1700) as JavaScript floats instead of strings
types.setTypeParser(1700, (val) => parseFloat(val));

// ─── Reconnection State ─────────────────────────────────────────────────────
const BACKOFF_INITIAL_MS = 1000;       // Start with 1 second
const BACKOFF_MAX_MS = 30000;          // Cap at 30 seconds
const HEALTH_CHECK_INTERVAL_MS = 30000; // Ping DB every 30 seconds
const QUERY_RETRY_LIMIT = 3;           // Max retries for transient query failures

let currentBackoff = BACKOFF_INITIAL_MS;
let isReconnecting = false;
let isPoolHealthy = true;
let healthCheckTimer = null;

// Connection-related error codes that indicate a dropped/lost connection
const CONNECTION_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'EHOSTUNREACH',
  'ETIMEDOUT',
  'EPIPE',
  'EAI_AGAIN',
  '57P01',  // admin_shutdown
  '57P02',  // crash_shutdown
  '57P03',  // cannot_connect_now
  '08000',  // connection_exception
  '08003',  // connection_does_not_exist
  '08006',  // connection_failure
  '08001',  // sqlclient_unable_to_establish_sqlconnection
  '08004',  // sqlserver_rejected_establishment_of_sqlconnection
]);

function isConnectionError(err) {
  if (!err) return false;
  if (err.code && CONNECTION_ERROR_CODES.has(err.code)) return true;
  const msg = (err.message || '').toLowerCase();
  return (
    msg.includes('connection terminated') ||
    msg.includes('connection refused') ||
    msg.includes('connection reset') ||
    msg.includes('client has encountered a connection error') ||
    msg.includes('cannot acquire a connection') ||
    msg.includes('terminating connection') ||
    msg.includes('server closed the connection') ||
    msg.includes('the database system is shutting down') ||
    msg.includes('too many connections') ||
    msg.includes('timeout expired')
  );
}

// ─── Pool Configuration ──────────────────────────────────────────────────────
function createPoolConfig() {
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'yamz_cafe',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    max: 10,
    min: 2,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    allowExitOnIdle: true,
  };
}

let pool = new Pool(createPoolConfig());

// ─── Pool Error Handling ─────────────────────────────────────────────────────
function attachPoolListeners(p) {
  p.on('error', (err) => {
    console.error(`⚠️  [${new Date().toISOString()}] Database pool error on idle client:`, err.message);
    isPoolHealthy = false;
    triggerReconnect();
  });

  p.on('connect', () => {
    // A new client was successfully checked out — pool is alive
    if (!isPoolHealthy) {
      console.log(`✅ [${new Date().toISOString()}] Pool client connected — marking pool healthy`);
    }
    isPoolHealthy = true;
  });
}

attachPoolListeners(pool);

// ─── Reconnection Logic with Exponential Backoff ─────────────────────────────
async function triggerReconnect() {
  if (isReconnecting) return; // Already attempting
  isReconnecting = true;

  console.log(`🔄 [${new Date().toISOString()}] Database connection lost. Starting reconnection with exponential backoff...`);

  while (true) {
    console.log(`🔄 [${new Date().toISOString()}] Attempting reconnection in ${currentBackoff / 1000}s...`);
    await sleep(currentBackoff);

    try {
      // Try a simple query to check connectivity
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();

      // Success — reset state
      console.log(`✅ [${new Date().toISOString()}] Database reconnected successfully! Backoff reset.`);
      currentBackoff = BACKOFF_INITIAL_MS;
      isPoolHealthy = true;
      isReconnecting = false;
      return;
    } catch (err) {
      console.error(`❌ [${new Date().toISOString()}] Reconnection attempt failed: ${err.message}`);

      // Exponential backoff
      currentBackoff = Math.min(currentBackoff * 2, BACKOFF_MAX_MS);

      // If the pool itself is broken, recreate it
      try {
        await pool.end().catch(() => {}); // Gracefully close old pool
      } catch (_) {
        // Ignore errors when closing broken pool
      }

      pool = new Pool(createPoolConfig());
      attachPoolListeners(pool);
      console.log(`🔧 [${new Date().toISOString()}] Pool recreated. Next retry in ${currentBackoff / 1000}s...`);
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Periodic Health Check ───────────────────────────────────────────────────
function startHealthCheck() {
  if (healthCheckTimer) return; // Already running

  healthCheckTimer = setInterval(async () => {
    try {
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();

      if (!isPoolHealthy) {
        console.log(`✅ [${new Date().toISOString()}] Health check passed — pool recovered.`);
      }
      isPoolHealthy = true;
    } catch (err) {
      console.error(`⚠️  [${new Date().toISOString()}] Health check failed: ${err.message}`);
      isPoolHealthy = false;
      triggerReconnect();
    }
  }, HEALTH_CHECK_INTERVAL_MS);

  // Allow the process to exit even if the timer is running
  if (healthCheckTimer.unref) {
    healthCheckTimer.unref();
  }
}

function stopHealthCheck() {
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
  }
}

// Start health checks automatically
startHealthCheck();

// ─── Query Helper with Automatic Retry ───────────────────────────────────────
async function query(text, params) {
  let lastError;

  for (let attempt = 1; attempt <= QUERY_RETRY_LIMIT; attempt++) {
    const start = Date.now();
    try {
      const result = await pool.query(text, params);
      const duration = Date.now() - start;
      console.log('Executed query', { text: text.substring(0, 80), duration, rows: result.rowCount });

      // If we were unhealthy, mark as recovered
      if (!isPoolHealthy) {
        isPoolHealthy = true;
        currentBackoff = BACKOFF_INITIAL_MS;
      }

      return result;
    } catch (error) {
      lastError = error;
      const duration = Date.now() - start;

      if (isConnectionError(error) && attempt < QUERY_RETRY_LIMIT) {
        console.warn(
          `⚠️  [${new Date().toISOString()}] Query failed (attempt ${attempt}/${QUERY_RETRY_LIMIT}) ` +
          `after ${duration}ms — ${error.message}. Retrying in ${currentBackoff / 1000}s...`
        );
        isPoolHealthy = false;

        // Wait before retry with current backoff
        const retryDelay = Math.min(BACKOFF_INITIAL_MS * Math.pow(2, attempt - 1), BACKOFF_MAX_MS);
        await sleep(retryDelay);

        // If pool seems broken, trigger full reconnect
        triggerReconnect();

        // Wait a bit more for reconnect to potentially succeed
        await sleep(1000);
        continue;
      }

      // Non-connection error or final attempt — log and throw
      console.error('Query error:', { text: text.substring(0, 200), error: error.message, attempt });
      throw error;
    }
  }

  throw lastError;
}

// ─── Transaction Helper (with connection-aware error handling) ────────────────
async function transaction(callback) {
  let client;
  let lastError;

  for (let attempt = 1; attempt <= QUERY_RETRY_LIMIT; attempt++) {
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      lastError = error;

      // Try to rollback
      if (client) {
        try {
          await client.query('ROLLBACK');
        } catch (_) {
          // Ignore rollback errors on broken connections
        }
      }

      if (isConnectionError(error) && attempt < QUERY_RETRY_LIMIT) {
        console.warn(
          `⚠️  [${new Date().toISOString()}] Transaction failed (attempt ${attempt}/${QUERY_RETRY_LIMIT}) ` +
          `— ${error.message}. Retrying...`
        );
        const retryDelay = Math.min(BACKOFF_INITIAL_MS * Math.pow(2, attempt - 1), BACKOFF_MAX_MS);
        await sleep(retryDelay);
        triggerReconnect();
        await sleep(1000);
        continue;
      }

      throw error;
    } finally {
      if (client) {
        try {
          client.release();
        } catch (_) {
          // Ignore release errors
        }
      }
    }
  }

  throw lastError;
}

// ─── Create All Tables ───────────────────────────────────────────────────────
async function createTables() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Use gen_random_uuid() which is built-in to PostgreSQL 13+
    // For older versions, enable pgcrypto extension
    await client.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS auth_users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT UNIQUE NOT NULL,
        encrypted_password TEXT NOT NULL,
        email_confirmed_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS user_profiles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT UNIQUE,
        full_name TEXT,
        role TEXT DEFAULT 'student',
        student_id TEXT,
        grade TEXT,
        balance NUMERIC(10,2) DEFAULT 0,
        phone_number TEXT,
        parent_email TEXT,
        parent_id UUID,
        photo TEXT,
        photo_alt TEXT,
        dietary_restrictions TEXT,
        allergies TEXT,
        account_status TEXT DEFAULT 'active',
        account_locked BOOLEAN DEFAULT FALSE,
        is_deleted BOOLEAN DEFAULT FALSE,
        deleted_at TIMESTAMPTZ,
        password_set BOOLEAN DEFAULT FALSE,
        permissions JSONB DEFAULT '[]'::jsonb,
        notification_preferences JSONB DEFAULT '{}'::jsonb,
        reset_token TEXT,
        reset_token_expires TIMESTAMPTZ,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS parent_students (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        parent_id UUID,
        student_id UUID,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(parent_id, student_id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS menu_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        description TEXT,
        category TEXT,
        price NUMERIC(10,2) NOT NULL,
        image_url TEXT,
        is_available BOOLEAN DEFAULT TRUE,
        stock_quantity INTEGER DEFAULT 0,
        allergens JSONB DEFAULT '[]'::jsonb,
        nutritional_info JSONB DEFAULT '{}'::jsonb,
        deleted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS meal_categories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        display_order INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS menu_schedules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        date DATE NOT NULL,
        menu_item_ids JSONB DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        student_id UUID,
        type TEXT NOT NULL,
        amount NUMERIC(10,2) NOT NULL,
        payment_method TEXT,
        status TEXT DEFAULT 'completed',
        processed_by UUID,
        cashier_id UUID,
        notes TEXT,
        related_transaction_id UUID,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS transaction_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        transaction_id UUID NOT NULL,
        menu_item_id UUID,
        item_name TEXT,
        quantity INTEGER DEFAULT 1,
        price NUMERIC(10,2),
        unit_price NUMERIC(10,2),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS pre_orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        student_id UUID,
        menu_item_id UUID,
        order_date DATE,
        quantity INTEGER DEFAULT 1,
        notes TEXT,
        status TEXT DEFAULT 'pending',
        fulfilled_at TIMESTAMPTZ,
        fulfilled_by UUID,
        deleted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID,
        type TEXT,
        title TEXT,
        message TEXT,
        is_read BOOLEAN DEFAULT FALSE,
        read_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS parent_notification_preferences (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        parent_id UUID,
        student_id UUID,
        low_balance_enabled BOOLEAN DEFAULT TRUE,
        low_balance_frequency TEXT DEFAULT 'realtime',
        low_balance_delivery JSONB DEFAULT '["in_app","email"]'::jsonb,
        transaction_issue_enabled BOOLEAN DEFAULT TRUE,
        transaction_issue_frequency TEXT DEFAULT 'realtime',
        transaction_issue_delivery JSONB DEFAULT '["in_app","email"]'::jsonb,
        transaction_enabled BOOLEAN DEFAULT FALSE,
        transaction_frequency TEXT DEFAULT 'realtime',
        transaction_delivery JSONB DEFAULT '["in_app","email"]'::jsonb,
        pre_order_update_enabled BOOLEAN DEFAULT TRUE,
        pre_order_update_frequency TEXT DEFAULT 'daily',
        pre_order_update_delivery JSONB DEFAULT '["in_app"]'::jsonb,
        dietary_alert_enabled BOOLEAN DEFAULT TRUE,
        dietary_alert_frequency TEXT DEFAULT 'realtime',
        dietary_alert_delivery JSONB DEFAULT '["in_app","email"]'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(parent_id, student_id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS dietary_restrictions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        student_id UUID,
        restriction_id UUID,
        notes TEXT,
        parent_verified BOOLEAN DEFAULT FALSE,
        status TEXT DEFAULT 'active',
        deleted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS dietary_restriction_templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        description TEXT,
        severity TEXT DEFAULT 'medium',
        deleted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS dietary_restriction_categories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        description TEXT,
        icon TEXT DEFAULT 'AlertCircle',
        color TEXT DEFAULT '#dc2626',
        requires_documentation BOOLEAN DEFAULT FALSE,
        display_order INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_trail (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID,
        action TEXT,
        details TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS system_config (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        key TEXT UNIQUE NOT NULL,
        value TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS company_settings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_name TEXT,
        tagline TEXT,
        logo_url TEXT,
        login_logo_url TEXT,
        login_logo_size TEXT DEFAULT 'medium',
        welcome_text TEXT,
        subtitle_text TEXT,
        login_background_type TEXT DEFAULT 'color',
        login_background_value TEXT,
        primary_color TEXT,
        secondary_color TEXT,
        accent_color TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS payment_gateways (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        provider_id TEXT NOT NULL,
        provider_name TEXT NOT NULL,
        status TEXT DEFAULT 'active',
        is_active BOOLEAN DEFAULT TRUE,
        environment TEXT DEFAULT 'production',
        supported_currencies JSONB DEFAULT '["USD"]'::jsonb,
        transaction_volume INTEGER DEFAULT 0,
        success_rate NUMERIC(5,2) DEFAULT 0,
        avg_response_time INTEGER DEFAULT 0,
        configured_by TEXT,
        configured_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS aftercare_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        student_id UUID NOT NULL,
        check_in_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        check_out_time TIMESTAMPTZ,
        checked_in_by UUID NOT NULL,
        checked_in_by_role TEXT NOT NULL DEFAULT 'staff',
        checked_out_by UUID,
        checked_out_by_role TEXT,
        status TEXT NOT NULL DEFAULT 'checked_in',
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS aftercare_billing_settings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        rate_type TEXT NOT NULL DEFAULT 'hourly',
        rate_amount NUMERIC(10,2) NOT NULL DEFAULT 10.00,
        daily_cap NUMERIC(10,2) DEFAULT NULL,
        grace_period_minutes INTEGER DEFAULT 15,
        billing_cycle TEXT DEFAULT 'weekly',
        late_pickup_fee NUMERIC(10,2) DEFAULT 0,
        late_pickup_after_minutes INTEGER DEFAULT 360,
        auto_generate BOOLEAN DEFAULT FALSE,
        is_active BOOLEAN DEFAULT TRUE,
        created_by UUID,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Add auto_generate column if it doesn't exist (migration for existing tables)
    await client.query(`
      ALTER TABLE aftercare_billing_settings ADD COLUMN IF NOT EXISTS auto_generate BOOLEAN DEFAULT FALSE
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS aftercare_invoices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        student_id UUID NOT NULL,
        session_id UUID,
        parent_id UUID,
        amount NUMERIC(10,2) NOT NULL DEFAULT 0,
        duration_minutes INTEGER DEFAULT 0,
        rate_type TEXT,
        rate_amount NUMERIC(10,2),
        late_fee NUMERIC(10,2) DEFAULT 0,
        total NUMERIC(10,2) NOT NULL DEFAULT 0,
        status TEXT DEFAULT 'pending',
        invoice_date DATE DEFAULT CURRENT_DATE,
        paid_at TIMESTAMPTZ,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS aftercare_programmes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        description TEXT,
        active BOOLEAN DEFAULT TRUE,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS aftercare_packages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        description TEXT,
        price NUMERIC(10,2) NOT NULL DEFAULT 0,
        billing_frequency TEXT DEFAULT 'monthly',
        active BOOLEAN DEFAULT TRUE,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS aftercare_enrollments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        student_id UUID NOT NULL,
        parent_id UUID NOT NULL,
        programmes JSONB DEFAULT '[]',
        package_type TEXT NOT NULL,
        academic_year TEXT DEFAULT '2025-2026',
        status TEXT DEFAULT 'active',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query('COMMIT');
    console.log('✅ All tables created successfully');

    // Run migrations (ALTER TABLE) outside the main transaction so partial success is OK
    await runMigrations(client);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating tables:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

// ─── Migrations: Add missing columns to existing tables ──────────────────────
async function runMigrations(client) {
  const addColumnIfNotExists = async (table, column, definition) => {
    try {
      const check = await client.query(
        `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
        [table, column]
      );
      if (check.rows.length === 0) {
        await client.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
        console.log(`  ✅ Added column ${table}.${column}`);
      }
    } catch (err) {
      console.error(`  ⚠️  Failed to add column ${table}.${column}: ${err.message}`);
    }
  };

  console.log('🔄 Running migrations...');

  // Create scheduled_menus table if it doesn't exist (referenced by pre_orders routes)
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS scheduled_menus (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        menu_name TEXT,
        schedule_date DATE,
        meal_type TEXT DEFAULT 'lunch',
        menu_item_ids JSONB DEFAULT '[]'::jsonb,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('  ✅ scheduled_menus table ensured');
  } catch (err) {
    console.error('  ⚠️  Failed to create scheduled_menus table:', err.message);
  }

  // Add cutoff_time column to scheduled_menus if not exists
  await addColumnIfNotExists('scheduled_menus', 'cutoff_time', 'TIMESTAMPTZ');

  // Drop unique constraint on schedule_date if it exists (allows multiple meal plans per date)
  try {
    const constraintCheck = await client.query(
      `SELECT 1 FROM information_schema.table_constraints 
       WHERE table_name = 'scheduled_menus' AND constraint_name = 'scheduled_menus_schedule_date_key'`
    );
    if (constraintCheck.rows.length > 0) {
      await client.query('ALTER TABLE scheduled_menus DROP CONSTRAINT scheduled_menus_schedule_date_key');
      console.log('  ✅ Dropped unique constraint on scheduled_menus.schedule_date');
    }
  } catch (err) {
    console.error('  ⚠️  Failed to drop schedule_date unique constraint:', err.message);
  }

  // pre_orders table — add missing columns used by preOrders routes
  await addColumnIfNotExists('pre_orders', 'parent_id', 'UUID');
  await addColumnIfNotExists('pre_orders', 'scheduled_menu_id', 'UUID');
  await addColumnIfNotExists('pre_orders', 'order_number', 'TEXT');
  await addColumnIfNotExists('pre_orders', 'meal_type', "TEXT DEFAULT 'lunch'");
  await addColumnIfNotExists('pre_orders', 'subtotal', 'NUMERIC(10,2) DEFAULT 0');
  await addColumnIfNotExists('pre_orders', 'tax', 'NUMERIC(10,2) DEFAULT 0');
  await addColumnIfNotExists('pre_orders', 'total', 'NUMERIC(10,2) DEFAULT 0');
  await addColumnIfNotExists('pre_orders', 'payment_method', "TEXT DEFAULT 'balance'");
  await addColumnIfNotExists('pre_orders', 'payment_status', "TEXT DEFAULT 'pending'");
  await addColumnIfNotExists('pre_orders', 'special_instructions', 'TEXT');
  await addColumnIfNotExists('pre_orders', 'ordered_at', 'TIMESTAMPTZ');
  await addColumnIfNotExists('pre_orders', 'confirmed_at', 'TIMESTAMPTZ');
  await addColumnIfNotExists('pre_orders', 'cancelled_at', 'TIMESTAMPTZ');
  await addColumnIfNotExists('pre_orders', 'cancellation_reason', 'TEXT');

  // parent_students — add relationship column
  await addColumnIfNotExists('parent_students', 'relationship', "TEXT DEFAULT 'guardian'");

  // menu_items — add stock tracking columns
  await addColumnIfNotExists('menu_items', 'stock_quantity', 'INTEGER DEFAULT 50');
  await addColumnIfNotExists('menu_items', 'max_stock', 'INTEGER DEFAULT 50');
  await addColumnIfNotExists('menu_items', 'low_stock_threshold', 'INTEGER DEFAULT 5');

  // Create password_reset_tokens table if it doesn't exist
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        token TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('  ✅ password_reset_tokens table ensured');
  } catch (err) {
    console.error('  ⚠️  Failed to create password_reset_tokens table:', err.message);
  }

  // company_settings — add separate background image columns
  await addColumnIfNotExists('company_settings', 'login_background_image', 'TEXT');
  await addColumnIfNotExists('company_settings', 'dashboard_background_image', 'TEXT');
  await addColumnIfNotExists('company_settings', 'site_background_image', 'TEXT');
  await addColumnIfNotExists('company_settings', 'login_bg_opacity', "INTEGER DEFAULT 40");
  await addColumnIfNotExists('company_settings', 'login_bg_blur', "INTEGER DEFAULT 4");
  await addColumnIfNotExists('company_settings', 'login_card_opacity', "INTEGER DEFAULT 100");
  await addColumnIfNotExists('company_settings', 'contact_email', 'TEXT');
  await addColumnIfNotExists('company_settings', 'contact_phone', 'TEXT');
  await addColumnIfNotExists('company_settings', 'address', 'TEXT');
  await addColumnIfNotExists('company_settings', 'website_url', 'TEXT');
  await addColumnIfNotExists('company_settings', 'currency_symbol', "TEXT DEFAULT '$'");
  await addColumnIfNotExists('company_settings', 'timezone', "TEXT DEFAULT 'America/New_York'");
  await addColumnIfNotExists('company_settings', 'date_format', "TEXT DEFAULT 'MM/DD/YYYY'");
  await addColumnIfNotExists('company_settings', 'favicon_url', 'TEXT');

  // Aftercare invoices - payment tracking columns
  await addColumnIfNotExists('aftercare_invoices', 'payment_method', 'TEXT');
  await addColumnIfNotExists('aftercare_invoices', 'payment_reference', 'TEXT');
  await addColumnIfNotExists('aftercare_invoices', 'received_by', 'UUID');
  await addColumnIfNotExists('aftercare_invoices', 'notes', 'TEXT');

  // Migrate existing site_background_image to both new columns if they are empty
  try {
    await client.query(`
      UPDATE company_settings
      SET login_background_image = COALESCE(login_background_image, site_background_image),
          dashboard_background_image = COALESCE(dashboard_background_image, site_background_image)
      WHERE site_background_image IS NOT NULL AND site_background_image != ''
        AND (login_background_image IS NULL OR login_background_image = '')
    `);
    console.log('  ✅ Migrated site_background_image to login/dashboard columns');
  } catch (err) {
    console.error('  ⚠️  Failed to migrate background images:', err.message);
  }

  // Seed aftercare programmes if table is empty
  try {
    const progCount = await client.query('SELECT COUNT(*) as count FROM aftercare_programmes');
    if (parseInt(progCount.rows[0].count) === 0) {
      const programmes = [
        'Art Care', 'Chess', 'Coding & Robotics', 'Dance (Ballet)',
        'Dance (Modern)', 'Football', 'Music (Keyboard)', 'Music (Piano)',
        'Savings Club', 'STEM Club', 'Swimming', 'Taekwondo', 'Unleashing Creativity'
      ];
      for (let i = 0; i < programmes.length; i++) {
        await client.query(
          `INSERT INTO aftercare_programmes (name, active, sort_order) VALUES ($1, true, $2)`,
          [programmes[i], i + 1]
        );
      }
      console.log('  ✅ Seeded aftercare programmes');
    }
  } catch (err) {
    console.error('  ⚠️  Failed to seed aftercare programmes:', err.message);
  }

  // Seed aftercare packages if table is empty
  try {
    const pkgCount = await client.query('SELECT COUNT(*) as count FROM aftercare_packages');
    if (parseInt(pkgCount.rows[0].count) === 0) {
      const packages = [
        { name: 'Hourly Care', description: '$10 per hour', price: 10.00, billing_frequency: 'hourly', sort_order: 1 },
        { name: 'Monthly Care', description: '$320 per month', price: 320.00, billing_frequency: 'monthly', sort_order: 2 },
        { name: 'None', description: 'No aftercare package', price: 0, billing_frequency: 'none', sort_order: 3 }
      ];
      for (const pkg of packages) {
        await client.query(
          `INSERT INTO aftercare_packages (name, description, price, billing_frequency, active, sort_order) 
           VALUES ($1, $2, $3, $4, true, $5)`,
          [pkg.name, pkg.description, pkg.price, pkg.billing_frequency, pkg.sort_order]
        );
      }
      console.log('  ✅ Seeded aftercare packages');
    }
  } catch (err) {
    console.error('  ⚠️  Failed to seed aftercare packages:', err.message);
  }

  console.log('✅ Migrations complete');
}

// ─── Test Connection ─────────────────────────────────────────────────────────
async function testConnection() {
  try {
    const result = await pool.query('SELECT NOW() as now');
    console.log('Database connection test successful:', result.rows[0].now);
    return true;
  } catch (error) {
    console.error('Database connection test failed:', error.message);
    return false;
  }
}

// ─── Initialize Database (create tables) ─────────────────────────────────────
let dbReady = null;
let dbInitialized = false;
async function getDB() {
  if (!dbReady) {
    dbReady = createTables().then(() => {
      dbInitialized = true;
    }).catch((err) => {
      console.error('⚠️  Database initialization failed (will retry on next request):', err.message);
      dbReady = null; // Allow retry on next call
      dbInitialized = false;
    });
  }
  return dbReady;
}

function isDBReady() {
  return dbInitialized;
}

// ─── Getters (for modules that need the current pool reference) ──────────────
// Since pool can be recreated during reconnection, other modules should use
// getPool() if they need the raw pool, or just use the exported query/transaction.
function getPool() {
  return pool;
}

function getConnectionStatus() {
  return {
    healthy: isPoolHealthy,
    reconnecting: isReconnecting,
    currentBackoffMs: currentBackoff,
    dbInitialized,
  };
}

// ─── Exports (backward-compatible) ──────────────────────────────────────────
module.exports = {
  // The pool getter — use this instead of the raw `pool` for reconnection safety.
  // For backward compat, we also expose `pool` as a property that resolves to the current pool.
  get pool() {
    return pool;
  },
  query,
  transaction,
  testConnection,
  getDB,
  isDBReady,
  getPool,
  getConnectionStatus,
  startHealthCheck,
  stopHealthCheck,
};