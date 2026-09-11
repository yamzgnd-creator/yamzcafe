const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { verifyToken, requireRole } = require('../middleware/auth');

// ============================================
// Default email templates
// ============================================

const DEFAULT_EMAIL_TEMPLATES = {
  welcome: {
    subject: 'Welcome to {{app_name}} — Set Your Password',
    body: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: 'Segoe UI', Arial, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.07);">
          <tr>
            <td style="background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); padding: 32px 40px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">🍽️ {{app_name}}</h1>
              <p style="margin: 8px 0 0; color: rgba(255,255,255,0.85); font-size: 14px;">Welcome to the team!</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 36px 40px 24px;">
              <h2 style="margin: 0 0 16px; color: #111827; font-size: 22px; font-weight: 600;">Hello, {{user_name}}! 👋</h2>
              <p style="margin: 0 0 16px; color: #374151; font-size: 15px; line-height: 1.6;">
                You've been invited to join <strong>{{app_name}}</strong> as a <strong>{{user_role}}</strong>.
                Your account has been created and is ready for you to set up.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 20px 0; background-color: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <p style="margin: 0 0 6px; color: #0c4a6e; font-size: 13px; font-weight: 600; text-transform: uppercase;">Your Account Details</p>
                    <p style="margin: 0; color: #1e3a8a; font-size: 15px;">
                      <strong>Email:</strong> {{user_email}}<br/>
                      <strong>Role:</strong> {{user_role}}
                    </p>
                  </td>
                </tr>
              </table>
              <p style="margin: 0 0 24px; color: #374151; font-size: 15px; line-height: 1.6;">
                To get started, please click the button below to set your password. This link will expire in <strong>{{expiry_hours}} hours</strong>.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 8px 0 24px;">
                    <a href="{{reset_link}}" style="display: inline-block; background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 8px; font-size: 16px; font-weight: 600;">
                      Set Your Password →
                    </a>
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 20px; background-color: #fefce8; border: 1px solid #fde68a; border-radius: 8px;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <p style="margin: 0 0 8px; color: #92400e; font-size: 14px; font-weight: 600;">📋 How to access the system:</p>
                    <ol style="margin: 0; padding-left: 20px; color: #78350f; font-size: 14px; line-height: 1.8;">
                      <li>Click the "Set Your Password" button above</li>
                      <li>Create a secure password (at least 6 characters)</li>
                      <li>Once set, go to the login page and sign in with your email and new password</li>
                      <li>You'll be directed to your {{user_role}} dashboard</li>
                    </ol>
                  </td>
                </tr>
              </table>
              <p style="margin: 0; color: #6b7280; font-size: 13px; line-height: 1.5;">
                If the button doesn't work, copy and paste this link into your browser:<br/>
                <a href="{{reset_link}}" style="color: #2563eb; word-break: break-all;">{{reset_link}}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 40px 32px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0 0 8px; color: #9ca3af; font-size: 12px; text-align: center;">
                This is an automated message from {{app_name}}. Please do not reply to this email.
              </p>
              <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center;">
                If you didn't expect this email or need help, please contact your administrator.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  },
  reset_password: {
    subject: '{{app_name}} — Password Reset',
    body: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: 'Segoe UI', Arial, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.07);">
          <tr>
            <td style="background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); padding: 32px 40px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">🍽️ {{app_name}}</h1>
              <p style="margin: 8px 0 0; color: rgba(255,255,255,0.85); font-size: 14px;">Password Reset Request</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 36px 40px 24px;">
              <h2 style="margin: 0 0 16px; color: #111827; font-size: 22px;">Hello, {{user_name}}!</h2>
              <p style="margin: 0 0 16px; color: #374151; font-size: 15px; line-height: 1.6;">
                We received a request to reset your password. Click the button below to set a new password. This link will expire in <strong>{{expiry_hours}} hours</strong>.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 8px 0 24px;">
                    <a href="{{reset_link}}" style="display: inline-block; background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 8px; font-size: 16px; font-weight: 600;">
                      Reset Password →
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin: 0 0 12px; color: #6b7280; font-size: 13px;">
                If you didn't request this, you can safely ignore this email. Your password will remain unchanged.
              </p>
              <p style="margin: 0; color: #6b7280; font-size: 13px;">
                Link: <a href="{{reset_link}}" style="color: #2563eb; word-break: break-all;">{{reset_link}}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 40px 32px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center;">
                This is an automated message from {{app_name}}.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  },
  parent_welcome: {
    subject: 'Welcome to {{app_name}}!',
    body: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: 'Segoe UI', Arial, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.07);">
          <tr>
            <td style="background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); padding: 32px 40px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">🍽️ {{app_name}}</h1>
              <p style="margin: 8px 0 0; color: rgba(255,255,255,0.85); font-size: 14px;">Welcome, Parent!</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 36px 40px 24px;">
              <h2 style="margin: 0 0 16px; color: #111827; font-size: 22px; font-weight: 600;">Hello, {{user_name}}! 👋</h2>
              <p style="margin: 0 0 16px; color: #374151; font-size: 15px; line-height: 1.6;">
                Thank you for registering with <strong>{{app_name}}</strong>! Your parent account has been created successfully.
              </p>
              <p style="margin: 0 0 16px; color: #374151; font-size: 15px; line-height: 1.6;">
                You can now sign in to manage your children's meal accounts, view transactions, place pre-orders, and more.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 8px 0 24px;">
                    <a href="{{login_url}}" style="display: inline-block; background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 8px; font-size: 16px; font-weight: 600;">
                      Go to Login →
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin: 0; color: #6b7280; font-size: 13px;">
                Your login email: <strong>{{user_email}}</strong>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 40px 32px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center;">
                This is an automated message from {{app_name}}. If you need help, contact your administrator.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  },
};

// ============================================
// BRANDING routes MUST come BEFORE /:key route
// otherwise Express matches "branding" as :key
// ============================================

// Get company branding (PUBLIC - no auth required, needed for login page)
router.get('/branding/company', async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM company_settings ORDER BY created_at DESC LIMIT 1'
    );
    
    if (result?.rows?.length === 0) {
      return res.json({});
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get branding error:', error);
    res.status(500).json({ error: 'Failed to fetch branding' });
  }
});

// Update company branding
router.put('/branding/company', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const branding = req.body;
    
    // Check if a row already exists
    const existing = await query('SELECT id FROM company_settings ORDER BY created_at DESC LIMIT 1');
    
    if (existing?.rows?.length > 0) {
      // UPDATE existing row
      const existingId = existing.rows[0].id;
      const result = await query(
        `UPDATE company_settings SET
          company_name = COALESCE($1, company_name),
          tagline = COALESCE($2, tagline),
          logo_url = COALESCE($3, logo_url),
          login_logo_url = COALESCE($4, login_logo_url),
          login_logo_size = COALESCE($5, login_logo_size),
          welcome_text = COALESCE($6, welcome_text),
          subtitle_text = COALESCE($7, subtitle_text),
          login_background_type = COALESCE($8, login_background_type),
          login_background_value = COALESCE($9, login_background_value),
          primary_color = COALESCE($10, primary_color),
          secondary_color = COALESCE($11, secondary_color),
          accent_color = COALESCE($12, accent_color),
          contact_email = COALESCE($13, contact_email),
          contact_phone = COALESCE($14, contact_phone),
          address = COALESCE($15, address),
          website_url = COALESCE($16, website_url),
          currency_symbol = COALESCE($17, currency_symbol),
          timezone = COALESCE($18, timezone),
          date_format = COALESCE($19, date_format),
          site_background_image = $20,
          favicon_url = $21,
          login_background_image = $22,
          dashboard_background_image = $23,
          login_bg_opacity = $24,
          login_bg_blur = $25,
          login_card_opacity = $26,
          updated_at = NOW()
        WHERE id = $27
        RETURNING *`,
        [
          branding?.company_name,
          branding?.tagline,
          branding?.logo_url,
          branding?.login_logo_url,
          branding?.login_logo_size,
          branding?.welcome_text,
          branding?.subtitle_text,
          branding?.login_background_type,
          branding?.login_background_value,
          branding?.primary_color,
          branding?.secondary_color,
          branding?.accent_color,
          branding?.contact_email,
          branding?.contact_phone,
          branding?.address,
          branding?.website_url,
          branding?.currency_symbol,
          branding?.timezone,
          branding?.date_format,
          branding?.site_background_image !== undefined ? branding.site_background_image : null,
          branding?.favicon_url !== undefined ? branding.favicon_url : null,
          branding?.login_background_image !== undefined ? branding.login_background_image : null,
          branding?.dashboard_background_image !== undefined ? branding.dashboard_background_image : null,
          branding?.login_bg_opacity != null ? branding.login_bg_opacity : 40,
          branding?.login_bg_blur != null ? branding.login_bg_blur : 4,
          branding?.login_card_opacity != null ? branding.login_card_opacity : 100,
          existingId
        ]
      );
      
      return res.json(result.rows[0]);
    } else {
      // INSERT new row
      const result = await query(
        `INSERT INTO company_settings (
          company_name, tagline, logo_url, login_logo_url, login_logo_size,
          welcome_text, subtitle_text, login_background_type, login_background_value,
          primary_color, secondary_color, accent_color,
          contact_email, contact_phone, address, website_url,
          currency_symbol, timezone, date_format, site_background_image, favicon_url,
          login_background_image, dashboard_background_image,
          login_bg_opacity, login_bg_blur, login_card_opacity
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)
        RETURNING *`,
        [
          branding?.company_name,
          branding?.tagline,
          branding?.logo_url,
          branding?.login_logo_url,
          branding?.login_logo_size,
          branding?.welcome_text,
          branding?.subtitle_text,
          branding?.login_background_type,
          branding?.login_background_value,
          branding?.primary_color,
          branding?.secondary_color,
          branding?.accent_color,
          branding?.contact_email,
          branding?.contact_phone,
          branding?.address,
          branding?.website_url,
          branding?.currency_symbol || '$',
          branding?.timezone || 'America/New_York',
          branding?.date_format || 'MM/DD/YYYY',
          branding?.site_background_image || null,
          branding?.favicon_url || null,
          branding?.login_background_image || null,
          branding?.dashboard_background_image || null,
          branding?.login_bg_opacity != null ? branding.login_bg_opacity : 40,
          branding?.login_bg_blur != null ? branding.login_bg_blur : 4,
          branding?.login_card_opacity != null ? branding.login_card_opacity : 100
        ]
      );
      
      return res.json(result.rows[0]);
    }
  } catch (error) {
    console.error('Update branding error:', error);
    res.status(500).json({ error: 'Failed to update branding' });
  }
});

// ============================================
// SMTP routes MUST come BEFORE /:key route
// ============================================

// Get SMTP settings (password masked)
router.get('/smtp', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const result = await query(
      `SELECT key, value FROM system_config WHERE key LIKE 'smtp_%'`
    );

    const smtp = {};
    for (const row of result?.rows || []) {
      let val = row.value;
      try { val = JSON.parse(val); } catch { /* use raw */ }
      // Mask the password
      if (row.key === 'smtp_password' && val) {
        smtp[row.key] = '••••••••';
      } else {
        smtp[row.key] = val;
      }
    }

    res.json(smtp);
  } catch (error) {
    console.error('Get SMTP settings error:', error);
    res.status(500).json({ error: 'Failed to fetch SMTP settings' });
  }
});

// Save SMTP settings
router.put('/smtp', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const {
      smtp_host, smtp_port, smtp_secure,
      smtp_user, smtp_password,
      smtp_from_name, smtp_from_email,
    } = req.body;

    const fields = {
      smtp_host: smtp_host || '',
      smtp_port: smtp_port || 587,
      smtp_secure: smtp_secure || false,
      smtp_user: smtp_user || '',
      smtp_from_name: smtp_from_name || '',
      smtp_from_email: smtp_from_email || '',
    };

    // Only update password if it's not the masked placeholder
    if (smtp_password && smtp_password !== '••••••••') {
      fields.smtp_password = smtp_password;
    }

    for (const [key, value] of Object.entries(fields)) {
      await query(
        `INSERT INTO system_config (key, value)
         VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        [key, JSON.stringify(value)]
      );
    }

    res.json({ message: 'SMTP settings saved successfully' });
  } catch (error) {
    console.error('Save SMTP settings error:', error);
    res.status(500).json({ error: 'Failed to save SMTP settings' });
  }
});

// Send test email
router.post('/smtp/test', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { recipient_email } = req.body;
    if (!recipient_email) {
      return res.status(400).json({ error: 'Recipient email is required' });
    }

    const { sendTestEmail } = require('../services/emailService');
    const info = await sendTestEmail(recipient_email);

    res.json({
      message: `Test email sent successfully to ${recipient_email}`,
      messageId: info.messageId,
    });
  } catch (error) {
    console.error('Send test email error:', error);
    res.status(500).json({
      error: `Failed to send test email: ${error.message}`,
    });
  }
});

// ============================================
// EMAIL TEMPLATE routes
// ============================================

// Get all email templates
router.get('/email-templates', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const result = await query(
      `SELECT key, value FROM system_config WHERE key LIKE 'email_template_%'`
    );

    const customTemplates = {};
    for (const row of result?.rows || []) {
      const templateKey = row.key.replace('email_template_', '');
      let val = row.value;
      try { val = JSON.parse(val); } catch { /* use raw */ }
      customTemplates[templateKey] = val;
    }

    // Merge defaults with custom templates
    const templates = {};
    for (const [key, defaultTpl] of Object.entries(DEFAULT_EMAIL_TEMPLATES)) {
      templates[key] = {
        key,
        subject: customTemplates[key]?.subject || defaultTpl.subject,
        body: customTemplates[key]?.body || defaultTpl.body,
        is_custom: !!customTemplates[key],
      };
    }

    res.json(templates);
  } catch (error) {
    console.error('Get email templates error:', error);
    res.status(500).json({ error: 'Failed to fetch email templates' });
  }
});

// Get a specific email template
router.get('/email-templates/:templateKey', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { templateKey } = req.params;

    if (!DEFAULT_EMAIL_TEMPLATES[templateKey]) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const result = await query(
      `SELECT value FROM system_config WHERE key = $1`,
      [`email_template_${templateKey}`]
    );

    const defaultTpl = DEFAULT_EMAIL_TEMPLATES[templateKey];

    if (result?.rows?.length > 0) {
      let val = result.rows[0].value;
      try { val = JSON.parse(val); } catch { /* use raw */ }
      return res.json({
        key: templateKey,
        subject: val.subject || defaultTpl.subject,
        body: val.body || defaultTpl.body,
        is_custom: true,
      });
    }

    res.json({
      key: templateKey,
      subject: defaultTpl.subject,
      body: defaultTpl.body,
      is_custom: false,
    });
  } catch (error) {
    console.error('Get email template error:', error);
    res.status(500).json({ error: 'Failed to fetch email template' });
  }
});

// Save/update a specific email template
router.put('/email-templates/:templateKey', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { templateKey } = req.params;
    const { subject, body } = req.body;

    if (!DEFAULT_EMAIL_TEMPLATES[templateKey]) {
      return res.status(404).json({ error: 'Template not found' });
    }

    if (!subject || !body) {
      return res.status(400).json({ error: 'Subject and body are required' });
    }

    const configKey = `email_template_${templateKey}`;
    const value = JSON.stringify({ subject, body });

    await query(
      `INSERT INTO system_config (key, value)
       VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [configKey, value]
    );

    res.json({
      key: templateKey,
      subject,
      body,
      is_custom: true,
      message: 'Email template saved successfully',
    });
  } catch (error) {
    console.error('Save email template error:', error);
    res.status(500).json({ error: 'Failed to save email template' });
  }
});

// Reset a template back to default
router.post('/email-templates/:templateKey/reset', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { templateKey } = req.params;

    if (!DEFAULT_EMAIL_TEMPLATES[templateKey]) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Delete the custom template from system_config
    await query(
      `DELETE FROM system_config WHERE key = $1`,
      [`email_template_${templateKey}`]
    );

    const defaultTpl = DEFAULT_EMAIL_TEMPLATES[templateKey];

    res.json({
      key: templateKey,
      subject: defaultTpl.subject,
      body: defaultTpl.body,
      is_custom: false,
      message: 'Email template reset to default',
    });
  } catch (error) {
    console.error('Reset email template error:', error);
    res.status(500).json({ error: 'Failed to reset email template' });
  }
});

// ============================================
// Generic settings routes (after branding, smtp, email-templates)
// ============================================

// Get all system settings
router.get('/', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const result = await query('SELECT * FROM system_config ORDER BY key');
    
    const settings = {};
    result?.rows?.forEach(row => {
      settings[row.key] = row?.value;
    });
    
    res.json(settings);
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// Get specific setting
router.get('/:key', verifyToken, async (req, res) => {
  try {
    const { key } = req.params;
    
    const result = await query(
      'SELECT value FROM system_config WHERE key = $1',
      [key]
    );
    
    if (result?.rows?.length === 0) {
      return res.status(404).json({ error: 'Setting not found' });
    }
    
    res.json(result.rows[0]?.value);
  } catch (error) {
    console.error('Get setting error:', error);
    res.status(500).json({ error: 'Failed to fetch setting' });
  }
});

// Update setting
router.put('/:key', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    
    const result = await query(
      `INSERT INTO system_config (key, value)
       VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()
       RETURNING *`,
      [key, JSON.stringify(value)]
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update setting error:', error);
    res.status(500).json({ error: 'Failed to update setting' });
  }
});

// Export default templates for use by emailService
router.DEFAULT_EMAIL_TEMPLATES = DEFAULT_EMAIL_TEMPLATES;

module.exports = router;