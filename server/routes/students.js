const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { query, transaction } = require('../config/database');
const { verifyToken, requireRole, requirePermission } = require('../middleware/auth');
const { sendWelcomeEmail } = require('../services/emailService');

// ── Helper: get base URL from request ──
function getBaseUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

// ── Helper: get company name from system config ──
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

// ── Helper: create a password reset token and return the full reset URL ──
async function createResetTokenForUser(userId, baseUrl) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  await query(
    `INSERT INTO password_reset_tokens (user_id, token, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, token, expiresAt]
  );

  return `${baseUrl}/reset-password?token=${token}`;
}

// ── Helper: send welcome email to a newly created parent (async, non-blocking) ──
function sendParentWelcomeEmailAsync(parentUserId, parentEmail, parentName, req) {
  const baseUrl = getBaseUrl(req);

  // Create reset token then send welcome email
  createResetTokenForUser(parentUserId, baseUrl)
    .then(async (resetLink) => {
      const companyName = await getCompanyName();
      return sendWelcomeEmail({
        email: parentEmail,
        fullName: parentName,
        role: 'parent',
        resetLink,
        companyName,
      });
    })
    .then(() => {
      console.log(`📧 Parent welcome email sent to ${parentEmail}`);
    })
    .catch((emailErr) => {
      console.error(`⚠️  Failed to send parent welcome email to ${parentEmail}:`, emailErr.message);
    });
}

// Ensure parent_guardian column exists
(async () => {
  try {
    await query(`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS parent_guardian TEXT`);
    await query(`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS homeroom TEXT`);
    await query(`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS meal_program TEXT DEFAULT 'standard'`);
    await query(`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS spending_limit NUMERIC(10,2)`);
    await query(`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS parent_email_address TEXT`);
  } catch (err) {
    console.error('Column migration warning:', err.message);
  }
})();

// ─── Grade Promotion ─────────────────────────────────────────────────────────
// NOTE: These routes MUST be defined BEFORE /:id to avoid Express matching
// "grade-summary" or "promote-grades" as an :id parameter.

// Grade mapping: current grade → next grade
const GRADE_ORDER = ['Pre-K', 'K', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th', '12th'];

// Parallel numeric order for DB storage consistency
const GRADE_NUMERIC = ['Pre-K', 'K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

// Build a flexible lookup that handles various formats
function normalizeGrade(grade) {
  if (!grade) return null;
  const g = grade.trim();
  const lower = g.toLowerCase();

  // Direct match in GRADE_ORDER
  if (GRADE_ORDER.includes(g)) return g;

  // Handle numeric-only grades: "1" → "1st", "2" → "2nd", etc.
  const num = parseInt(g, 10);
  if (!isNaN(num) && num >= 1 && num <= 12) {
    const suffixes = { 1: '1st', 2: '2nd', 3: '3rd' };
    return suffixes[num] || `${num}th`;
  }

  // Handle lowercase/case variations
  for (const ordered of GRADE_ORDER) {
    if (ordered.toLowerCase() === lower) return ordered;
  }

  // Handle "pre-k" variations
  if (lower === 'pre-k' || lower === 'prek' || lower === 'pre k') return 'Pre-K';
  if (lower === 'k' || lower === 'kindergarten') return 'K';

  return null; // Unknown grade
}

// Get the next grade in the same format as the input
// e.g., "6" → "7", "6th" → "7th", "K" → "1" or "1st" depending on input style
function getNextGrade(currentGrade) {
  if (!currentGrade) return null;
  const g = currentGrade.trim();
  const normalized = normalizeGrade(g);
  if (!normalized) return null;
  const idx = GRADE_ORDER.indexOf(normalized);
  if (idx === -1 || idx >= GRADE_ORDER.length - 1) return null; // Already at max or unknown

  // Determine if the input was in numeric format (e.g., "6", "7")
  const num = parseInt(g, 10);
  const isNumericFormat = (!isNaN(num) && num >= 1 && num <= 12 && g === String(num));

  if (isNumericFormat) {
    // Return next grade in numeric format
    return GRADE_NUMERIC[idx + 1];
  }

  // Return next grade in suffixed format
  return GRADE_ORDER[idx + 1];
}

// GET /api/students/grade-summary - Count of students per grade level
router.get('/grade-summary', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const result = await query(`
      SELECT grade, COUNT(*)::int as count
      FROM user_profiles
      WHERE role = 'student' AND account_status = 'active'
      GROUP BY grade
      ORDER BY grade
    `);

    // Also return ordered summary with normalized grades
    const summary = [];
    const rawCounts = {};
    for (const row of result.rows) {
      rawCounts[row.grade || 'Unassigned'] = row.count;
    }

    // Build ordered summary
    for (const g of GRADE_ORDER) {
      // Check for exact match or normalized match
      let count = 0;
      for (const [rawGrade, rawCount] of Object.entries(rawCounts)) {
        if (normalizeGrade(rawGrade) === g) {
          count += rawCount;
        }
      }
      if (count > 0) {
        summary.push({ grade: g, count });
      }
    }

    // Add unassigned/unknown grades
    let unassignedCount = 0;
    for (const [rawGrade, rawCount] of Object.entries(rawCounts)) {
      if (!normalizeGrade(rawGrade)) {
        unassignedCount += rawCount;
      }
    }
    if (unassignedCount > 0) {
      summary.push({ grade: 'Unassigned', count: unassignedCount });
    }

    res.json({ summary, raw: rawCounts });
  } catch (error) {
    console.error('Grade summary error:', error);
    res.status(500).json({ error: 'Failed to fetch grade summary' });
  }
});

// POST /api/students/promote-grades - Bulk promote students to next grade
router.post('/promote-grades', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { graduating_grade, graduating_action, selected_grades } = req.body;
    const dryRun = req.query.dry_run === 'true';

    // Normalize selected_grades for filtering (if provided)
    const normalizedSelectedGrades = Array.isArray(selected_grades) && selected_grades.length > 0
      ? selected_grades.map(g => normalizeGrade(g)).filter(Boolean)
      : null; // null means all grades

    // Get all active students with grades
    const studentsResult = await query(`
      SELECT id, full_name, student_id, grade
      FROM user_profiles
      WHERE role = 'student' AND account_status = 'active' AND grade IS NOT NULL AND grade != ''
      ORDER BY grade, full_name
    `);

    const students = studentsResult.rows;
    const promotions = [];
    const graduatingStudents = [];
    const skipped = [];

    const normalizedGraduatingGrade = graduating_grade ? normalizeGrade(graduating_grade) : null;

    for (const student of students) {
      const normalized = normalizeGrade(student.grade);

      if (!normalized) {
        skipped.push({
          id: student.id,
          student_id: student.student_id,
          full_name: student.full_name,
          grade: student.grade,
          reason: 'Unrecognized grade format',
        });
        continue;
      }

      // If specific grades are selected, skip students not in those grades
      if (normalizedSelectedGrades && !normalizedSelectedGrades.includes(normalized)) {
        skipped.push({
          id: student.id,
          student_id: student.student_id,
          full_name: student.full_name,
          grade: student.grade,
          reason: 'Grade not selected for promotion',
        });
        continue;
      }

      // Check if this student is in the graduating grade
      if (normalizedGraduatingGrade && normalized === normalizedGraduatingGrade) {
        graduatingStudents.push({
          id: student.id,
          student_id: student.student_id,
          full_name: student.full_name,
          grade: student.grade,
          normalized_grade: normalized,
        });
        continue;
      }

      const nextGrade = getNextGrade(student.grade);
      if (!nextGrade) {
        // At the highest grade (12th) but not marked as graduating grade
        skipped.push({
          id: student.id,
          student_id: student.student_id,
          full_name: student.full_name,
          grade: student.grade,
          reason: 'Already at highest grade level',
        });
        continue;
      }

      promotions.push({
        id: student.id,
        student_id: student.student_id,
        full_name: student.full_name,
        from_grade: student.grade,
        to_grade: nextGrade,
      });
    }

    // If dry run, return preview without making changes
    if (dryRun) {
      return res.json({
        dry_run: true,
        total_students: students.length,
        to_promote: promotions.length,
        to_graduate: graduatingStudents.length,
        skipped: skipped.length,
        promotions,
        graduating: graduatingStudents,
        skipped_details: skipped,
      });
    }

    // Execute the promotions
    const results = await transaction(async (client) => {
      let promotedCount = 0;
      let graduatedCount = 0;
      const errors = [];

      // Promote students
      for (const promo of promotions) {
        try {
          await client.query(
            `UPDATE user_profiles SET grade = $1, updated_at = NOW() WHERE id = $2`,
            [promo.to_grade, promo.id]
          );
          promotedCount++;
        } catch (err) {
          errors.push({
            student_id: promo.student_id,
            full_name: promo.full_name,
            error: err.message,
          });
        }
      }

      // Handle graduating students
      if (graduating_action === 'archive' && graduatingStudents.length > 0) {
        // First, ensure the 'graduated' status is allowed by the CHECK constraint
        try {
          await client.query(`
            ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_account_status_check;
            ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_account_status_check
              CHECK (account_status = ANY (ARRAY['active', 'inactive', 'suspended', 'graduated']));
          `);
        } catch (constraintErr) {
          console.warn('Could not update account_status constraint (non-fatal):', constraintErr.message);
        }

        for (const grad of graduatingStudents) {
          try {
            await client.query(
              `UPDATE user_profiles SET account_status = 'graduated', updated_at = NOW() WHERE id = $1`,
              [grad.id]
            );
            graduatedCount++;
          } catch (err) {
            errors.push({
              student_id: grad.student_id,
              full_name: grad.full_name,
              error: err.message,
            });
          }
        }
      } else {
        graduatedCount = 0; // 'keep' action — no changes to graduating students
      }

      // Log to audit trail
      try {
        await client.query(
          `INSERT INTO audit_trail (user_id, action, details) VALUES ($1, $2, $3)`,
          [
            req.user.id,
            'bulk_grade_promotion',
            JSON.stringify({
              promoted: promotedCount,
              graduated: graduatedCount,
              graduating_grade: graduating_grade || null,
              graduating_action: graduating_action || null,
              skipped: skipped.length,
              errors: errors.length,
              timestamp: new Date().toISOString(),
            }),
          ]
        );
      } catch (auditErr) {
        console.error('Audit trail insert failed (non-fatal):', auditErr.message);
      }

      return { promotedCount, graduatedCount, errors };
    });

    res.json({
      dry_run: false,
      success: true,
      promoted: results.promotedCount,
      graduated: results.graduatedCount,
      skipped: skipped.length,
      errors: results.errors,
      promotions,
      graduating: graduatingStudents,
      skipped_details: skipped,
    });
  } catch (error) {
    console.error('Grade promotion error:', error);
    res.status(500).json({ error: 'Grade promotion failed: ' + error.message });
  }
});

// ─── End Grade Promotion ─────────────────────────────────────────────────────

// Get all students (with filters)
router.get('/', verifyToken, async (req, res) => {
  try {
    const { search, grade, status, parent_id } = req.query;
    
    // Aggregate all parents into a JSON array per student so multiple parents are returned.
    // Also keep the first parent's flat fields for backward compatibility.
    let queryText = `
      SELECT up.*,
        -- Backward-compatible: first linked parent flat fields
        (parents_agg.parents_arr->0->>'link_id') as link_id,
        (parents_agg.parents_arr->0->>'parent_id') as parent_id,
        (parents_agg.parents_arr->0->>'relationship') as relationship,
        (parents_agg.parents_arr->0->>'parent_name') as parent_name,
        (parents_agg.parents_arr->0->>'parent_email') as parent_email,
        -- Full parents array
        COALESCE(parents_agg.parents_arr, '[]'::jsonb) as parents
      FROM user_profiles up
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(
          jsonb_build_object(
            'link_id', ps.id,
            'parent_id', ps.parent_id,
            'relationship', ps.relationship,
            'parent_name', parent_up.full_name,
            'parent_email', parent_up.email,
            'parent_phone', parent_up.phone_number
          ) ORDER BY ps.created_at ASC
        ) as parents_arr
        FROM parent_students ps
        JOIN user_profiles parent_up ON ps.parent_id = parent_up.id
        WHERE ps.student_id = up.id
      ) parents_agg ON true
      WHERE up.role = 'student'
    `;
    const params = [];
    let paramCount = 1;
    
    if (search) {
      queryText += ` AND (up.full_name ILIKE $${paramCount} OR up.student_id ILIKE $${paramCount} OR up.email ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }
    
    if (grade) {
      queryText += ` AND up.grade = $${paramCount}`;
      params.push(grade);
      paramCount++;
    }
    
    if (status) {
      queryText += ` AND up.account_status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }
    
    if (parent_id) {
      const resolvedParentId = parent_id === 'me' ? req.user.id : parent_id;
      queryText += ` AND EXISTS (SELECT 1 FROM parent_students ps2 WHERE ps2.student_id = up.id AND ps2.parent_id = $${paramCount})`;
      params.push(resolvedParentId);
      paramCount++;
    }
    
    queryText += ' ORDER BY up.full_name';
    
    const result = await query(queryText, params);
    
    // Parse the parents JSON array for each row
    // PostgreSQL JSONB may come back as a parsed array, a JSON string, or null
    const rows = result.rows.map(row => {
      let parents = row.parents;
      if (typeof parents === 'string') {
        try { parents = JSON.parse(parents); } catch { parents = []; }
      }
      if (!Array.isArray(parents)) {
        parents = [];
      }
      return { ...row, parents };
    });
    
    res.json(rows);
  } catch (error) {
    console.error('Get students error:', error);
    res.status(500).json({ error: 'Failed to fetch students' });
  }
});

// Get student by ID
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req?.params;
    
    // Get student profile
    const studentResult = await query(
      `SELECT * FROM user_profiles WHERE id = $1`,
      [id]
    );
    
    if (studentResult?.rows?.length === 0) {
      return res?.status(404)?.json({ error: 'Student not found' });
    }
    
    const student = studentResult.rows[0];
    
    // Get all linked parents
    const parentsResult = await query(
      `SELECT ps.id as link_id, ps.parent_id, ps.relationship,
              parent_up.full_name as parent_name,
              parent_up.email as parent_email,
              parent_up.phone_number as parent_phone
       FROM parent_students ps
       JOIN user_profiles parent_up ON ps.parent_id = parent_up.id
       WHERE ps.student_id = $1
       ORDER BY ps.created_at ASC`,
      [id]
    );
    
    const parents = parentsResult.rows || [];
    const firstParent = parents[0] || {};
    
    // Return student with backward-compatible flat fields + full parents array
    res?.json({
      ...student,
      link_id: firstParent.link_id || null,
      parent_id: firstParent.parent_id || null,
      relationship: firstParent.relationship || null,
      parent_name: firstParent.parent_name || null,
      parent_email: firstParent.parent_email || null,
      parent_phone: firstParent.parent_phone || null,
      parents,
    });
  } catch (error) {
    console.error('Get student error:', error);
    res?.status(500)?.json({ error: 'Failed to fetch student' });
  }
});

// Get student dietary restrictions
router.get('/:id/dietary-restrictions', verifyToken, async (req, res) => {
  try {
    const { id } = req?.params;
    
    const result = await query(
      `SELECT dr.*, drt.name as restriction_name, drt.severity
       FROM dietary_restrictions dr
       JOIN dietary_restriction_templates drt ON dr.restriction_id = drt.id
       WHERE dr.student_id = $1
       ORDER BY drt.severity DESC`,
      [id]
    );
    
    res?.json(result?.rows);
  } catch (error) {
    console.error('Get dietary restrictions error:', error);
    res?.status(500)?.json({ error: 'Failed to fetch dietary restrictions' });
  }
});

// Create student
router.post('/', verifyToken, requireRole('admin', 'staff'), async (req, res) => {
  try {
    const {
      student_id,
      full_name,
      first_name,
      last_name,
      email,
      grade,
      homeroom,
      balance,
      meal_program,
      dietary_restrictions,
      allergies,
      account_status,
      photo,
      parent_guardian,
      parent_email_address,
      parent_id,
      status,
      notes,
    } = req?.body;

    // Support both full_name and first_name/last_name
    const resolvedName = full_name || (first_name && last_name ? `${first_name} ${last_name}` : first_name || '');

    if (!student_id || !resolvedName) {
      return res?.status(400)?.json({ error: 'Student ID and name are required' });
    }
    
    // Check if student_id already exists
    const existing = await query(
      "SELECT id FROM user_profiles WHERE student_id = $1 AND role = 'student'",
      [student_id]
    );
    
    if (existing?.rows?.length > 0) {
      return res?.status(409)?.json({ error: 'Student ID already exists' });
    }

    // Generate a placeholder email if none provided (email column is NOT NULL)
    const resolvedEmail = email || `student_${student_id}@placeholder.local`;

    // meal_program must be one of: 'paid', 'reduced', 'free'
    const validMealPrograms = ['paid', 'reduced', 'free'];
    const resolvedMealProgram = validMealPrograms.includes(meal_program) ? meal_program : 'paid';

    // user_profiles.id is a FK to auth.users.id, so we must create the auth user first.
    // The `handle_new_user` trigger on auth.users automatically creates a user_profiles row,
    // so we UPDATE the trigger-created profile instead of inserting a new one.
    const result = await transaction(async (client) => {
      // Pass student metadata via raw_user_meta_data so the trigger can use it
      const authResult = await client.query(
        `INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at, is_sso_user, is_anonymous)
         VALUES (gen_random_uuid(), $1, $2, NOW(), NOW(), false, false)
         RETURNING id`,
        [
          resolvedEmail,
          JSON.stringify({ full_name: resolvedName, role: 'student' }),
        ]
      );
      const newUserId = authResult.rows[0].id;

      // Update the profile that was auto-created by the handle_new_user trigger
      const profileResult = await client.query(
        `UPDATE user_profiles SET
          student_id = $2,
          full_name = $3,
          email = $4,
          role = 'student',
          grade = $5,
          homeroom = $6,
          balance = $7,
          meal_program = $8,
          account_status = $9,
          photo = $10,
          parent_guardian = $11,
          parent_email_address = $12,
          updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
        [
          newUserId,
          student_id,
          resolvedName,
          resolvedEmail,
          grade || null,
          homeroom || null,
          balance || 0,
          resolvedMealProgram,
          account_status || status || 'active',
          photo || null,
          parent_guardian || null,
          parent_email_address || null,
        ]
      );

      const studentProfile = profileResult.rows[0];

      // ── Create or find parent account and link to student ──
      let newParentCreated = null; // Track if we created a new parent (for email)
      if (parent_email_address) {
        let parentUserId = null;
        let isNewParent = false;
        const parentEmail = parent_email_address.toLowerCase().trim();
        const parentName = parent_guardian || parentEmail.split('@')[0];

        // Check if a parent with this email already exists in user_profiles
        const existingProfile = await client.query(
          `SELECT id FROM user_profiles WHERE email = $1`,
          [parentEmail]
        );

        if (existingProfile.rows.length > 0) {
          // Parent profile already exists — use their ID
          parentUserId = existingProfile.rows[0].id;
        } else {
          // Also check auth.users in case the email exists there but not in user_profiles
          const existingAuthUser = await client.query(
            `SELECT id FROM auth.users WHERE email = $1`,
            [parentEmail]
          );

          if (existingAuthUser.rows.length > 0) {
            // Auth user exists but profile may be missing or not set as parent
            parentUserId = existingAuthUser.rows[0].id;

            // Ensure user_profiles row exists and is set to parent role
            const profileCheck = await client.query(
              `SELECT id FROM user_profiles WHERE id = $1`,
              [parentUserId]
            );
            if (profileCheck.rows.length > 0) {
              await client.query(
                `UPDATE user_profiles SET
                  full_name = COALESCE(NULLIF(full_name, ''), $2),
                  role = 'parent',
                  account_status = 'active',
                  updated_at = NOW()
                WHERE id = $1`,
                [parentUserId, parentName]
              );
            } else {
              await client.query(
                `INSERT INTO user_profiles (id, email, full_name, role, account_status, created_at, updated_at)
                 VALUES ($1, $2, $3, 'parent', 'active', NOW(), NOW())`,
                [parentUserId, parentEmail, parentName]
              );
            }

            // Ensure auth_users row exists too
            const localAuthCheck = await client.query(
              `SELECT id FROM auth_users WHERE id = $1`,
              [parentUserId]
            );
            if (localAuthCheck.rows.length === 0) {
              const tempPassword = `Parent${Math.random().toString(36).slice(-8)}!`;
              const hashedPassword = await bcrypt.hash(tempPassword, 10);
              await client.query(
                `INSERT INTO auth_users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
                 VALUES ($1, $2, $3, NOW(), NOW(), NOW())`,
                [parentUserId, parentEmail, hashedPassword]
              );
              isNewParent = true;
            }
          } else {
            // Completely new parent — create auth.users, auth_users, and user_profiles
            const tempPassword = `Parent${Math.random().toString(36).slice(-8)}!`;
            const hashedPassword = await bcrypt.hash(tempPassword, 10);

            const parentMetadata = JSON.stringify({
              full_name: parentName,
              role: 'parent',
              password_set: false,
            });

            const parentAuthResult = await client.query(
              `INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, role, aud, instance_id, raw_user_meta_data)
               VALUES (gen_random_uuid(), $1, $2, NOW(), NOW(), NOW(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', $3::jsonb)
               RETURNING id`,
              [parentEmail, hashedPassword, parentMetadata]
            );
            parentUserId = parentAuthResult.rows[0].id;

            await client.query(
              `INSERT INTO auth_users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
               VALUES ($1, $2, $3, NOW(), NOW(), NOW())`,
              [parentUserId, parentEmail, hashedPassword]
            );

            // Update the trigger-created profile with parent details
            await client.query(
              `UPDATE user_profiles SET
                full_name = $2,
                role = 'parent',
                account_status = 'active',
                updated_at = NOW()
              WHERE id = $1`,
              [parentUserId, parentName]
            );

            isNewParent = true;
          }

          // Mark that we created a new parent so we can send a welcome email
          if (isNewParent) {
            newParentCreated = { id: parentUserId, email: parentEmail, name: parentName };
          }
        }

        // Link parent to student in parent_students (if not already linked)
        if (parentUserId) {
          const existingLink = await client.query(
            `SELECT id FROM parent_students WHERE parent_id = $1 AND student_id = $2`,
            [parentUserId, newUserId]
          );

          if (existingLink.rows.length === 0) {
            await client.query(
              `INSERT INTO parent_students (id, parent_id, student_id, relationship, created_at)
               VALUES (gen_random_uuid(), $1, $2, $3, NOW())`,
              [parentUserId, newUserId, 'parent']
            );
          }
        }
      }

      return { studentProfile, newParentCreated };
    });

    // Send welcome email to newly created parent (async, non-blocking)
    if (result.newParentCreated) {
      const { id, email, name } = result.newParentCreated;
      sendParentWelcomeEmailAsync(id, email, name, req);
    }
    
    res?.status(201)?.json(result.studentProfile);
  } catch (error) {
    console.error('Create student error:', error);
    res?.status(500)?.json({ error: 'Failed to create student' });
  }
});

// Update student
router.put('/:id', verifyToken, requireRole('admin', 'staff'), async (req, res) => {
  try {
    const { id } = req?.params;
    const {
      student_id,
      full_name,
      first_name,
      last_name,
      email,
      grade,
      homeroom,
      balance,
      meal_program,
      dietary_restrictions,
      allergies,
      account_status,
      photo,
      parent_guardian,
      parent_email_address,
      parent_id,
      status,
      notes,
    } = req?.body;

    // Support both full_name and first_name/last_name
    const resolvedName = full_name || (first_name && last_name ? `${first_name} ${last_name}` : undefined);

    const result = await query(
      `UPDATE user_profiles SET
        student_id = COALESCE($1, student_id),
        full_name = COALESCE($2, full_name),
        email = COALESCE($3, email),
        grade = COALESCE($4, grade),
        homeroom = COALESCE($5, homeroom),
        balance = COALESCE($6, balance),
        meal_program = COALESCE($7, meal_program),
        account_status = COALESCE($8, account_status),
        photo = COALESCE($9, photo),
        parent_guardian = COALESCE($10, parent_guardian),
        parent_email_address = COALESCE($11, parent_email_address),
        updated_at = NOW()
      WHERE id = $12
      RETURNING *`,
      [
        student_id || null,
        resolvedName || null,
        email !== undefined ? (email || null) : null,
        grade || null,
        homeroom !== undefined ? (homeroom || null) : null,
        balance !== undefined ? balance : null,
        meal_program || null,
        account_status || status || null,
        photo !== undefined ? (photo || null) : null,
        parent_guardian !== undefined ? (parent_guardian || null) : null,
        parent_email_address !== undefined ? (parent_email_address || null) : null,
        id,
      ]
    );
    
    if (result?.rows?.length === 0) {
      return res?.status(404)?.json({ error: 'Student not found' });
    }
    
    res?.json(result?.rows?.[0]);
  } catch (error) {
    console.error('Update student error:', error);
    res?.status(500)?.json({ error: 'Failed to update student' });
  }
});

// Delete student (soft delete)
router.delete('/:id', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req?.params;
    
    // Hard delete - remove from user_profiles first, then auth.users (FK order)
    const result = await transaction(async (client) => {
      const profileResult = await client.query(
        'DELETE FROM user_profiles WHERE id = $1 RETURNING id',
        [id]
      );
      
      if (profileResult.rows.length === 0) {
        throw new Error('Student not found');
      }

      // Also clean up the auth.users entry
      await client.query('DELETE FROM auth.users WHERE id = $1', [id]);

      return profileResult.rows[0];
    });
    
    res?.json({ message: 'Student deleted successfully' });
  } catch (error) {
    console.error('Delete student error:', error);
    res?.status(500)?.json({ error: 'Failed to delete student' });
  }
});

// Bulk import students
router.post('/bulk-import', verifyToken, requireRole('admin', 'staff'), async (req, res) => {
  try {
    const { students } = req?.body;
    
    if (!Array.isArray(students) || students?.length === 0) {
      return res?.status(400)?.json({ error: 'Invalid students data' });
    }
    
    const newParentsToEmail = []; // Track newly created parents for welcome emails

    const results = await transaction(async (client) => {
      const imported = [];
      const errors = [];
      
      for (let i = 0; i < students.length; i++) {
        const student = students[i];
        try {
          if (!student?.student_id || !student?.full_name) {
            errors?.push({
              row: i + 1,
              student_id: student?.student_id || '(missing)',
              full_name: student?.full_name || '(missing)',
              error: 'Student ID and Full Name are required',
            });
            continue;
          }

          // Check for duplicate student_id
          const existing = await client?.query(
            "SELECT id FROM user_profiles WHERE student_id = $1 AND role = 'student'",
            [student.student_id]
          );
          if (existing?.rows?.length > 0) {
            errors?.push({
              row: i + 1,
              student_id: student.student_id,
              full_name: student.full_name,
              error: 'Student ID already exists',
            });
            continue;
          }

          // meal_program must be one of: 'paid', 'reduced', 'free'
          const bulkValidPrograms = ['paid', 'reduced', 'free'];
          const bulkMealProgram = bulkValidPrograms.includes(student.meal_program) ? student.meal_program : 'paid';
          const bulkEmail = student.email || `student_${student.student_id}@placeholder.local`;

          // Create auth.users entry first (FK requirement)
          // The handle_new_user trigger auto-creates a user_profiles row,
          // so we UPDATE it afterwards instead of inserting.
          const authRes = await client?.query(
            `INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at, is_sso_user, is_anonymous)
             VALUES (gen_random_uuid(), $1, $2, NOW(), NOW(), false, false)
             RETURNING id`,
            [
              bulkEmail,
              JSON.stringify({ full_name: student.full_name, role: 'student' }),
            ]
          );
          const bulkUserId = authRes.rows[0].id;

          const result = await client?.query(
            `UPDATE user_profiles SET
              student_id = $2,
              full_name = $3,
              email = $4,
              role = 'student',
              grade = $5,
              homeroom = $6,
              balance = $7,
              meal_program = $8,
              account_status = 'active',
              parent_guardian = $9,
              parent_email_address = $10,
              updated_at = NOW()
            WHERE id = $1
            RETURNING *`,
            [
              bulkUserId,
              student.student_id,
              student.full_name,
              bulkEmail,
              student.grade || null,
              student.homeroom || null,
              student.balance || 0,
              bulkMealProgram,
              student.parent_guardian || null,
              student.parent_email_address || null,
            ]
          );

          // ── Create or find parent account and link to student (bulk) ──
          if (student.parent_email_address) {
            try {
              let parentUserId = null;
              let isNewParent = false;
              const parentEmail = student.parent_email_address.toLowerCase().trim();
              const parentName = student.parent_guardian || parentEmail.split('@')[0];

              // Check user_profiles first
              const existingProfile = await client.query(
                `SELECT id FROM user_profiles WHERE email = $1`,
                [parentEmail]
              );

              if (existingProfile.rows.length > 0) {
                parentUserId = existingProfile.rows[0].id;
              } else {
                // Check auth.users in case email exists there but not in user_profiles
                const existingAuthUser = await client.query(
                  `SELECT id FROM auth.users WHERE email = $1`,
                  [parentEmail]
                );

                if (existingAuthUser.rows.length > 0) {
                  parentUserId = existingAuthUser.rows[0].id;

                  const profileCheck = await client.query(
                    `SELECT id FROM user_profiles WHERE id = $1`,
                    [parentUserId]
                  );
                  if (profileCheck.rows.length > 0) {
                    await client.query(
                      `UPDATE user_profiles SET
                        full_name = COALESCE(NULLIF(full_name, ''), $2),
                        role = 'parent',
                        account_status = 'active',
                        updated_at = NOW()
                      WHERE id = $1`,
                      [parentUserId, parentName]
                    );
                  } else {
                    await client.query(
                      `INSERT INTO user_profiles (id, email, full_name, role, account_status, created_at, updated_at)
                       VALUES ($1, $2, $3, 'parent', 'active', NOW(), NOW())`,
                      [parentUserId, parentEmail, parentName]
                    );
                  }

                  const localAuthCheck = await client.query(
                    `SELECT id FROM auth_users WHERE id = $1`,
                    [parentUserId]
                  );
                  if (localAuthCheck.rows.length === 0) {
                    const tempPassword = `Parent${Math.random().toString(36).slice(-8)}!`;
                    const hashedPassword = await bcrypt.hash(tempPassword, 10);
                    await client.query(
                      `INSERT INTO auth_users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
                       VALUES ($1, $2, $3, NOW(), NOW(), NOW())`,
                      [parentUserId, parentEmail, hashedPassword]
                    );
                    isNewParent = true;
                  }
                } else {
                  // Completely new parent
                  const tempPassword = `Parent${Math.random().toString(36).slice(-8)}!`;
                  const hashedPassword = await bcrypt.hash(tempPassword, 10);

                  const parentMetadata = JSON.stringify({
                    full_name: parentName,
                    role: 'parent',
                    password_set: false,
                  });

                  const parentAuthResult = await client.query(
                    `INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, role, aud, instance_id, raw_user_meta_data)
                     VALUES (gen_random_uuid(), $1, $2, NOW(), NOW(), NOW(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', $3::jsonb)
                     RETURNING id`,
                    [parentEmail, hashedPassword, parentMetadata]
                  );
                  parentUserId = parentAuthResult.rows[0].id;

                  await client.query(
                    `INSERT INTO auth_users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
                     VALUES ($1, $2, $3, NOW(), NOW(), NOW())`,
                    [parentUserId, parentEmail, hashedPassword]
                  );

                  await client.query(
                    `UPDATE user_profiles SET
                      full_name = $2,
                      role = 'parent',
                      account_status = 'active',
                      updated_at = NOW()
                    WHERE id = $1`,
                    [parentUserId, parentName]
                  );

                  isNewParent = true;
                }
              }

              if (parentUserId) {
                const existingLink = await client.query(
                  `SELECT id FROM parent_students WHERE parent_id = $1 AND student_id = $2`,
                  [parentUserId, bulkUserId]
                );

                if (existingLink.rows.length === 0) {
                  await client.query(
                    `INSERT INTO parent_students (id, parent_id, student_id, relationship, created_at)
                     VALUES (gen_random_uuid(), $1, $2, $3, NOW())`,
                    [parentUserId, bulkUserId, 'parent']
                  );
                }

                // Queue welcome email for newly created parent
                if (isNewParent) {
                  newParentsToEmail.push({ id: parentUserId, email: parentEmail, name: parentName });
                }
              }
            } catch (parentErr) {
              console.error(`Warning: Failed to create parent account for ${student.parent_email_address}:`, parentErr.message);
              // Don't fail the student import if parent creation fails
            }
          }

          imported?.push(result?.rows?.[0]);
        } catch (error) {
          errors?.push({
            row: i + 1,
            student_id: student?.student_id || '(unknown)',
            full_name: student?.full_name || '(unknown)',
            error: error?.message,
          });
        }
      }
      
      return { imported, errors };
    });

    // Send welcome emails to all newly created parents (async, non-blocking)
    // Deduplicate by email in case multiple students share the same parent
    const emailedParents = new Set();
    for (const parent of newParentsToEmail) {
      if (!emailedParents.has(parent.email)) {
        emailedParents.add(parent.email);
        sendParentWelcomeEmailAsync(parent.id, parent.email, parent.name, req);
      }
    }
    
    res?.json(results);
  } catch (error) {
    console.error('Bulk import error:', error);
    res?.status(500)?.json({ error: 'Bulk import failed' });
  }
});

module.exports = router;