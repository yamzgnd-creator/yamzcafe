const express = require('express');
const router = express?.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query, transaction } = require('../config/database');
const { verifyToken, requireRole } = require('../middleware/auth');
const { sendWelcomeEmail, sendParentWelcomeEmail, sendPasswordResetEmail } = require('../services/emailService');

// ─── Ensure password_reset_tokens table exists ──────────────────────────────
(async () => {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        token VARCHAR(255) NOT NULL UNIQUE,
        expires_at TIMESTAMP NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ password_reset_tokens table ready');
  } catch (err) {
    console.error('⚠️  Could not create password_reset_tokens table:', err.message);
  }
})();

// Helper: get base URL from request or env
function getBaseUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

// Helper: get company name from branding settings
async function getCompanyName() {
  try {
    const result = await query(
      `SELECT value FROM system_config WHERE key = 'company_name'`
    );
    if (result?.rows?.length > 0) {
      let val = result.rows[0].value;
      try { val = JSON.parse(val); } catch { /* use raw */ }
      return val || 'YAMZ Cafe';
    }
  } catch { /* ignore */ }
  return 'YAMZ Cafe';
}

// Helper: generate a secure random token
function generateResetToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Helper: create a password reset token for a user and return the full reset URL
async function createResetTokenForUser(userId, baseUrl) {
  const token = generateResetToken();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  await query(
    `INSERT INTO password_reset_tokens (user_id, token, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, token, expiresAt]
  );

  return `${baseUrl}/reset-password?token=${token}`;
}

// Generate JWT token
const generateToken = (user) => {
  return jwt?.sign(
    {
      userId: user?.id,
      email: user?.email,
      role: user?.role
    },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
};

// Login
router?.post('/login', async (req, res) => {
  try {
    const { email, password } = req?.body;
    
    if (!email || !password) {
      return res?.status(400)?.json({ error: 'Email and password required' });
    }
    
    // Get user from database
    const result = await query(
      `SELECT up.*, au.encrypted_password 
       FROM user_profiles up
       LEFT JOIN auth_users au ON up.id = au.id
       WHERE up.email = $1`,
      [email?.toLowerCase()]
    );
    
    if (result?.rows?.length === 0) {
      return res?.status(401)?.json({ error: 'Invalid email or password' });
    }
    
    const user = result?.rows?.[0];
    
    // Check if account is locked
    if (user?.is_locked) {
      // Check if lock has expired
      if (user?.locked_until && new Date(user?.locked_until) < new Date()) {
        // Unlock the account
        await query(
          `UPDATE user_profiles SET is_locked = false, locked_until = NULL, failed_login_attempts = 0 WHERE id = $1`,
          [user?.id]
        );
      } else {
        return res?.status(403)?.json({ error: 'Account is locked. Please contact administrator.' });
      }
    }
    
    // Verify password
    if (!user?.encrypted_password) {
      return res?.status(401)?.json({ error: 'Invalid email or password' });
    }
    
    const isValidPassword = await bcrypt?.compare(password, user?.encrypted_password);
    
    if (!isValidPassword) {
      // Increment failed login attempts
      const failedAttempts = (user?.failed_login_attempts || 0) + 1;
      const updateFields = { failed_login_attempts: failedAttempts, last_failed_login: new Date() };
      
      // Lock account after 5 failed attempts
      if (failedAttempts >= 5) {
        updateFields.is_locked = true;
        updateFields.locked_until = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
      }
      
      await query(
        `UPDATE user_profiles SET failed_login_attempts = $1, last_failed_login = $2, is_locked = $3, locked_until = $4 WHERE id = $5`,
        [updateFields.failed_login_attempts, updateFields.last_failed_login, updateFields.is_locked || false, updateFields.locked_until || null, user?.id]
      );
      
      return res?.status(401)?.json({ error: 'Invalid email or password' });
    }
    
    // Reset failed login attempts on successful login
    if (user?.failed_login_attempts > 0) {
      await query(
        `UPDATE user_profiles SET failed_login_attempts = 0, last_failed_login = NULL WHERE id = $1`,
        [user?.id]
      );
    }
    
    // Check if password needs to be set (for parent accounts)
    if (user?.role === 'parent' && !user?.password_set) {
      return res?.status(403)?.json({ 
        error: 'Password setup required',
        requirePasswordSetup: true,
        userId: user?.id
      });
    }
    
    // Generate token
    const token = generateToken(user);
    
    // Return user data and token
    res?.json({
      user: {
        id: user?.id,
        email: user?.email,
        role: user?.role,
        full_name: user?.full_name,
        permissions: user?.permissions || {}
      },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res?.status(500)?.json({ error: 'Login failed' });
  }
});

// Get current user profile (used by frontend AuthContext)
router?.get('/profile', verifyToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, email, full_name, role, phone_number, secondary_phone,
              student_id, grade, homeroom, balance, photo, photo_alt,
              parent_email_address, parent_guardian,
              account_status, password_set, permissions, meal_program, spending_limit,
              is_locked, locked_until,
              created_at, updated_at
       FROM user_profiles WHERE id = $1`,
      [req?.user?.id]
    );

    if (result?.rows?.length === 0) {
      return res?.status(404)?.json({ error: 'Profile not found' });
    }

    const profile = result?.rows?.[0];
    res?.json({
      id: profile?.id,
      email: profile?.email,
      name: profile?.full_name,
      full_name: profile?.full_name,
      role: profile?.role,
      phone_number: profile?.phone_number,
      secondary_phone: profile?.secondary_phone,
      student_id: profile?.student_id,
      grade: profile?.grade,
      homeroom: profile?.homeroom,
      balance: profile?.balance,
      photo: profile?.photo,
      photo_alt: profile?.photo_alt,
      parent_email: profile?.parent_email_address,
      parent_guardian: profile?.parent_guardian,
      account_status: profile?.account_status,
      is_active: profile?.account_status === 'active',
      is_deleted: false,
      deleted_at: null,
      password_set: profile?.password_set,
      permissions: profile?.permissions || {},
      meal_program: profile?.meal_program,
      spending_limit: profile?.spending_limit,
      created_at: profile?.created_at,
      updated_at: profile?.updated_at
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res?.status(500)?.json({ error: 'Failed to fetch profile' });
  }
});

// Register (Admin-only: create user of any role)
router?.post('/register', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { email, password, full_name, role, phone_number, secondary_phone, relationship } = req?.body;
    
    if (!email || !full_name || !role) {
      return res?.status(400)?.json({ error: 'Email, full name, and role are required' });
    }
    
    const validRoles = ['admin', 'cashier', 'staff', 'parent', 'student'];
    if (!validRoles.includes(role)) {
      return res?.status(400)?.json({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}` });
    }
    
    // For non-parent accounts, password is required
    const isParentAccount = role === 'parent';
    if (!isParentAccount && !password) {
      return res?.status(400)?.json({ error: 'Password is required for non-parent accounts' });
    }
    
    // Check if user already exists
    const existingUser = await query(
      'SELECT id FROM user_profiles WHERE email = $1',
      [email?.toLowerCase()]
    );
    
    if (existingUser?.rows?.length > 0) {
      return res?.status(409)?.json({ error: 'Email already registered' });
    }
    
    // Generate password for parent accounts if not provided
    const userPassword = password || `Parent${Math.random().toString(36).slice(-8)}!`;
    const hashedPassword = await bcrypt?.hash(userPassword, 10);
    
    // Build metadata for the trigger (handle_new_user reads raw_user_meta_data)
    const metadata = JSON.stringify({
      full_name,
      role,
      phone_number: phone_number || null,
      secondary_phone: secondary_phone || null,
      password_set: !isParentAccount
    });
    
    // Create user in transaction
    const result = await transaction(async (client) => {
      // Insert into auth.users - the trigger handle_new_user() will auto-create user_profiles
      const authResult = await client?.query(
        `INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, role, aud, instance_id, raw_user_meta_data)
         VALUES (gen_random_uuid(), $1, $2, NOW(), NOW(), NOW(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', $3::jsonb)
         RETURNING id`,
        [email?.toLowerCase(), hashedPassword, metadata]
      );
      
      const userId = authResult?.rows?.[0]?.id;
      
      // Also insert into local auth_users table (used by login query)
      await client?.query(
        `INSERT INTO auth_users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW(), NOW())`,
        [userId, email?.toLowerCase(), hashedPassword]
      );
      
      // Update user_profiles with account_status (trigger sets defaults, we update extras)
      await client?.query(
        `UPDATE user_profiles SET account_status = 'active' WHERE id = $1`,
        [userId]
      );
      
      // Fetch the created profile
      const profileResult = await client?.query(
        `SELECT * FROM user_profiles WHERE id = $1`,
        [userId]
      );
      
      // Log the action in audit trail
      try {
        await client?.query(
          `INSERT INTO audit_trail (user_id, action, details)
           VALUES ($1, 'create_user', $2)`,
          [req?.user?.id, JSON.stringify({ created_user_id: userId, role, email: email?.toLowerCase() })]
        );
      } catch (auditErr) {
        console.error('Audit trail insert failed:', auditErr?.message);
      }
      
      return profileResult?.rows?.[0];
    });

    // Send welcome email for non-admin roles (async, don't block response)
    if (role !== 'admin') {
      const baseUrl = getBaseUrl(req);
      const companyName = await getCompanyName();

      createResetTokenForUser(result.id, baseUrl)
        .then((resetLink) => {
          return sendWelcomeEmail({
            email: email?.toLowerCase(),
            fullName: full_name,
            role,
            resetLink,
            companyName,
          });
        })
        .then(() => {
          console.log(`📧 Welcome email sent to ${email}`);
        })
        .catch((emailErr) => {
          console.error(`⚠️  Failed to send welcome email to ${email}:`, emailErr.message);
        });
    }
    
    res?.status(201)?.json({
      user: {
        id: result?.id,
        email: result?.email,
        role: result?.role,
        full_name: result?.full_name,
        phone_number: result?.phone_number,
        account_status: result?.account_status
      },
      message: `${role.charAt(0).toUpperCase() + role.slice(1)} account created successfully${role !== 'admin' ? '. A welcome email with password setup instructions has been sent.' : '.'}`
    });
  } catch (error) {
    console.error('Register error:', error);
    res?.status(500)?.json({ error: error?.message || 'Registration failed' });
  }
});

// Signup (for parent self-registration)
router?.post('/signup', async (req, res) => {
  try {
    const { email, password, name, phone } = req?.body;
    
    if (!email || !password || !name) {
      return res?.status(400)?.json({ error: 'Email, password, and name required' });
    }
    
    // Check if user already exists
    const existingUser = await query(
      'SELECT id FROM user_profiles WHERE email = $1',
      [email?.toLowerCase()]
    );
    
    if (existingUser?.rows?.length > 0) {
      return res?.status(409)?.json({ error: 'Email already registered' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt?.hash(password, 10);
    
    // Build metadata for the trigger
    const metadata = JSON.stringify({
      full_name: name,
      role: 'parent',
      phone_number: phone || null,
      password_set: true
    });
    
    // Create user in transaction
    const result = await transaction(async (client) => {
      // Insert into auth.users - trigger auto-creates user_profiles
      const authResult = await client?.query(
        `INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, role, aud, instance_id, raw_user_meta_data)
         VALUES (gen_random_uuid(), $1, $2, NOW(), NOW(), NOW(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', $3::jsonb)
         RETURNING id`,
        [email?.toLowerCase(), hashedPassword, metadata]
      );
      
      const userId = authResult?.rows?.[0]?.id;
      
      // Also insert into local auth_users table (used by login query)
      await client?.query(
        `INSERT INTO auth_users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW(), NOW())`,
        [userId, email?.toLowerCase(), hashedPassword]
      );
      
      // Update account_status
      await client?.query(
        `UPDATE user_profiles SET account_status = 'active' WHERE id = $1`,
        [userId]
      );
      
      // Fetch the created profile
      const profileResult = await client?.query(
        `SELECT * FROM user_profiles WHERE id = $1`,
        [userId]
      );
      
      return profileResult?.rows?.[0];
    });

    // Send parent welcome email (async, don't block response)
    const baseUrl = getBaseUrl(req);
    const companyName = await getCompanyName();
    sendParentWelcomeEmail({
      email: email?.toLowerCase(),
      fullName: name,
      loginUrl: baseUrl,
      companyName,
    }).catch((emailErr) => {
      console.error(`⚠️  Failed to send parent welcome email to ${email}:`, emailErr.message);
    });
    
    // Generate token
    const token = generateToken(result);
    
    res?.status(201)?.json({
      user: {
        id: result?.id,
        email: result?.email,
        role: result?.role,
        full_name: result?.full_name
      },
      token
    });
  } catch (error) {
    console.error('Signup error:', error);
    res?.status(500)?.json({ error: 'Signup failed' });
  }
});

// Change password (authenticated user changes their own password)
router?.post('/change-password', verifyToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req?.body;
    
    if (!currentPassword || !newPassword) {
      return res?.status(400)?.json({ error: 'Current password and new password are required' });
    }
    
    if (newPassword.length < 6) {
      return res?.status(400)?.json({ error: 'New password must be at least 6 characters long' });
    }
    
    if (currentPassword === newPassword) {
      return res?.status(400)?.json({ error: 'New password must be different from current password' });
    }
    
    // Get current password hash
    const result = await query(
      'SELECT encrypted_password FROM auth_users WHERE id = $1',
      [req?.user?.id]
    );
    
    if (result?.rows?.length === 0) {
      return res?.status(404)?.json({ error: 'User not found' });
    }
    
    // Verify current password
    const isValid = await bcrypt?.compare(currentPassword, result?.rows?.[0]?.encrypted_password);
    if (!isValid) {
      return res?.status(401)?.json({ error: 'Current password is incorrect' });
    }
    
    // Hash new password and update both auth tables
    const hashedPassword = await bcrypt?.hash(newPassword, 10);
    
    // Update auth.users (Supabase auth table)
    await query(
      'UPDATE auth.users SET encrypted_password = $1, updated_at = NOW() WHERE id = $2',
      [hashedPassword, req?.user?.id]
    );
    
    // Update local auth_users table
    await query(
      'UPDATE auth_users SET encrypted_password = $1, updated_at = NOW() WHERE id = $2',
      [hashedPassword, req?.user?.id]
    );
    
    // Update password_set flag
    await query(
      'UPDATE user_profiles SET password_set = true, updated_at = NOW() WHERE id = $1',
      [req?.user?.id]
    );
    
    // Log the action
    try {
      await query(
        `INSERT INTO audit_trail (user_id, action, details) VALUES ($1, 'change_password', $2)`,
        [req?.user?.id, JSON.stringify({ timestamp: new Date() })]
      );
    } catch (auditErr) {
      console.error('Audit trail insert failed:', auditErr?.message);
    }
    
    res?.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res?.status(500)?.json({ error: 'Failed to change password' });
  }
});

// Admin reset user password
router?.post('/reset-user-password', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { userId, newPassword } = req?.body;
    
    if (!userId || !newPassword) {
      return res?.status(400)?.json({ error: 'User ID and new password are required' });
    }
    
    if (newPassword.length < 6) {
      return res?.status(400)?.json({ error: 'Password must be at least 6 characters long' });
    }
    
    // Check if user exists
    const userResult = await query('SELECT id FROM user_profiles WHERE id = $1', [userId]);
    if (userResult?.rows?.length === 0) {
      return res?.status(404)?.json({ error: 'User not found' });
    }
    
    // Hash new password and update
    const hashedPassword = await bcrypt?.hash(newPassword, 10);
    
    await transaction(async (client) => {
      // Update auth.users (Supabase auth table)
      await client?.query(
        'UPDATE auth.users SET encrypted_password = $1, updated_at = NOW() WHERE id = $2',
        [hashedPassword, userId]
      );
      
      // Update local auth_users table
      const authCheck = await client?.query('SELECT id FROM auth_users WHERE id = $1', [userId]);
      if (authCheck?.rows?.length === 0) {
        await client?.query(
          `INSERT INTO auth_users (id, email, encrypted_password, email_confirmed_at)
           SELECT $1, email, $2, NOW() FROM user_profiles WHERE id = $1`,
          [userId, hashedPassword]
        );
      } else {
        await client?.query(
          'UPDATE auth_users SET encrypted_password = $1, updated_at = NOW() WHERE id = $2',
          [hashedPassword, userId]
        );
      }
      
      await client?.query(
        'UPDATE user_profiles SET password_set = true, updated_at = NOW() WHERE id = $1',
        [userId]
      );
      
      // Log the action
      try {
        await client?.query(
          `INSERT INTO audit_trail (user_id, action, details) VALUES ($1, 'admin_reset_password', $2)`,
          [req?.user?.id, JSON.stringify({ target_user_id: userId, timestamp: new Date() })]
        );
      } catch (auditErr) {
        console.error('Audit trail insert failed:', auditErr?.message);
      }
    });
    
    res?.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Admin reset password error:', error);
    res?.status(500)?.json({ error: 'Failed to reset password' });
  }
});

// Forgot password (send reset link via email)
router?.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req?.body;
    
    if (!email) {
      return res?.status(400)?.json({ error: 'Email required' });
    }
    
    // Always return the same message to prevent email enumeration
    const successMessage = 'If an account with that email exists, a password reset link has been sent.';

    // Check if user exists
    const result = await query(
      'SELECT id, full_name, role FROM user_profiles WHERE email = $1',
      [email?.toLowerCase()]
    );
    
    if (result?.rows?.length === 0) {
      return res?.json({ message: successMessage });
    }
    
    const user = result?.rows?.[0];
    const baseUrl = getBaseUrl(req);
    const companyName = await getCompanyName();

    // Invalidate any existing unused tokens for this user
    await query(
      `UPDATE password_reset_tokens SET used = TRUE WHERE user_id = $1 AND used = FALSE`,
      [user.id]
    );

    // Create new reset token
    const resetLink = await createResetTokenForUser(user.id, baseUrl);

    // Send reset email using template
    sendPasswordResetEmail({
      email: email?.toLowerCase(),
      fullName: user.full_name,
      resetLink,
      companyName,
    }).catch((err) => {
      console.error(`⚠️  Failed to send password reset email to ${email}:`, err.message);
    });

    res?.json({ message: successMessage });
  } catch (error) {
    console.error('Forgot password error:', error);
    res?.status(500)?.json({ error: 'Password reset request failed' });
  }
});

// Password reset request (alias for forgot-password)
router?.post('/reset-password-request', async (req, res) => {
  // Forward to the forgot-password logic
  const { email } = req?.body;

  if (!email) {
    return res?.status(400)?.json({ error: 'Email required' });
  }

  const successMessage = 'If an account with that email exists, a password reset link has been sent.';

  try {
    const result = await query(
      'SELECT id, full_name, role FROM user_profiles WHERE email = $1',
      [email?.toLowerCase()]
    );

    if (result?.rows?.length === 0) {
      return res?.json({ message: successMessage });
    }

    const user = result?.rows?.[0];
    const baseUrl = getBaseUrl(req);
    const companyName = await getCompanyName();

    // Invalidate existing tokens
    await query(
      `UPDATE password_reset_tokens SET used = TRUE WHERE user_id = $1 AND used = FALSE`,
      [user.id]
    );

    // Create new reset token
    const resetLink = await createResetTokenForUser(user.id, baseUrl);

    // Send reset email
    sendPasswordResetEmail({
      email: email?.toLowerCase(),
      fullName: user.full_name,
      resetLink,
      companyName,
    }).catch((err) => {
      console.error(`⚠️  Failed to send password reset email to ${email}:`, err.message);
    });

    res?.json({ message: successMessage });
  } catch (error) {
    console.error('Password reset request error:', error);
    res?.status(500)?.json({ error: 'Password reset request failed' });
  }
});

// Set password (for parent account setup - requires auth token)
router?.post('/set-password', verifyToken, async (req, res) => {
  try {
    const { password } = req?.body;

    if (!password) {
      return res?.status(400)?.json({ error: 'Password is required' });
    }

    if (password.length < 6) {
      return res?.status(400)?.json({ error: 'Password must be at least 6 characters long' });
    }

    const userId = req?.user?.id;

    // Hash new password
    const hashedPassword = await bcrypt?.hash(password, 10);

    // Update password in both auth tables
    await transaction(async (client) => {
      // Update auth.users
      await client?.query(
        'UPDATE auth.users SET encrypted_password = $1, updated_at = NOW() WHERE id = $2',
        [hashedPassword, userId]
      );

      // Update local auth_users
      const authCheck = await client?.query('SELECT id FROM auth_users WHERE id = $1', [userId]);
      if (authCheck?.rows?.length === 0) {
        await client?.query(
          `INSERT INTO auth_users (id, email, encrypted_password, email_confirmed_at)
           SELECT $1, email, $2, NOW() FROM user_profiles WHERE id = $1`,
          [userId, hashedPassword]
        );
      } else {
        await client?.query(
          'UPDATE auth_users SET encrypted_password = $1, updated_at = NOW() WHERE id = $2',
          [hashedPassword, userId]
        );
      }

      // Mark password as set
      await client?.query(
        `UPDATE user_profiles SET password_set = true, updated_at = NOW() WHERE id = $1`,
        [userId]
      );

      // Log the action
      try {
        await client?.query(
          `INSERT INTO audit_trail (user_id, action, details) VALUES ($1, 'parent_set_password', $2)`,
          [userId, JSON.stringify({ timestamp: new Date() })]
        );
      } catch (auditErr) {
        console.error('Audit trail insert failed:', auditErr?.message);
      }
    });

    res?.json({ message: 'Password set successfully' });
  } catch (error) {
    console.error('Set password error:', error);
    res?.status(500)?.json({ error: 'Failed to set password' });
  }
});

// Reset password (with token from password_reset_tokens table)
router?.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req?.body;
    
    if (!token || !newPassword) {
      return res?.status(400)?.json({ error: 'Token and new password required' });
    }

    if (newPassword.length < 6) {
      return res?.status(400)?.json({ error: 'Password must be at least 6 characters long' });
    }
    
    // Look up the token in password_reset_tokens
    const tokenResult = await query(
      `SELECT id, user_id, expires_at, used FROM password_reset_tokens WHERE token = $1`,
      [token]
    );

    if (tokenResult?.rows?.length === 0) {
      return res?.status(401)?.json({ error: 'Invalid or expired reset link. Please request a new one.' });
    }

    const tokenRow = tokenResult.rows[0];

    if (tokenRow.used) {
      return res?.status(401)?.json({ error: 'This reset link has already been used. Please request a new one.' });
    }

    if (new Date(tokenRow.expires_at) < new Date()) {
      return res?.status(401)?.json({ error: 'This reset link has expired. Please request a new one.' });
    }

    const userId = tokenRow.user_id;
    
    // Hash new password
    const hashedPassword = await bcrypt?.hash(newPassword, 10);
    
    // Update password in both auth tables and mark token as used
    await transaction(async (client) => {
      // Update auth.users
      await client?.query(
        'UPDATE auth.users SET encrypted_password = $1, updated_at = NOW() WHERE id = $2',
        [hashedPassword, userId]
      );
      
      // Update local auth_users
      const authCheck = await client?.query('SELECT id FROM auth_users WHERE id = $1', [userId]);
      if (authCheck?.rows?.length === 0) {
        await client?.query(
          `INSERT INTO auth_users (id, email, encrypted_password, email_confirmed_at)
           SELECT $1, email, $2, NOW() FROM user_profiles WHERE id = $1`,
          [userId, hashedPassword]
        );
      } else {
        await client?.query(
          'UPDATE auth_users SET encrypted_password = $1, updated_at = NOW() WHERE id = $2',
          [hashedPassword, userId]
        );
      }
      
      // Update user_profiles - mark password as set
      await client?.query(
        `UPDATE user_profiles 
         SET password_set = true, updated_at = NOW()
         WHERE id = $1`,
        [userId]
      );

      // Mark the token as used
      await client?.query(
        `UPDATE password_reset_tokens SET used = TRUE WHERE id = $1`,
        [tokenRow.id]
      );

      // Log the action
      try {
        await client?.query(
          `INSERT INTO audit_trail (user_id, action, details) VALUES ($1, 'password_reset_via_token', $2)`,
          [userId, JSON.stringify({ timestamp: new Date() })]
        );
      } catch (auditErr) {
        console.error('Audit trail insert failed:', auditErr?.message);
      }
    });
    
    res?.json({ message: 'Password has been set successfully. You can now sign in.' });
  } catch (error) {
    console.error('Password reset error:', error);
    res?.status(500)?.json({ error: 'Password reset failed' });
  }
});

// Validate reset token (check if token is valid without using it)
router?.get('/validate-reset-token', async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res?.status(400)?.json({ valid: false, error: 'Token is required' });
    }

    const tokenResult = await query(
      `SELECT prt.id, prt.user_id, prt.expires_at, prt.used, up.full_name, up.email
       FROM password_reset_tokens prt
       JOIN user_profiles up ON up.id = prt.user_id
       WHERE prt.token = $1`,
      [token]
    );

    if (tokenResult?.rows?.length === 0) {
      return res?.json({ valid: false, error: 'Invalid reset link.' });
    }

    const row = tokenResult.rows[0];

    if (row.used) {
      return res?.json({ valid: false, error: 'This reset link has already been used.' });
    }

    if (new Date(row.expires_at) < new Date()) {
      return res?.json({ valid: false, error: 'This reset link has expired.' });
    }

    res?.json({
      valid: true,
      user: { full_name: row.full_name, email: row.email },
    });
  } catch (error) {
    console.error('Validate reset token error:', error);
    res?.status(500)?.json({ valid: false, error: 'Validation failed' });
  }
});

// Get current user
router?.get('/me', verifyToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, email, full_name, role, phone_number, permissions, created_at
       FROM user_profiles WHERE id = $1`,
      [req?.user?.id]
    );
    
    if (result?.rows?.length === 0) {
      return res?.status(404)?.json({ error: 'User not found' });
    }
    
    res?.json(result?.rows?.[0]);
  } catch (error) {
    console.error('Get user error:', error);
    res?.status(500)?.json({ error: 'Failed to get user' });
  }
});



// Logout (client-side token removal, but we can log it)
router?.post('/logout', verifyToken, async (req, res) => {
  try {
    await query(
      `INSERT INTO audit_trail (user_id, action, details)
       VALUES ($1, 'logout', $2)`,
      [req?.user?.id, JSON.stringify({ timestamp: new Date() })]
    );
    
    res?.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res?.status(500)?.json({ error: 'Logout failed' });
  }
});

module.exports = router;