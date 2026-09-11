const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { verifyToken } = require('../middleware/auth');

// All routes require authentication
router.use(verifyToken);

// ─── BILLING SETTINGS ────────────────────────────────────────────────────────

// GET /api/aftercare-billing/settings - Get current billing settings
router.get('/settings', async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM aftercare_billing_settings WHERE is_active = true ORDER BY created_at DESC LIMIT 1`
    );
    if (result.rows.length === 0) {
      // Return default settings
      return res.json({
        id: null,
        rate_type: 'hourly',
        rate_amount: 10.00,
        daily_cap: null,
        grace_period_minutes: 15,
        billing_cycle: 'weekly',
        late_pickup_fee: 0,
        late_pickup_after_minutes: 360,
        is_active: true,
      });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching billing settings:', error);
    res.status(500).json({ error: 'Failed to fetch billing settings' });
  }
});

// PUT /api/aftercare-billing/settings - Update billing settings (admin only)
router.put('/settings', async (req, res) => {
  try {
    const userRole = req.user.role;
    if (userRole !== 'admin') {
      return res.status(403).json({ error: 'Only admins can update billing settings' });
    }

    const {
      rate_type,
      rate_amount,
      daily_cap,
      grace_period_minutes,
      billing_cycle,
      late_pickup_fee,
      late_pickup_after_minutes,
    } = req.body;

    if (!rate_type || rate_amount === undefined) {
      return res.status(400).json({ error: 'rate_type and rate_amount are required' });
    }

    if (!['hourly', 'weekly', 'monthly'].includes(rate_type)) {
      return res.status(400).json({ error: 'rate_type must be hourly, weekly, or monthly' });
    }

    // Deactivate old settings
    await query(`UPDATE aftercare_billing_settings SET is_active = false, updated_at = NOW()`);

    // Insert new settings
    const result = await query(`
      INSERT INTO aftercare_billing_settings 
        (rate_type, rate_amount, daily_cap, grace_period_minutes, billing_cycle, late_pickup_fee, late_pickup_after_minutes, is_active, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8)
      RETURNING *
    `, [
      rate_type,
      parseFloat(rate_amount),
      daily_cap ? parseFloat(daily_cap) : null,
      parseInt(grace_period_minutes) || 15,
      billing_cycle || 'weekly',
      parseFloat(late_pickup_fee) || 0,
      parseInt(late_pickup_after_minutes) || 360,
      req.user.id,
    ]);

    // Audit log
    try {
      await query(
        `INSERT INTO audit_trail (user_id, action, details) VALUES ($1, $2, $3)`,
        [req.user.id, 'aftercare_billing_settings_update', JSON.stringify({ rate_type, rate_amount, daily_cap, billing_cycle })]
      );
    } catch (auditErr) {
      console.error('Audit log failed:', auditErr.message);
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating billing settings:', error);
    res.status(500).json({ error: 'Failed to update billing settings' });
  }
});

// ─── INVOICES ────────────────────────────────────────────────────────────────

// GET /api/aftercare-billing/invoices - List invoices with filters
router.get('/invoices', async (req, res) => {
  try {
    const { student_id, status, date_from, date_to, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramIdx = 1;

    if (student_id) {
      whereClause += ` AND i.student_id = $${paramIdx}`;
      params.push(student_id);
      paramIdx++;
    }

    if (status) {
      whereClause += ` AND i.status = $${paramIdx}`;
      params.push(status);
      paramIdx++;
    }

    if (date_from) {
      whereClause += ` AND i.invoice_date >= $${paramIdx}`;
      params.push(date_from);
      paramIdx++;
    }

    if (date_to) {
      whereClause += ` AND i.invoice_date <= $${paramIdx}`;
      params.push(date_to);
      paramIdx++;
    }

    // If parent, only show their children's invoices
    if (req.user.role === 'parent') {
      whereClause += ` AND i.parent_id = $${paramIdx}`;
      params.push(req.user.id);
      paramIdx++;
    }

    const countResult = await query(
      `SELECT COUNT(*) as total FROM aftercare_invoices i ${whereClause}`,
      params
    );

    const result = await query(`
      SELECT 
        i.*,
        p.full_name as student_name,
        p.student_id as student_code,
        p.grade,
        par.full_name as parent_name
      FROM aftercare_invoices i
      JOIN user_profiles p ON p.id = i.student_id
      LEFT JOIN user_profiles par ON par.id = i.parent_id
      ${whereClause}
      ORDER BY i.created_at DESC
      LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `, [...params, parseInt(limit), offset]);

    res.json({
      invoices: result.rows,
      total: parseInt(countResult.rows[0].total),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

// POST /api/aftercare-billing/generate - Generate invoices for completed sessions
router.post('/generate', async (req, res) => {
  try {
    const userRole = req.user.role;
    if (!['admin', 'staff'].includes(userRole)) {
      return res.status(403).json({ error: 'Only admin/staff can generate invoices' });
    }

    const { date_from, date_to } = req.body;

    // Get billing settings
    const settingsResult = await query(
      `SELECT * FROM aftercare_billing_settings WHERE is_active = true ORDER BY created_at DESC LIMIT 1`
    );
    const settings = settingsResult.rows[0] || {
      rate_type: 'hourly',
      rate_amount: 10.00,
      daily_cap: null,
      grace_period_minutes: 15,
      late_pickup_fee: 0,
      late_pickup_after_minutes: 360,
    };

    // Get completed sessions that don't have invoices yet
    let sessionWhere = `WHERE a.status = 'checked_out' AND a.check_out_time IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM aftercare_invoices inv WHERE inv.session_id = a.id)`;
    const sessionParams = [];
    let pIdx = 1;

    if (date_from) {
      sessionWhere += ` AND DATE(a.check_in_time) >= $${pIdx}`;
      sessionParams.push(date_from);
      pIdx++;
    }
    if (date_to) {
      sessionWhere += ` AND DATE(a.check_in_time) <= $${pIdx}`;
      sessionParams.push(date_to);
      pIdx++;
    }

    const sessions = await query(`
      SELECT 
        a.id, a.student_id, a.check_in_time, a.check_out_time,
        ps.parent_id
      FROM aftercare_sessions a
      LEFT JOIN parent_students ps ON ps.student_id = a.student_id
      ${sessionWhere}
      ORDER BY a.check_in_time ASC
    `, sessionParams);

    if (sessions.rows.length === 0) {
      return res.json({ generated: 0, message: 'No unbilled sessions found' });
    }

    let generated = 0;

    for (const session of sessions.rows) {
      const checkIn = new Date(session.check_in_time);
      const checkOut = new Date(session.check_out_time);
      let durationMinutes = Math.floor((checkOut.getTime() - checkIn.getTime()) / 60000);

      // Apply grace period
      const billableMinutes = Math.max(0, durationMinutes - settings.grace_period_minutes);

      let amount = 0;
      let lateFee = 0;

      if (settings.rate_type === 'hourly') {
        const hours = billableMinutes / 60;
        amount = Math.round(hours * settings.rate_amount * 100) / 100;
        // Apply daily cap
        if (settings.daily_cap && amount > settings.daily_cap) {
          amount = settings.daily_cap;
        }
      } else if (settings.rate_type === 'weekly') {
        // Weekly rate is a fixed amount per week
        amount = Math.round(settings.rate_amount * 100) / 100;
      } else if (settings.rate_type === 'monthly') {
        // Monthly rate is a fixed amount per month
        amount = Math.round(settings.rate_amount * 100) / 100;
      }

      // Late pickup fee
      if (settings.late_pickup_fee > 0 && durationMinutes > settings.late_pickup_after_minutes) {
        lateFee = settings.late_pickup_fee;
      }

      const total = Math.round((amount + lateFee) * 100) / 100;

      await query(`
        INSERT INTO aftercare_invoices 
          (student_id, session_id, parent_id, amount, duration_minutes, rate_type, rate_amount, late_fee, total, status, invoice_date)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', DATE($10))
      `, [
        session.student_id,
        session.id,
        session.parent_id || null,
        amount,
        durationMinutes,
        settings.rate_type,
        settings.rate_amount,
        lateFee,
        total,
        session.check_in_time,
      ]);

      generated++;
    }

    // Audit log
    try {
      await query(
        `INSERT INTO audit_trail (user_id, action, details) VALUES ($1, $2, $3)`,
        [req.user.id, 'aftercare_invoices_generated', JSON.stringify({ count: generated, date_from, date_to })]
      );
    } catch (auditErr) {
      console.error('Audit log failed:', auditErr.message);
    }

    res.json({ generated, message: `${generated} invoice(s) generated` });
  } catch (error) {
    console.error('Error generating invoices:', error);
    res.status(500).json({ error: 'Failed to generate invoices' });
  }
});

// PUT /api/aftercare-billing/invoices/:id/status - Update invoice status
router.put('/invoices/:id/status', async (req, res) => {
  try {
    const userRole = req.user.role;
    if (!['admin', 'staff'].includes(userRole)) {
      return res.status(403).json({ error: 'Only admin/staff can update invoice status' });
    }

    const { id } = req.params;
    const { status, payment_method, payment_reference, notes } = req.body;

    if (!['pending', 'paid', 'waived', 'overdue'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be pending, paid, waived, or overdue' });
    }

    const paidAt = status === 'paid' ? 'NOW()' : 'NULL';
    const receivedBy = status === 'paid' ? req.user.id : null;

    const result = await query(`
      UPDATE aftercare_invoices 
      SET status = $1, 
          paid_at = ${paidAt}, 
          payment_method = COALESCE($3, payment_method),
          payment_reference = COALESCE($4, payment_reference),
          notes = COALESCE($5, notes),
          received_by = COALESCE($6, received_by),
          updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [status, id, payment_method || null, payment_reference || null, notes || null, receivedBy]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating invoice status:', error);
    res.status(500).json({ error: 'Failed to update invoice status' });
  }
});

// POST /api/aftercare-billing/invoices/:id/payment - Record a manual payment
router.post('/invoices/:id/payment', async (req, res) => {
  try {
    const userRole = req.user.role;
    if (!['admin', 'staff'].includes(userRole)) {
      return res.status(403).json({ error: 'Only admin/staff can record payments' });
    }

    const { id } = req.params;
    const { payment_method, payment_reference, notes } = req.body;

    if (!payment_method) {
      return res.status(400).json({ error: 'Payment method is required' });
    }

    // Check invoice exists and is not already paid
    const existing = await query(`SELECT * FROM aftercare_invoices WHERE id = $1`, [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    if (existing.rows[0].status === 'paid') {
      return res.status(400).json({ error: 'Invoice is already paid' });
    }

    const result = await query(`
      UPDATE aftercare_invoices 
      SET status = 'paid', 
          paid_at = NOW(), 
          payment_method = $2,
          payment_reference = $3,
          notes = $4,
          received_by = $5,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [id, payment_method, payment_reference || null, notes || null, req.user.id]);

    res.json({ message: 'Payment recorded successfully', invoice: result.rows[0] });
  } catch (error) {
    console.error('Error recording payment:', error);
    res.status(500).json({ error: 'Failed to record payment' });
  }
});

// GET /api/aftercare-billing/summary - Get billing summary stats
router.get('/summary', async (req, res) => {
  try {
    const { date_from, date_to } = req.query;

    let dateFilter = '';
    const params = [];
    let pIdx = 1;

    if (date_from) {
      dateFilter += ` AND invoice_date >= $${pIdx}`;
      params.push(date_from);
      pIdx++;
    }
    if (date_to) {
      dateFilter += ` AND invoice_date <= $${pIdx}`;
      params.push(date_to);
      pIdx++;
    }

    const totalResult = await query(
      `SELECT 
        COUNT(*) as total_invoices,
        COALESCE(SUM(total), 0) as total_amount,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN total ELSE 0 END), 0) as paid_amount,
        COALESCE(SUM(CASE WHEN status = 'pending' THEN total ELSE 0 END), 0) as pending_amount,
        COALESCE(SUM(CASE WHEN status = 'overdue' THEN total ELSE 0 END), 0) as overdue_amount,
        COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid_count,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
        COUNT(CASE WHEN status = 'overdue' THEN 1 END) as overdue_count,
        COUNT(CASE WHEN status = 'waived' THEN 1 END) as waived_count
      FROM aftercare_invoices WHERE 1=1 ${dateFilter}`,
      params
    );

    res.json(totalResult.rows[0]);
  } catch (error) {
    console.error('Error fetching billing summary:', error);
    res.status(500).json({ error: 'Failed to fetch billing summary' });
  }
});

// ─── AUTO-GENERATE (CRON-STYLE) ──────────────────────────────────────────────

// POST /api/aftercare-billing/auto-generate - Auto-generate invoices for yesterday (or specified date)
// This can be called by a cron job or scheduler
router.post('/auto-generate', async (req, res) => {
  try {
    // Check if auto-generation is enabled
    const settingsResult = await query(
      `SELECT * FROM aftercare_billing_settings WHERE is_active = true ORDER BY created_at DESC LIMIT 1`
    );
    const settings = settingsResult.rows[0] || {
      rate_type: 'hourly',
      rate_amount: 10.00,
      daily_cap: null,
      grace_period_minutes: 15,
      late_pickup_fee: 0,
      late_pickup_after_minutes: 360,
      auto_generate: false,
    };

    // Allow manual trigger by admin even if auto_generate is off
    const isManualTrigger = req.user && ['admin', 'staff'].includes(req.user.role);
    if (!settings.auto_generate && !isManualTrigger) {
      return res.json({ generated: 0, message: 'Auto-generation is disabled' });
    }

    // Default to yesterday if no date specified
    const targetDate = req.body.date || new Date(Date.now() - 86400000).toISOString().split('T')[0];

    // Get completed sessions for the target date that don't have invoices yet
    const sessions = await query(`
      SELECT 
        a.id, a.student_id, a.check_in_time, a.check_out_time,
        ps.parent_id
      FROM aftercare_sessions a
      LEFT JOIN parent_students ps ON ps.student_id = a.student_id
      WHERE a.status = 'checked_out' 
        AND a.check_out_time IS NOT NULL
        AND DATE(a.check_in_time) = $1
        AND NOT EXISTS (SELECT 1 FROM aftercare_invoices inv WHERE inv.session_id = a.id)
      ORDER BY a.check_in_time ASC
    `, [targetDate]);

    if (sessions.rows.length === 0) {
      return res.json({ generated: 0, message: `No unbilled sessions for ${targetDate}` });
    }

    let generated = 0;

    for (const session of sessions.rows) {
      const checkIn = new Date(session.check_in_time);
      const checkOut = new Date(session.check_out_time);
      let durationMinutes = Math.floor((checkOut.getTime() - checkIn.getTime()) / 60000);

      const billableMinutes = Math.max(0, durationMinutes - settings.grace_period_minutes);

      let amount = 0;
      let lateFee = 0;

      if (settings.rate_type === 'hourly') {
        const hours = billableMinutes / 60;
        amount = Math.round(hours * settings.rate_amount * 100) / 100;
        if (settings.daily_cap && amount > settings.daily_cap) {
          amount = settings.daily_cap;
        }
      } else if (settings.rate_type === 'weekly') {
        // Weekly rate is a fixed amount per week
        amount = Math.round(settings.rate_amount * 100) / 100;
      } else if (settings.rate_type === 'monthly') {
        // Monthly rate is a fixed amount per month
        amount = Math.round(settings.rate_amount * 100) / 100;
      }

      if (settings.late_pickup_fee > 0 && durationMinutes > settings.late_pickup_after_minutes) {
        lateFee = settings.late_pickup_fee;
      }

      const total = Math.round((amount + lateFee) * 100) / 100;

      await query(`
        INSERT INTO aftercare_invoices 
          (student_id, session_id, parent_id, amount, duration_minutes, rate_type, rate_amount, late_fee, total, status, invoice_date)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', $10)
      `, [
        session.student_id,
        session.id,
        session.parent_id || null,
        amount,
        durationMinutes,
        settings.rate_type,
        settings.rate_amount,
        lateFee,
        total,
        targetDate,
      ]);

      generated++;
    }

    // Log auto-generation
    try {
      await query(
        `INSERT INTO audit_trail (user_id, action, details) VALUES ($1, $2, $3)`,
        [req.user ? req.user.id : null, 'aftercare_auto_invoice_generated', JSON.stringify({ count: generated, date: targetDate })]
      );
    } catch (auditErr) {
      console.error('Audit log failed:', auditErr.message);
    }

    res.json({ generated, message: `${generated} invoice(s) auto-generated for ${targetDate}` });
  } catch (error) {
    console.error('Error auto-generating invoices:', error);
    res.status(500).json({ error: 'Failed to auto-generate invoices' });
  }
});

// GET /api/aftercare-billing/auto-generate/status - Check auto-generation status
router.get('/auto-generate/status', async (req, res) => {
  try {
    const settingsResult = await query(
      `SELECT auto_generate FROM aftercare_billing_settings WHERE is_active = true ORDER BY created_at DESC LIMIT 1`
    );
    const autoGenerate = settingsResult.rows[0]?.auto_generate || false;
    res.json({ auto_generate: autoGenerate });
  } catch (error) {
    res.json({ auto_generate: false });
  }
});

// PUT /api/aftercare-billing/auto-generate/toggle - Toggle auto-generation
router.put('/auto-generate/toggle', async (req, res) => {
  try {
    const userRole = req.user.role;
    if (userRole !== 'admin') {
      return res.status(403).json({ error: 'Only admins can toggle auto-generation' });
    }

    const { enabled } = req.body;

    await query(
      `UPDATE aftercare_billing_settings SET auto_generate = $1, updated_at = NOW() WHERE is_active = true`,
      [!!enabled]
    );

    res.json({ auto_generate: !!enabled, message: `Auto-generation ${enabled ? 'enabled' : 'disabled'}` });
  } catch (error) {
    console.error('Error toggling auto-generation:', error);
    res.status(500).json({ error: 'Failed to toggle auto-generation' });
  }
});

// ─── INVOICE PDF / PRINT ─────────────────────────────────────────────────────

// GET /api/aftercare-billing/invoices/:id/pdf - Get invoice data for PDF/print
router.get('/invoices/:id/pdf', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(`
      SELECT 
        i.*,
        p.full_name as student_name,
        p.student_id as student_code,
        p.grade,
        par.full_name as parent_name,
        par.email as parent_email,
        a.check_in_time,
        a.check_out_time
      FROM aftercare_invoices i
      JOIN user_profiles p ON p.id = i.student_id
      LEFT JOIN user_profiles par ON par.id = i.parent_id
      LEFT JOIN aftercare_sessions a ON a.id = i.session_id
      WHERE i.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    // Get school settings for the invoice header
    let schoolSettings = {};
    try {
      const settingsResult = await query(
        `SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('school_name', 'school_address', 'school_phone', 'school_email')`
      );
      for (const row of settingsResult.rows) {
        schoolSettings[row.setting_key] = row.setting_value;
      }
    } catch (e) {
      // Settings table might not exist, use defaults
    }

    const invoice = result.rows[0];

    res.json({
      invoice,
      school: {
        name: schoolSettings.school_name || 'YAMZ Cafe School',
        address: schoolSettings.school_address || '',
        phone: schoolSettings.school_phone || '',
        email: schoolSettings.school_email || '',
      }
    });
  } catch (error) {
    console.error('Error fetching invoice for PDF:', error);
    res.status(500).json({ error: 'Failed to fetch invoice' });
  }
});

// GET /api/aftercare-billing/invoices/export - Export invoices as CSV data
router.get('/invoices/export', async (req, res) => {
  try {
    const userRole = req.user.role;
    if (!['admin', 'staff'].includes(userRole)) {
      return res.status(403).json({ error: 'Only admin/staff can export invoices' });
    }

    const { status, date_from, date_to } = req.query;

    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramIdx = 1;

    if (status && status !== 'all') {
      whereClause += ` AND i.status = $${paramIdx}`;
      params.push(status);
      paramIdx++;
    }
    if (date_from) {
      whereClause += ` AND i.invoice_date >= $${paramIdx}`;
      params.push(date_from);
      paramIdx++;
    }
    if (date_to) {
      whereClause += ` AND i.invoice_date <= $${paramIdx}`;
      params.push(date_to);
      paramIdx++;
    }

    const result = await query(`
      SELECT 
        i.invoice_date,
        p.full_name as student_name,
        p.student_id as student_code,
        p.grade,
        par.full_name as parent_name,
        i.duration_minutes,
        i.rate_type,
        i.rate_amount,
        i.amount,
        i.late_fee,
        i.total,
        i.status,
        i.paid_at
      FROM aftercare_invoices i
      JOIN user_profiles p ON p.id = i.student_id
      LEFT JOIN user_profiles par ON par.id = i.parent_id
      ${whereClause}
      ORDER BY i.invoice_date DESC, p.full_name ASC
    `, params);

    // Return as CSV
    const headers = ['Date', 'Student', 'Code', 'Grade', 'Parent', 'Duration (min)', 'Rate Type', 'Rate', 'Amount', 'Late Fee', 'Total', 'Status', 'Paid At'];
    const csvRows = [headers.join(',')];

    for (const row of result.rows) {
      csvRows.push([
        row.invoice_date,
        `"${row.student_name}"`,
        row.student_code,
        row.grade,
        `"${row.parent_name || ''}"`,
        row.duration_minutes,
        row.rate_type,
        row.rate_amount,
        row.amount,
        row.late_fee,
        row.total,
        row.status,
        row.paid_at || '',
      ].join(','));
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=aftercare-invoices-${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csvRows.join('\n'));
  } catch (error) {
    console.error('Error exporting invoices:', error);
    res.status(500).json({ error: 'Failed to export invoices' });
  }
});

module.exports = router;