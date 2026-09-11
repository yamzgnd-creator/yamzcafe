const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { verifyToken } = require('../middleware/auth');

// Apply auth middleware to all routes
router.use(verifyToken);

// Helper: Generate invoice immediately on checkout
async function generateInvoiceForSession(sessionId, studentId) {
  try {
    // Check if invoice already exists for this session
    const existing = await query(
      `SELECT id FROM aftercare_invoices WHERE session_id = $1`,
      [sessionId]
    );
    if (existing.rows.length > 0) return null; // Already billed

    // Get billing settings
    const settingsResult = await query(
      `SELECT * FROM aftercare_billing_settings WHERE is_active = true ORDER BY created_at DESC LIMIT 1`
    );
    const settings = settingsResult.rows[0];
    if (!settings) return null; // No billing settings configured

    // Get the session with check-out time
    const sessionResult = await query(
      `SELECT a.*, ps.parent_id FROM aftercare_sessions a
       LEFT JOIN parent_students ps ON ps.student_id = a.student_id
       WHERE a.id = $1`,
      [sessionId]
    );
    const session = sessionResult.rows[0];
    if (!session || !session.check_out_time) return null;

    const checkIn = new Date(session.check_in_time);
    const checkOut = new Date(session.check_out_time);
    const durationMinutes = Math.floor((checkOut.getTime() - checkIn.getTime()) / 60000);
    const billableMinutes = Math.max(0, durationMinutes - (settings.grace_period_minutes || 15));

    let amount = 0;
    let lateFee = 0;

    if (settings.rate_type === 'hourly') {
      const hours = billableMinutes / 60;
      amount = Math.round(hours * settings.rate_amount * 100) / 100;
      if (settings.daily_cap && amount > settings.daily_cap) {
        amount = settings.daily_cap;
      }
    } else if (settings.rate_type === 'weekly') {
      amount = Math.round((settings.rate_amount / 5) * 100) / 100;
    } else if (settings.rate_type === 'monthly') {
      amount = Math.round((settings.rate_amount / 22) * 100) / 100;
    }

    if (settings.late_pickup_fee > 0 && durationMinutes > settings.late_pickup_after_minutes) {
      lateFee = settings.late_pickup_fee;
    }

    const total = Math.round((amount + lateFee) * 100) / 100;
    const invoiceDate = checkIn.toISOString().split('T')[0];

    const invoiceResult = await query(`
      INSERT INTO aftercare_invoices 
        (student_id, session_id, parent_id, amount, duration_minutes, rate_type, rate_amount, late_fee, total, status, invoice_date)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', $10)
      RETURNING *
    `, [
      studentId,
      sessionId,
      session.parent_id || null,
      amount,
      durationMinutes,
      settings.rate_type,
      settings.rate_amount,
      lateFee,
      total,
      invoiceDate,
    ]);

    console.log(`[AutoBill] Invoice generated for session ${sessionId}: $${total}`);
    return invoiceResult.rows[0];
  } catch (err) {
    console.error(`[AutoBill] Failed to generate invoice for session ${sessionId}:`, err.message);
    return null;
  }
}

// GET /api/aftercare/active - Get all currently checked-in students
router.get('/active', async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        a.id,
        a.student_id,
        a.check_in_time,
        a.checked_in_by,
        a.checked_in_by_role,
        a.notes,
        a.status,
        p.full_name as student_name,
        p.student_id as student_code,
        p.grade,
        cb.full_name as checked_in_by_name
      FROM aftercare_sessions a
      JOIN user_profiles p ON p.id = a.student_id
      LEFT JOIN user_profiles cb ON cb.id = a.checked_in_by
      WHERE a.status = 'checked_in'
      ORDER BY a.check_in_time DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching active aftercare sessions:', error);
    res.status(500).json({ error: 'Failed to fetch active sessions' });
  }
});

// GET /api/aftercare/history - Get aftercare history with optional filters
router.get('/history', async (req, res) => {
  try {
    const { date, student_id, tz_offset, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramIdx = 1;

    if (date && date !== 'all') {
      // tz_offset from JS getTimezoneOffset(): positive = behind UTC (e.g., 300 for UTC-5)
      // User's local midnight in UTC = UTC midnight of that date + offset in minutes
      // Example: user in UTC-5 selects 2026-08-06 → local midnight = 2026-08-06T05:00:00Z
      const offsetMinutes = parseInt(tz_offset) || 0;
      
      // Parse the date as UTC midnight, then add the offset to get user's local midnight in UTC
      const utcMidnight = new Date(`${date}T00:00:00Z`); // UTC midnight of selected date
      const userDayStartUTC = new Date(utcMidnight.getTime() + offsetMinutes * 60 * 1000);
      const userDayEndUTC = new Date(userDayStartUTC.getTime() + 24 * 60 * 60 * 1000);
      
      whereClause += ` AND a.check_in_time >= $${paramIdx}::timestamptz AND a.check_in_time < $${paramIdx + 1}::timestamptz`;
      params.push(userDayStartUTC.toISOString(), userDayEndUTC.toISOString());
      paramIdx += 2;
    }

    if (student_id) {
      whereClause += ` AND a.student_id = $${paramIdx}`;
      params.push(student_id);
      paramIdx++;
    }

    const countResult = await query(
      `SELECT COUNT(*) as total FROM aftercare_sessions a ${whereClause}`,
      params
    );

    const result = await query(`
      SELECT 
        a.id,
        a.student_id,
        a.check_in_time,
        a.check_out_time,
        a.checked_in_by,
        a.checked_in_by_role,
        a.checked_out_by,
        a.checked_out_by_role,
        a.status,
        a.notes,
        p.full_name as student_name,
        p.student_id as student_code,
        p.grade,
        cb.full_name as checked_in_by_name,
        co.full_name as checked_out_by_name
      FROM aftercare_sessions a
      JOIN user_profiles p ON p.id = a.student_id
      LEFT JOIN user_profiles cb ON cb.id = a.checked_in_by
      LEFT JOIN user_profiles co ON co.id = a.checked_out_by
      ${whereClause}
      ORDER BY a.check_in_time DESC
      LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `, [...params, parseInt(limit), offset]);

    res.json({
      sessions: result.rows,
      total: parseInt(countResult.rows[0].total),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (error) {
    console.error('Error fetching aftercare history:', error);
    res.status(500).json({ error: 'Failed to fetch aftercare history' });
  }
});

// GET /api/aftercare/stats - Get accurate dashboard statistics for today
router.get('/stats', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const [activeResult, checkedOutResult, totalResult] = await Promise.all([
      query(`SELECT COUNT(*) as count FROM aftercare_sessions WHERE status = 'checked_in'`),
      query(`SELECT COUNT(*) as count FROM aftercare_sessions WHERE status = 'checked_out' AND check_in_time >= $1::date AND check_in_time < ($1::date + interval '1 day')`, [today]),
      query(`SELECT COUNT(*) as count FROM aftercare_sessions WHERE check_in_time >= $1::date AND check_in_time < ($1::date + interval '1 day')`, [today]),
    ]);

    res.json({
      currently_checked_in: parseInt(activeResult.rows[0].count),
      checked_out_today: parseInt(checkedOutResult.rows[0].count),
      total_sessions_today: parseInt(totalResult.rows[0].count),
    });
  } catch (error) {
    console.error('Error fetching aftercare stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// GET /api/aftercare/parent - Get aftercare sessions for parent's children
router.get('/parent', async (req, res) => {
  try {
    const parentId = req.user.id;
    
    // Get parent's children from the parent_students link table (authoritative source)
    const children = await query(
      `SELECT DISTINCT student_id FROM parent_students WHERE parent_id = $1`,
      [parentId]
    );
    
    if (children.rows.length === 0) {
      return res.json({ children: [], sessions: [], enrollments: [] });
    }

    const childIdsArray = children.rows.map(c => c.student_id);
    
    // Get children profiles
    const childProfiles = await query(
      `SELECT id, full_name, student_id, grade FROM user_profiles WHERE id = ANY($1)`,
      [childIdsArray]
    );

    // Get currently active sessions (checked_in) + recent completed sessions (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

    const activeSessions = await query(`
      SELECT 
        a.id,
        a.student_id,
        a.check_in_time,
        a.check_out_time,
        a.checked_in_by_role,
        a.checked_out_by_role,
        a.status,
        a.notes,
        p.full_name as student_name,
        cb.full_name as checked_in_by_name,
        co.full_name as checked_out_by_name,
        inv.id as invoice_id,
        inv.total as invoice_total,
        inv.status as invoice_status,
        inv.paid_at as invoice_paid_at
      FROM aftercare_sessions a
      JOIN user_profiles p ON p.id = a.student_id
      LEFT JOIN user_profiles cb ON cb.id = a.checked_in_by
      LEFT JOIN user_profiles co ON co.id = a.checked_out_by
      LEFT JOIN aftercare_invoices inv ON inv.session_id = a.id
      WHERE a.student_id = ANY($1)
        AND (a.status = 'checked_in' OR a.check_in_time >= $2::date)
      ORDER BY a.check_in_time DESC
      LIMIT 100
    `, [childIdsArray, thirtyDaysAgoStr]);

    // Get active enrollments for these children
    const enrollmentResult = await query(`
      SELECT 
        ae.id,
        ae.student_id,
        ae.package_type,
        ae.academic_year,
        ae.status,
        ae.programmes,
        ae.created_at,
        p.full_name as student_name,
        p.grade
      FROM aftercare_enrollments ae
      JOIN user_profiles p ON p.id = ae.student_id
      WHERE ae.student_id = ANY($1) AND ae.parent_id = $2
      ORDER BY ae.created_at DESC
    `, [childIdsArray, parentId]);

    res.json({
      children: childProfiles.rows,
      sessions: activeSessions.rows,
      enrollments: enrollmentResult.rows,
    });
  } catch (error) {
    console.error('Error fetching parent aftercare data:', error);
    res.status(500).json({ error: 'Failed to fetch aftercare data' });
  }
});

// POST /api/aftercare/checkin - Check in a student
router.post('/checkin', async (req, res) => {
  try {
    const { student_id, notes } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    if (!student_id) {
      return res.status(400).json({ error: 'Student ID is required' });
    }

    // Verify student exists
    const student = await query(
      `SELECT id, full_name, student_id FROM user_profiles WHERE id = $1 AND role = 'student'`,
      [student_id]
    );
    if (student.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Check if student is already checked in
    const existing = await query(
      `SELECT id FROM aftercare_sessions WHERE student_id = $1 AND status = 'checked_in'`,
      [student_id]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Student is already checked in to aftercare' });
    }

    // If parent is checking in, verify they are the parent
    if (userRole === 'parent') {
      const parentLink = await query(
        `SELECT 1 FROM parent_students WHERE parent_id = $1 AND student_id = $2`,
        [userId, student_id]
      );
      if (parentLink.rows.length === 0) {
        return res.status(403).json({ error: 'You can only check in your own children' });
      }

      // Verify student has active aftercare enrollment
      const enrollment = await query(
        `SELECT id FROM aftercare_enrollments WHERE student_id = $1 AND parent_id = $2 AND status = 'active'`,
        [student_id, userId]
      );
      if (enrollment.rows.length === 0) {
        return res.status(403).json({ error: 'Enrollment required. Please complete the After School Programme enrollment for this child before checking in.' });
      }
    }

    const result = await query(`
      INSERT INTO aftercare_sessions (student_id, checked_in_by, checked_in_by_role, notes)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [student_id, userId, userRole, notes || null]);

    // Log to audit trail
    try {
      await query(
        `INSERT INTO audit_trail (user_id, action, details) VALUES ($1, $2, $3)`,
        [userId, 'aftercare_checkin', JSON.stringify({ student_id, student_name: student.rows[0].full_name })]
      );
    } catch (auditErr) {
      console.error('Audit log failed:', auditErr.message);
    }

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error checking in student:', error);
    res.status(500).json({ error: 'Failed to check in student' });
  }
});

// POST /api/aftercare/checkout/:id - Check out a student
router.post('/checkout/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Get the session
    const session = await query(
      `SELECT a.*, p.full_name as student_name FROM aftercare_sessions a 
       JOIN user_profiles p ON p.id = a.student_id
       WHERE a.id = $1 AND a.status = 'checked_in'`,
      [id]
    );
    if (session.rows.length === 0) {
      return res.status(404).json({ error: 'Active session not found' });
    }

    // If parent is checking out, verify they are the parent
    if (userRole === 'parent') {
      const parentLink = await query(
        `SELECT 1 FROM parent_students WHERE parent_id = $1 AND student_id = $2`,
        [userId, session.rows[0].student_id]
      );
      if (parentLink.rows.length === 0) {
        return res.status(403).json({ error: 'You can only check out your own children' });
      }
    }

    const updateNotes = notes ? `${session.rows[0].notes || ''} | Checkout: ${notes}`.trim() : session.rows[0].notes;

    const result = await query(`
      UPDATE aftercare_sessions 
      SET check_out_time = NOW(), 
          checked_out_by = $1, 
          checked_out_by_role = $2, 
          status = 'checked_out',
          notes = $3,
          updated_at = NOW()
      WHERE id = $4
      RETURNING *
    `, [userId, userRole, updateNotes, id]);

    // Auto-generate invoice on checkout
    const invoice = await generateInvoiceForSession(id, session.rows[0].student_id);

    // Log to audit trail
    try {
      await query(
        `INSERT INTO audit_trail (user_id, action, details) VALUES ($1, $2, $3)`,
        [userId, 'aftercare_checkout', JSON.stringify({ session_id: id, student_name: session.rows[0].student_name, invoice_generated: !!invoice })]
      );
    } catch (auditErr) {
      console.error('Audit log failed:', auditErr.message);
    }

    res.json({ ...result.rows[0], invoice });
  } catch (error) {
    console.error('Error checking out student:', error);
    res.status(500).json({ error: 'Failed to check out student' });
  }
});

// POST /api/aftercare/bulk-checkin - Bulk check in multiple students
router.post('/bulk-checkin', async (req, res) => {
  try {
    const { student_ids, notes } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    if (!student_ids || !Array.isArray(student_ids) || student_ids.length === 0) {
      return res.status(400).json({ error: 'student_ids array is required' });
    }

    if (student_ids.length > 50) {
      return res.status(400).json({ error: 'Cannot check in more than 50 students at once' });
    }

    // Verify all students exist
    const students = await query(
      `SELECT id, full_name, student_id FROM user_profiles WHERE id = ANY($1) AND role = 'student'`,
      [student_ids]
    );
    if (students.rows.length === 0) {
      return res.status(404).json({ error: 'No valid students found' });
    }

    const validIds = students.rows.map(s => s.id);

    // Check which students are already checked in
    const existing = await query(
      `SELECT student_id FROM aftercare_sessions WHERE student_id = ANY($1) AND status = 'checked_in'`,
      [validIds]
    );
    const alreadyCheckedIn = new Set(existing.rows.map(r => r.student_id));

    // Filter out already checked-in students
    const toCheckIn = validIds.filter(id => !alreadyCheckedIn.has(id));

    if (toCheckIn.length === 0) {
      return res.status(409).json({ error: 'All selected students are already checked in' });
    }

    // Bulk insert
    const values = toCheckIn.map((sid, idx) => {
      const offset = idx * 4;
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`;
    }).join(', ');

    const params = toCheckIn.flatMap(sid => [sid, userId, userRole, notes || null]);

    const result = await query(`
      INSERT INTO aftercare_sessions (student_id, checked_in_by, checked_in_by_role, notes)
      VALUES ${values}
      RETURNING *
    `, params);

    // Audit log
    try {
      const checkedInNames = students.rows
        .filter(s => toCheckIn.includes(s.id))
        .map(s => s.full_name);
      await query(
        `INSERT INTO audit_trail (user_id, action, details) VALUES ($1, $2, $3)`,
        [userId, 'aftercare_bulk_checkin', JSON.stringify({ count: toCheckIn.length, students: checkedInNames })]
      );
    } catch (auditErr) {
      console.error('Audit log failed:', auditErr.message);
    }

    res.status(201).json({
      checked_in: result.rows.length,
      skipped: alreadyCheckedIn.size,
      sessions: result.rows,
    });
  } catch (error) {
    console.error('Error bulk checking in students:', error);
    res.status(500).json({ error: 'Failed to bulk check in students' });
  }
});

// POST /api/aftercare/bulk-checkout - Bulk check out multiple sessions
router.post('/bulk-checkout', async (req, res) => {
  try {
    const { session_ids, notes } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    if (!session_ids || !Array.isArray(session_ids) || session_ids.length === 0) {
      return res.status(400).json({ error: 'session_ids array is required' });
    }

    if (session_ids.length > 50) {
      return res.status(400).json({ error: 'Cannot check out more than 50 students at once' });
    }

    // Get active sessions
    const sessions = await query(
      `SELECT a.id, a.student_id, a.notes as existing_notes, p.full_name as student_name 
       FROM aftercare_sessions a 
       JOIN user_profiles p ON p.id = a.student_id
       WHERE a.id = ANY($1) AND a.status = 'checked_in'`,
      [session_ids]
    );

    if (sessions.rows.length === 0) {
      return res.status(404).json({ error: 'No active sessions found' });
    }

    const validIds = sessions.rows.map(s => s.id);

    // Bulk update
    const result = await query(`
      UPDATE aftercare_sessions 
      SET check_out_time = NOW(), 
          checked_out_by = $1, 
          checked_out_by_role = $2, 
          status = 'checked_out',
          notes = CASE WHEN $3::text IS NOT NULL THEN COALESCE(notes || ' | Checkout: ', '') || $3 ELSE notes END,
          updated_at = NOW()
      WHERE id = ANY($4) AND status = 'checked_in'
      RETURNING *
    `, [userId, userRole, notes || null, validIds]);

    // Auto-generate invoices for each checked-out session
    const invoices = [];
    for (const checkedOut of result.rows) {
      const invoice = await generateInvoiceForSession(checkedOut.id, checkedOut.student_id);
      if (invoice) invoices.push(invoice);
    }

    // Audit log
    try {
      const checkedOutNames = sessions.rows.map(s => s.student_name);
      await query(
        `INSERT INTO audit_trail (user_id, action, details) VALUES ($1, $2, $3)`,
        [userId, 'aftercare_bulk_checkout', JSON.stringify({ count: result.rows.length, students: checkedOutNames, invoices_generated: invoices.length })]
      );
    } catch (auditErr) {
      console.error('Audit log failed:', auditErr.message);
    }

    res.json({
      checked_out: result.rows.length,
      invoices_generated: invoices.length,
      sessions: result.rows,
    });
  } catch (error) {
    console.error('Error bulk checking out students:', error);
    res.status(500).json({ error: 'Failed to bulk check out students' });
  }
});

// GET /api/aftercare/search-students - Search students for check-in
router.get('/search-students', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 1) {
      return res.json([]);
    }

    const result = await query(`
      SELECT id, full_name, student_id, grade
      FROM user_profiles
      WHERE role = 'student' AND account_status = 'active'
        AND (
          LOWER(full_name) LIKE LOWER($1)
          OR LOWER(student_id) LIKE LOWER($1)
        )
      ORDER BY full_name ASC
      LIMIT 20
    `, [`%${q}%`]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error searching students:', error);
    res.status(500).json({ error: 'Failed to search students' });
  }
});

module.exports = router;