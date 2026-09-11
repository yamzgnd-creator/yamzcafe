const express = require('express');
const router = express?.Router();
const bcrypt = require('bcryptjs');
const { query, transaction } = require('../config/database');
const { verifyToken, requireRole } = require('../middleware/auth');
const { sendWelcomeEmail } = require('../services/emailService');

// Default permissions templates by role - mirrors frontend userPermissionService
function getDefaultPermissionsByRole(role) {
  const templates = {
    staff: {
      pos: { processTransactions: true, processRefunds: true, voidTransactions: true, applyDiscounts: true, overridePrice: true, accessOfflineMode: true },
      students: { viewAccounts: true, modifyBalances: true, viewTransactionHistory: true, exportStudentData: true, manageStudentAccounts: true },
      reports: { viewDailyReports: true, viewSalesReports: true, exportReports: true, viewFinancialReports: true },
      system: { accessSettings: false, manageUsers: false, viewAuditLogs: true, manageMenuItems: true, manageInventory: true },
      preOrders: { viewPreOrders: true, fulfillPreOrders: true, cancelPreOrders: true, exportPreOrderReports: true }
    },
    cashier: {
      pos: { processTransactions: true, processRefunds: false, voidTransactions: false, applyDiscounts: false, overridePrice: false, accessOfflineMode: false },
      students: { viewAccounts: true, modifyBalances: false, viewTransactionHistory: true, exportStudentData: false, manageStudentAccounts: false },
      reports: { viewDailyReports: false, viewSalesReports: false, exportReports: false, viewFinancialReports: false },
      system: { accessSettings: false, manageUsers: false, viewAuditLogs: false, manageMenuItems: false, manageInventory: false },
      preOrders: { viewPreOrders: true, fulfillPreOrders: true, cancelPreOrders: false, exportPreOrderReports: false }
    },
    parent: {
      students: { viewOwnChildrenAccounts: true, addFundsToChildren: true, viewChildrenTransactionHistory: true, setSpendingLimits: true, manageDietaryRestrictions: true },
      preOrders: { createPreOrders: true, viewPreOrders: true, cancelPreOrders: true, modifyPreOrders: true },
      notifications: { receiveBalanceAlerts: true, receiveTransactionNotifications: true, receiveDietaryAlerts: true, configureNotificationPreferences: true },
      reports: { viewChildrenSpendingReports: true, exportChildrenData: true, viewNutritionSummary: true }
    },
    student: {
      account: { viewOwnBalance: true, viewOwnTransactionHistory: true, viewOwnDietaryRestrictions: true },
      preOrders: { viewOwnPreOrders: true },
      menu: { viewMenu: true, viewNutritionInfo: true }
    },
    admin: {}
  };
  return templates[role] || {};
}

// Get all users
router?.get('/', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { role, search } = req?.query;
    
    let queryText = 'SELECT * FROM user_profiles WHERE 1=1';
    const params = [];
    let paramCount = 1;
    
    if (role) {
      queryText += ` AND role = $${paramCount}`;
      params?.push(role);
      paramCount++;
    }
    
    if (search) {
      queryText += ` AND (full_name ILIKE $${paramCount} OR email ILIKE $${paramCount})`;
      params?.push(`%${search}%`);
      paramCount++;
    }
    
    queryText += ' ORDER BY created_at DESC';
    
    const result = await query(queryText, params);
    res?.json(result?.rows);
  } catch (error) {
    console.error('Get users error:', error);
    res?.status(500)?.json({ error: 'Failed to fetch users' });
  }
});

// Create user (admin only)
router?.post('/', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { full_name, email, password, role, phone_number } = req?.body;

    // Validate required fields
    if (!full_name || !email || !role) {
      return res?.status(400)?.json({ error: 'Full name, email, and role are required' });
    }

    const validRoles = ['admin', 'staff', 'cashier', 'parent', 'student'];
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
      password_set: !isParentAccount
    });

    // Create user in transaction
    const result = await transaction(async (client) => {
      // Generate a new UUID for the user
      const idResult = await client?.query('SELECT gen_random_uuid() as id');
      const userId = idResult?.rows?.[0]?.id;

      // Try to insert into auth.users (Supabase-style) - optional, may not exist on all setups
      try {
        await client?.query(
          `INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, role, aud, instance_id, raw_user_meta_data)
           VALUES ($1, $2, $3, NOW(), NOW(), NOW(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', $4::jsonb)`,
          [userId, email?.toLowerCase(), hashedPassword, metadata]
        );
      } catch (authErr) {
        console.log('Note: auth.users insert skipped:', authErr?.message);
      }

      // Insert into local auth_users table (used by login query)
      await client?.query(
        `INSERT INTO auth_users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW(), NOW())`,
        [userId, email?.toLowerCase(), hashedPassword]
      );

      // Assign default permissions based on role
      const defaultPermissions = getDefaultPermissionsByRole(role);

      // Insert into user_profiles (or update if trigger already created it)
      await client?.query(
        `INSERT INTO user_profiles (id, email, full_name, role, phone_number, account_status, password_set, permissions, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'active', true, $6::jsonb, NOW(), NOW())
         ON CONFLICT (id) DO UPDATE SET
           full_name = COALESCE($3, user_profiles.full_name),
           role = COALESCE($4, user_profiles.role),
           phone_number = COALESCE($5, user_profiles.phone_number),
           account_status = 'active',
           password_set = true,
           permissions = COALESCE($6::jsonb, user_profiles.permissions),
           updated_at = NOW()`,
        [userId, email?.toLowerCase(), full_name, role, phone_number || null, JSON.stringify(defaultPermissions)]
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

    res?.status(201)?.json(result);
  } catch (error) {
    console.error('Create user error:', error);
    res?.status(500)?.json({ error: 'Failed to create user' });
  }
});

// ─── Parent-Accessible Guardian Management ───────────────────────────────────
// IMPORTANT: These /child/... routes MUST be defined BEFORE the /:id route,
// otherwise Express matches "child" as an :id parameter and returns 404.

// GET /api/users/child/:studentId/guardians - Get all guardians linked to a child
// Parents can only view guardians for their own children
router?.get('/child/:studentId/guardians', verifyToken, async (req, res) => {
  try {
    const { studentId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    // If not admin/staff, verify the requesting parent is linked to this child
    if (userRole !== 'admin' && userRole !== 'staff') {
      const parentCheck = await query(
        'SELECT id FROM parent_students WHERE parent_id = $1 AND student_id = $2',
        [userId, studentId]
      );
      if (parentCheck?.rows?.length === 0) {
        return res.status(403).json({ error: 'You are not authorized to view guardians for this child' });
      }
    }

    // Get all guardians linked to this student
    const result = await query(
      `SELECT ps.id as link_id, ps.relationship, ps.created_at as linked_at,
              up.id, up.full_name, up.email, up.phone_number
       FROM parent_students ps
       JOIN user_profiles up ON ps.parent_id = up.id
       WHERE ps.student_id = $1
       ORDER BY ps.created_at`,
      [studentId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get child guardians error:', error);
    res.status(500).json({ error: 'Failed to fetch guardians' });
  }
});

// POST /api/users/child/:studentId/guardians - Add a guardian to a child by email
// If the email doesn't exist, automatically create a parent account
router?.post('/child/:studentId/guardians', verifyToken, async (req, res) => {
  try {
    const { studentId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;
    const { email, relationship, full_name } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Guardian email is required' });
    }

    // If not admin/staff, verify the requesting parent is linked to this child
    if (userRole !== 'admin' && userRole !== 'staff') {
      const parentCheck = await query(
        'SELECT id FROM parent_students WHERE parent_id = $1 AND student_id = $2',
        [userId, studentId]
      );
      if (parentCheck?.rows?.length === 0) {
        return res.status(403).json({ error: 'You are not authorized to add guardians for this child' });
      }
    }

    // Verify student exists
    const studentCheck = await query(
      "SELECT id, full_name FROM user_profiles WHERE id = $1 AND role = 'student'",
      [studentId]
    );
    if (studentCheck?.rows?.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const guardianEmail = email.trim().toLowerCase();
    let guardian = null;
    let accountCreated = false;

    // Look up the guardian by email
    const guardianLookup = await query(
      "SELECT id, full_name, email, role FROM user_profiles WHERE email = $1",
      [guardianEmail]
    );

    if (guardianLookup?.rows?.length > 0) {
      guardian = guardianLookup.rows[0];

      // The guardian must have a parent role
      if (guardian.role !== 'parent') {
        return res.status(400).json({ error: 'The user found is not a parent account. Only parent accounts can be added as guardians.' });
      }
    } else {
      // Email not found in user_profiles — check if it already exists in auth.users
      // (could happen if a previous account creation partially succeeded or the user was created via another flow)
      const guardianName = full_name?.trim() || guardianEmail.split('@')[0];
      const tempPassword = `Parent${Math.random().toString(36).slice(-8)}!`;
      const hashedPassword = await bcrypt.hash(tempPassword, 10);

      const newUser = await transaction(async (client) => {
        // First check if email already exists in auth.users
        let existingAuthUser = null;
        try {
          const authCheck = await client.query(
            `SELECT id FROM auth.users WHERE email = $1`,
            [guardianEmail]
          );
          if (authCheck?.rows?.length > 0) {
            existingAuthUser = authCheck.rows[0];
          }
        } catch (authCheckErr) {
          // auth.users table might not exist in all setups, ignore
          console.log('Note: Could not check auth.users table:', authCheckErr.message);
        }

        // Also check local auth_users table
        let existingLocalAuth = null;
        try {
          const localAuthCheck = await client.query(
            `SELECT id FROM auth_users WHERE email = $1`,
            [guardianEmail]
          );
          if (localAuthCheck?.rows?.length > 0) {
            existingLocalAuth = localAuthCheck.rows[0];
          }
        } catch (_) { /* ignore */ }

        let userId;

        if (existingAuthUser) {
          // Auth account exists — use its ID
          userId = existingAuthUser.id;
          console.log(`Found existing auth.users account for ${guardianEmail} with id ${userId}`);

          // Ensure local auth_users entry exists too
          if (!existingLocalAuth) {
            try {
              await client.query(
                `INSERT INTO auth_users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
                 VALUES ($1, $2, $3, NOW(), NOW(), NOW())
                 ON CONFLICT (id) DO NOTHING`,
                [userId, guardianEmail, hashedPassword]
              );
            } catch (_) { /* ignore if already exists */ }
          }

          // Check if user_profiles entry exists for this ID
          const profileCheck = await client.query(
            `SELECT id, full_name, email, role FROM user_profiles WHERE id = $1`,
            [userId]
          );

          if (profileCheck?.rows?.length > 0) {
            // Profile exists but maybe with different email or role — update to parent role
            if (profileCheck.rows[0].role !== 'parent') {
              await client.query(
                `UPDATE user_profiles SET role = 'parent', full_name = COALESCE(full_name, $2), account_status = 'active', updated_at = NOW() WHERE id = $1`,
                [userId, guardianName]
              );
            }
            const updatedProfile = await client.query(
              `SELECT id, full_name, email, role FROM user_profiles WHERE id = $1`,
              [userId]
            );
            return updatedProfile.rows[0];
          } else {
            // No profile exists — create one
            await client.query(
              `INSERT INTO user_profiles (id, email, full_name, role, account_status, password_set, created_at, updated_at)
               VALUES ($1, $2, $3, 'parent', 'active', false, NOW(), NOW())`,
              [userId, guardianEmail, guardianName]
            );
            const newProfile = await client.query(
              `SELECT id, full_name, email, role FROM user_profiles WHERE id = $1`,
              [userId]
            );
            return newProfile.rows[0];
          }
        } else if (existingLocalAuth) {
          // Only local auth exists (no auth.users) — use that ID
          userId = existingLocalAuth.id;
          console.log(`Found existing auth_users account for ${guardianEmail} with id ${userId}`);

          // Ensure user_profiles exists
          const profileCheck = await client.query(
            `SELECT id, full_name, email, role FROM user_profiles WHERE id = $1`,
            [userId]
          );
          if (profileCheck?.rows?.length > 0) {
            if (profileCheck.rows[0].role !== 'parent') {
              await client.query(
                `UPDATE user_profiles SET role = 'parent', full_name = COALESCE(full_name, $2), account_status = 'active', updated_at = NOW() WHERE id = $1`,
                [userId, guardianName]
              );
            }
            const updatedProfile = await client.query(
              `SELECT id, full_name, email, role FROM user_profiles WHERE id = $1`,
              [userId]
            );
            return updatedProfile.rows[0];
          } else {
            await client.query(
              `INSERT INTO user_profiles (id, email, full_name, role, account_status, password_set, created_at, updated_at)
               VALUES ($1, $2, $3, 'parent', 'active', false, NOW(), NOW())`,
              [userId, guardianEmail, guardianName]
            );
            const newProfile = await client.query(
              `SELECT id, full_name, email, role FROM user_profiles WHERE id = $1`,
              [userId]
            );
            return newProfile.rows[0];
          }
        } else {
          // No account exists anywhere — create fresh
          const metadata = JSON.stringify({
            full_name: guardianName,
            role: 'parent',
            phone_number: null,
            secondary_phone: null,
            password_set: false,
          });

          const authResult = await client.query(
            `INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, role, aud, instance_id, raw_user_meta_data)
             VALUES (gen_random_uuid(), $1, $2, NOW(), NOW(), NOW(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', $3::jsonb)
             RETURNING id`,
            [guardianEmail, hashedPassword, metadata]
          );
          const newId = authResult.rows[0].id;

          // Also insert into local auth_users table
          await client.query(
            `INSERT INTO auth_users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
             VALUES ($1, $2, $3, NOW(), NOW(), NOW())`,
            [newId, guardianEmail, hashedPassword]
          );

          // Update user_profiles (trigger may have created it) or create it
          await client.query(
            `INSERT INTO user_profiles (id, email, full_name, role, account_status, password_set, created_at, updated_at)
             VALUES ($1, $2, $3, 'parent', 'active', false, NOW(), NOW())
             ON CONFLICT (id) DO UPDATE SET role = 'parent', full_name = COALESCE(user_profiles.full_name, $3), account_status = 'active', updated_at = NOW()`,
            [newId, guardianEmail, guardianName]
          );

          const profileResult = await client.query(
            `SELECT id, full_name, email, role FROM user_profiles WHERE id = $1`,
            [newId]
          );
          return profileResult.rows[0];
        }
      });

      guardian = newUser;
      accountCreated = true;

      // Send welcome email asynchronously (don't block response)
      try {
        // Build a simple base URL for password reset
        const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
        const host = req.headers['x-forwarded-host'] || req.headers.host;
        const baseUrl = `${protocol}://${host}`;

        // Try to create a password reset token so the welcome email includes a setup link
        const crypto = require('crypto');
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenHash = await bcrypt.hash(resetToken, 10);
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

        await query(
          `INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)`,
          [guardian.id, resetToken, expiresAt]
        );

        const resetLink = `${baseUrl}/reset-password?token=${resetToken}`;

        // Get company name
        let companyName = 'School Cafe';
        try {
          const companyResult = await query('SELECT * FROM company_settings ORDER BY created_at DESC LIMIT 1');
          if (companyResult?.rows?.length > 0) {
            companyName = companyResult.rows[0].company_name || companyName;
          }
        } catch (_) { /* ignore */ }

        sendWelcomeEmail({
          email: guardianEmail,
          fullName: guardian.full_name,
          role: 'parent',
          resetLink,
          companyName,
        }).then(() => {
          console.log(`📧 Welcome email sent to new guardian ${guardianEmail}`);
        }).catch((emailErr) => {
          console.error(`⚠️  Failed to send welcome email to ${guardianEmail}:`, emailErr.message);
        });
      } catch (emailSetupErr) {
        console.error('⚠️  Failed to set up welcome email for guardian:', emailSetupErr.message);
      }
    }

    // Cannot add yourself
    if (guardian.id === userId) {
      return res.status(400).json({ error: 'You are already linked to this child' });
    }

    // Check if link already exists
    const existingLink = await query(
      'SELECT id FROM parent_students WHERE parent_id = $1 AND student_id = $2',
      [guardian.id, studentId]
    );
    if (existingLink?.rows?.length > 0) {
      return res.status(409).json({ error: 'This guardian is already linked to this child' });
    }

    // Create the link
    const result = await query(
      `INSERT INTO parent_students (parent_id, student_id, relationship)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [guardian.id, studentId, relationship || 'guardian']
    );

    // Log the action
    try {
      await query(
        `INSERT INTO audit_trail (user_id, action, details) VALUES ($1, 'parent_add_guardian', $2)`,
        [userId, JSON.stringify({
          added_by: userId,
          guardian_id: guardian.id,
          guardian_email: guardian.email,
          student_id: studentId,
          relationship: relationship || 'guardian',
          account_created: accountCreated,
          timestamp: new Date().toISOString(),
        })]
      );
    } catch (auditErr) {
      console.error('Audit log warning:', auditErr.message);
    }

    res.status(201).json({
      link_id: result.rows[0].id,
      id: guardian.id,
      full_name: guardian.full_name,
      email: guardian.email,
      relationship: result.rows[0].relationship,
      linked_at: result.rows[0].created_at,
      account_created: accountCreated,
    });
  } catch (error) {
    console.error('Add guardian error:', error);
    if (error?.code === '23505') {
      return res.status(409).json({ error: 'This guardian is already linked to this child' });
    }
    res.status(500).json({ error: 'Failed to add guardian' });
  }
});

// DELETE /api/users/child/:studentId/guardians/:linkId - Remove a guardian from a child
// Parents can remove guardians from their own children (but not themselves)
router?.delete('/child/:studentId/guardians/:linkId', verifyToken, async (req, res) => {
  try {
    const { studentId, linkId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    // If not admin/staff, verify the requesting parent is linked to this child
    if (userRole !== 'admin' && userRole !== 'staff') {
      const parentCheck = await query(
        'SELECT id FROM parent_students WHERE parent_id = $1 AND student_id = $2',
        [userId, studentId]
      );
      if (parentCheck?.rows?.length === 0) {
        return res.status(403).json({ error: 'You are not authorized to manage guardians for this child' });
      }
    }

    // Get the link to verify it belongs to this student and it's not the requesting user
    const linkCheck = await query(
      'SELECT * FROM parent_students WHERE id = $1 AND student_id = $2',
      [linkId, studentId]
    );
    if (linkCheck?.rows?.length === 0) {
      return res.status(404).json({ error: 'Guardian link not found' });
    }

    // Parents cannot remove themselves (only admin can do that)
    if (userRole === 'parent' && linkCheck.rows[0].parent_id === userId) {
      return res.status(400).json({ error: 'You cannot remove yourself as a guardian. Contact an administrator.' });
    }

    // Delete the link
    await query('DELETE FROM parent_students WHERE id = $1', [linkId]);

    // Log the action
    try {
      await query(
        `INSERT INTO audit_trail (user_id, action, details) VALUES ($1, 'parent_remove_guardian', $2)`,
        [userId, JSON.stringify({
          removed_by: userId,
          link_id: linkId,
          guardian_id: linkCheck.rows[0].parent_id,
          student_id: studentId,
          timestamp: new Date().toISOString(),
        })]
      );
    } catch (auditErr) {
      console.error('Audit log warning:', auditErr.message);
    }

    res.json({ message: 'Guardian removed successfully' });
  } catch (error) {
    console.error('Remove guardian error:', error);
    res.status(500).json({ error: 'Failed to remove guardian' });
  }
});

// ─── Generic User Routes (must come AFTER specific /child/... routes) ────────

// Get user by ID
router?.get('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req?.params;
    
    const result = await query(
      'SELECT * FROM user_profiles WHERE id = $1',
      [id]
    );
    
    if (result?.rows?.length === 0) {
      return res?.status(404)?.json({ error: 'User not found' });
    }
    
    res?.json(result?.rows?.[0]);
  } catch (error) {
    console.error('Get user error:', error);
    res?.status(500)?.json({ error: 'Failed to fetch user' });
  }
});

// Update user
router?.put('/:id', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req?.params;
    const { 
      full_name, name, role, phone, phone_number, secondary_phone,
      permissions, grade, homeroom, balance, meal_program, 
      account_status, spending_limit, photo, photo_alt
    } = req?.body;
    
    const userName = full_name || name;
    const userPhone = phone_number || phone;
    
    // Ensure permissions is properly serialized as JSON for the jsonb column
    const permissionsJson = permissions !== undefined && permissions !== null 
      ? (typeof permissions === 'string' ? permissions : JSON.stringify(permissions))
      : null;
    
    const result = await query(
      `UPDATE user_profiles SET
        full_name = COALESCE($1, full_name),
        role = COALESCE($2, role),
        phone_number = COALESCE($3, phone_number),
        permissions = COALESCE($4::jsonb, permissions),
        secondary_phone = COALESCE($5, secondary_phone),
        grade = COALESCE($6, grade),
        homeroom = COALESCE($7, homeroom),
        balance = COALESCE($8, balance),
        meal_program = COALESCE($9, meal_program),
        account_status = COALESCE($10, account_status),
        spending_limit = COALESCE($11, spending_limit),
        photo = COALESCE($12, photo),
        photo_alt = COALESCE($13, photo_alt),
        updated_at = NOW()
      WHERE id = $14
      RETURNING *`,
      [userName, role, userPhone, permissionsJson, secondary_phone, grade, homeroom, balance, meal_program, account_status, spending_limit, photo, photo_alt, id]
    );
    
    if (result?.rows?.length === 0) {
      return res?.status(404)?.json({ error: 'User not found' });
    }
    
    // Log permission changes in audit trail
    if (permissions !== undefined) {
      try {
        await query(
          `INSERT INTO audit_trail (user_id, action, details) VALUES ($1, 'update_permissions', $2)`,
          [req?.user?.id, JSON.stringify({ 
            target_user_id: id, 
            new_permissions: permissions,
            timestamp: new Date().toISOString()
          })]
        );
      } catch (auditErr) {
        console.error('Audit trail insert failed:', auditErr?.message);
      }
    }
    
    res?.json(result?.rows?.[0]);
  } catch (error) {
    console.error('Update user error:', error);
    res?.status(500)?.json({ error: 'Failed to update user' });
  }
});

// Delete user
router?.delete('/:id', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req?.params;
    
    await transaction(async (client) => {
      // Remove parent-student links
      await client?.query('DELETE FROM parent_students WHERE parent_id = $1 OR student_id = $1', [id]);
      
      // Remove notifications
      await client?.query('DELETE FROM notifications WHERE user_id = $1', [id]);
      
      // Delete user profile
      const result = await client?.query(
        'DELETE FROM user_profiles WHERE id = $1 RETURNING id',
        [id]
      );
      
      if (result?.rows?.length === 0) {
        throw new Error('User not found');
      }
      
      // Delete auth user
      await client?.query('DELETE FROM auth_users WHERE id = $1', [id]);
      
      // Log the action
      await client?.query(
        `INSERT INTO audit_trail (user_id, action, details) VALUES ($1, 'delete_user', $2)`,
        [req?.user?.id, JSON.stringify({ deleted_user_id: id, timestamp: new Date() })]
      );
    });
    
    res?.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    if (error?.message === 'User not found') {
      return res?.status(404)?.json({ error: 'User not found' });
    }
    res?.status(500)?.json({ error: 'Failed to delete user' });
  }
});

// Unlock user account
router?.post('/:id/unlock', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req?.params;
    
    const result = await query(
      `UPDATE user_profiles SET 
        is_locked = false, 
        locked_until = NULL, 
        failed_login_attempts = 0,
        updated_at = NOW()
      WHERE id = $1
      RETURNING id, full_name, email`,
      [id]
    );
    
    if (result?.rows?.length === 0) {
      return res?.status(404)?.json({ error: 'User not found' });
    }
    
    // Log the action
    await query(
      `INSERT INTO audit_trail (user_id, action, details) VALUES ($1, 'unlock_account', $2)`,
      [req?.user?.id, JSON.stringify({ unlocked_user_id: id, timestamp: new Date() })]
    );
    
    res?.json({ 
      success: true, 
      message: `Account unlocked for ${result?.rows?.[0]?.full_name}`,
      user: result?.rows?.[0]
    });
  } catch (error) {
    console.error('Unlock account error:', error);
    res?.status(500)?.json({ error: 'Failed to unlock account' });
  }
});

// Link parent to student (admin only)
router?.post('/link-parent-student', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { parentId, studentId, relationship } = req?.body;
    
    if (!parentId || !studentId) {
      return res?.status(400)?.json({ error: 'Parent ID and Student ID are required' });
    }
    
    // Verify parent exists and has parent role
    const parentCheck = await query(
      'SELECT id, role FROM user_profiles WHERE id = $1',
      [parentId]
    );
    if (parentCheck?.rows?.length === 0) {
      return res?.status(404)?.json({ error: 'Parent not found' });
    }
    if (parentCheck?.rows?.[0]?.role !== 'parent') {
      return res?.status(400)?.json({ error: 'User is not a parent' });
    }
    
    // Verify student exists and has student role
    const studentCheck = await query(
      'SELECT id, role FROM user_profiles WHERE id = $1',
      [studentId]
    );
    if (studentCheck?.rows?.length === 0) {
      return res?.status(404)?.json({ error: 'Student not found' });
    }
    if (studentCheck?.rows?.[0]?.role !== 'student') {
      return res?.status(400)?.json({ error: 'User is not a student' });
    }
    
    // Check if link already exists
    const existingLink = await query(
      'SELECT id FROM parent_students WHERE parent_id = $1 AND student_id = $2',
      [parentId, studentId]
    );
    if (existingLink?.rows?.length > 0) {
      return res?.status(409)?.json({ error: 'This parent is already linked to this student' });
    }
    
    // Create the link
    const result = await query(
      `INSERT INTO parent_students (parent_id, student_id, relationship)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [parentId, studentId, relationship || 'parent']
    );
    
    // Log the action
    await query(
      `INSERT INTO audit_trail (user_id, action, details) VALUES ($1, 'link_parent_student', $2)`,
      [req?.user?.id, JSON.stringify({ parent_id: parentId, student_id: studentId, relationship })]
    );
    
    res?.status(201)?.json(result?.rows?.[0]);
  } catch (error) {
    console.error('Link parent-student error:', error);
    if (error?.code === '23505') {
      return res?.status(409)?.json({ error: 'This parent is already linked to this student' });
    }
    res?.status(500)?.json({ error: 'Failed to link parent to student' });
  }
});

// Unlink parent from student (admin only)
router?.delete('/unlink-parent-student/:linkId', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { linkId } = req?.params;
    
    const result = await query(
      'DELETE FROM parent_students WHERE id = $1 RETURNING *',
      [linkId]
    );
    
    if (result?.rows?.length === 0) {
      return res?.status(404)?.json({ error: 'Link not found' });
    }
    
    // Log the action
    await query(
      `INSERT INTO audit_trail (user_id, action, details) VALUES ($1, 'unlink_parent_student', $2)`,
      [req?.user?.id, JSON.stringify({ link_id: linkId, parent_id: result?.rows?.[0]?.parent_id, student_id: result?.rows?.[0]?.student_id })]
    );
    
    res?.json({ message: 'Parent-student link removed successfully' });
  } catch (error) {
    console.error('Unlink parent-student error:', error);
    res?.status(500)?.json({ error: 'Failed to unlink parent from student' });
  }
});

module.exports = router;