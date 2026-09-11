const express = require('express');
const router = express.Router();
const { query, transaction } = require('../config/database');
const { verifyToken, requireRole, requirePermission } = require('../middleware/auth');

// Get all transactions (with filters)
// Actual DB columns: id, transaction_id, student_id, cashier_id, terminal_id,
//   transaction_type, payment_method, subtotal, tax, total, cash_received,
//   change_given, receipt_number, notes, created_at, status, failure_reason,
//   resolved_by, resolved_at
router.get('/', verifyToken, async (req, res) => {
  try {
    const { student_id, type, status, start_date, end_date, limit = 100 } = req.query;

    let queryText = `
      SELECT t.*,
        up.full_name as student_name, up.student_id as student_number,
        cashier_up.full_name as processed_by_name,
        COALESCE(
          (SELECT json_agg(
            json_build_object(
              'id', ti.id,
              'menu_item_id', ti.menu_item_id,
              'item_name', ti.item_name,
              'quantity', ti.quantity,
              'unit_price', ti.unit_price,
              'price', ti.unit_price,
              'total_price', ti.total_price
            )
          ) FROM transaction_items ti WHERE ti.transaction_id = t.id),
          '[]'::json
        ) as items
      FROM transactions t
      LEFT JOIN user_profiles up ON t.student_id = up.id
      LEFT JOIN user_profiles cashier_up ON t.cashier_id = cashier_up.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;

    if (student_id) {
      queryText += ` AND t.student_id = $${paramCount}`;
      params.push(student_id);
      paramCount++;
    }

    if (type) {
      queryText += ` AND t.transaction_type = $${paramCount}`;
      params.push(type);
      paramCount++;
    }

    if (status) {
      queryText += ` AND t.status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    if (start_date) {
      queryText += ` AND t.created_at >= $${paramCount}::timestamptz`;
      params.push(start_date);
      paramCount++;
    }

    if (end_date) {
      queryText += ` AND t.created_at <= $${paramCount}::timestamptz`;
      params.push(end_date);
      paramCount++;
    }

    queryText += ` ORDER BY t.created_at DESC LIMIT $${paramCount}`;
    params.push(parseInt(limit, 10));

    const result = await query(queryText, params);

    // Map to expected field names for frontend compatibility
    const mapped = result.rows.map(row => ({
      ...row,
      type: row.transaction_type === 'deposit' ? 'credit' : row.transaction_type,
      amount: row.total,
      processed_by: row.cashier_id,
      items: typeof row.items === 'string' ? JSON.parse(row.items) : (row.items || []),
    }));

    res.json(mapped);
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ error: 'Failed to fetch transactions', details: error.message });
  }
});

// Get pending/failed transactions
router.get('/pending', verifyToken, async (req, res) => {
  try {
    const { status: filterStatus, start_date, end_date } = req.query;

    let queryText = `
      SELECT t.*,
        up.full_name as student_name, up.student_id as student_number,
        cashier_up.full_name as processed_by_name
      FROM transactions t
      LEFT JOIN user_profiles up ON t.student_id = up.id
      LEFT JOIN user_profiles cashier_up ON t.cashier_id = cashier_up.id
      WHERE t.status IN ('pending', 'failed')
    `;
    const params = [];
    let paramCount = 1;

    if (filterStatus) {
      queryText += ` AND t.status = $${paramCount}`;
      params.push(filterStatus);
      paramCount++;
    }

    if (start_date) {
      queryText += ` AND t.created_at >= $${paramCount}::timestamptz`;
      params.push(start_date);
      paramCount++;
    }

    if (end_date) {
      queryText += ` AND t.created_at <= $${paramCount}::timestamptz`;
      params.push(end_date);
      paramCount++;
    }

    queryText += ' ORDER BY t.created_at DESC LIMIT 200';

    const result = await query(queryText, params);

    const mapped = result.rows.map(row => ({
      ...row,
      type: row.transaction_type,
      amount: row.total,
    }));

    res.json(mapped);
  } catch (error) {
    console.error('Get pending transactions error:', error);
    res.status(500).json({ error: 'Failed to fetch pending transactions' });
  }
});

// Get transaction statistics
router.get('/stats/summary', verifyToken, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    let dateFilter = '';
    const params = [];

    if (start_date && end_date) {
      dateFilter = 'WHERE created_at BETWEEN $1 AND $2';
      params.push(start_date, end_date);
    }

    const result = await query(
      `SELECT
        COUNT(*) as total_transactions,
        SUM(CASE WHEN transaction_type = 'purchase' THEN total ELSE 0 END) as total_sales,
        SUM(CASE WHEN transaction_type = 'deposit' THEN total ELSE 0 END) as total_credits,
        SUM(CASE WHEN transaction_type = 'refund' THEN total ELSE 0 END) as total_refunds,
        AVG(CASE WHEN transaction_type = 'purchase' THEN total ELSE NULL END) as avg_transaction
      FROM transactions
      ${dateFilter}`,
      params
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// Get today's POS stats for the current cashier
router.get('/stats/today', verifyToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT
        COUNT(*) FILTER (WHERE transaction_type = 'purchase' AND status = 'completed') as total_transactions,
        COALESCE(SUM(total) FILTER (WHERE transaction_type = 'purchase' AND status = 'completed'), 0) as total_sales,
        COALESCE(AVG(total) FILTER (WHERE transaction_type = 'purchase' AND status = 'completed'), 0) as avg_order
      FROM transactions
      WHERE created_at >= CURRENT_DATE
        AND created_at < CURRENT_DATE + INTERVAL '1 day'`
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get today stats error:', error);
    res.status(500).json({ error: 'Failed to fetch today stats' });
  }
});

// Get popular items (most frequently ordered)
router.get('/stats/popular-items', verifyToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT ti.menu_item_id, ti.item_name as name,
        SUM(ti.quantity) as total_qty,
        mi.price, mi.image, mi.category
      FROM transaction_items ti
      JOIN transactions t ON ti.transaction_id = t.id
      LEFT JOIN menu_items mi ON ti.menu_item_id = mi.id
      WHERE t.status = 'completed'
        AND t.transaction_type = 'purchase'
        AND t.created_at >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY ti.menu_item_id, ti.item_name, mi.price, mi.image, mi.category
      ORDER BY total_qty DESC
      LIMIT 8`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get popular items error:', error);
    res.status(500).json({ error: 'Failed to fetch popular items' });
  }
});

// Get recent transactions for current cashier
router.get('/stats/recent-cashier', verifyToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT t.id, t.transaction_id, t.total, t.payment_method, t.created_at, t.status,
        up.full_name as student_name,
        COALESCE(
          (SELECT json_agg(json_build_object('name', ti.item_name, 'quantity', ti.quantity))
           FROM transaction_items ti WHERE ti.transaction_id = t.id),
          '[]'::json
        ) as items
      FROM transactions t
      LEFT JOIN user_profiles up ON t.student_id = up.id
      WHERE t.cashier_id = $1
        AND t.transaction_type = 'purchase'
        AND t.created_at >= CURRENT_DATE
      ORDER BY t.created_at DESC
      LIMIT 10`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get recent cashier transactions error:', error);
    res.status(500).json({ error: 'Failed to fetch recent transactions' });
  }
});

// Get transaction by ID — MUST be after all /stats/* routes
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT t.*,
        up.full_name as student_name, up.student_id as student_number,
        cashier_up.full_name as processed_by_name,
        COALESCE(
          (SELECT json_agg(
            json_build_object(
              'id', ti.id,
              'menu_item_id', ti.menu_item_id,
              'name', COALESCE(ti.item_name, mi.name),
              'item_name', COALESCE(ti.item_name, mi.name),
              'quantity', ti.quantity,
              'price', ti.unit_price,
              'unit_price', ti.unit_price,
              'total_price', ti.total_price
            )
          ) FROM transaction_items ti
          LEFT JOIN menu_items mi ON ti.menu_item_id = mi.id
          WHERE ti.transaction_id = t.id),
          '[]'::json
        ) as transaction_items
      FROM transactions t
      LEFT JOIN user_profiles up ON t.student_id = up.id
      LEFT JOIN user_profiles cashier_up ON t.cashier_id = cashier_up.id
      WHERE t.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const row = result.rows[0];
    res.json({
      ...row,
      type: row.transaction_type === 'deposit' ? 'credit' : row.transaction_type,
      amount: row.total,
      processed_by: row.cashier_id,
      items: row.transaction_items,
    });
  } catch (error) {
    console.error('Get transaction error:', error);
    res.status(500).json({ error: 'Failed to fetch transaction' });
  }
});

// Create transaction (purchase)
// transaction_items columns: id, transaction_id, menu_item_id, item_name,
//   quantity, unit_price, total_price, created_at
router.post('/', verifyToken, async (req, res) => {
  try {
    const {
      student_id, items, payment_method, notes,
      cash_received, change_given,
      discount_amount, discount_type, discount_reason
    } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'Items are required' });
    }

    const result = await transaction(async (client) => {
      // If paying from account, verify student and balance
      let currentBalance = 0;
      if (payment_method === 'account') {
        if (!student_id) {
          throw new Error('Student ID required for account payment');
        }
        const studentResult = await client.query(
          "SELECT balance FROM user_profiles WHERE id = $1 AND role = 'student'",
          [student_id]
        );

        if (studentResult.rows.length === 0) {
          throw new Error('Student not found');
        }

        currentBalance = parseFloat(studentResult.rows[0].balance);
      }

      // Calculate total from menu items
      let subtotal = 0;
      const resolvedItems = [];

      for (const item of items) {
        const menuItem = await client.query(
          'SELECT id, name, price FROM menu_items WHERE id = $1',
          [item.menu_item_id]
        );

        if (menuItem.rows.length === 0) {
          throw new Error(`Menu item ${item.menu_item_id} not found`);
        }

        const mi = menuItem.rows[0];
        const unitPrice = parseFloat(mi.price);
        const qty = item.quantity || 1;
        const totalPrice = unitPrice * qty;
        subtotal += totalPrice;

        resolvedItems.push({
          menu_item_id: mi.id,
          item_name: mi.name,
          quantity: qty,
          unit_price: unitPrice,
          total_price: totalPrice,
        });
      }

      const tax = 0;
      // Apply discount
      const discountAmt = parseFloat(discount_amount) || 0;
      let total = subtotal + tax;
      if (discount_type === 'percentage') {
        total = total * (1 - discountAmt / 100);
      } else if (discount_type === 'fixed') {
        total = total - discountAmt;
      }
      total = Math.max(0, Math.round(total * 100) / 100);

      // Check balance for account payments (with negative balance settings)
      if (payment_method === 'account') {
        let negativeBalanceEnabled = false;
        let negativeBalanceCap = 0;

        try {
          const enabledResult = await client.query(
            "SELECT value FROM system_config WHERE key = 'negative_balance_enabled'"
          );
          if (enabledResult.rows.length > 0) {
            const val = enabledResult.rows[0].value;
            const parsed = typeof val === 'string' ? JSON.parse(val) : val;
            negativeBalanceEnabled = parsed === true || parsed === 'true';
          }
        } catch (enabledErr) {
          console.error('Failed to fetch negative_balance_enabled:', enabledErr);
        }

        try {
          const capResult = await client.query(
            "SELECT value FROM system_config WHERE key = 'negative_balance_cap'"
          );
          if (capResult.rows.length > 0) {
            const val = capResult.rows[0].value;
            const parsed = typeof val === 'string' ? JSON.parse(val) : val;
            negativeBalanceCap = parseFloat(parsed) || 0;
          }
        } catch (capErr) {
          console.error('Failed to fetch negative_balance_cap:', capErr);
        }

        const resultingBalance = currentBalance - total;

        if (negativeBalanceEnabled && negativeBalanceCap > 0) {
          // Negative balances allowed up to the cap
          if (resultingBalance < -negativeBalanceCap) {
            throw new Error(
              `Insufficient balance. This transaction would bring the balance to $${resultingBalance.toFixed(2)}, which exceeds the negative balance limit of -$${negativeBalanceCap.toFixed(2)}.`
            );
          }
        } else {
          // Negative balances not allowed
          if (resultingBalance < 0) {
            throw new Error(
              `Insufficient balance ($${currentBalance.toFixed(2)}). This transaction requires $${total.toFixed(2)}. Negative balances are not allowed.`
            );
          }
        }
      }

      // Generate receipt number
      const receiptNum = `RCP-${Date.now()}`;
      const txnId = `TXN-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;

      // Create transaction record
      const transactionResult = await client.query(
        `INSERT INTO transactions (
          transaction_id, student_id, cashier_id, transaction_type, payment_method,
          subtotal, tax, total, cash_received, change_given,
          discount_amount, discount_type, discount_reason,
          receipt_number, notes, status
        ) VALUES ($1, $2, $3, 'purchase', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'completed')
        RETURNING *`,
        [
          txnId, student_id || null, req.user.id, payment_method,
          subtotal, tax, total,
          cash_received || null, change_given || null,
          discountAmt || 0, discount_type || null, discount_reason || null,
          receiptNum, notes || null
        ]
      );

      const transactionId = transactionResult.rows[0].id;

      // Create transaction items and decrement inventory stock
      for (const ri of resolvedItems) {
        await client.query(
          `INSERT INTO transaction_items (
            transaction_id, menu_item_id, item_name, quantity, unit_price, total_price
          ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [transactionId, ri.menu_item_id, ri.item_name, ri.quantity, ri.unit_price, ri.total_price]
        );

        // Decrement stock_quantity for the sold item (floor at 0)
        await client.query(
          `UPDATE menu_items SET stock_quantity = GREATEST(0, stock_quantity - $1), updated_at = NOW() WHERE id = $2`,
          [ri.quantity, ri.menu_item_id]
        );
      }

      // Update student balance if paying from account
      if (payment_method === 'account' && student_id) {
        await client.query(
          'UPDATE user_profiles SET balance = balance - $1 WHERE id = $2',
          [total, student_id]
        );
      }

      const row = transactionResult.rows[0];
      return {
        ...row,
        type: row.transaction_type,
        amount: row.total,
        processed_by: row.cashier_id,
      };
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Create transaction error:', error);
    res.status(500).json({ error: error.message || 'Failed to create transaction' });
  }
});

// Add credit to student account
router.post('/add-credit', verifyToken, requireRole('admin', 'staff', 'cashier'), async (req, res) => {
  try {
    const { student_id, amount, payment_method, notes } = req.body;

    if (!student_id || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid student ID and amount required' });
    }

    const receiptNum = `CRD-${Date.now()}`;
    const txnId = `DEP-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;

    const result = await transaction(async (client) => {
      // Create deposit transaction
      const transactionResult = await client.query(
        `INSERT INTO transactions (
          transaction_id, student_id, cashier_id, transaction_type, payment_method,
          subtotal, tax, total, receipt_number, notes, status
        ) VALUES ($1, $2, $3, 'deposit', $4, $5, 0, $5, $6, $7, 'completed')
        RETURNING *`,
        [txnId, student_id, req.user.id, payment_method, amount, receiptNum, notes || null]
      );

      // Update student balance
      await client.query(
        'UPDATE user_profiles SET balance = balance + $1 WHERE id = $2',
        [amount, student_id]
      );

      // Get updated balance
      const balanceResult = await client.query(
        'SELECT balance FROM user_profiles WHERE id = $1',
        [student_id]
      );
      const newBalance = balanceResult.rows.length > 0 ? parseFloat(balanceResult.rows[0].balance) : 0;

      const row = transactionResult.rows[0];
      return {
        ...row,
        type: 'credit',
        amount: row.total,
        processed_by: row.cashier_id,
        new_balance: newBalance,
      };
    });

    // Send top-up receipt email to parent (fire-and-forget, don't block response)
    (async () => {
      try {
        // Get student and parent info
        const studentResult = await query(
          `SELECT up.full_name as student_name, up.student_id as student_number, up.grade
           FROM user_profiles up WHERE up.id = $1`,
          [student_id]
        );
        const parentResult = await query(
          `SELECT up.email, up.full_name as parent_name FROM parent_students ps
           JOIN user_profiles up ON ps.parent_id = up.id
           WHERE ps.student_id = $1`,
          [student_id]
        );

        if (parentResult.rows.length === 0) {
          console.log('No parent email found for student, skipping top-up receipt email');
          return;
        }

        const student = studentResult.rows[0] || {};
        const parent = parentResult.rows[0];
        const depositAmount = parseFloat(amount);
        const newBalance = result.new_balance || 0;
        const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

        const receiptHtml = `
          <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px">
            <div style="text-align:center;margin-bottom:20px">
              <h2 style="margin:0;color:#333">YAMZ Cafe</h2>
              <p style="margin:4px 0;color:#666;font-size:13px">Account Top-Up Confirmation</p>
            </div>
            <hr style="border:1px solid #ddd">
            <div style="margin:16px 0;font-size:14px;color:#444">
              <p style="margin:8px 0">Dear ${parent.parent_name || 'Parent/Guardian'},</p>
              <p style="margin:8px 0">A deposit has been made to your child's cafeteria account. Here are the details:</p>
            </div>
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:16px 0">
              <table style="width:100%;border-collapse:collapse">
                <tr>
                  <td style="padding:6px 0;color:#666;font-size:13px">Student:</td>
                  <td style="padding:6px 0;text-align:right;font-weight:bold">${student.student_name || 'N/A'}</td>
                </tr>
                ${student.student_number ? `<tr>
                  <td style="padding:6px 0;color:#666;font-size:13px">Student ID:</td>
                  <td style="padding:6px 0;text-align:right">${student.student_number}</td>
                </tr>` : ''}
                ${student.grade ? `<tr>
                  <td style="padding:6px 0;color:#666;font-size:13px">Grade:</td>
                  <td style="padding:6px 0;text-align:right">${student.grade}</td>
                </tr>` : ''}
                <tr>
                  <td style="padding:6px 0;color:#666;font-size:13px">Date:</td>
                  <td style="padding:6px 0;text-align:right">${dateStr} at ${timeStr}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;color:#666;font-size:13px">Payment Method:</td>
                  <td style="padding:6px 0;text-align:right">${(payment_method || 'cash').charAt(0).toUpperCase() + (payment_method || 'cash').slice(1)}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;color:#666;font-size:13px">Receipt #:</td>
                  <td style="padding:6px 0;text-align:right">${receiptNum}</td>
                </tr>
              </table>
              <hr style="border:1px solid #bbf7d0;margin:12px 0">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <span style="font-size:15px;font-weight:bold;color:#166534">Amount Deposited:</span>
                <span style="font-size:22px;font-weight:bold;color:#166534">$${depositAmount.toFixed(2)}</span>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">
                <span style="font-size:13px;color:#666">New Account Balance:</span>
                <span style="font-size:16px;font-weight:bold;color:#333">$${newBalance.toFixed(2)}</span>
              </div>
            </div>
            ${notes ? `<div style="margin:12px 0;padding:10px;background:#f5f5f5;border-radius:6px;font-size:13px;color:#555">
              <strong>Notes:</strong> ${notes}
            </div>` : ''}
            <hr style="border:1px solid #ddd">
            <p style="text-align:center;color:#888;font-size:12px;margin-top:16px">
              Thank you for keeping your child's account funded! 🎉<br>
              This is an automated notification from YAMZ Cafe.
            </p>
          </div>
        `;

        const { sendEmail } = require('../services/emailService');
        await sendEmail(
          parent.email,
          `YAMZ Cafe - Account Top-Up Confirmation ($${depositAmount.toFixed(2)})`,
          receiptHtml
        );
        console.log(`Top-up receipt emailed to ${parent.email} for student ${student.student_name}`);
      } catch (emailErr) {
        console.error('Failed to send top-up receipt email (non-blocking):', emailErr.message);
      }
    })();

    res.status(201).json(result);
  } catch (error) {
    console.error('Add credit error:', error);
    res.status(500).json({ error: 'Failed to add credit' });
  }
});

// Refund transaction
router.post('/:id/refund', verifyToken, requirePermission('pos.processRefunds'), async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const result = await transaction(async (client) => {
      // Get original transaction
      const originalTx = await client.query(
        'SELECT * FROM transactions WHERE id = $1',
        [id]
      );

      if (originalTx.rows.length === 0) {
        throw new Error('Transaction not found');
      }

      const original = originalTx.rows[0];

      if (original.status === 'refunded') {
        throw new Error('Transaction already refunded');
      }

      const receiptNum = `RFD-${Date.now()}`;
      const txnId = `RFD-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;

      // Create refund transaction
      const refundResult = await client.query(
        `INSERT INTO transactions (
          transaction_id, student_id, cashier_id, transaction_type, payment_method,
          subtotal, tax, total, receipt_number, notes, status
        ) VALUES ($1, $2, $3, 'refund', $4, $5, 0, $5, $6, $7, 'completed')
        RETURNING *`,
        [txnId, original.student_id, req.user.id, original.payment_method, original.total, receiptNum, reason || null]
      );

      // Update original transaction status
      await client.query(
        "UPDATE transactions SET status = 'refunded' WHERE id = $1",
        [id]
      );

      // Restore stock for refunded items
      const refundedItems = await client.query(
        'SELECT menu_item_id, quantity FROM transaction_items WHERE transaction_id = $1',
        [id]
      );
      for (const ri of refundedItems.rows) {
        if (ri.menu_item_id) {
          await client.query(
            `UPDATE menu_items SET stock_quantity = LEAST(max_stock, stock_quantity + $1), updated_at = NOW() WHERE id = $2`,
            [ri.quantity, ri.menu_item_id]
          );
        }
      }

      // Refund to student balance if original was account payment
      if (original.student_id) {
        await client.query(
          'UPDATE user_profiles SET balance = balance + $1 WHERE id = $2',
          [original.total, original.student_id]
        );
      }

      const row = refundResult.rows[0];
      return {
        ...row,
        type: 'refund',
        amount: row.total,
        processed_by: row.cashier_id,
      };
    });

    res.json(result);
  } catch (error) {
    console.error('Refund error:', error);
    res.status(500).json({ error: error.message || 'Failed to process refund' });
  }
});

// Email receipt to parent
router.post('/:id/email-receipt', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { email } = req.body; // optional override email

    // Get transaction with items and student info
    const txResult = await query(
      `SELECT t.*,
        up.full_name as student_name, up.student_id as student_number,
        up.email as student_email,
        cashier_up.full_name as cashier_name
      FROM transactions t
      LEFT JOIN user_profiles up ON t.student_id = up.id
      LEFT JOIN user_profiles cashier_up ON t.cashier_id = cashier_up.id
      WHERE t.id = $1`,
      [id]
    );

    if (txResult.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const tx = txResult.rows[0];

    // Get transaction items
    const itemsResult = await query(
      `SELECT ti.item_name, ti.quantity, ti.unit_price, ti.total_price
       FROM transaction_items ti WHERE ti.transaction_id = $1`,
      [id]
    );

    // Determine recipient email
    let recipientEmail = email;
    if (!recipientEmail && tx.student_id) {
      // Try to find parent email
      const parentResult = await query(
        `SELECT up.email, up.full_name FROM parent_students ps
         JOIN user_profiles up ON ps.parent_id = up.id
         WHERE ps.student_id = $1 LIMIT 1`,
        [tx.student_id]
      );
      if (parentResult.rows.length > 0) {
        recipientEmail = parentResult.rows[0].email;
      }
    }

    if (!recipientEmail) {
      return res.status(400).json({ error: 'No email address available. Student has no linked parent email.' });
    }

    // Build receipt HTML
    const dateStr = new Date(tx.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    const timeStr = new Date(tx.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    const itemRows = itemsResult.rows.map(item =>
      `<tr>
        <td style="padding:8px;border-bottom:1px solid #eee">${item.item_name}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${item.quantity}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">$${parseFloat(item.unit_price).toFixed(2)}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">$${parseFloat(item.total_price).toFixed(2)}</td>
      </tr>`
    ).join('');

    const receiptHtml = `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px">
        <div style="text-align:center;margin-bottom:20px">
          <h2 style="margin:0;color:#333">YAMZ Cafe</h2>
          <p style="margin:4px 0;color:#666;font-size:13px">School Cafeteria - Purchase Receipt</p>
        </div>
        <hr style="border:1px solid #ddd">
        <div style="margin:16px 0;font-size:14px;color:#444">
          <p style="margin:4px 0"><strong>Date:</strong> ${dateStr}</p>
          <p style="margin:4px 0"><strong>Time:</strong> ${timeStr}</p>
          <p style="margin:4px 0"><strong>Receipt #:</strong> ${tx.receipt_number || 'N/A'}</p>
          ${tx.student_name ? `<p style="margin:4px 0"><strong>Student:</strong> ${tx.student_name}</p>` : ''}
          <p style="margin:4px 0"><strong>Payment:</strong> ${tx.payment_method.charAt(0).toUpperCase() + tx.payment_method.slice(1)}</p>
          ${tx.cashier_name ? `<p style="margin:4px 0"><strong>Cashier:</strong> ${tx.cashier_name}</p>` : ''}
        </div>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr style="background:#f5f5f5">
            <th style="padding:8px;text-align:left;font-size:13px">Item</th>
            <th style="padding:8px;text-align:center;font-size:13px">Qty</th>
            <th style="padding:8px;text-align:right;font-size:13px">Price</th>
            <th style="padding:8px;text-align:right;font-size:13px">Total</th>
          </tr>
          ${itemRows}
        </table>
        <div style="margin:16px 0;font-size:14px">
          <div style="display:flex;justify-content:space-between;padding:4px 0">
            <span>Subtotal:</span><span>$${parseFloat(tx.subtotal).toFixed(2)}</span>
          </div>
          ${tx.discount_amount && parseFloat(tx.discount_amount) > 0 ? `
          <div style="display:flex;justify-content:space-between;padding:4px 0;color:#c00">
            <span>Discount${tx.discount_type === 'percentage' ? ` (${tx.discount_amount}%)` : ''}:</span>
            <span>-$${(parseFloat(tx.subtotal) - parseFloat(tx.total)).toFixed(2)}</span>
          </div>` : ''}
          <div style="display:flex;justify-content:space-between;padding:8px 0;font-weight:bold;font-size:16px;border-top:2px solid #333">
            <span>TOTAL:</span><span>$${parseFloat(tx.total).toFixed(2)}</span>
          </div>
          ${tx.payment_method === 'cash' && tx.cash_received ? `
          <div style="padding:4px 0;font-size:13px;color:#666">
            <div style="display:flex;justify-content:space-between"><span>Cash Received:</span><span>$${parseFloat(tx.cash_received).toFixed(2)}</span></div>
            <div style="display:flex;justify-content:space-between"><span>Change:</span><span>$${parseFloat(tx.change_given || 0).toFixed(2)}</span></div>
          </div>` : ''}
        </div>
        <hr style="border:1px solid #ddd">
        <p style="text-align:center;color:#888;font-size:12px;margin-top:16px">
          Thank you for your purchase! 🍕<br>
          This receipt was sent from YAMZ Cafe POS.
        </p>
      </div>
    `;

    // Send email using emailService
    const { sendEmail } = require('../services/emailService');
    await sendEmail(
      recipientEmail,
      `YAMZ Cafe Receipt - ${tx.receipt_number || dateStr}`,
      receiptHtml
    );

    res.json({ message: 'Receipt emailed successfully', email: recipientEmail });
  } catch (error) {
    console.error('Email receipt error:', error);
    res.status(500).json({ error: error.message || 'Failed to email receipt' });
  }
});

// Resolve a pending/failed transaction
router.post('/:id/resolve', verifyToken, requireRole('admin', 'staff'), async (req, res) => {
  try {
    const { id } = req.params;
    const { resolution, notes } = req.body;

    if (!resolution || !['completed', 'cancelled', 'refunded'].includes(resolution)) {
      return res.status(400).json({ error: 'Valid resolution required: completed, cancelled, or refunded' });
    }

    const result = await query(
      `UPDATE transactions SET
        status = $1,
        notes = COALESCE($2, notes),
        resolved_by = $3,
        resolved_at = NOW(),
        updated_at = NOW()
      WHERE id = $4 AND status IN ('pending', 'failed')
      RETURNING *`,
      [resolution, notes, req.user.id, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found or already resolved' });
    }

    // If resolving as completed and it's a purchase, deduct balance
    const tx = result.rows[0];
    if (resolution === 'completed' && tx.transaction_type === 'purchase' && tx.student_id && tx.payment_method === 'account') {
      await query(
        'UPDATE user_profiles SET balance = balance - $1 WHERE id = $2',
        [tx.total, tx.student_id]
      );
    }

    // If resolving as refunded and student exists, refund balance
    if (resolution === 'refunded' && tx.student_id) {
      await query(
        'UPDATE user_profiles SET balance = balance + $1 WHERE id = $2',
        [tx.total, tx.student_id]
      );
    }

    res.json({ ...tx, status: resolution });
  } catch (error) {
    console.error('Resolve transaction error:', error);
    res.status(500).json({ error: 'Failed to resolve transaction' });
  }
});

module.exports = router;