/**
 * Auto Invoice Scheduler
 * Runs daily at midnight to auto-generate invoices for the previous day's aftercare sessions.
 * Uses setInterval for simplicity (no external cron dependency needed).
 */

const { query } = require('../config/database');

let schedulerInterval = null;

async function runAutoGenerate() {
  try {
    // Check if auto-generation is enabled
    const settingsResult = await query(
      `SELECT * FROM aftercare_billing_settings WHERE is_active = true ORDER BY created_at DESC LIMIT 1`
    );
    const settings = settingsResult.rows[0];

    if (!settings || !settings.auto_generate) {
      return { generated: 0, skipped: true, message: 'Auto-generation is disabled' };
    }

    // Generate for yesterday
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    // Get completed sessions for yesterday that don't have invoices yet
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
    `, [yesterday]);

    if (sessions.rows.length === 0) {
      return { generated: 0, date: yesterday, message: 'No unbilled sessions' };
    }

    let generated = 0;

    for (const session of sessions.rows) {
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
        yesterday,
      ]);

      generated++;
    }

    // Audit log
    try {
      await query(
        `INSERT INTO audit_trail (user_id, action, details) VALUES ($1, $2, $3)`,
        [null, 'aftercare_auto_invoice_scheduled', JSON.stringify({ count: generated, date: yesterday })]
      );
    } catch (auditErr) {
      console.error('[AutoInvoice] Audit log failed:', auditErr.message);
    }

    console.log(`[AutoInvoice] Generated ${generated} invoice(s) for ${yesterday}`);
    return { generated, date: yesterday };
  } catch (error) {
    console.error('[AutoInvoice] Error:', error.message);
    return { generated: 0, error: error.message };
  }
}

function startScheduler() {
  // Calculate ms until next midnight
  const now = new Date();
  const nextMidnight = new Date(now);
  nextMidnight.setDate(nextMidnight.getDate() + 1);
  nextMidnight.setHours(0, 5, 0, 0); // Run at 00:05 to ensure day has fully ended

  const msUntilMidnight = nextMidnight.getTime() - now.getTime();

  console.log(`[AutoInvoice] Scheduler starting. Next run in ${Math.round(msUntilMidnight / 60000)} minutes`);

  // First run at next midnight
  setTimeout(() => {
    runAutoGenerate();
    // Then run every 24 hours
    schedulerInterval = setInterval(runAutoGenerate, 24 * 60 * 60 * 1000);
  }, msUntilMidnight);
}

function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}

module.exports = { startScheduler, stopScheduler, runAutoGenerate };