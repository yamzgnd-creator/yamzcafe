const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { verifyToken, requireRole } = require('../middleware/auth');

// Get inventory items (menu items with stock info)
router.get('/', verifyToken, requireRole('admin', 'staff'), async (req, res) => {
  try {
    const { available_only, stock_status } = req.query;

    let queryText = 'SELECT * FROM menu_items WHERE 1=1';
    const params = [];
    let paramCount = 1;

    if (available_only === 'true') {
      queryText += ' AND is_available = true';
    }

    if (stock_status === 'low') {
      queryText += ' AND stock_quantity > 0 AND stock_quantity <= low_stock_threshold';
    } else if (stock_status === 'out') {
      queryText += ' AND stock_quantity <= 0';
    } else if (stock_status === 'ok') {
      queryText += ' AND stock_quantity > low_stock_threshold';
    }

    queryText += ' ORDER BY name ASC';

    const result = await query(queryText, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get inventory error:', error);
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

// Get ingredient inventory with stock levels
router.get('/ingredients', verifyToken, requireRole('admin', 'staff'), async (req, res) => {
  try {
    const result = await query(`
      SELECT i.*,
        COALESCE(SUM(CASE WHEN it.transaction_type = 'in' THEN it.quantity ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN it.transaction_type = 'out' THEN it.quantity ELSE 0 END), 0) as current_stock
      FROM ingredients i
      LEFT JOIN inventory_transactions it ON i.id = it.ingredient_id
      GROUP BY i.id
      ORDER BY i.name ASC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Get ingredient inventory error:', error);
    res.status(500).json({ error: 'Failed to fetch ingredient inventory' });
  }
});

// Update inventory item availability
router.patch('/:id/availability', verifyToken, requireRole('admin', 'staff'), async (req, res) => {
  try {
    const { id } = req.params;
    const { is_available } = req.body;

    if (is_available === undefined) {
      return res.status(400).json({ error: 'Availability status required' });
    }

    const result = await query(
      'UPDATE menu_items SET is_available = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [is_available, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update inventory error:', error);
    res.status(500).json({ error: 'Failed to update inventory' });
  }
});

// Restock an item — increase stock_quantity and optionally update max_stock / threshold
router.post('/:id/restock', verifyToken, requireRole('admin', 'staff'), async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, max_stock, low_stock_threshold } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'A positive restock amount is required' });
    }

    // Build dynamic SET clause
    const sets = [
      'stock_quantity = LEAST(COALESCE($2, max_stock), stock_quantity + $1)',
      'updated_at = NOW()',
    ];
    const params = [amount];
    let paramCount = 2;

    if (max_stock !== undefined) {
      sets.push(`max_stock = $${paramCount}`);
      params.push(max_stock);
      paramCount++;
    } else {
      params.push(null); // placeholder for $2 (used in LEAST)
    }

    if (low_stock_threshold !== undefined) {
      sets.push(`low_stock_threshold = $${paramCount}`);
      params.push(low_stock_threshold);
      paramCount++;
    }

    params.push(id);

    // Adjust the query: use COALESCE($2, max_stock) so if max_stock param is null we keep existing
    const result = await query(
      `UPDATE menu_items SET ${sets.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Restock error:', error);
    res.status(500).json({ error: 'Failed to restock item' });
  }
});

// Quick stock adjust (+/- delta)
router.patch('/:id/stock', verifyToken, requireRole('admin', 'staff'), async (req, res) => {
  try {
    const { id } = req.params;
    const { delta, max_stock, low_stock_threshold } = req.body;

    if (delta === undefined || delta === 0) {
      return res.status(400).json({ error: 'A non-zero delta is required' });
    }

    const sets = ['updated_at = NOW()'];
    const params = [];
    let paramCount = 1;

    // stock_quantity adjustment (clamped between 0 and max_stock)
    sets.push(`stock_quantity = GREATEST(0, LEAST(max_stock, stock_quantity + $${paramCount}))`);
    params.push(delta);
    paramCount++;

    if (max_stock !== undefined) {
      sets.push(`max_stock = $${paramCount}`);
      params.push(max_stock);
      paramCount++;
    }

    if (low_stock_threshold !== undefined) {
      sets.push(`low_stock_threshold = $${paramCount}`);
      params.push(low_stock_threshold);
      paramCount++;
    }

    params.push(id);

    const result = await query(
      `UPDATE menu_items SET ${sets.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Stock adjust error:', error);
    res.status(500).json({ error: 'Failed to adjust stock' });
  }
});

// Update menu item details
router.patch('/:id', verifyToken, requireRole('admin', 'staff'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, price, calories, is_healthy, is_available, category, allergens, dietary_tags, prep_time, serving_size, stock_quantity, max_stock, low_stock_threshold } = req.body;

    const fields = [];
    const values = [];
    let paramCount = 1;

    if (name !== undefined) { fields.push(`name = $${paramCount}`); values.push(name); paramCount++; }
    if (description !== undefined) { fields.push(`description = $${paramCount}`); values.push(description); paramCount++; }
    if (price !== undefined) { fields.push(`price = $${paramCount}`); values.push(price); paramCount++; }
    if (calories !== undefined) { fields.push(`calories = $${paramCount}`); values.push(calories); paramCount++; }
    if (is_healthy !== undefined) { fields.push(`is_healthy = $${paramCount}`); values.push(is_healthy); paramCount++; }
    if (is_available !== undefined) { fields.push(`is_available = $${paramCount}`); values.push(is_available); paramCount++; }
    if (category !== undefined) { fields.push(`category = $${paramCount}`); values.push(category); paramCount++; }
    if (allergens !== undefined) { fields.push(`allergens = $${paramCount}`); values.push(allergens); paramCount++; }
    if (dietary_tags !== undefined) { fields.push(`dietary_tags = $${paramCount}`); values.push(dietary_tags); paramCount++; }
    if (prep_time !== undefined) { fields.push(`prep_time = $${paramCount}`); values.push(prep_time); paramCount++; }
    if (serving_size !== undefined) { fields.push(`serving_size = $${paramCount}`); values.push(serving_size); paramCount++; }
    if (stock_quantity !== undefined) { fields.push(`stock_quantity = $${paramCount}`); values.push(stock_quantity); paramCount++; }
    if (max_stock !== undefined) { fields.push(`max_stock = $${paramCount}`); values.push(max_stock); paramCount++; }
    if (low_stock_threshold !== undefined) { fields.push(`low_stock_threshold = $${paramCount}`); values.push(low_stock_threshold); paramCount++; }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    fields.push('updated_at = NOW()');
    values.push(id);

    const result = await query(
      `UPDATE menu_items SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update menu item error:', error);
    res.status(500).json({ error: 'Failed to update menu item' });
  }
});

module.exports = router;