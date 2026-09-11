const nodemailer = require('nodemailer');
const { query } = require('../config/database');

/**
 * Load SMTP configuration from the system_config table.
 */
async function loadSmtpConfig() {
  const result = await query(
    `SELECT key, value FROM system_config WHERE key LIKE 'smtp_%'`
  );

  const config = {};
  for (const row of result?.rows || []) {
    let val = row.value;
    try { val = JSON.parse(val); } catch { /* use raw */ }
    config[row.key] = val;
  }

  return {
    host: config.smtp_host || '',
    port: parseInt(config.smtp_port, 10) || 587,
    secure: config.smtp_secure === true || config.smtp_secure === 'true',
    user: config.smtp_user || '',
    password: config.smtp_password || '',
    fromName: config.smtp_from_name || 'YAMZ Cafe',
    fromEmail: config.smtp_from_email || '',
  };
}

/**
 * Create a nodemailer transporter from stored SMTP settings.
 */
async function createTransporter() {
  const cfg = await loadSmtpConfig();

  if (!cfg.host || !cfg.user || !cfg.password) {
    throw new Error('SMTP is not configured. Please set SMTP settings in System Settings.');
  }

  const useSecure = cfg.port === 465;

  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: useSecure,
    auth: {
      user: cfg.user,
      pass: cfg.password,
    },
    tls: {
      rejectUnauthorized: false,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
}

/**
 * Send an email using the stored SMTP configuration.
 */
async function sendEmail(to, subject, html, text) {
  const cfg = await loadSmtpConfig();
  const transporter = await createTransporter();

  const from = cfg.fromName
    ? `"${cfg.fromName}" <${cfg.fromEmail || cfg.user}>`
    : cfg.fromEmail || cfg.user;

  const info = await transporter.sendMail({
    from,
    to,
    subject,
    html,
    text: text || undefined,
  });

  console.log(`📧 Email sent to ${to}: ${info.messageId}`);
  return info;
}

/**
 * Load a custom email template from system_config, falling back to the default.
 * @param {string} templateKey - e.g. 'welcome', 'reset_password', 'parent_welcome'
 * @returns {Promise<{subject: string, body: string}>}
 */
async function loadEmailTemplate(templateKey) {
  // Lazy-load defaults from settings router to avoid circular dependency
  let defaults;
  try {
    const settingsRouter = require('../routes/settings');
    defaults = settingsRouter.DEFAULT_EMAIL_TEMPLATES || {};
  } catch {
    defaults = {};
  }

  const defaultTpl = defaults[templateKey] || { subject: '', body: '' };

  try {
    const result = await query(
      `SELECT value FROM system_config WHERE key = $1`,
      [`email_template_${templateKey}`]
    );

    if (result?.rows?.length > 0) {
      let val = result.rows[0].value;
      try { val = JSON.parse(val); } catch { /* use raw */ }
      return {
        subject: val.subject || defaultTpl.subject,
        body: val.body || defaultTpl.body,
      };
    }
  } catch (err) {
    console.error(`⚠️  Failed to load custom template "${templateKey}":`, err.message);
  }

  return defaultTpl;
}

/**
 * Replace all {{placeholder}} tokens in a string with provided values.
 */
function replacePlaceholders(template, variables) {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(regex, value || '');
  }
  return result;
}

/**
 * Send a test email to verify SMTP configuration.
 */
async function sendTestEmail(recipientEmail) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #1e3a8a;">✅ SMTP Configuration Test</h2>
      <p>This is a test email from <strong>YAMZ Cafe POS</strong>.</p>
      <p>If you received this email, your SMTP settings are configured correctly!</p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
      <p style="font-size: 12px; color: #6b7280;">
        Sent at: ${new Date().toISOString()}<br/>
        From: YAMZ Cafe System Settings
      </p>
    </div>
  `;

  return sendEmail(
    recipientEmail,
    'YAMZ Cafe — SMTP Test Email',
    html,
    'This is a test email from YAMZ Cafe POS. Your SMTP settings are working correctly!'
  );
}

/**
 * Send a welcome email to a newly created user with a password reset link.
 */
async function sendWelcomeEmail({ email, fullName, role, resetLink, companyName }) {
  const brandName = companyName || 'YAMZ Cafe';
  const template = await loadEmailTemplate('welcome');

  const variables = {
    user_name: fullName,
    user_email: email,
    user_role: role.charAt(0).toUpperCase() + role.slice(1),
    reset_link: resetLink,
    app_name: brandName,
    login_url: '',
    expiry_hours: '24',
  };

  const subject = replacePlaceholders(template.subject, variables);
  const html = replacePlaceholders(template.body, variables);

  const text = `Hello ${fullName},

You've been invited to join ${brandName} as a ${role}.

Your login email: ${email}

Please set your password by visiting: ${resetLink}

This link expires in 24 hours.

— ${brandName}`;

  return sendEmail(email, subject, html, text);
}

/**
 * Send a welcome email to a self-registered parent.
 */
async function sendParentWelcomeEmail({ email, fullName, loginUrl, companyName }) {
  const brandName = companyName || 'YAMZ Cafe';
  const template = await loadEmailTemplate('parent_welcome');

  const variables = {
    user_name: fullName,
    user_email: email,
    user_role: 'Parent',
    reset_link: '',
    app_name: brandName,
    login_url: loginUrl,
    expiry_hours: '',
  };

  const subject = replacePlaceholders(template.subject, variables);
  const html = replacePlaceholders(template.body, variables);

  const text = `Hello ${fullName},

Thank you for registering with ${brandName}! Your parent account has been created.

You can sign in at: ${loginUrl}
Your login email: ${email}

— ${brandName}`;

  return sendEmail(email, subject, html, text);
}

/**
 * Send a password reset email.
 */
async function sendPasswordResetEmail({ email, fullName, resetLink, companyName }) {
  const brandName = companyName || 'YAMZ Cafe';
  const template = await loadEmailTemplate('reset_password');

  const variables = {
    user_name: fullName,
    user_email: email,
    user_role: '',
    reset_link: resetLink,
    app_name: brandName,
    login_url: '',
    expiry_hours: '24',
  };

  const subject = replacePlaceholders(template.subject, variables);
  const html = replacePlaceholders(template.body, variables);

  const text = `Hello ${fullName}, visit this link to reset your password: ${resetLink} (expires in 24 hours)`;

  return sendEmail(email, subject, html, text);
}

module.exports = {
  loadSmtpConfig,
  createTransporter,
  sendEmail,
  sendTestEmail,
  sendWelcomeEmail,
  sendParentWelcomeEmail,
  sendPasswordResetEmail,
  loadEmailTemplate,
  replacePlaceholders,
};