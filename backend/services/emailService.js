import nodemailer from 'nodemailer';

// Initialize transporter based on environment
let transporter;

export const initializeEmailService = () => {
  if (process.env.EMAIL_SERVICE === 'gmail') {
    // For Gmail with App Password
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_EMAIL,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });
  } else if (process.env.SMTP_HOST) {
    // For generic SMTP (Outlook, custom servers, etc.)
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true', // true for 465, false for 587
      auth: {
        user: process.env.SMTP_EMAIL,
        pass: process.env.SMTP_PASSWORD,
      },
    });
  } else {
    console.warn('[EmailService] Warning: Email service not configured. Password reset emails will not be sent.');
    console.warn('[EmailService] Add EMAIL_SERVICE=gmail and GMAIL_EMAIL/GMAIL_APP_PASSWORD to .env');
    console.warn('[EmailService] Or add SMTP_HOST, SMTP_PORT, SMTP_EMAIL, SMTP_PASSWORD to .env');
    transporter = null;
  }
};

// Send password reset email with 6-digit code
export const sendPasswordResetEmail = async (userEmail, resetCode) => {
  if (!transporter) {
    console.warn(`[EmailService] Email not sent to ${userEmail} - service not configured`);
    return false;
  }

  try {
    const mailOptions = {
      from: process.env.GMAIL_EMAIL || process.env.SMTP_EMAIL,
      to: userEmail,
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
                  <strong>⏱️ Code expires in 15 minutes</strong><br>
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

    const info = await transporter.sendMail(mailOptions);
    console.log(`[EmailService] ✓ Password reset code sent to ${userEmail}`);
    console.log(`[EmailService] Message ID: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error(`[EmailService] Error sending email to ${userEmail}:`, error.message);
    return false;
  }
};

// Verify email service connectivity
export const verifyEmailService = async () => {
  if (!transporter) {
    console.warn('[EmailService] Email service not configured');
    return false;
  }

  try {
    await transporter.verify();
    console.log('[EmailService] ✓ Connected and ready to send emails');
    return true;
  } catch (error) {
    console.error('[EmailService] ✗ Failed to verify:', error.message);
    return false;
  }
};
