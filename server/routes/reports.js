const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { verifyToken, requireRole, requirePermission } = require('../middleware/auth');

// ─── Dashboard Stats ─────────────────────────────────────────────────────────
// GET /api/reports/dashboard-stats
router.get('/dashboard-stats', verifyToken, async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // Today's revenue & transaction count
    const revenueResult = await query(
      `SELECT
        COALESCE(SUM(CASE WHEN transaction_type = 'purchase' THEN total ELSE 0 END), 0) as today_revenue,
        COUNT(*) as today_transactions
      FROM transactions
      WHERE created_at >= $1 AND created_at <= $2
        AND status = 'completed'`,
      [todayStart.toISOString(), todayEnd.toISOString()]
    );

    // Active students count
    const studentsResult = await query(
      "SELECT COUNT(*) as active_students FROM user_profiles WHERE role = 'student' AND account_status = 'active'"
    );

    // Low balance students (below $5)
    const lowBalanceResult = await query(
      "SELECT COUNT(*) as low_balance_count FROM user_profiles WHERE role = 'student' AND account_status = 'active' AND balance < 5"
    );

    // Recent transactions (last 10)
    const recentResult = await query(
      `SELECT t.*,
        up.full_name as student_name, up.student_id as student_number,
        cashier_up.full_name as processed_by_name
      FROM transactions t
      LEFT JOIN user_profiles up ON t.student_id = up.id
      LEFT JOIN user_profiles cashier_up ON t.cashier_id = cashier_up.id
      ORDER BY t.created_at DESC
      LIMIT 10`
    );

    // Map recent transactions for frontend compat
    const recentTransactions = recentResult.rows.map(row => ({
      ...row,
      type: row.transaction_type === 'deposit' ? 'credit' : row.transaction_type,
      amount: row.total,
      processed_by: row.cashier_id,
    }));

    const stats = revenueResult.rows[0];

    res.json({
      todayRevenue: parseFloat(stats.today_revenue) || 0,
      todayTransactions: parseInt(stats.today_transactions, 10) || 0,
      activeStudents: parseInt(studentsResult.rows[0].active_students, 10) || 0,
      lowBalanceCount: parseInt(lowBalanceResult.rows[0].low_balance_count, 10) || 0,
      recentTransactions,
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});

// ─── Financial Reports ───────────────────────────────────────────────────────
router.get('/financial', verifyToken, requirePermission('reports.viewFinancialReports'), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({ error: 'Start date and end date required' });
    }

    const result = await query(
      `SELECT
        DATE(created_at) as date,
        COUNT(*) as transaction_count,
        SUM(CASE WHEN transaction_type = 'purchase' THEN total ELSE 0 END) as total_sales,
        SUM(CASE WHEN transaction_type = 'deposit' THEN total ELSE 0 END) as total_credits,
        SUM(CASE WHEN transaction_type = 'refund' THEN total ELSE 0 END) as total_refunds
      FROM transactions
      WHERE created_at BETWEEN $1 AND $2
      GROUP BY DATE(created_at)
      ORDER BY date`,
      [start_date, end_date]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get financial report error:', error);
    res.status(500).json({ error: 'Failed to generate financial report' });
  }
});

// ─── Student Balance Report ──────────────────────────────────────────────────
router.get('/student-balances', verifyToken, requireRole('admin', 'staff'), async (req, res) => {
  try {
    const { threshold } = req.query;

    let queryText = `
      SELECT up.*
      FROM user_profiles up
      WHERE up.role = 'student'
    `;
    const params = [];

    if (threshold) {
      queryText += ' AND up.balance < $1';
      params.push(threshold);
    }

    queryText += ' ORDER BY up.balance ASC';

    const result = await query(queryText, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get student balance report error:', error);
    res.status(500).json({ error: 'Failed to generate student balance report' });
  }
});

// ─── Menu Sales Report ───────────────────────────────────────────────────────
router.get('/menu-sales', verifyToken, requirePermission('reports.viewSalesReports'), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({ error: 'Start date and end date required' });
    }

    const result = await query(
      `SELECT
        mi.id,
        mi.name,
        mi.category,
        COUNT(ti.id) as times_sold,
        SUM(ti.quantity) as total_quantity,
        SUM(ti.total_price) as total_revenue
      FROM transaction_items ti
      JOIN menu_items mi ON ti.menu_item_id = mi.id
      JOIN transactions t ON ti.transaction_id = t.id
      WHERE t.created_at BETWEEN $1 AND $2
        AND t.transaction_type = 'purchase'
      GROUP BY mi.id, mi.name, mi.category
      ORDER BY total_revenue DESC`,
      [start_date, end_date]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get menu sales report error:', error);
    res.status(500).json({ error: 'Failed to generate menu sales report' });
  }
});

// ─── Audit Trail ─────────────────────────────────────────────────────────────
router.get('/audit-trail', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { user_id, action, start_date, end_date, limit = 100 } = req.query;

    let queryText = `
      SELECT at.*, up.full_name as user_name, up.email as user_email
      FROM audit_trail at
      LEFT JOIN user_profiles up ON at.user_id = up.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;

    if (user_id) {
      queryText += ` AND at.user_id = $${paramCount}`;
      params.push(user_id);
      paramCount++;
    }

    if (action) {
      queryText += ` AND at.action = $${paramCount}`;
      params.push(action);
      paramCount++;
    }

    if (start_date) {
      queryText += ` AND at.created_at >= $${paramCount}`;
      params.push(start_date);
      paramCount++;
    }

    if (end_date) {
      queryText += ` AND at.created_at <= $${paramCount}`;
      params.push(end_date);
      paramCount++;
    }

    queryText += ` ORDER BY at.created_at DESC LIMIT $${paramCount}`;
    params.push(parseInt(limit, 10));

    const result = await query(queryText, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get audit trail error:', error);
    res.status(500).json({ error: 'Failed to fetch audit trail' });
  }
});

// ─── Monthly Report ──────────────────────────────────────────────────────────
// GET /api/reports/monthly?month=3&year=2026
router.get('/monthly', verifyToken, requirePermission('reports.viewFinancialReports'), async (req, res) => {
  try {
    const now = new Date();
    const month = parseInt(req.query.month, 10) || (now.getMonth() + 1); // 1-12
    const year = parseInt(req.query.year, 10) || now.getFullYear();

    // Validate
    if (month < 1 || month > 12 || year < 2000 || year > 2100) {
      return res.status(400).json({ error: 'Invalid month or year' });
    }

    // Date range for the requested month
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endMonth = month === 12 ? 1 : month + 1;
    const endYear = month === 12 ? year + 1 : year;
    const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;

    // Previous month range for comparison
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const prevStartDate = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`;
    const prevEndDate = startDate; // current month start = prev month end

    // 1) Summary for current month
    const summaryResult = await query(
      `SELECT
        COUNT(*) as total_transactions,
        COALESCE(SUM(CASE WHEN transaction_type = 'purchase' THEN total ELSE 0 END), 0) as total_sales,
        COALESCE(SUM(CASE WHEN transaction_type = 'deposit' THEN total ELSE 0 END), 0) as total_deposits,
        COALESCE(SUM(CASE WHEN transaction_type = 'refund' THEN total ELSE 0 END), 0) as total_refunds,
        COALESCE(AVG(CASE WHEN transaction_type = 'purchase' THEN total END), 0) as avg_transaction,
        COUNT(DISTINCT student_id) as unique_students,
        COUNT(DISTINCT cashier_id) as unique_cashiers
      FROM transactions
      WHERE created_at >= $1 AND created_at < $2
        AND status = 'completed'`,
      [startDate, endDate]
    );

    // 2) Summary for previous month (comparison)
    const prevSummaryResult = await query(
      `SELECT
        COUNT(*) as total_transactions,
        COALESCE(SUM(CASE WHEN transaction_type = 'purchase' THEN total ELSE 0 END), 0) as total_sales,
        COALESCE(SUM(CASE WHEN transaction_type = 'deposit' THEN total ELSE 0 END), 0) as total_deposits,
        COALESCE(SUM(CASE WHEN transaction_type = 'refund' THEN total ELSE 0 END), 0) as total_refunds
      FROM transactions
      WHERE created_at >= $1 AND created_at < $2
        AND status = 'completed'`,
      [prevStartDate, prevEndDate]
    );

    // 3) Daily breakdown
    const dailyResult = await query(
      `SELECT
        DATE(created_at) as date,
        COUNT(*) as transaction_count,
        COALESCE(SUM(CASE WHEN transaction_type = 'purchase' THEN total ELSE 0 END), 0) as total_sales,
        COALESCE(SUM(CASE WHEN transaction_type = 'deposit' THEN total ELSE 0 END), 0) as total_deposits,
        COALESCE(SUM(CASE WHEN transaction_type = 'refund' THEN total ELSE 0 END), 0) as total_refunds
      FROM transactions
      WHERE created_at >= $1 AND created_at < $2
        AND status = 'completed'
      GROUP BY DATE(created_at)
      ORDER BY date`,
      [startDate, endDate]
    );

    // 4) Top selling items
    const topItemsResult = await query(
      `SELECT
        ti.item_name as name,
        COALESCE(mi.category, 'Other') as category,
        SUM(ti.quantity) as total_quantity,
        SUM(ti.total_price) as total_revenue,
        COUNT(DISTINCT ti.transaction_id) as order_count
      FROM transaction_items ti
      JOIN transactions t ON ti.transaction_id = t.id
      LEFT JOIN menu_items mi ON ti.menu_item_id = mi.id
      WHERE t.created_at >= $1 AND t.created_at < $2
        AND t.transaction_type = 'purchase'
        AND t.status = 'completed'
      GROUP BY ti.item_name, mi.category
      ORDER BY total_revenue DESC
      LIMIT 20`,
      [startDate, endDate]
    );

    // 5) Payment method breakdown
    const paymentResult = await query(
      `SELECT
        payment_method,
        COUNT(*) as transaction_count,
        COALESCE(SUM(total), 0) as total_amount
      FROM transactions
      WHERE created_at >= $1 AND created_at < $2
        AND status = 'completed'
      GROUP BY payment_method
      ORDER BY total_amount DESC`,
      [startDate, endDate]
    );

    // 6) Transaction type breakdown
    const typeResult = await query(
      `SELECT
        transaction_type,
        COUNT(*) as transaction_count,
        COALESCE(SUM(total), 0) as total_amount
      FROM transactions
      WHERE created_at >= $1 AND created_at < $2
        AND status = 'completed'
      GROUP BY transaction_type
      ORDER BY total_amount DESC`,
      [startDate, endDate]
    );

    // 7) Busiest hours (for the month)
    const hourlyResult = await query(
      `SELECT
        EXTRACT(HOUR FROM created_at) as hour,
        COUNT(*) as transaction_count,
        COALESCE(SUM(total), 0) as total_amount
      FROM transactions
      WHERE created_at >= $1 AND created_at < $2
        AND status = 'completed'
        AND transaction_type = 'purchase'
      GROUP BY EXTRACT(HOUR FROM created_at)
      ORDER BY hour`,
      [startDate, endDate]
    );

    // 8) Category breakdown
    const categoryResult = await query(
      `SELECT
        COALESCE(mi.category, 'Other') as category,
        SUM(ti.quantity) as total_quantity,
        SUM(ti.total_price) as total_revenue
      FROM transaction_items ti
      JOIN transactions t ON ti.transaction_id = t.id
      LEFT JOIN menu_items mi ON ti.menu_item_id = mi.id
      WHERE t.created_at >= $1 AND t.created_at < $2
        AND t.transaction_type = 'purchase'
        AND t.status = 'completed'
      GROUP BY mi.category
      ORDER BY total_revenue DESC`,
      [startDate, endDate]
    );

    const summary = summaryResult.rows[0];
    const prevSummary = prevSummaryResult.rows[0];

    // Calculate percentage changes
    const calcChange = (current, previous) => {
      const curr = parseFloat(current) || 0;
      const prev = parseFloat(previous) || 0;
      if (prev === 0) return curr > 0 ? 100 : 0;
      return parseFloat((((curr - prev) / prev) * 100).toFixed(1));
    };

    res.json({
      month,
      year,
      summary: {
        total_transactions: parseInt(summary.total_transactions, 10),
        total_sales: parseFloat(summary.total_sales),
        total_deposits: parseFloat(summary.total_deposits),
        total_refunds: parseFloat(summary.total_refunds),
        avg_transaction: parseFloat(parseFloat(summary.avg_transaction).toFixed(2)),
        unique_students: parseInt(summary.unique_students, 10),
        unique_cashiers: parseInt(summary.unique_cashiers, 10),
        net_revenue: parseFloat(summary.total_sales) - parseFloat(summary.total_refunds),
      },
      comparison: {
        sales_change: calcChange(summary.total_sales, prevSummary.total_sales),
        transactions_change: calcChange(summary.total_transactions, prevSummary.total_transactions),
        deposits_change: calcChange(summary.total_deposits, prevSummary.total_deposits),
        refunds_change: calcChange(summary.total_refunds, prevSummary.total_refunds),
        prev_total_sales: parseFloat(prevSummary.total_sales),
        prev_total_transactions: parseInt(prevSummary.total_transactions, 10),
      },
      daily_breakdown: dailyResult.rows.map(row => ({
        date: row.date,
        transaction_count: parseInt(row.transaction_count, 10),
        total_sales: parseFloat(row.total_sales),
        total_deposits: parseFloat(row.total_deposits),
        total_refunds: parseFloat(row.total_refunds),
      })),
      top_items: topItemsResult.rows.map(row => ({
        name: row.name,
        category: row.category,
        total_quantity: parseInt(row.total_quantity, 10),
        total_revenue: parseFloat(row.total_revenue),
        order_count: parseInt(row.order_count, 10),
      })),
      payment_methods: paymentResult.rows.map(row => ({
        method: row.payment_method,
        transaction_count: parseInt(row.transaction_count, 10),
        total_amount: parseFloat(row.total_amount),
      })),
      transaction_types: typeResult.rows.map(row => ({
        type: row.transaction_type,
        transaction_count: parseInt(row.transaction_count, 10),
        total_amount: parseFloat(row.total_amount),
      })),
      hourly_breakdown: hourlyResult.rows.map(row => ({
        hour: parseInt(row.hour, 10),
        transaction_count: parseInt(row.transaction_count, 10),
        total_amount: parseFloat(row.total_amount),
      })),
      category_breakdown: categoryResult.rows.map(row => ({
        category: row.category,
        total_quantity: parseInt(row.total_quantity, 10),
        total_revenue: parseFloat(row.total_revenue),
      })),
    });
  } catch (error) {
    console.error('Get monthly report error:', error);
    res.status(500).json({ error: 'Failed to generate monthly report' });
  }
});

// ─── Balance Report Schedule Settings ────────────────────────────────────────
// GET /api/reports/balance-report-settings
router.get('/balance-report-settings', verifyToken, requireRole('admin', 'staff'), async (req, res) => {
  try {
    const { getReportScheduleSettings } = require('../services/balanceReportService');
    const settings = await getReportScheduleSettings();
    res.json(settings);
  } catch (error) {
    console.error('Get balance report settings error:', error);
    res.status(500).json({ error: 'Failed to fetch balance report settings' });
  }
});

// PUT /api/reports/balance-report-settings
router.put('/balance-report-settings', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { saveReportScheduleSettings } = require('../services/balanceReportService');
    const settings = await saveReportScheduleSettings(req.body);
    res.json({ message: 'Balance report settings saved', settings });
  } catch (error) {
    console.error('Save balance report settings error:', error);
    res.status(500).json({ error: 'Failed to save balance report settings' });
  }
});

// ─── Students with Parents (for report preview) ─────────────────────────────
// GET /api/reports/students-with-parents
router.get('/students-with-parents', verifyToken, requireRole('admin', 'staff'), async (req, res) => {
  try {
    const { getStudentsWithParents } = require('../services/balanceReportService');
    const students = await getStudentsWithParents();
    res.json(students);
  } catch (error) {
    console.error('Get students with parents error:', error);
    res.status(500).json({ error: 'Failed to fetch students with parents' });
  }
});

// ─── Send Balance Reports ────────────────────────────────────────────────────
// POST /api/reports/send-balance-reports
router.post('/send-balance-reports', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { frequency = 'monthly' } = req.body;
    const { sendBulkBalanceReports } = require('../services/balanceReportService');
    const results = await sendBulkBalanceReports(frequency);
    res.json({
      message: `Balance reports sent: ${results.sent} successful, ${results.failed} failed, ${results.skipped} skipped`,
      ...results,
    });
  } catch (error) {
    console.error('Send balance reports error:', error);
    res.status(500).json({ error: `Failed to send balance reports: ${error.message}` });
  }
});

// POST /api/reports/send-balance-report/:studentId
router.post('/send-balance-report/:studentId', verifyToken, requireRole('admin', 'staff'), async (req, res) => {
  try {
    const { studentId } = req.params;
    const { frequency = 'monthly' } = req.body;
    const { sendSingleStudentReport } = require('../services/balanceReportService');
    const results = await sendSingleStudentReport(studentId, frequency);
    res.json({
      message: `Balance report sent: ${results.sent} successful, ${results.failed} failed`,
      ...results,
    });
  } catch (error) {
    console.error('Send single balance report error:', error);
    res.status(500).json({ error: `Failed to send balance report: ${error.message}` });
  }
});

// GET /api/reports/last-balance-report-run
router.get('/last-balance-report-run', verifyToken, requireRole('admin', 'staff'), async (req, res) => {
  try {
    const result = await query(
      `SELECT value FROM system_config WHERE key = 'last_balance_report_run'`
    );
    if (result?.rows?.length > 0) {
      let val = result.rows[0].value;
      try { val = JSON.parse(val); } catch { /* use raw */ }
      return res.json(val);
    }
    res.json(null);
  } catch (error) {
    console.error('Get last balance report run error:', error);
    res.status(500).json({ error: 'Failed to fetch last report run' });
  }
});

module.exports = router;