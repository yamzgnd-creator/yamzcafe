const { query } = require('../config/database');
const { sendEmail, loadSmtpConfig, replacePlaceholders } = require('./emailService');

/**
 * Default balance report email template
 */
const BALANCE_REPORT_TEMPLATE = {
  subject: '{{app_name}} — {{report_type}} Balance Report for {{student_name}}',
  body: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: 'Segoe UI', Arial, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.07);">
          <tr>
            <td style="background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); padding: 32px 40px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">🍽️ {{app_name}}</h1>
              <p style="margin: 8px 0 0; color: rgba(255,255,255,0.85); font-size: 14px;">{{report_type}} Balance Report</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 36px 40px 24px;">
              <h2 style="margin: 0 0 16px; color: #111827; font-size: 22px; font-weight: 600;">Hello, {{parent_name}}! 👋</h2>
              <p style="margin: 0 0 16px; color: #374151; font-size: 15px; line-height: 1.6;">
                Here is the {{report_type_lower}} balance report for your child <strong>{{student_name}}</strong>.
              </p>

              <!-- Balance Card -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 20px 0; background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 4px; color: #166534; font-size: 13px; font-weight: 600; text-transform: uppercase;">Current Balance</p>
                    <p style="margin: 0; color: #15803d; font-size: 32px; font-weight: 700;">{{currency_symbol}}{{current_balance}}</p>
                  </td>
                </tr>
              </table>

              <!-- Summary -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 20px 0; border: 1px solid #e5e7eb; border-radius: 8px;">
                <tr>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb;">
                    <p style="margin: 0 0 4px; color: #6b7280; font-size: 13px; font-weight: 600; text-transform: uppercase;">Report Period</p>
                    <p style="margin: 0; color: #111827; font-size: 15px;">{{period_start}} — {{period_end}}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 16px 20px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="width: 33%; text-align: center; padding: 8px;">
                          <p style="margin: 0 0 4px; color: #6b7280; font-size: 12px;">Transactions</p>
                          <p style="margin: 0; color: #111827; font-size: 18px; font-weight: 700;">{{transaction_count}}</p>
                        </td>
                        <td style="width: 33%; text-align: center; padding: 8px; border-left: 1px solid #e5e7eb; border-right: 1px solid #e5e7eb;">
                          <p style="margin: 0 0 4px; color: #6b7280; font-size: 12px;">Total Spent</p>
                          <p style="margin: 0; color: #dc2626; font-size: 18px; font-weight: 700;">{{currency_symbol}}{{total_spent}}</p>
                        </td>
                        <td style="width: 33%; text-align: center; padding: 8px;">
                          <p style="margin: 0 0 4px; color: #6b7280; font-size: 12px;">Deposits</p>
                          <p style="margin: 0; color: #15803d; font-size: 18px; font-weight: 700;">{{currency_symbol}}{{total_deposits}}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              {{#if low_balance_warning}}
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 20px 0; background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <p style="margin: 0; color: #991b1b; font-size: 14px; font-weight: 600;">⚠️ Low Balance Alert</p>
                    <p style="margin: 8px 0 0; color: #b91c1c; font-size: 14px;">
                      {{student_name}}'s balance is below {{currency_symbol}}{{low_balance_threshold}}. Please consider adding funds to their account.
                    </p>
                  </td>
                </tr>
              </table>
              {{/if}}

              <!-- Recent Transactions -->
              {{recent_transactions_html}}

              <p style="margin: 24px 0 0; color: #6b7280; font-size: 13px; line-height: 1.5;">
                This report was automatically generated on {{generated_date}}. If you have any questions, please contact the school cafeteria.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 40px 32px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center;">
                This is an automated message from {{app_name}}. Please do not reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
};

/**
 * Build an HTML table of recent transactions
 */
function buildTransactionsHtml(transactions, currencySymbol = '$') {
  if (!transactions || transactions.length === 0) {
    return '<p style="margin: 20px 0; color: #6b7280; font-size: 14px; font-style: italic;">No transactions during this period.</p>';
  }

  let html = `
    <p style="margin: 20px 0 8px; color: #111827; font-size: 15px; font-weight: 600;">Recent Transactions</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
      <tr style="background-color: #f9fafb;">
        <td style="padding: 10px 12px; font-size: 12px; font-weight: 600; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Date</td>
        <td style="padding: 10px 12px; font-size: 12px; font-weight: 600; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Type</td>
        <td style="padding: 10px 12px; font-size: 12px; font-weight: 600; color: #6b7280; border-bottom: 1px solid #e5e7eb; text-align: right;">Amount</td>
      </tr>`;

  for (const tx of transactions.slice(0, 15)) {
    const date = new Date(tx.created_at).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
    const type = tx.transaction_type || tx.type || 'purchase';
    const typeLabel = type === 'deposit' ? 'Deposit' : type === 'refund' ? 'Refund' : 'Purchase';
    const amount = parseFloat(tx.total || tx.amount || 0).toFixed(2);
    const color = type === 'deposit' ? '#15803d' : type === 'refund' ? '#2563eb' : '#dc2626';
    const prefix = type === 'deposit' ? '+' : type === 'refund' ? '+' : '-';

    html += `
      <tr>
        <td style="padding: 10px 12px; font-size: 13px; color: #374151; border-bottom: 1px solid #f3f4f6;">${date}</td>
        <td style="padding: 10px 12px; font-size: 13px; color: #374151; border-bottom: 1px solid #f3f4f6;">${typeLabel}</td>
        <td style="padding: 10px 12px; font-size: 13px; color: ${color}; font-weight: 600; text-align: right; border-bottom: 1px solid #f3f4f6;">${prefix}${currencySymbol}${amount}</td>
      </tr>`;
  }

  html += '</table>';

  if (transactions.length > 15) {
    html += `<p style="margin: 8px 0 0; color: #6b7280; font-size: 12px;">...and ${transactions.length - 15} more transactions</p>`;
  }

  return html;
}

/**
 * Get the report schedule settings from system_config
 */
async function getReportScheduleSettings() {
  try {
    const result = await query(
      `SELECT value FROM system_config WHERE key = 'balance_report_schedule'`
    );
    if (result?.rows?.length > 0) {
      let val = result.rows[0].value;
      try { val = JSON.parse(val); } catch { /* use raw */ }
      return val;
    }
  } catch (err) {
    console.error('Failed to load report schedule settings:', err.message);
  }
  // Defaults
  return {
    enabled: false,
    frequency: 'monthly', // 'weekly' or 'monthly'
    day_of_week: 1,        // Monday (for weekly)
    day_of_month: 1,       // 1st (for monthly)
    low_balance_threshold: 5,
    include_transactions: true,
  };
}

/**
 * Save the report schedule settings
 */
async function saveReportScheduleSettings(settings) {
  await query(
    `INSERT INTO system_config (key, value)
     VALUES ('balance_report_schedule', $1)
     ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
    [JSON.stringify(settings)]
  );
  return settings;
}

/**
 * Get students with their parent emails for sending reports
 */
async function getStudentsWithParents() {
  const result = await query(`
    SELECT
      s.id as student_id,
      s.full_name as student_name,
      s.student_id as student_number,
      s.grade,
      s.balance,
      p.id as parent_id,
      p.full_name as parent_name,
      p.email as parent_email
    FROM user_profiles s
    JOIN parent_students ps ON ps.student_id = s.id
    JOIN user_profiles p ON ps.parent_id = p.id
    WHERE s.role = 'student'
      AND s.account_status = 'active'
      AND p.email IS NOT NULL
      AND p.email != ''
    ORDER BY s.full_name
  `);
  return result.rows;
}

/**
 * Get transactions for a student within a date range
 */
async function getStudentTransactions(studentId, startDate, endDate) {
  const result = await query(
    `SELECT t.*, ti.item_name
     FROM transactions t
     LEFT JOIN transaction_items ti ON ti.transaction_id = t.id
     WHERE t.student_id = $1
       AND t.created_at >= $2
       AND t.created_at < $3
       AND t.status = 'completed'
     ORDER BY t.created_at DESC`,
    [studentId, startDate, endDate]
  );
  return result.rows;
}

/**
 * Get transaction summary for a student within a date range
 */
async function getStudentTransactionSummary(studentId, startDate, endDate) {
  const result = await query(
    `SELECT
      COUNT(*) as transaction_count,
      COALESCE(SUM(CASE WHEN transaction_type = 'purchase' THEN total ELSE 0 END), 0) as total_spent,
      COALESCE(SUM(CASE WHEN transaction_type = 'deposit' THEN total ELSE 0 END), 0) as total_deposits,
      COALESCE(SUM(CASE WHEN transaction_type = 'refund' THEN total ELSE 0 END), 0) as total_refunds
    FROM transactions
    WHERE student_id = $1
      AND created_at >= $2
      AND created_at < $3
      AND status = 'completed'`,
    [studentId, startDate, endDate]
  );
  return result.rows[0];
}

/**
 * Calculate the date range for the report period
 */
function getReportDateRange(frequency) {
  const now = new Date();
  let startDate, endDate;

  if (frequency === 'weekly') {
    // Last 7 days
    endDate = new Date(now);
    endDate.setHours(23, 59, 59, 999);
    startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 7);
    startDate.setHours(0, 0, 0, 0);
  } else {
    // Last month
    endDate = new Date(now.getFullYear(), now.getMonth(), 1); // First of current month
    startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1); // First of last month
  }

  return { startDate, endDate };
}

/**
 * Send a balance report email to a specific parent for a specific student
 */
async function sendBalanceReportEmail({
  parentEmail,
  parentName,
  studentName,
  currentBalance,
  transactionCount,
  totalSpent,
  totalDeposits,
  periodStart,
  periodEnd,
  transactions,
  frequency,
  lowBalanceThreshold,
  companyName,
  currencySymbol,
}) {
  const brandName = companyName || 'YAMZ Cafe';
  const symbol = currencySymbol || '$';
  const reportType = frequency === 'weekly' ? 'Weekly' : 'Monthly';
  const isLowBalance = currentBalance < (lowBalanceThreshold || 5);

  // Build transactions HTML
  const recentTransactionsHtml = buildTransactionsHtml(transactions, symbol);

  // Handle low balance warning conditional
  let bodyTemplate = BALANCE_REPORT_TEMPLATE.body;
  if (isLowBalance) {
    bodyTemplate = bodyTemplate
      .replace('{{#if low_balance_warning}}', '')
      .replace('{{/if}}', '');
  } else {
    // Remove the low balance warning block
    bodyTemplate = bodyTemplate.replace(
      /\{\{#if low_balance_warning\}\}[\s\S]*?\{\{\/if\}\}/g,
      ''
    );
  }

  const variables = {
    app_name: brandName,
    report_type: reportType,
    report_type_lower: reportType.toLowerCase(),
    parent_name: parentName || 'Parent',
    student_name: studentName,
    currency_symbol: symbol,
    current_balance: parseFloat(currentBalance || 0).toFixed(2),
    period_start: periodStart,
    period_end: periodEnd,
    transaction_count: String(transactionCount || 0),
    total_spent: parseFloat(totalSpent || 0).toFixed(2),
    total_deposits: parseFloat(totalDeposits || 0).toFixed(2),
    low_balance_threshold: String(lowBalanceThreshold || 5),
    recent_transactions_html: recentTransactionsHtml,
    generated_date: new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    }),
  };

  const subject = replacePlaceholders(BALANCE_REPORT_TEMPLATE.subject, variables);
  const html = replacePlaceholders(bodyTemplate, variables);

  const text = `${reportType} Balance Report for ${studentName}\n\nCurrent Balance: ${symbol}${variables.current_balance}\nPeriod: ${periodStart} — ${periodEnd}\nTransactions: ${transactionCount}\nTotal Spent: ${symbol}${variables.total_spent}\nDeposits: ${symbol}${variables.total_deposits}\n\n— ${brandName}`;

  return sendEmail(parentEmail, subject, html, text);
}

/**
 * Send balance reports to all parents
 */
async function sendBulkBalanceReports(frequency = 'monthly') {
  const settings = await getReportScheduleSettings();
  const lowBalanceThreshold = settings.low_balance_threshold || 5;

  // Get company branding
  let companyName = 'YAMZ Cafe';
  let currencySymbol = '$';
  try {
    const brandResult = await query(
      'SELECT company_name, currency_symbol FROM company_settings ORDER BY created_at DESC LIMIT 1'
    );
    if (brandResult?.rows?.length > 0) {
      companyName = brandResult.rows[0].company_name || companyName;
      currencySymbol = brandResult.rows[0].currency_symbol || currencySymbol;
    }
  } catch { /* use defaults */ }

  // Get date range
  const { startDate, endDate } = getReportDateRange(frequency);
  const periodStart = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const periodEnd = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  // Get all students with parents
  const studentsWithParents = await getStudentsWithParents();

  const results = {
    total: studentsWithParents.length,
    sent: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  for (const record of studentsWithParents) {
    try {
      // Get transaction summary
      const summary = await getStudentTransactionSummary(
        record.student_id,
        startDate.toISOString(),
        endDate.toISOString()
      );

      // Get recent transactions
      let transactions = [];
      if (settings.include_transactions !== false) {
        transactions = await getStudentTransactions(
          record.student_id,
          startDate.toISOString(),
          endDate.toISOString()
        );
      }

      await sendBalanceReportEmail({
        parentEmail: record.parent_email,
        parentName: record.parent_name,
        studentName: record.student_name,
        currentBalance: record.balance,
        transactionCount: parseInt(summary.transaction_count, 10),
        totalSpent: parseFloat(summary.total_spent),
        totalDeposits: parseFloat(summary.total_deposits),
        periodStart,
        periodEnd,
        transactions,
        frequency,
        lowBalanceThreshold,
        companyName,
        currencySymbol,
      });

      results.sent++;
      console.log(`📧 Balance report sent to ${record.parent_email} for ${record.student_name}`);
    } catch (err) {
      results.failed++;
      results.errors.push({
        parent_email: record.parent_email,
        student_name: record.student_name,
        error: err.message,
      });
      console.error(`❌ Failed to send balance report to ${record.parent_email}:`, err.message);
    }
  }

  // Log the report run
  try {
    await query(
      `INSERT INTO system_config (key, value)
       VALUES ('last_balance_report_run', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
      [JSON.stringify({
        ran_at: new Date().toISOString(),
        frequency,
        ...results,
      })]
    );
  } catch { /* ignore logging errors */ }

  return results;
}

/**
 * Send a single balance report for a specific student to their parents
 */
async function sendSingleStudentReport(studentId, frequency = 'monthly') {
  const settings = await getReportScheduleSettings();
  const lowBalanceThreshold = settings.low_balance_threshold || 5;

  // Get company branding
  let companyName = 'YAMZ Cafe';
  let currencySymbol = '$';
  try {
    const brandResult = await query(
      'SELECT company_name, currency_symbol FROM company_settings ORDER BY created_at DESC LIMIT 1'
    );
    if (brandResult?.rows?.length > 0) {
      companyName = brandResult.rows[0].company_name || companyName;
      currencySymbol = brandResult.rows[0].currency_symbol || currencySymbol;
    }
  } catch { /* use defaults */ }

  // Get date range
  const { startDate, endDate } = getReportDateRange(frequency);
  const periodStart = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const periodEnd = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  // Get student info with parents
  const result = await query(`
    SELECT
      s.id as student_id,
      s.full_name as student_name,
      s.balance,
      p.id as parent_id,
      p.full_name as parent_name,
      p.email as parent_email
    FROM user_profiles s
    JOIN parent_students ps ON ps.student_id = s.id
    JOIN user_profiles p ON ps.parent_id = p.id
    WHERE s.id = $1
      AND p.email IS NOT NULL
      AND p.email != ''
  `, [studentId]);

  if (result.rows.length === 0) {
    throw new Error('No linked parents with email found for this student');
  }

  const results = { sent: 0, failed: 0, errors: [] };

  for (const record of result.rows) {
    try {
      const summary = await getStudentTransactionSummary(
        record.student_id,
        startDate.toISOString(),
        endDate.toISOString()
      );

      let transactions = [];
      if (settings.include_transactions !== false) {
        transactions = await getStudentTransactions(
          record.student_id,
          startDate.toISOString(),
          endDate.toISOString()
        );
      }

      await sendBalanceReportEmail({
        parentEmail: record.parent_email,
        parentName: record.parent_name,
        studentName: record.student_name,
        currentBalance: record.balance,
        transactionCount: parseInt(summary.transaction_count, 10),
        totalSpent: parseFloat(summary.total_spent),
        totalDeposits: parseFloat(summary.total_deposits),
        periodStart,
        periodEnd,
        transactions,
        frequency,
        lowBalanceThreshold,
        companyName,
        currencySymbol,
      });

      results.sent++;
    } catch (err) {
      results.failed++;
      results.errors.push({
        parent_email: record.parent_email,
        error: err.message,
      });
    }
  }

  return results;
}

module.exports = {
  getReportScheduleSettings,
  saveReportScheduleSettings,
  getStudentsWithParents,
  sendBalanceReportEmail,
  sendBulkBalanceReports,
  sendSingleStudentReport,
  getReportDateRange,
  BALANCE_REPORT_TEMPLATE,
};