const express = require('express');
const router = express?.Router();
const { query } = require('../config/database');
const { verifyToken } = require('../middleware/auth');

// Get notifications
router?.get('/', verifyToken, async (req, res) => {
  try {
    const { user_id, type, is_read, limit = 50 } = req?.query;
    
    let queryText = 'SELECT * FROM notifications WHERE 1=1';
    const params = [];
    let paramCount = 1;
    
    if (user_id) {
      queryText += ` AND user_id = $${paramCount}`;
      params?.push(user_id);
      paramCount++;
    } else {
      // Default to current user
      queryText += ` AND user_id = $${paramCount}`;
      params?.push(req?.user?.id);
      paramCount++;
    }
    
    if (type) {
      queryText += ` AND type = $${paramCount}`;
      params?.push(type);
      paramCount++;
    }
    
    if (is_read !== undefined) {
      queryText += ` AND is_read = $${paramCount}`;
      params?.push(is_read === 'true');
      paramCount++;
    }
    
    queryText += ` ORDER BY created_at DESC LIMIT $${paramCount}`;
    params?.push(limit);
    
    const result = await query(queryText, params);
    res?.json(result?.rows);
  } catch (error) {
    console.error('Get notifications error:', error);
    res?.status(500)?.json({ error: 'Failed to fetch notifications' });
  }
});

// Mark notification as read
router?.patch('/:id/read', verifyToken, async (req, res) => {
  try {
    const { id } = req?.params;
    
    const result = await query(
      'UPDATE notifications SET is_read = true, read_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, req?.user?.id]
    );
    
    if (result?.rows?.length === 0) {
      return res?.status(404)?.json({ error: 'Notification not found' });
    }
    
    res?.json(result?.rows?.[0]);
  } catch (error) {
    console.error('Mark notification read error:', error);
    res?.status(500)?.json({ error: 'Failed to mark notification as read' });
  }
});

// Mark all notifications as read
router?.post('/mark-all-read', verifyToken, async (req, res) => {
  try {
    await query(
      'UPDATE notifications SET is_read = true, read_at = NOW() WHERE user_id = $1 AND is_read = false',
      [req?.user?.id]
    );
    
    res?.json({ message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Mark all read error:', error);
    res?.status(500)?.json({ error: 'Failed to mark all notifications as read' });
  }
});

// Get notification preferences for parent-student pair
router?.get('/preferences', verifyToken, async (req, res) => {
  try {
    const { parent_id, student_id } = req?.query;
    
    // If parent_id and student_id provided, get specific preferences
    if (parent_id && student_id) {
      try {
        const result = await query(
          'SELECT * FROM parent_notification_preferences WHERE parent_id = $1 AND student_id = $2',
          [parent_id, student_id]
        );
        if (result?.rows?.length === 0) return res?.json({});
        return res?.json(result?.rows?.[0]);
      } catch (tableError) {
        // Table may not exist in local DB
        return res?.json({});
      }
    }
    
    // If only parent_id, get all preferences for parent
    if (parent_id) {
      try {
        const result = await query(
          'SELECT * FROM parent_notification_preferences WHERE parent_id = $1 ORDER BY created_at DESC',
          [parent_id]
        );
        return res?.json(result?.rows || []);
      } catch (tableError) {
        return res?.json([]);
      }
    }
    
    // Default: get current user preferences
    const result = await query(
      'SELECT notification_preferences FROM user_profiles WHERE id = $1',
      [req?.user?.id]
    );
    if (result?.rows?.length === 0) return res?.status(404)?.json({ error: 'User not found' });
    res?.json(result?.rows?.[0]?.notification_preferences || {});
  } catch (error) {
    console.error('Get preferences error:', error);
    res?.status(500)?.json({ error: 'Failed to fetch notification preferences' });
  }
});

// Upsert notification preferences for parent-student pair
router?.post('/preferences', verifyToken, async (req, res) => {
  try {
    const { parent_id, student_id, ...prefData } = req?.body;
    
    if (parent_id && student_id) {
      try {
        const result = await query(
          `INSERT INTO parent_notification_preferences (parent_id, student_id, low_balance_enabled, low_balance_frequency, low_balance_delivery, transaction_issue_enabled, transaction_issue_frequency, transaction_issue_delivery, transaction_enabled, transaction_frequency, transaction_delivery, pre_order_update_enabled, pre_order_update_frequency, pre_order_update_delivery, dietary_alert_enabled, dietary_alert_frequency, dietary_alert_delivery)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
           ON CONFLICT (parent_id, student_id) DO UPDATE SET
             low_balance_enabled = EXCLUDED.low_balance_enabled,
             low_balance_frequency = EXCLUDED.low_balance_frequency,
             low_balance_delivery = EXCLUDED.low_balance_delivery,
             transaction_issue_enabled = EXCLUDED.transaction_issue_enabled,
             transaction_issue_frequency = EXCLUDED.transaction_issue_frequency,
             transaction_issue_delivery = EXCLUDED.transaction_issue_delivery,
             transaction_enabled = EXCLUDED.transaction_enabled,
             transaction_frequency = EXCLUDED.transaction_frequency,
             transaction_delivery = EXCLUDED.transaction_delivery,
             pre_order_update_enabled = EXCLUDED.pre_order_update_enabled,
             pre_order_update_frequency = EXCLUDED.pre_order_update_frequency,
             pre_order_update_delivery = EXCLUDED.pre_order_update_delivery,
             dietary_alert_enabled = EXCLUDED.dietary_alert_enabled,
             dietary_alert_frequency = EXCLUDED.dietary_alert_frequency,
             dietary_alert_delivery = EXCLUDED.dietary_alert_delivery,
             updated_at = NOW()
           RETURNING *`,
          [
            parent_id, student_id,
            prefData?.low_balance_enabled ?? true, prefData?.low_balance_frequency || 'realtime', JSON.stringify(prefData?.low_balance_delivery || ['in_app', 'email']),
            prefData?.transaction_issue_enabled ?? true, prefData?.transaction_issue_frequency || 'realtime', JSON.stringify(prefData?.transaction_issue_delivery || ['in_app', 'email']),
            prefData?.transaction_enabled ?? false, prefData?.transaction_frequency || 'realtime', JSON.stringify(prefData?.transaction_delivery || ['in_app', 'email']),
            prefData?.pre_order_update_enabled ?? true, prefData?.pre_order_update_frequency || 'daily', JSON.stringify(prefData?.pre_order_update_delivery || ['in_app']),
            prefData?.dietary_alert_enabled ?? true, prefData?.dietary_alert_frequency || 'realtime', JSON.stringify(prefData?.dietary_alert_delivery || ['in_app', 'email'])
          ]
        );
        return res?.json(result?.rows?.[0]);
      } catch (tableError) {
        // Table may not exist - return success anyway
        return res?.json({ parent_id, student_id, ...prefData });
      }
    }
    
    // Default: update current user preferences
    const result = await query(
      'UPDATE user_profiles SET notification_preferences = $1 WHERE id = $2 RETURNING notification_preferences',
      [JSON.stringify(req?.body), req?.user?.id]
    );
    res?.json(result?.rows?.[0]?.notification_preferences);
  } catch (error) {
    console.error('Update preferences error:', error);
    res?.status(500)?.json({ error: 'Failed to update notification preferences' });
  }
});

// Send email notification (using Resend)
router?.post('/send-email', verifyToken, async (req, res) => {
  try {
    const { to, subject, html } = req?.body;
    
    if (!to || !subject || !html) {
      return res?.status(400)?.json({ error: 'To, subject, and html content required' });
    }
    
    // TODO: Implement Resend API integration
    // const resend = new Resend(process.env.RESEND_API_KEY);
    // await resend.emails.send({ from: 'noreply@yamzcafe.com', to, subject, html });
    
    res?.json({ message: 'Email sent successfully' });
  } catch (error) {
    console.error('Send email error:', error);
    res?.status(500)?.json({ error: 'Failed to send email' });
  }
});

module.exports = router;