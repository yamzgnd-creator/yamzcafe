const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { verifyToken, requireRole } = require('../middleware/auth');

// Get dietary restrictions (optionally filtered by student_id)
router.get('/restrictions', verifyToken, async (req, res) => {
  try {
    const { student_id } = req.query;

    let queryText = `
      SELECT * FROM dietary_restrictions
      WHERE 1=1
    `;
    const params = [];

    if (student_id) {
      queryText += ' AND student_id = $1';
      params.push(student_id);
    }

    queryText += ' ORDER BY severity DESC, restriction_name';

    const result = await query(queryText, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get dietary restrictions error:', error);
    res.status(500).json({ error: 'Failed to fetch dietary restrictions' });
  }
});

// Get restrictions for a specific student (convenience route used by frontend)
router.get('/students/:studentId/restrictions', verifyToken, async (req, res) => {
  try {
    const { studentId } = req.params;

    const result = await query(
      `SELECT * FROM dietary_restrictions
       WHERE student_id = $1
       ORDER BY severity DESC, restriction_name`,
      [studentId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get student dietary restrictions error:', error);
    res.status(500).json({ error: 'Failed to fetch dietary restrictions' });
  }
});

// Get dietary restriction templates
router.get('/templates', verifyToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, template_id, name, category, default_severity AS severity, 
              description, common_allergens, substitution_suggestions AS substitutions
       FROM dietary_restriction_templates 
       WHERE is_active = true 
       ORDER BY default_severity DESC, name`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get templates error:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// Add dietary restriction to a student (body-based)
router.post('/restrictions', verifyToken, async (req, res) => {
  try {
    const { student_id, restriction_name, category, severity, notes } = req.body;

    if (!student_id || !restriction_name) {
      return res.status(400).json({ error: 'Student ID and restriction name are required' });
    }

    const result = await query(
      `INSERT INTO dietary_restrictions (
        student_id, restriction_name, category, severity, notes
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *`,
      [student_id, restriction_name, category || 'allergy', severity || 'moderate', notes || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Add dietary restriction error:', error);
    res.status(500).json({ error: 'Failed to add dietary restriction' });
  }
});

// Add dietary restriction for a specific student (URL-based, used by frontend)
router.post('/students/:studentId/restrictions', verifyToken, async (req, res) => {
  try {
    const { studentId } = req.params;
    const { restriction_name, category, severity, notes } = req.body;

    if (!restriction_name) {
      return res.status(400).json({ error: 'Restriction name is required' });
    }

    const result = await query(
      `INSERT INTO dietary_restrictions (
        student_id, restriction_name, category, severity, notes
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *`,
      [studentId, restriction_name, category || 'allergy', severity || 'moderate', notes || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Add dietary restriction error:', error);
    res.status(500).json({ error: 'Failed to add dietary restriction' });
  }
});

// Update dietary restriction
router.put('/restrictions/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { restriction_name, category, severity, notes, parent_verified } = req.body;

    const result = await query(
      `UPDATE dietary_restrictions SET
        restriction_name = COALESCE($1, restriction_name),
        category = COALESCE($2, category),
        severity = COALESCE($3, severity),
        notes = COALESCE($4, notes),
        updated_at = NOW()
       WHERE id = $5 RETURNING *`,
      [restriction_name, category, severity, notes, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Dietary restriction not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update dietary restriction error:', error);
    res.status(500).json({ error: 'Failed to update dietary restriction' });
  }
});

// Remove dietary restriction (hard delete since no deleted_at column)
router.delete('/restrictions/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      'DELETE FROM dietary_restrictions WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Dietary restriction not found' });
    }

    res.json({ message: 'Dietary restriction removed successfully' });
  } catch (error) {
    console.error('Remove dietary restriction error:', error);
    res.status(500).json({ error: 'Failed to remove dietary restriction' });
  }
});

// Get dietary restriction categories
router.get('/categories', verifyToken, async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM dietary_restriction_categories WHERE is_active = true ORDER BY display_order, name'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get dietary categories error:', error);
    // Return empty array if table doesn't exist
    res.json([]);
  }
});

// Create dietary restriction category
router.post('/categories', verifyToken, requireRole('admin', 'staff'), async (req, res) => {
  try {
    const { name, description, icon, color, requires_documentation, display_order } = req.body;
    const result = await query(
      `INSERT INTO dietary_restriction_categories (name, description, icon, color, requires_documentation, display_order, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, true) RETURNING *`,
      [name, description, icon || 'AlertCircle', color || '#dc2626', requires_documentation || false, display_order || 0]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create dietary category error:', error);
    res.status(500).json({ error: 'Failed to create dietary category' });
  }
});

// Update dietary restriction category
router.put('/categories/:id', verifyToken, requireRole('admin', 'staff'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, icon, color, requires_documentation, display_order } = req.body;
    const result = await query(
      `UPDATE dietary_restriction_categories SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        icon = COALESCE($3, icon),
        color = COALESCE($4, color),
        requires_documentation = COALESCE($5, requires_documentation),
        display_order = COALESCE($6, display_order),
        updated_at = NOW()
       WHERE id = $7 RETURNING *`,
      [name, description, icon, color, requires_documentation, display_order, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Category not found' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update dietary category error:', error);
    res.status(500).json({ error: 'Failed to update dietary category' });
  }
});

module.exports = router;