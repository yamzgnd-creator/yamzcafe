const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { verifyToken } = require('../middleware/auth');

// All routes require authentication
router.use(verifyToken);

// GET /api/aftercare-enrollment/programmes - List available programmes
router.get('/programmes', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM aftercare_programmes WHERE active = true ORDER BY sort_order ASC, name ASC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching programmes:', error);
    res.status(500).json({ error: 'Failed to fetch programmes' });
  }
});

// GET /api/aftercare-enrollment/packages - List available aftercare packages
router.get('/packages', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, description, price, billing_frequency AS billing_cycle, active, sort_order FROM aftercare_packages WHERE active = true ORDER BY sort_order ASC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching packages:', error);
    res.status(500).json({ error: 'Failed to fetch packages' });
  }
});

// GET /api/aftercare-enrollment/my-enrollments - Get parent's enrollments
router.get('/my-enrollments', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ae.*, s.full_name as student_name, s.grade
       FROM aftercare_enrollments ae
       JOIN user_profiles s ON ae.student_id = s.id
       WHERE ae.parent_id = $1
       ORDER BY ae.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching enrollments:', error);
    res.status(500).json({ error: 'Failed to fetch enrollments' });
  }
});

// POST /api/aftercare-enrollment/enroll - Submit enrollment
router.post('/enroll', async (req, res) => {
  const { student_id, programmes, package_type, academic_year } = req.body;

  if (!student_id || !package_type) {
    return res.status(400).json({ error: 'Student and package selection are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check if student already enrolled for this academic year
    const existing = await client.query(
      `SELECT id FROM aftercare_enrollments 
       WHERE student_id = $1 AND academic_year = $2 AND status = 'active'`,
      [student_id, academic_year || '2025-2026']
    );

    if (existing.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Student is already enrolled for this academic year' });
    }

    // Insert enrollment
    const enrollResult = await client.query(
      `INSERT INTO aftercare_enrollments 
       (student_id, parent_id, programmes, package_type, academic_year, status, created_at)
       VALUES ($1, $2, $3, $4, $5, 'active', NOW())
       RETURNING *`,
      [
        student_id,
        req.user.id,
        JSON.stringify(programmes || []),
        package_type,
        academic_year || '2025-2026'
      ]
    );

    await client.query('COMMIT');
    res.status(201).json(enrollResult.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating enrollment:', error);
    res.status(500).json({ error: 'Failed to create enrollment' });
  } finally {
    client.release();
  }
});

// DELETE /api/aftercare-enrollment/:id - Cancel enrollment
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE aftercare_enrollments SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1 AND parent_id = $2 RETURNING *`,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }

    res.json({ message: 'Enrollment cancelled', enrollment: result.rows[0] });
  } catch (error) {
    console.error('Error cancelling enrollment:', error);
    res.status(500).json({ error: 'Failed to cancel enrollment' });
  }
});

// ─── ADMIN: Enrollment Management ───────────────────────────────────────────

// GET /api/aftercare-enrollment/admin/enrollments - List ALL enrollments with student & parent info
router.get('/admin/enrollments', async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'teacher') {
    return res.status(403).json({ error: 'Admin or teacher access required' });
  }
  try {
    const { status, search, academic_year } = req.query;
    let query = `
      SELECT ae.*,
             s.full_name as student_name, s.grade, s.student_id as student_code,
             p.full_name as parent_name, p.email as parent_email
      FROM aftercare_enrollments ae
      JOIN user_profiles s ON ae.student_id = s.id
      LEFT JOIN user_profiles p ON ae.parent_id = p.id
      WHERE 1=1
    `;
    const params = [];
    let paramIdx = 1;

    if (status && status !== 'all') {
      query += ` AND ae.status = $${paramIdx}`;
      params.push(status);
      paramIdx++;
    }

    if (academic_year) {
      query += ` AND ae.academic_year = $${paramIdx}`;
      params.push(academic_year);
      paramIdx++;
    }

    if (search) {
      query += ` AND (s.full_name ILIKE $${paramIdx} OR s.student_id ILIKE $${paramIdx} OR p.full_name ILIKE $${paramIdx})`;
      params.push(`%${search}%`);
      paramIdx++;
    }

    query += ` ORDER BY ae.created_at DESC`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching admin enrollments:', error);
    res.status(500).json({ error: 'Failed to fetch enrollments' });
  }
});

// PUT /api/aftercare-enrollment/admin/enrollments/:id/status - Update enrollment status
router.put('/admin/enrollments/:id/status', async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  const { id } = req.params;
  const { status } = req.body;

  const validStatuses = ['active', 'suspended', 'cancelled', 'pending'];
  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({ error: `Status must be one of: ${validStatuses.join(', ')}` });
  }

  try {
    const result = await pool.query(
      `UPDATE aftercare_enrollments SET status = $1, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }

    res.json({ message: `Enrollment status updated to ${status}`, enrollment: result.rows[0] });
  } catch (error) {
    console.error('Error updating enrollment status:', error);
    res.status(500).json({ error: 'Failed to update enrollment status' });
  }
});

// DELETE /api/aftercare-enrollment/admin/enrollments/:id - Delete enrollment (hard delete)
router.delete('/admin/enrollments/:id', async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  const { id } = req.params;
  try {
    const result = await pool.query(
      `DELETE FROM aftercare_enrollments WHERE id = $1 RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }
    res.json({ message: 'Enrollment deleted', enrollment: result.rows[0] });
  } catch (error) {
    console.error('Error deleting enrollment:', error);
    res.status(500).json({ error: 'Failed to delete enrollment' });
  }
});

// ─── ADMIN: Programme Management ────────────────────────────────────────────

// GET /api/aftercare-enrollment/admin/programmes - List ALL programmes (including inactive)
router.get('/admin/programmes', async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  try {
    const result = await pool.query(
      `SELECT * FROM aftercare_programmes ORDER BY sort_order ASC, name ASC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching admin programmes:', error);
    res.status(500).json({ error: 'Failed to fetch programmes' });
  }
});

// POST /api/aftercare-enrollment/admin/programmes - Create a programme
router.post('/admin/programmes', async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  const { name, description, active, sort_order } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Programme name is required' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO aftercare_programmes (name, description, active, sort_order)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name.trim(), description || null, active !== false, sort_order || 0]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating programme:', error);
    res.status(500).json({ error: 'Failed to create programme' });
  }
});

// PUT /api/aftercare-enrollment/admin/programmes/:id - Update a programme
router.put('/admin/programmes/:id', async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  const { id } = req.params;
  const { name, description, active, sort_order } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Programme name is required' });
  }
  try {
    const result = await pool.query(
      `UPDATE aftercare_programmes
       SET name = $1, description = $2, active = $3, sort_order = $4
       WHERE id = $5 RETURNING *`,
      [name.trim(), description || null, active !== false, sort_order || 0, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Programme not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating programme:', error);
    res.status(500).json({ error: 'Failed to update programme' });
  }
});

// DELETE /api/aftercare-enrollment/admin/programmes/:id - Delete a programme
router.delete('/admin/programmes/:id', async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  const { id } = req.params;
  try {
    const result = await pool.query(
      `DELETE FROM aftercare_programmes WHERE id = $1 RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Programme not found' });
    }
    res.json({ message: 'Programme deleted', programme: result.rows[0] });
  } catch (error) {
    console.error('Error deleting programme:', error);
    res.status(500).json({ error: 'Failed to delete programme' });
  }
});

module.exports = router;