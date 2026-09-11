const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { verifyToken, requireRole, requirePermission } = require('../middleware/auth');

// Helper: get negative balance cap from system_config
async function getNegativeBalanceCap() {
  try {
    const result = await query(
      "SELECT value FROM system_config WHERE key = 'negative_balance_cap'"
    );
    if (result.rows.length > 0) {
      const val = result.rows[0].value;
      const parsed = typeof val === 'string' ? JSON.parse(val) : val;
      return parseFloat(parsed) || 0;
    }
  } catch (err) {
    console.error('Failed to fetch negative_balance_cap:', err);
  }
  return 0;
}

// Get pre-orders (admin sees all, parent sees only their own)
router.get('/', verifyToken, async (req, res) => {
  try {
    const { student_id, date, status, start_date, end_date } = req.query;
    const userRole = req.user.role;

    let queryText = `
      SELECT po.*,
        up.full_name as student_name, up.student_id as student_number, up.grade as student_grade,
        parent_up.full_name as parent_name, parent_up.email as parent_email,
        sm.menu_name, sm.schedule_date as menu_date
      FROM pre_orders po
      LEFT JOIN user_profiles up ON po.student_id = up.id
      LEFT JOIN user_profiles parent_up ON po.parent_id = parent_up.id
      LEFT JOIN scheduled_menus sm ON po.scheduled_menu_id = sm.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;

    // Parent can only see their own orders
    if (userRole === 'parent') {
      queryText += ` AND po.parent_id = $${paramCount}`;
      params.push(req.user.id);
      paramCount++;
    }

    if (student_id) {
      queryText += ` AND po.student_id = $${paramCount}`;
      params.push(student_id);
      paramCount++;
    }

    if (date) {
      queryText += ` AND po.order_date = $${paramCount}`;
      params.push(date);
      paramCount++;
    }

    if (start_date) {
      queryText += ` AND po.order_date >= $${paramCount}`;
      params.push(start_date);
      paramCount++;
    }

    if (end_date) {
      queryText += ` AND po.order_date <= $${paramCount}`;
      params.push(end_date);
      paramCount++;
    }

    if (status) {
      queryText += ` AND po.status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    queryText += ' ORDER BY po.order_date DESC, po.created_at DESC';

    const result = await query(queryText, params);
    res.json(result.rows || []);
  } catch (error) {
    console.error('Get pre-orders error:', error);
    res.status(500).json({ error: 'Failed to fetch pre-orders' });
  }
});

// Get single pre-order by ID
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT po.*,
        up.full_name as student_name, up.student_id as student_number
      FROM pre_orders po
      LEFT JOIN user_profiles up ON po.student_id = up.id
      WHERE po.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pre-order not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get pre-order error:', error);
    res.status(500).json({ error: 'Failed to fetch pre-order' });
  }
});

// Create pre-order
router.post('/', verifyToken, async (req, res) => {
  try {
    const {
      student_id,
      parent_id,
      scheduled_menu_id,
      order_date,
      meal_type,
      subtotal,
      tax,
      total,
      payment_method,
      special_instructions,
    } = req.body;

    if (!student_id || !order_date) {
      return res.status(400).json({ error: 'Student ID and order date are required' });
    }

    // Resolve parent_id: use provided or current user if parent role
    const resolvedParentId = parent_id || (req.user.role === 'parent' ? req.user.id : null);

    const orderTotal = parseFloat(total) || 0;

    // If paying from balance, check student balance against negative cap
    let paymentStatus = 'pending';
    if (payment_method === 'balance' && orderTotal > 0) {
      const studentResult = await query(
        'SELECT balance FROM user_profiles WHERE id = $1',
        [student_id]
      );

      if (studentResult.rows.length === 0) {
        return res.status(404).json({ error: 'Student not found' });
      }

      const currentBalance = parseFloat(studentResult.rows[0].balance) || 0;
      const negativeBalanceCap = await getNegativeBalanceCap();
      const resultingBalance = currentBalance - orderTotal;

      if (resultingBalance < -negativeBalanceCap) {
        return res.status(400).json({
          error: `Insufficient balance. This order would bring the balance to $${resultingBalance.toFixed(2)}, which exceeds the negative balance limit of -$${negativeBalanceCap.toFixed(2)}.`,
          current_balance: currentBalance,
          order_total: orderTotal,
          negative_balance_cap: negativeBalanceCap,
          resulting_balance: resultingBalance,
        });
      }

      // Deduct balance
      await query(
        'UPDATE user_profiles SET balance = balance - $1 WHERE id = $2',
        [orderTotal, student_id]
      );

      if (resultingBalance < 0) {
        paymentStatus = 'negative_charge';
      } else {
        paymentStatus = 'charged';
      }
    }

    // Generate order number
    const orderNumber = `PO-${Date.now().toString(36).toUpperCase()}`;

    const result = await query(
      `INSERT INTO pre_orders (
        order_number, student_id, parent_id, scheduled_menu_id, order_date,
        meal_type, status, subtotal, tax, total, payment_method,
        payment_status, special_instructions, ordered_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, $9, $10, $11, $12, NOW())
      RETURNING *`,
      [
        orderNumber,
        student_id,
        resolvedParentId,
        scheduled_menu_id || null,
        order_date,
        meal_type || 'lunch',
        subtotal || 0,
        tax || 0,
        orderTotal,
        payment_method || 'balance',
        paymentStatus,
        special_instructions || null,
      ]
    );

    // Fetch with joins for the response
    const fullResult = await query(
      `SELECT po.*,
        up.full_name as student_name, up.student_id as student_number
      FROM pre_orders po
      LEFT JOIN user_profiles up ON po.student_id = up.id
      WHERE po.id = $1`,
      [result.rows[0].id]
    );

    res.status(201).json(fullResult.rows[0] || result.rows[0]);
  } catch (error) {
    console.error('Create pre-order error:', error);
    res.status(500).json({ error: error.message || 'Failed to create pre-order' });
  }
});

// Update pre-order status
router.patch('/:id/status', verifyToken, requireRole('admin', 'staff', 'cashier'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    let queryText = `UPDATE pre_orders SET status = $1, updated_at = NOW()`;
    const params = [status];
    let paramCount = 2;

    if (status === 'confirmed') {
      queryText += `, confirmed_at = NOW()`;
    }

    if (status === 'cancelled') {
      queryText += `, cancelled_at = NOW()`;
    }

    queryText += ` WHERE id = $${paramCount} RETURNING *`;
    params.push(id);

    const result = await query(queryText, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pre-order not found' });
    }

    // If cancelling and payment was charged, refund the balance
    if (status === 'cancelled') {
      const order = result.rows[0];
      if (
        (order.payment_status === 'charged' || order.payment_status === 'negative_charge') &&
        order.payment_method === 'balance' &&
        order.student_id &&
        order.total > 0
      ) {
        await query(
          'UPDATE user_profiles SET balance = balance + $1 WHERE id = $2',
          [order.total, order.student_id]
        );
        await query(
          "UPDATE pre_orders SET payment_status = 'refunded' WHERE id = $1",
          [id]
        );
      }
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update pre-order error:', error);
    res.status(500).json({ error: 'Failed to update pre-order' });
  }
});

// Edit pre-order (parent can edit their own pending orders, admin can edit any)
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { meal_type, special_instructions, order_date, scheduled_menu_id } = req.body;
    const userRole = req.user.role;

    // Build where clause based on role
    let whereClause = 'id = $1';
    const whereParams = [id];

    // Parents can only edit their own orders
    if (userRole === 'parent') {
      whereClause += ' AND parent_id = $2';
      whereParams.push(req.user.id);
    }

    // Get the order first — only pending orders can be edited
    const orderResult = await query(
      `SELECT * FROM pre_orders WHERE ${whereClause} AND status = 'pending'`,
      whereParams
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Pre-order not found or cannot be edited (only pending orders can be modified)' });
    }

    // Build dynamic update
    const updates = [];
    const updateParams = [];
    let paramIdx = 1;

    if (meal_type !== undefined) {
      updates.push(`meal_type = $${paramIdx}`);
      updateParams.push(meal_type);
      paramIdx++;
    }

    if (special_instructions !== undefined) {
      updates.push(`special_instructions = $${paramIdx}`);
      updateParams.push(special_instructions);
      paramIdx++;
    }

    if (order_date !== undefined) {
      updates.push(`order_date = $${paramIdx}`);
      updateParams.push(order_date);
      paramIdx++;
    }

    if (scheduled_menu_id !== undefined) {
      updates.push(`scheduled_menu_id = $${paramIdx}`);
      updateParams.push(scheduled_menu_id);
      paramIdx++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push('updated_at = NOW()');

    const updateQuery = `UPDATE pre_orders SET ${updates.join(', ')} WHERE id = $${paramIdx} RETURNING *`;
    updateParams.push(id);

    const result = await query(updateQuery, updateParams);

    // Fetch with joins for the response
    const fullResult = await query(
      `SELECT po.*,
        up.full_name as student_name, up.student_id as student_number,
        sm.menu_name, sm.schedule_date as menu_date
      FROM pre_orders po
      LEFT JOIN user_profiles up ON po.student_id = up.id
      LEFT JOIN scheduled_menus sm ON po.scheduled_menu_id = sm.id
      WHERE po.id = $1`,
      [result.rows[0].id]
    );

    res.json(fullResult.rows[0] || result.rows[0]);
  } catch (error) {
    console.error('Edit pre-order error:', error);
    res.status(500).json({ error: error.message || 'Failed to edit pre-order' });
  }
});

// Cancel pre-order (parent or admin)
router.put('/:id/cancel', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};
    const userRole = req.user.role;

    // Build query based on role
    let whereClause = 'id = $1';
    const queryParams = [id];

    // Parents can only cancel their own orders
    if (userRole === 'parent') {
      whereClause += ' AND parent_id = $2';
      queryParams.push(req.user.id);
    }

    // Get the order first
    const orderResult = await query(
      `SELECT * FROM pre_orders WHERE ${whereClause} AND status IN ('pending', 'confirmed')`,
      queryParams
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Pre-order not found or cannot be cancelled' });
    }

    const order = orderResult.rows[0];

    const result = await query(
      `UPDATE pre_orders
       SET status = 'cancelled', cancelled_at = NOW(), cancellation_reason = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, reason || null]
    );

    // Refund balance if it was charged
    if (
      (order.payment_status === 'charged' || order.payment_status === 'negative_charge') &&
      order.payment_method === 'balance' &&
      order.student_id &&
      order.total > 0
    ) {
      await query(
        'UPDATE user_profiles SET balance = balance + $1 WHERE id = $2',
        [order.total, order.student_id]
      );
      await query(
        "UPDATE pre_orders SET payment_status = 'refunded' WHERE id = $1",
        [id]
      );
    }

    res.json({ message: 'Pre-order cancelled successfully', order: result.rows[0] });
  } catch (error) {
    console.error('Cancel pre-order error:', error);
    res.status(500).json({ error: 'Failed to cancel pre-order' });
  }
});

// DELETE pre-order (legacy support)
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};

    const orderResult = await query(
      "SELECT * FROM pre_orders WHERE id = $1 AND status = 'pending'",
      [id]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Pre-order not found or cannot be cancelled' });
    }

    const order = orderResult.rows[0];

    await query(
      `UPDATE pre_orders
       SET status = 'cancelled', cancelled_at = NOW(), cancellation_reason = $2, updated_at = NOW()
       WHERE id = $1`,
      [id, reason || null]
    );

    // Refund balance if it was charged
    if (
      (order.payment_status === 'charged' || order.payment_status === 'negative_charge') &&
      order.payment_method === 'balance' &&
      order.student_id &&
      order.total > 0
    ) {
      await query(
        'UPDATE user_profiles SET balance = balance + $1 WHERE id = $2',
        [order.total, order.student_id]
      );
      await query(
        "UPDATE pre_orders SET payment_status = 'refunded' WHERE id = $1",
        [id]
      );
    }

    res.json({ message: 'Pre-order cancelled successfully' });
  } catch (error) {
    console.error('Cancel pre-order error:', error);
    res.status(500).json({ error: 'Failed to cancel pre-order' });
  }
});

module.exports = router;