const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { verifyToken, requireRole } = require('../middleware/auth');

// ── Auto-migration: ensure meal_subscriptions table exists ───────────────────
(async () => {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS meal_subscriptions (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        student_id UUID NOT NULL,
        parent_id UUID NOT NULL,
        meal_type VARCHAR(50) DEFAULT 'lunch',
        days_of_week INTEGER[] DEFAULT '{1,2,3,4,5}',
        status VARCHAR(20) DEFAULT 'active',
        special_instructions TEXT,
        max_daily_amount NUMERIC(10,2) DEFAULT 0,
        start_date DATE NOT NULL DEFAULT CURRENT_DATE,
        end_date DATE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // Add index for quick lookups
    await query(`
      CREATE INDEX IF NOT EXISTS idx_meal_subs_student ON meal_subscriptions(student_id);
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_meal_subs_parent ON meal_subscriptions(parent_id);
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_meal_subs_status ON meal_subscriptions(status);
    `);

    console.log('✅ meal_subscriptions table ensured');
  } catch (err) {
    console.error('⚠️  Could not ensure meal_subscriptions table:', err.message);
  }
})();

// ── Get subscriptions for current parent ─────────────────────────────────────
router.get('/', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    let queryText = `
      SELECT ms.*,
        up.full_name as student_name, up.student_id as student_number, up.grade as student_grade
      FROM meal_subscriptions ms
      LEFT JOIN user_profiles up ON ms.student_id = up.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;

    // Parents see only their own subscriptions
    if (userRole === 'parent') {
      queryText += ` AND ms.parent_id = $${paramCount}`;
      params.push(userId);
      paramCount++;
    }

    // Optional filters
    if (req.query.student_id) {
      queryText += ` AND ms.student_id = $${paramCount}`;
      params.push(req.query.student_id);
      paramCount++;
    }

    if (req.query.status) {
      queryText += ` AND ms.status = $${paramCount}`;
      params.push(req.query.status);
      paramCount++;
    }

    queryText += ' ORDER BY ms.created_at DESC';

    const result = await query(queryText, params);
    res.json(result.rows || []);
  } catch (error) {
    console.error('Get meal subscriptions error:', error);
    res.status(500).json({ error: 'Failed to fetch meal subscriptions' });
  }
});

// ── Create a new subscription ────────────────────────────────────────────────
router.post('/', verifyToken, async (req, res) => {
  try {
    const {
      student_id,
      meal_type,
      days_of_week,
      special_instructions,
      max_daily_amount,
      start_date,
      end_date,
    } = req.body;

    if (!student_id) {
      return res.status(400).json({ error: 'Student ID is required' });
    }

    const parentId = req.user.role === 'parent' ? req.user.id : req.body.parent_id;

    if (!parentId) {
      return res.status(400).json({ error: 'Parent ID is required' });
    }

    // Verify parent has access to this student
    if (req.user.role === 'parent') {
      const linkCheck = await query(
        'SELECT 1 FROM parent_students WHERE parent_id = $1 AND student_id = $2',
        [parentId, student_id]
      );
      if (linkCheck.rows.length === 0) {
        return res.status(403).json({ error: 'You do not have access to this student' });
      }
    }

    // Check if there's already an active subscription for this student
    const existing = await query(
      `SELECT id FROM meal_subscriptions 
       WHERE student_id = $1 AND parent_id = $2 AND status = 'active' AND meal_type = $3`,
      [student_id, parentId, meal_type || 'lunch']
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ 
        error: 'An active subscription already exists for this student and meal type. Please pause or cancel it first.' 
      });
    }

    const result = await query(
      `INSERT INTO meal_subscriptions (
        student_id, parent_id, meal_type, days_of_week, 
        special_instructions, max_daily_amount, start_date, end_date
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        student_id,
        parentId,
        meal_type || 'lunch',
        days_of_week || [1, 2, 3, 4, 5],
        special_instructions || null,
        max_daily_amount || 0,
        start_date || new Date().toISOString().split('T')[0],
        end_date || null,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create meal subscription error:', error);
    res.status(500).json({ error: error.message || 'Failed to create subscription' });
  }
});

// ── Update subscription ──────────────────────────────────────────────────────
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      meal_type,
      days_of_week,
      special_instructions,
      max_daily_amount,
      start_date,
      end_date,
      status,
    } = req.body;

    // Verify ownership for parents
    if (req.user.role === 'parent') {
      const ownerCheck = await query(
        'SELECT id FROM meal_subscriptions WHERE id = $1 AND parent_id = $2',
        [id, req.user.id]
      );
      if (ownerCheck.rows.length === 0) {
        return res.status(403).json({ error: 'Not authorized to modify this subscription' });
      }
    }

    const result = await query(
      `UPDATE meal_subscriptions SET
        meal_type = COALESCE($1, meal_type),
        days_of_week = COALESCE($2, days_of_week),
        special_instructions = $3,
        max_daily_amount = COALESCE($4, max_daily_amount),
        start_date = COALESCE($5, start_date),
        end_date = $6,
        status = COALESCE($7, status),
        updated_at = NOW()
      WHERE id = $8
      RETURNING *`,
      [
        meal_type || null,
        days_of_week || null,
        special_instructions !== undefined ? special_instructions : null,
        max_daily_amount !== undefined ? max_daily_amount : null,
        start_date || null,
        end_date !== undefined ? end_date : null,
        status || null,
        id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update meal subscription error:', error);
    res.status(500).json({ error: 'Failed to update subscription' });
  }
});

// ── Pause/Resume/Cancel subscription ─────────────────────────────────────────
router.patch('/:id/status', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['active', 'paused', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be active, paused, or cancelled' });
    }

    // Verify ownership for parents
    if (req.user.role === 'parent') {
      const ownerCheck = await query(
        'SELECT id FROM meal_subscriptions WHERE id = $1 AND parent_id = $2',
        [id, req.user.id]
      );
      if (ownerCheck.rows.length === 0) {
        return res.status(403).json({ error: 'Not authorized to modify this subscription' });
      }
    }

    const result = await query(
      `UPDATE meal_subscriptions SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update subscription status error:', error);
    res.status(500).json({ error: 'Failed to update subscription status' });
  }
});

// ── Delete subscription ──────────────────────────────────────────────────────
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify ownership for parents
    if (req.user.role === 'parent') {
      const ownerCheck = await query(
        'SELECT id FROM meal_subscriptions WHERE id = $1 AND parent_id = $2',
        [id, req.user.id]
      );
      if (ownerCheck.rows.length === 0) {
        return res.status(403).json({ error: 'Not authorized to delete this subscription' });
      }
    }

    await query('DELETE FROM meal_subscriptions WHERE id = $1', [id]);
    res.json({ message: 'Subscription deleted' });
  } catch (error) {
    console.error('Delete meal subscription error:', error);
    res.status(500).json({ error: 'Failed to delete subscription' });
  }
});

// ── Process subscriptions: auto-create pre-orders for a published menu ───────
// This is called when a menu is published, or can be triggered manually
router.post('/process', verifyToken, requireRole('admin', 'staff'), async (req, res) => {
  try {
    const { scheduled_menu_id } = req.body;

    if (!scheduled_menu_id) {
      return res.status(400).json({ error: 'Scheduled menu ID is required' });
    }

    // Get the menu details
    const menuResult = await query(
      `SELECT sm.*, 
        COALESCE(
          (SELECT json_agg(json_build_object('id', smi.menu_item_id, 'price', mi.price, 'name', mi.name))
           FROM scheduled_menu_items smi
           LEFT JOIN menu_items mi ON smi.menu_item_id = mi.id
           WHERE smi.scheduled_menu_id = sm.id), '[]'
        ) as items
      FROM scheduled_menus sm
      WHERE sm.id = $1 AND sm.status = 'published'`,
      [scheduled_menu_id]
    );

    if (menuResult.rows.length === 0) {
      return res.status(404).json({ error: 'Published menu not found' });
    }

    const menu = menuResult.rows[0];
    const menuDate = new Date(menu.schedule_date);
    const dayOfWeek = menuDate.getDay(); // 0=Sun, 1=Mon, ...

    // Find all active subscriptions that match this day
    const subscriptions = await query(
      `SELECT ms.*, up.full_name as student_name, up.balance as student_balance
       FROM meal_subscriptions ms
       LEFT JOIN user_profiles up ON ms.student_id = up.id
       WHERE ms.status = 'active'
         AND $1 = ANY(ms.days_of_week)
         AND ms.start_date <= $2
         AND (ms.end_date IS NULL OR ms.end_date >= $2)`,
      [dayOfWeek, menu.schedule_date]
    );

    let created = 0;
    let skipped = 0;
    const errors = [];

    for (const sub of subscriptions.rows) {
      try {
        // Check if a pre-order already exists for this student/date
        const existingOrder = await query(
          `SELECT id FROM pre_orders 
           WHERE student_id = $1 AND order_date = $2 AND status != 'cancelled'`,
          [sub.student_id, menu.schedule_date]
        );

        if (existingOrder.rows.length > 0) {
          skipped++;
          continue;
        }

        // Calculate total from menu items (use first item or sum all)
        const items = typeof menu.items === 'string' ? JSON.parse(menu.items) : menu.items;
        let total = 0;
        if (Array.isArray(items) && items.length > 0) {
          total = items.reduce((sum, item) => sum + (parseFloat(item.price) || 0), 0);
        }

        // If max_daily_amount is set and total exceeds it, skip
        if (sub.max_daily_amount > 0 && total > sub.max_daily_amount) {
          skipped++;
          continue;
        }

        // Generate order number
        const orderNumber = `AUTO-${Date.now().toString(36).toUpperCase()}-${created}`;

        // Create the pre-order
        await query(
          `INSERT INTO pre_orders (
            order_number, student_id, parent_id, scheduled_menu_id, order_date,
            meal_type, status, subtotal, tax, total, payment_method,
            payment_status, special_instructions, ordered_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, 0, $7, 'balance', 'pending', $8, NOW())`,
          [
            orderNumber,
            sub.student_id,
            sub.parent_id,
            scheduled_menu_id,
            menu.schedule_date,
            sub.meal_type || 'lunch',
            total,
            sub.special_instructions || null,
          ]
        );

        created++;
      } catch (subErr) {
        errors.push({ student_id: sub.student_id, error: subErr.message });
      }
    }

    res.json({
      message: `Processed ${subscriptions.rows.length} subscriptions: ${created} orders created, ${skipped} skipped`,
      created,
      skipped,
      total_subscriptions: subscriptions.rows.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Process subscriptions error:', error);
    res.status(500).json({ error: 'Failed to process subscriptions' });
  }
});

// ── Get subscription stats (admin) ──────────────────────────────────────────
router.get('/stats', verifyToken, requireRole('admin', 'staff'), async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'active') as active_count,
        COUNT(*) FILTER (WHERE status = 'paused') as paused_count,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_count,
        COUNT(*) as total_count
      FROM meal_subscriptions
    `);

    res.json(result.rows[0] || { active_count: 0, paused_count: 0, cancelled_count: 0, total_count: 0 });
  } catch (error) {
    console.error('Get subscription stats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

module.exports = router;