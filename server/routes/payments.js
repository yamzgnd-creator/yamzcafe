const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { verifyToken, requireRole } = require('../middleware/auth');

// ─── Payment Gateways CRUD ──────────────────────────────────────────────────

// GET /api/payments/gateways — List all payment gateways
router.get('/gateways', verifyToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, provider_id, provider_name, status, is_active, environment,
              supported_currencies, transaction_volume, success_rate,
              avg_response_time, configured_by, configured_at,
              created_at, updated_at
       FROM payment_gateways
       ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get gateways error:', error);
    res.status(500).json({ error: 'Failed to fetch payment gateways' });
  }
});

// POST /api/payments/gateways — Create a new payment gateway
router.post('/gateways', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const {
      provider_id,
      provider_name,
      environment = 'production',
      supported_currencies = ['USD'],
    } = req.body;

    if (!provider_id) {
      return res.status(400).json({ error: 'provider_id is required' });
    }

    const result = await query(
      `INSERT INTO payment_gateways
         (provider_id, provider_name, environment, supported_currencies, configured_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        provider_id,
        provider_name || provider_id,
        environment,
        JSON.stringify(supported_currencies),
        req.user.full_name || req.user.email,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create gateway error:', error);
    res.status(500).json({ error: 'Failed to create payment gateway' });
  }
});

// PUT /api/payments/gateways/:id — Update a payment gateway
router.put('/gateways/:id', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      provider_id,
      provider_name,
      environment,
      supported_currencies,
    } = req.body;

    const result = await query(
      `UPDATE payment_gateways
       SET provider_id = COALESCE($1, provider_id),
           provider_name = COALESCE($2, provider_name),
           environment = COALESCE($3, environment),
           supported_currencies = COALESCE($4, supported_currencies),
           updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [
        provider_id || null,
        provider_name || null,
        environment || null,
        supported_currencies ? JSON.stringify(supported_currencies) : null,
        id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Payment gateway not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update gateway error:', error);
    res.status(500).json({ error: 'Failed to update payment gateway' });
  }
});

// DELETE /api/payments/gateways/:id — Remove a payment gateway
router.delete('/gateways/:id', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `DELETE FROM payment_gateways WHERE id = $1 RETURNING id`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Payment gateway not found' });
    }

    res.status(204).send();
  } catch (error) {
    console.error('Delete gateway error:', error);
    res.status(500).json({ error: 'Failed to delete payment gateway' });
  }
});

// POST /api/payments/gateways/:id/toggle — Toggle gateway active status
router.post('/gateways/:id/toggle', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `UPDATE payment_gateways
       SET is_active = NOT is_active,
           status = CASE WHEN is_active THEN 'inactive' ELSE 'active' END,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Payment gateway not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Toggle gateway error:', error);
    res.status(500).json({ error: 'Failed to toggle payment gateway' });
  }
});

// ─── Stripe Payment Processing ──────────────────────────────────────────────

// POST /api/payments/stripe/charge — Process a Stripe payment
router.post('/stripe/charge', verifyToken, async (req, res) => {
  try {
    const { amount, token, student_id } = req.body;

    if (!amount || !token) {
      return res.status(400).json({ error: 'Amount and payment token required' });
    }

    // TODO: Implement Stripe payment processing
    // const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    // const charge = await stripe.charges.create({
    //   amount: amount * 100, // Convert to cents
    //   currency: 'usd',
    //   source: token,
    //   description: `Credit for student ${student_id}`
    // });

    res.json({
      success: true,
      message: 'Payment processed successfully',
      // charge_id: charge.id
    });
  } catch (error) {
    console.error('Stripe payment error:', error);
    res.status(500).json({ error: 'Payment processing failed' });
  }
});

// GET /api/payments/methods — Get available payment methods
router.get('/methods', verifyToken, async (req, res) => {
  try {
    res.json([
      { id: 'cash', name: 'Cash', enabled: true },
      { id: 'card', name: 'Credit/Debit Card', enabled: true },
      { id: 'account', name: 'Student Account', enabled: true },
    ]);
  } catch (error) {
    console.error('Get payment methods error:', error);
    res.status(500).json({ error: 'Failed to fetch payment methods' });
  }
});

module.exports = router;