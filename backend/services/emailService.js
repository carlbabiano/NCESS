import sgMail from '@sendgrid/mail';

let isEmailConfigured = false;

const EMAIL_TIMEOUT_MS = Number(process.env.EMAIL_TIMEOUT_MS) || 10000;

const sendgridApiKey = () => String(process.env.SENDGRID_API_KEY || '').trim();
const senderEmail = () => String(process.env.SENDGRID_FROM_EMAIL || '').trim();
const senderName = () => String(process.env.SENDGRID_FROM_NAME || 'NCESS').trim();

const withTimeout = (promise, timeoutMs, timeoutMessage) => {
  let timeoutId;

  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
};

const getSendGridErrorMessage = (error) => {
  const sendGridErrors = error?.response?.body?.errors;
  if (Array.isArray(sendGridErrors) && sendGridErrors.length > 0) {
    return sendGridErrors.map((item) => item.message).join('; ');
  }

  return error.message;
};

export const initializeEmailService = () => {
  const apiKey = sendgridApiKey();
  const fromEmail = senderEmail();

  if (!apiKey || !fromEmail) {
    console.warn('[EmailService] Warning: SendGrid is not configured. Password reset emails will not be sent.');
    console.warn('[EmailService] Add SENDGRID_API_KEY and SENDGRID_FROM_EMAIL to .env');
    isEmailConfigured = false;
    return;
  }

  sgMail.setApiKey(apiKey);
  sgMail.setTimeout(EMAIL_TIMEOUT_MS);
  isEmailConfigured = true;

  console.log('[EmailService] SendGrid initialized');
  console.log('[EmailService] Sender:', `"${senderName()}" <${fromEmail}>`);
  console.log('[EmailService] Timeout:', `${EMAIL_TIMEOUT_MS}ms`);
};

// Send password reset email with 6-digit code
export const sendPasswordResetEmail = async (userEmail, resetCode) => {
  if (!isEmailConfigured) {
    console.warn(`[EmailService] Email not sent to ${userEmail} - SendGrid is not configured`);
    return { ok: false, error: 'Email service is not configured' };
  }

  try {
    const message = {
      to: userEmail,
      from: {
        email: senderEmail(),
        name: senderName(),
      },
      subject: 'Password Reset Code - NCESS',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { font-family: 'DM Sans', Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
              .content { background: #f9fafb; padding: 30px 20px; border-radius: 0 0 8px 8px; }
              .code-box { background: white; border: 2px solid #2563eb; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0; }
              .code-display { font-size: 32px; font-weight: bold; color: #2563eb; letter-spacing: 4px; font-family: monospace; }
              .footer { font-size: 12px; color: #6b7280; margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb; }
              .warning { background: #fef3c7; border: 1px solid #fcd34d; padding: 12px; border-radius: 6px; font-size: 12px; margin: 20px 0; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1 style="margin: 0;">NCESS Password Reset</h1>
                <p style="margin: 5px 0 0 0;">New Cabalan E-Service System</p>
              </div>
              <div class="content">
                <p>Hello,</p>
                <p>You requested to reset your password for your NCESS account. Use this code to proceed:</p>

                <div class="code-box">
                  <div class="code-display">${resetCode}</div>
                </div>

                <p style="text-align: center; color: #6b7280;">
                  This code is valid for <strong>15 minutes</strong>
                </p>

                <div class="warning">
                  <strong>Code expires in 15 minutes</strong><br>
                  If you didn't request this, please ignore this email. Your password will not change unless you enter this code.
                </div>

                <p><strong>Security tips:</strong></p>
                <ul>
                  <li>Never share this code with anyone</li>
                  <li>We will never ask for your code via email or phone</li>
                  <li>Use a strong password with letters, numbers, and symbols</li>
                </ul>

                <div class="footer">
                  <p>This is an automated message. Please do not reply to this email.</p>
                  <p>&copy; 2026 New Cabalan E-Service System. All rights reserved.</p>
                </div>
              </div>
            </div>
          </body>
        </html>
      `,
      text: `Password Reset Code\n\nYour password reset code is: ${resetCode}\n\nThis code is valid for 15 minutes.\n\nIf you didn't request this, please ignore this email.`,
    };

    const [response] = await withTimeout(
      sgMail.send(message),
      EMAIL_TIMEOUT_MS,
      `SendGrid request timed out after ${EMAIL_TIMEOUT_MS}ms`
    );

    console.log(`[EmailService] Password reset code sent to ${userEmail}`);
    console.log(`[EmailService] SendGrid status: ${response?.statusCode || 'unknown'}`);
    console.log(`[EmailService] SendGrid message ID: ${response?.headers?.['x-message-id'] || 'none'}`);

    return { ok: true, info: response };
  } catch (error) {
    const errorMessage = getSendGridErrorMessage(error);
    console.error(`[EmailService] Error sending email to ${userEmail}:`, errorMessage);
    return { ok: false, error: errorMessage };
  }
};

// Verify email service configuration
export const verifyEmailService = async () => {
  if (!isEmailConfigured) {
    console.warn('[EmailService] SendGrid is not configured');
    return false;
  }

  console.log('[EmailService] SendGrid configured and ready to send emails');
  return true;
};
