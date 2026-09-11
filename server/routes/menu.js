const express = require('express');
const router = express.Router();
const { query, transaction } = require('../config/database');
const { verifyToken, requireRole, requirePermission } = require('../middleware/auth');

// Get all menu items
router.get('/items', verifyToken, async (req, res) => {
  try {
    const { category, is_available, search } = req.query;

    let queryText = 'SELECT * FROM menu_items WHERE 1=1';
    const params = [];
    let paramCount = 1;

    if (category) {
      queryText += ` AND category = $${paramCount}`;
      params.push(category);
      paramCount++;
    }

    if (is_available !== undefined) {
      queryText += ` AND is_available = $${paramCount}`;
      params.push(is_available === 'true');
      paramCount++;
    }

    if (search) {
      queryText += ` AND (name ILIKE $${paramCount} OR description ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }

    queryText += ' ORDER BY category, name';

    const result = await query(queryText, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get menu items error:', error);
    res.status(500).json({ error: 'Failed to fetch menu items' });
  }
});

// Get menu item by ID
router.get('/items/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      'SELECT * FROM menu_items WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Menu item not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get menu item error:', error);
    res.status(500).json({ error: 'Failed to fetch menu item' });
  }
});

// Create menu item
// Actual DB columns: id, item_id, name, description, price, calories, is_healthy,
//   image, image_alt, is_available, created_at, updated_at, category, allergens,
//   dietary_tags, prep_time, serving_size
router.post('/items', verifyToken, requirePermission('system.manageMenuItems'), async (req, res) => {
  try {
    const {
      name,
      description,
      category,
      price,
      image,
      image_url,       // frontend compat — maps to `image` column
      image_alt,
      is_available,
      calories,
      is_healthy,
      allergens,
      dietary_tags,
      prep_time,
      serving_size,
    } = req.body;

    if (!name || !category || price === undefined) {
      return res.status(400).json({ error: 'Name, category, and price required' });
    }

    // Generate a simple item_id
    const itemId = `ITEM-${Date.now()}`;

    // Convert arrays to PostgreSQL array format
    const allergensArr = Array.isArray(allergens) ? allergens : [];
    const dietaryArr = Array.isArray(dietary_tags) ? dietary_tags : [];

    const result = await query(
      `INSERT INTO menu_items (
        item_id, name, description, category, price, image, image_alt,
        is_available, calories, is_healthy, allergens, dietary_tags,
        prep_time, serving_size
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::text[], $12::text[], $13, $14)
      RETURNING *`,
      [
        itemId,
        name,
        description || null,
        category,
        price,
        image || image_url || null,
        image_alt || null,
        is_available !== false,
        calories || null,
        is_healthy || false,
        allergensArr,
        dietaryArr,
        prep_time || 0,
        serving_size || null,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create menu item error:', error);
    res.status(500).json({ error: 'Failed to create menu item' });
  }
});

// Update menu item
router.put('/items/:id', verifyToken, requirePermission('system.manageMenuItems'), async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Map image_url → image for frontend compat
    if (updates.image_url !== undefined && updates.image === undefined) {
      updates.image = updates.image_url;
      delete updates.image_url;
    }

    // Only allow known columns
    const allowedColumns = [
      'name', 'description', 'category', 'price', 'image', 'image_alt',
      'is_available', 'calories', 'is_healthy', 'allergens', 'dietary_tags',
      'prep_time', 'serving_size',
    ];

    const fields = [];
    const values = [];
    let paramCount = 1;

    for (const key of allowedColumns) {
      if (updates[key] !== undefined) {
        // Use PostgreSQL array cast for array columns
        if (key === 'allergens' || key === 'dietary_tags') {
          fields.push(`${key} = $${paramCount}::text[]`);
          values.push(Array.isArray(updates[key]) ? updates[key] : []);
        } else {
          fields.push(`${key} = $${paramCount}`);
          values.push(updates[key]);
        }
        paramCount++;
      }
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    fields.push('updated_at = NOW()');
    values.push(id);

    const result = await query(
      `UPDATE menu_items SET ${fields.join(', ')}
       WHERE id = $${paramCount}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Menu item not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update menu item error:', error);
    res.status(500).json({ error: 'Failed to update menu item' });
  }
});

// Delete menu item
router.delete('/items/:id', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      'DELETE FROM menu_items WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Menu item not found' });
    }

    res.json({ message: 'Menu item deleted successfully' });
  } catch (error) {
    console.error('Delete menu item error:', error);
    res.status(500).json({ error: 'Failed to delete menu item' });
  }
});

// Get meal categories
router.get('/categories', verifyToken, async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM meal_categories ORDER BY display_order, name'
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// Get menu schedules
router.get('/schedules', verifyToken, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    let queryText = `
      SELECT ms.*,
        json_agg(
          json_build_object(
            'id', mi.id,
            'name', mi.name,
            'category', mi.category,
            'price', mi.price
          )
        ) as menu_items
      FROM menu_schedules ms
      LEFT JOIN menu_items mi ON mi.id::text = ANY(
        ARRAY(SELECT jsonb_array_elements_text(ms.menu_item_ids))
      )
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;

    if (start_date) {
      queryText += ` AND ms.date >= $${paramCount}`;
      params.push(start_date);
      paramCount++;
    }

    if (end_date) {
      queryText += ` AND ms.date <= $${paramCount}`;
      params.push(end_date);
      paramCount++;
    }

    queryText += ' GROUP BY ms.id ORDER BY ms.date';

    const result = await query(queryText, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get schedules error:', error);
    res.status(500).json({ error: 'Failed to fetch schedules' });
  }
});

// Create meal category
router.post('/categories', verifyToken, requirePermission('system.manageMenuItems'), async (req, res) => {
  try {
    const { name, description, display_order, is_active, icon, color } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Category name is required' });
    }
    // Generate a category_id from the name (e.g., "Hot Drinks" -> "CAT-HOT-DRINKS")
    const categoryId = 'CAT-' + name.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 30) + '-' + Date.now().toString(36);
    const result = await query(
      `INSERT INTO meal_categories (category_id, name, description, display_order, is_active, icon, color)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [categoryId, name, description || null, display_order || 0, is_active !== false, icon || null, color || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

// Update meal category
router.put('/categories/:id', verifyToken, requirePermission('system.manageMenuItems'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, display_order, is_active } = req.body;
    const result = await query(
      `UPDATE meal_categories SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        display_order = COALESCE($3, display_order),
        is_active = COALESCE($4, is_active),
        updated_at = NOW()
      WHERE id = $5 RETURNING *`,
      [name, description, display_order, is_active, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update category error:', error);
    res.status(500).json({ error: 'Failed to update category' });
  }
});

// Delete meal category
router.delete('/categories/:id', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(
      'DELETE FROM meal_categories WHERE id = $1 RETURNING id',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }
    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

module.exports = router;