const express = require('express');
const router = express.Router();
const { query, transaction } = require('../config/database');
const { verifyToken, requireRole } = require('../middleware/auth');

// ── Auto-migration: ensure recurrence columns exist ──────────────────────────
(async () => {
  try {
    await query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'scheduled_menus' AND column_name = 'recurrence_type'
        ) THEN
          ALTER TABLE scheduled_menus ADD COLUMN recurrence_type VARCHAR(20) DEFAULT 'none';
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'scheduled_menus' AND column_name = 'recurrence_end_date'
        ) THEN
          ALTER TABLE scheduled_menus ADD COLUMN recurrence_end_date DATE;
        END IF;
      END $$;
    `);
    console.log('✅ Recurrence columns ensured on scheduled_menus');
  } catch (err) {
    console.error('⚠️  Could not ensure recurrence columns:', err.message);
  }
})();

// ── Helper: generate recurring copies of a menu ──────────────────────────────
async function generateRecurringCopies(sourceMenu, sourceItems, userId) {
  const recurrenceType = sourceMenu.recurrence_type;
  const endDate = sourceMenu.recurrence_end_date;

  if (!recurrenceType || recurrenceType === 'none' || !endDate) return [];

  const sourceDate = new Date(sourceMenu.schedule_date);
  const limitDate = new Date(endDate);
  const createdMenus = [];
  let currentDate = new Date(sourceDate);

  // Advance to the first recurrence
  if (recurrenceType === 'weekly') {
    currentDate.setDate(currentDate.getDate() + 7);
  } else if (recurrenceType === 'monthly') {
    currentDate.setMonth(currentDate.getMonth() + 1);
  }

  while (currentDate <= limitDate) {
    const targetDateStr = currentDate.toISOString().split('T')[0];

    // Check if a menu already exists for this date with the same name
    const existingCheck = await query(
      `SELECT id FROM scheduled_menus WHERE schedule_date = $1 AND menu_name = $2`,
      [targetDateStr, sourceMenu.menu_name]
    );

    if (existingCheck.rows.length === 0) {
      // Create the recurring copy as published
      const newMenuResult = await query(
        `INSERT INTO scheduled_menus (schedule_date, menu_name, status, meal_types, notes, created_by, cutoff_time, recurrence_type, recurrence_end_date)
         VALUES ($1, $2, 'published', $3::text[], $4, $5, $6, 'none', NULL)
         RETURNING *`,
        [
          targetDateStr,
          sourceMenu.menu_name,
          sourceMenu.meal_types || ['lunch'],
          sourceMenu.notes || null,
          userId,
          null
        ]
      );

      const newMenu = newMenuResult.rows[0];

      // Copy menu items
      for (const item of sourceItems) {
        await query(
          `INSERT INTO menu_item_schedules (scheduled_menu_id, menu_item_id, meal_type, display_order)
           VALUES ($1, $2, $3, $4)`,
          [newMenu.id, item.menu_item_id, item.meal_type, item.display_order]
        );
      }

      createdMenus.push(newMenu);
    }

    // Advance to next occurrence
    if (recurrenceType === 'weekly') {
      currentDate.setDate(currentDate.getDate() + 7);
    } else if (recurrenceType === 'monthly') {
      // Keep the same day-of-month
      const origDay = sourceDate.getDate();
      currentDate.setMonth(currentDate.getMonth() + 1);
      // Handle months with fewer days
      const maxDay = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
      currentDate.setDate(Math.min(origDay, maxDay));
    }
  }

  return createdMenus;
}

// GET /api/scheduled-menus - List all scheduled menus (with filters)
router.get('/', verifyToken, async (req, res) => {
  try {
    const { start_date, end_date, status } = req.query;

    let queryText = `
      SELECT sm.*,
        up.full_name as created_by_name
      FROM scheduled_menus sm
      LEFT JOIN user_profiles up ON sm.created_by = up.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;

    if (start_date) {
      queryText += ` AND sm.schedule_date >= $${paramCount}`;
      params.push(start_date);
      paramCount++;
    }

    if (end_date) {
      queryText += ` AND sm.schedule_date <= $${paramCount}`;
      params.push(end_date);
      paramCount++;
    }

    if (status) {
      queryText += ` AND sm.status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    queryText += ' ORDER BY sm.schedule_date ASC, sm.created_at DESC';

    const result = await query(queryText, params);

    // For each menu, fetch its menu items
    const menus = result.rows || [];
    for (const menu of menus) {
      const itemsResult = await query(
        `SELECT mis.*, mi.name, mi.description, mi.price, mi.calories,
                mi.image, mi.image_alt, mi.category, mi.allergens,
                mi.dietary_tags, mi.is_healthy, mi.is_available
         FROM menu_item_schedules mis
         JOIN menu_items mi ON mis.menu_item_id = mi.id
         WHERE mis.scheduled_menu_id = $1
         ORDER BY mis.display_order ASC, mi.name ASC`,
        [menu.id]
      );
      menu.menu_items = itemsResult.rows || [];
    }

    res.json(menus);
  } catch (error) {
    console.error('Get scheduled menus error:', error);
    res.status(500).json({ error: 'Failed to fetch scheduled menus' });
  }
});

// GET /api/scheduled-menus/published - Get published menus for parents
router.get('/published', verifyToken, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    let queryText = `
      SELECT sm.*
      FROM scheduled_menus sm
      WHERE sm.status = 'published'
    `;
    const params = [];
    let paramCount = 1;

    if (start_date) {
      queryText += ` AND sm.schedule_date >= $${paramCount}`;
      params.push(start_date);
      paramCount++;
    }

    if (end_date) {
      queryText += ` AND sm.schedule_date <= $${paramCount}`;
      params.push(end_date);
      paramCount++;
    }

    queryText += ' ORDER BY sm.schedule_date ASC';

    const result = await query(queryText, params);
    const menus = result.rows || [];

    // Fetch menu items for each menu
    for (const menu of menus) {
      const itemsResult = await query(
        `SELECT mis.id as schedule_item_id, mis.meal_type, mis.display_order,
                mi.id, mi.item_id, mi.name, mi.description, mi.price, mi.calories,
                mi.image, mi.image_alt, mi.category, mi.allergens,
                mi.dietary_tags, mi.is_healthy
         FROM menu_item_schedules mis
         JOIN menu_items mi ON mis.menu_item_id = mi.id
         WHERE mis.scheduled_menu_id = $1
         ORDER BY mis.display_order ASC, mi.name ASC`,
        [menu.id]
      );
      menu.menu_items = itemsResult.rows || [];
    }

    res.json(menus);
  } catch (error) {
    console.error('Get published menus error:', error);
    res.status(500).json({ error: 'Failed to fetch published menus' });
  }
});

// POST /api/scheduled-menus/repeat-monthly - Repeat meal plans from a source month to a target month
router.post('/repeat-monthly', verifyToken, requireRole('admin', 'staff'), async (req, res) => {
  try {
    const { source_year, source_month, target_year, target_month } = req.body;

    if (!source_year || !source_month || !target_year || !target_month) {
      return res.status(400).json({ error: 'source_year, source_month, target_year, and target_month are required' });
    }

    // Get the first and last day of the source month
    const sourceStart = `${source_year}-${String(source_month).padStart(2, '0')}-01`;
    const sourceEnd = new Date(source_year, source_month, 0); // last day of source month
    const sourceEndStr = `${source_year}-${String(source_month).padStart(2, '0')}-${String(sourceEnd.getDate()).padStart(2, '0')}`;

    // Fetch all meal plans from the source month
    const sourceMenus = await query(
      `SELECT sm.* FROM scheduled_menus sm
       WHERE sm.schedule_date >= $1 AND sm.schedule_date <= $2
       ORDER BY sm.schedule_date ASC`,
      [sourceStart, sourceEndStr]
    );

    if (sourceMenus.rows.length === 0) {
      return res.status(400).json({ error: 'No meal plans found in the source month to repeat.' });
    }

    const targetLastDay = new Date(target_year, target_month, 0).getDate();
    const createdMenus = [];
    let skippedCount = 0;

    for (const sourceMenu of sourceMenus.rows) {
      const sourceDate = new Date(sourceMenu.schedule_date);
      let targetDay = sourceDate.getDate();

      // If the source day exceeds the target month's last day, cap it
      if (targetDay > targetLastDay) {
        targetDay = targetLastDay;
      }

      const targetDateStr = `${target_year}-${String(target_month).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;

      // Check if a menu already exists for this target date with the same name
      const existingCheck = await query(
        `SELECT id FROM scheduled_menus WHERE schedule_date = $1 AND menu_name = $2`,
        [targetDateStr, sourceMenu.menu_name]
      );

      if (existingCheck.rows.length > 0) {
        skippedCount++;
        continue; // Skip duplicates
      }

      // Create the new menu as draft
      const newMenuResult = await query(
        `INSERT INTO scheduled_menus (schedule_date, menu_name, status, meal_types, notes, created_by, cutoff_time)
         VALUES ($1, $2, 'draft', $3::text[], $4, $5, $6)
         RETURNING *`,
        [
          targetDateStr,
          sourceMenu.menu_name,
          sourceMenu.meal_types || ['lunch'],
          sourceMenu.notes || null,
          req.user.id,
          null // Reset cutoff_time for the new month
        ]
      );

      const newMenu = newMenuResult.rows[0];

      // Copy menu items from source
      const sourceItems = await query(
        `SELECT menu_item_id, meal_type, display_order FROM menu_item_schedules WHERE scheduled_menu_id = $1 ORDER BY display_order`,
        [sourceMenu.id]
      );

      for (const item of sourceItems.rows) {
        await query(
          `INSERT INTO menu_item_schedules (scheduled_menu_id, menu_item_id, meal_type, display_order)
           VALUES ($1, $2, $3, $4)`,
          [newMenu.id, item.menu_item_id, item.meal_type, item.display_order]
        );
      }

      createdMenus.push(newMenu);
    }

    res.status(201).json({
      message: `Successfully repeated ${createdMenus.length} meal plan(s) to ${target_year}-${String(target_month).padStart(2, '0')}. ${skippedCount > 0 ? `${skippedCount} plan(s) skipped (already exist).` : ''}`,
      created_count: createdMenus.length,
      skipped_count: skippedCount,
      menus: createdMenus
    });
  } catch (error) {
    console.error('Repeat monthly error:', error);
    res.status(500).json({ error: 'Failed to repeat meal plans: ' + error.message });
  }
});

// POST /api/scheduled-menus/repeat-weekly - Repeat a single meal plan weekly for N weeks
router.post('/repeat-weekly', verifyToken, requireRole('admin', 'staff'), async (req, res) => {
  try {
    const { source_menu_id, weeks } = req.body;

    if (!source_menu_id || !weeks || weeks < 1) {
      return res.status(400).json({ error: 'source_menu_id and weeks (>= 1) are required' });
    }

    const maxWeeks = 52;
    const numWeeks = Math.min(parseInt(weeks), maxWeeks);

    // Fetch source menu
    const sourceResult = await query(`SELECT * FROM scheduled_menus WHERE id = $1`, [source_menu_id]);
    if (sourceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Source menu not found' });
    }

    const sourceMenu = sourceResult.rows[0];
    const sourceDate = new Date(sourceMenu.schedule_date);

    // Fetch source items
    const sourceItems = await query(
      `SELECT menu_item_id, meal_type, display_order FROM menu_item_schedules WHERE scheduled_menu_id = $1 ORDER BY display_order`,
      [source_menu_id]
    );

    const createdMenus = [];
    let skippedCount = 0;

    for (let w = 1; w <= numWeeks; w++) {
      const targetDate = new Date(sourceDate);
      targetDate.setDate(targetDate.getDate() + (7 * w));
      const targetDateStr = targetDate.toISOString().split('T')[0];

      // Check for duplicates
      const existingCheck = await query(
        `SELECT id FROM scheduled_menus WHERE schedule_date = $1 AND menu_name = $2`,
        [targetDateStr, sourceMenu.menu_name]
      );

      if (existingCheck.rows.length > 0) {
        skippedCount++;
        continue;
      }

      const newMenuResult = await query(
        `INSERT INTO scheduled_menus (schedule_date, menu_name, status, meal_types, notes, created_by, cutoff_time)
         VALUES ($1, $2, 'draft', $3::text[], $4, $5, $6)
         RETURNING *`,
        [
          targetDateStr,
          sourceMenu.menu_name,
          sourceMenu.meal_types || ['lunch'],
          sourceMenu.notes || null,
          req.user.id,
          null
        ]
      );

      const newMenu = newMenuResult.rows[0];

      for (const item of sourceItems.rows) {
        await query(
          `INSERT INTO menu_item_schedules (scheduled_menu_id, menu_item_id, meal_type, display_order)
           VALUES ($1, $2, $3, $4)`,
          [newMenu.id, item.menu_item_id, item.meal_type, item.display_order]
        );
      }

      createdMenus.push(newMenu);
    }

    res.status(201).json({
      message: `Successfully created ${createdMenus.length} weekly repeat(s). ${skippedCount > 0 ? `${skippedCount} skipped (already exist).` : ''}`,
      created_count: createdMenus.length,
      skipped_count: skippedCount,
      menus: createdMenus
    });
  } catch (error) {
    console.error('Repeat weekly error:', error);
    res.status(500).json({ error: 'Failed to repeat meal plan weekly: ' + error.message });
  }
});

// PUT /api/scheduled-menus/:id/recurrence - Set recurrence on a menu
router.put('/:id/recurrence', verifyToken, requireRole('admin', 'staff'), async (req, res) => {
  try {
    const { id } = req.params;
    const { recurrence_type, recurrence_end_date } = req.body;

    if (!recurrence_type || !['none', 'weekly', 'monthly'].includes(recurrence_type)) {
      return res.status(400).json({ error: 'recurrence_type must be none, weekly, or monthly' });
    }

    if (recurrence_type !== 'none' && !recurrence_end_date) {
      return res.status(400).json({ error: 'recurrence_end_date is required when setting a recurrence' });
    }

    const result = await query(
      `UPDATE scheduled_menus SET
        recurrence_type = $1,
        recurrence_end_date = $2,
        updated_at = NOW()
      WHERE id = $3
      RETURNING *`,
      [recurrence_type, recurrence_end_date || null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Scheduled menu not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Set recurrence error:', error);
    res.status(500).json({ error: 'Failed to set recurrence' });
  }
});

// GET /api/scheduled-menus/:id - Get single scheduled menu with items
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const menuResult = await query(
      `SELECT sm.*, up.full_name as created_by_name
       FROM scheduled_menus sm
       LEFT JOIN user_profiles up ON sm.created_by = up.id
       WHERE sm.id = $1`,
      [id]
    );

    if (menuResult.rows.length === 0) {
      return res.status(404).json({ error: 'Scheduled menu not found' });
    }

    const menu = menuResult.rows[0];

    // Fetch menu items
    const itemsResult = await query(
      `SELECT mis.*, mi.name, mi.description, mi.price, mi.calories,
              mi.image, mi.image_alt, mi.category, mi.allergens,
              mi.dietary_tags, mi.is_healthy, mi.is_available
       FROM menu_item_schedules mis
       JOIN menu_items mi ON mis.menu_item_id = mi.id
       WHERE mis.scheduled_menu_id = $1
       ORDER BY mis.display_order ASC, mi.name ASC`,
      [id]
    );

    menu.menu_items = itemsResult.rows || [];

    // Fetch pre-orders count for this menu
    const ordersResult = await query(
      `SELECT COUNT(*) as order_count, COALESCE(SUM(total), 0) as total_revenue
       FROM pre_orders
       WHERE scheduled_menu_id = $1 AND status != 'cancelled'`,
      [id]
    );

    menu.order_count = parseInt(ordersResult.rows[0]?.order_count || 0);
    menu.total_revenue = parseFloat(ordersResult.rows[0]?.total_revenue || 0);

    res.json(menu);
  } catch (error) {
    console.error('Get scheduled menu error:', error);
    res.status(500).json({ error: 'Failed to fetch scheduled menu' });
  }
});

// POST /api/scheduled-menus - Create a new scheduled menu
router.post('/', verifyToken, requireRole('admin', 'staff'), async (req, res) => {
  try {
    const {
      schedule_date,
      menu_name,
      status,
      meal_types,
      notes,
      menu_item_ids,
      cutoff_time,
      recurrence_type,
      recurrence_end_date
    } = req.body;

    if (!schedule_date || !menu_name) {
      return res.status(400).json({ error: 'Schedule date and menu name are required' });
    }

    // Create the scheduled menu
    const menuResult = await query(
      `INSERT INTO scheduled_menus (schedule_date, menu_name, status, meal_types, notes, created_by, cutoff_time, recurrence_type, recurrence_end_date)
       VALUES ($1, $2, $3, $4::text[], $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        schedule_date,
        menu_name,
        status || 'draft',
        meal_types || ['lunch'],
        notes || null,
        req.user.id,
        cutoff_time || null,
        recurrence_type || 'none',
        recurrence_end_date || null
      ]
    );

    const menu = menuResult.rows[0];

    // Add menu items if provided
    if (Array.isArray(menu_item_ids) && menu_item_ids.length > 0) {
      for (let i = 0; i < menu_item_ids.length; i++) {
        const item = menu_item_ids[i];
        const menuItemId = typeof item === 'string' ? item : item.menu_item_id;
        const mealType = typeof item === 'object' ? item.meal_type : 'lunch';

        await query(
          `INSERT INTO menu_item_schedules (scheduled_menu_id, menu_item_id, meal_type, display_order)
           VALUES ($1, $2, $3, $4)`,
          [menu.id, menuItemId, mealType, i + 1]
        );
      }
    }

    // If status is published and recurrence is set, generate recurring copies
    if ((status === 'published') && recurrence_type && recurrence_type !== 'none' && recurrence_end_date) {
      const sourceItems = await query(
        `SELECT menu_item_id, meal_type, display_order FROM menu_item_schedules WHERE scheduled_menu_id = $1 ORDER BY display_order`,
        [menu.id]
      );
      const copies = await generateRecurringCopies(menu, sourceItems.rows, req.user.id);
      menu.recurring_copies_created = copies.length;
    }

    // Fetch the complete menu with items
    const fullResult = await query(
      `SELECT sm.*, up.full_name as created_by_name
       FROM scheduled_menus sm
       LEFT JOIN user_profiles up ON sm.created_by = up.id
       WHERE sm.id = $1`,
      [menu.id]
    );

    const fullMenu = fullResult.rows[0];

    const itemsResult = await query(
      `SELECT mis.*, mi.name, mi.description, mi.price, mi.calories,
              mi.image, mi.image_alt, mi.category, mi.allergens,
              mi.dietary_tags, mi.is_healthy
       FROM menu_item_schedules mis
       JOIN menu_items mi ON mis.menu_item_id = mi.id
       WHERE mis.scheduled_menu_id = $1
       ORDER BY mis.display_order ASC`,
      [menu.id]
    );

    fullMenu.menu_items = itemsResult.rows || [];
    if (menu.recurring_copies_created) {
      fullMenu.recurring_copies_created = menu.recurring_copies_created;
    }

    res.status(201).json(fullMenu);
  } catch (error) {
    console.error('Create scheduled menu error:', error);
    if (error.code === '23505') {
      res.status(409).json({ error: 'A meal plan already exists for this date. Please choose a different date or edit the existing plan.' });
    } else {
      res.status(500).json({ error: 'Failed to create scheduled menu' });
    }
  }
});

// PUT /api/scheduled-menus/:id - Update a scheduled menu
router.put('/:id', verifyToken, requireRole('admin', 'staff'), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      schedule_date,
      menu_name,
      status,
      meal_types,
      notes,
      menu_item_ids,
      cutoff_time,
      recurrence_type,
      recurrence_end_date
    } = req.body;

    const menuResult = await query(
      `UPDATE scheduled_menus SET
        schedule_date = COALESCE($1, schedule_date),
        menu_name = COALESCE($2, menu_name),
        status = COALESCE($3, status),
        meal_types = COALESCE($4::text[], meal_types),
        notes = COALESCE($5, notes),
        cutoff_time = $7,
        recurrence_type = COALESCE($8, recurrence_type),
        recurrence_end_date = $9,
        updated_at = NOW()
      WHERE id = $6
      RETURNING *`,
      [
        schedule_date || null,
        menu_name || null,
        status || null,
        meal_types || null,
        notes !== undefined ? notes : null,
        id,
        cutoff_time !== undefined ? (cutoff_time || null) : null,
        recurrence_type || null,
        recurrence_end_date !== undefined ? (recurrence_end_date || null) : null
      ]
    );

    if (menuResult.rows.length === 0) {
      return res.status(404).json({ error: 'Scheduled menu not found' });
    }

    // Update menu items if provided
    if (Array.isArray(menu_item_ids)) {
      // Remove existing items
      await query('DELETE FROM menu_item_schedules WHERE scheduled_menu_id = $1', [id]);

      // Add new items
      for (let i = 0; i < menu_item_ids.length; i++) {
        const item = menu_item_ids[i];
        const menuItemId = typeof item === 'string' ? item : item.menu_item_id;
        const mealType = typeof item === 'object' ? item.meal_type : 'lunch';

        await query(
          `INSERT INTO menu_item_schedules (scheduled_menu_id, menu_item_id, meal_type, display_order)
           VALUES ($1, $2, $3, $4)`,
          [id, menuItemId, mealType, i + 1]
        );
      }
    }

    // Fetch complete menu
    const fullResult = await query(
      `SELECT sm.*, up.full_name as created_by_name
       FROM scheduled_menus sm
       LEFT JOIN user_profiles up ON sm.created_by = up.id
       WHERE sm.id = $1`,
      [id]
    );

    const fullMenu = fullResult.rows[0];

    const itemsResult = await query(
      `SELECT mis.*, mi.name, mi.description, mi.price, mi.calories,
              mi.image, mi.image_alt, mi.category, mi.allergens,
              mi.dietary_tags, mi.is_healthy
       FROM menu_item_schedules mis
       JOIN menu_items mi ON mis.menu_item_id = mi.id
       WHERE mis.scheduled_menu_id = $1
       ORDER BY mis.display_order ASC`,
      [id]
    );

    fullMenu.menu_items = itemsResult.rows || [];

    res.json(fullMenu);
  } catch (error) {
    console.error('Update scheduled menu error:', error);
    res.status(500).json({ error: 'Failed to update scheduled menu' });
  }
});

// PUT /api/scheduled-menus/:id/publish - Publish a menu (with optional recurrence)
router.put('/:id/publish', verifyToken, requireRole('admin', 'staff'), async (req, res) => {
  try {
    const { id } = req.params;
    const { recurrence_type, recurrence_end_date } = req.body || {};

    // Update status and optionally set recurrence
    let updateQuery;
    let updateParams;

    if (recurrence_type && recurrence_type !== 'none' && recurrence_end_date) {
      updateQuery = `UPDATE scheduled_menus SET status = 'published', recurrence_type = $2, recurrence_end_date = $3, updated_at = NOW()
       WHERE id = $1
       RETURNING *`;
      updateParams = [id, recurrence_type, recurrence_end_date];
    } else {
      updateQuery = `UPDATE scheduled_menus SET status = 'published', updated_at = NOW()
       WHERE id = $1
       RETURNING *`;
      updateParams = [id];
    }

    const result = await query(updateQuery, updateParams);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Scheduled menu not found' });
    }

    const menu = result.rows[0];

    // If recurrence is set, generate recurring copies
    let recurringCopies = [];
    const effectiveRecurrence = recurrence_type || menu.recurrence_type;
    const effectiveEndDate = recurrence_end_date || menu.recurrence_end_date;

    if (effectiveRecurrence && effectiveRecurrence !== 'none' && effectiveEndDate) {
      const sourceItems = await query(
        `SELECT menu_item_id, meal_type, display_order FROM menu_item_schedules WHERE scheduled_menu_id = $1 ORDER BY display_order`,
        [id]
      );

      const menuForRecurrence = { ...menu, recurrence_type: effectiveRecurrence, recurrence_end_date: effectiveEndDate };
      recurringCopies = await generateRecurringCopies(menuForRecurrence, sourceItems.rows, req.user.id);
    }

    res.json({
      ...menu,
      recurring_copies_created: recurringCopies.length,
      message: recurringCopies.length > 0
        ? `Published and created ${recurringCopies.length} recurring ${effectiveRecurrence} copies.`
        : 'Menu published successfully.'
    });
  } catch (error) {
    console.error('Publish menu error:', error);
    res.status(500).json({ error: 'Failed to publish menu' });
  }
});

// PUT /api/scheduled-menus/:id/unpublish - Unpublish a menu
router.put('/:id/unpublish', verifyToken, requireRole('admin', 'staff'), async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `UPDATE scheduled_menus SET status = 'draft', updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Scheduled menu not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Unpublish menu error:', error);
    res.status(500).json({ error: 'Failed to unpublish menu' });
  }
});

// DELETE /api/scheduled-menus/:id - Delete a scheduled menu
router.delete('/:id', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;

    // Check if the menu is published - published menus cannot be deleted
    const menuCheck = await query(
      `SELECT id, status, menu_name FROM scheduled_menus WHERE id = $1`,
      [id]
    );

    if (menuCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Scheduled menu not found' });
    }

    if (menuCheck.rows[0].status === 'published') {
      return res.status(400).json({
        error: 'Cannot delete a published meal plan. Please unpublish it first before deleting.'
      });
    }

    // Check for existing pre-orders
    const ordersCheck = await query(
      `SELECT COUNT(*) as count FROM pre_orders WHERE scheduled_menu_id = $1 AND status != 'cancelled'`,
      [id]
    );

    if (parseInt(ordersCheck.rows[0].count) > 0) {
      return res.status(400).json({
        error: 'Cannot delete menu with active pre-orders. Cancel all orders first.'
      });
    }

    // Delete menu item schedules first
    await query('DELETE FROM menu_item_schedules WHERE scheduled_menu_id = $1', [id]);

    // Delete the menu
    const result = await query(
      'DELETE FROM scheduled_menus WHERE id = $1 RETURNING id',
      [id]
    );

    res.json({ message: 'Scheduled menu deleted successfully' });
  } catch (error) {
    console.error('Delete scheduled menu error:', error);
    res.status(500).json({ error: 'Failed to delete scheduled menu' });
  }
});

// GET /api/scheduled-menus/:id/pre-orders - Get pre-orders for a specific menu
router.get('/:id/pre-orders', verifyToken, requireRole('admin', 'staff'), async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT po.*,
        up_student.full_name as student_name,
        up_student.student_id as student_number,
        up_student.grade as student_grade,
        up_parent.full_name as parent_name,
        up_parent.email as parent_email
      FROM pre_orders po
      LEFT JOIN user_profiles up_student ON po.student_id = up_student.id
      LEFT JOIN user_profiles up_parent ON po.parent_id = up_parent.id
      WHERE po.scheduled_menu_id = $1
      ORDER BY po.created_at DESC`,
      [id]
    );

    res.json(result.rows || []);
  } catch (error) {
    console.error('Get menu pre-orders error:', error);
    res.status(500).json({ error: 'Failed to fetch pre-orders for this menu' });
  }
});

module.exports = router;