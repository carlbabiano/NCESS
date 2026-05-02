# Email Configuration Guide for Password Reset

The forgot password functionality now sends actual emails to users' email addresses. Follow the instructions below to set it up.

## Quick Setup (Gmail)

### Step 1: Create a Gmail App Password
1. Go to https://myaccount.google.com/apppasswords
2. Sign in with your Gmail account (use 2-factor authentication if required)
3. Select "Mail" and "Windows Computer" (or your device)
4. Google will generate a 16-character app password
5. Copy the password (format: `xxxx xxxx xxxx xxxx`)

### Step 2: Update .env
In `backend/.env`, uncomment and update the Gmail section:
```
EMAIL_SERVICE=gmail
GMAIL_EMAIL=your-email@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
FRONTEND_URL=http://localhost:5173
```

### Step 3: Restart Backend
```bash
npm start
# or
npm run dev
```

You should see in the console:
```
[EmailService] ✓ Connected and ready to send emails
```

## Alternative: Outlook/Hotmail

If using Outlook instead of Gmail:

```
SMTP_HOST=smtp-mail.outlook.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_EMAIL=your-email@outlook.com
SMTP_PASSWORD=your-password
FRONTEND_URL=http://localhost:5173
```

## Alternative: Other Email Providers

For other providers (SendGrid, Mailgun, custom SMTP), configure:
```
SMTP_HOST=your-smtp-host
SMTP_PORT=587
SMTP_SECURE=false
SMTP_EMAIL=your-email@example.com
SMTP_PASSWORD=your-password
FRONTEND_URL=http://localhost:5173
```

Common SMTP servers:
- **Gmail**: `smtp.gmail.com` (port 587, use app password)
- **Outlook**: `smtp-mail.outlook.com` (port 587)
- **Yahoo**: `smtp.mail.yahoo.com` (port 587)
- **SendGrid**: `smtp.sendgrid.net` (port 587)

## Testing the Flow

1. **Frontend**: Go to user login page
2. Click "Forgot password?"
3. Enter an email address
4. Check the email inbox (or spam folder)
5. Click the reset link in the email
6. Enter new password and submit
7. Login with new password

## Troubleshooting

### "Email service not configured" warning
- Check that `EMAIL_SERVICE=gmail` OR SMTP settings are in `.env`
- Ensure `GMAIL_EMAIL` and `GMAIL_APP_PASSWORD` are set correctly
- Restart the backend server

### Gmail app password not working
- Make sure 2-Factor Authentication is enabled on your Gmail account
- Don't use your regular Gmail password, use the 16-character app password
- The password format should be: `xxxx xxxx xxxx xxxx` (with spaces)

### Reset link not in email
- Check email spam/junk folder
- Verify email was sent by checking server console logs
- Make sure `FRONTEND_URL` is set to your frontend address

### No email received
- Check backend console for error messages with `[EmailService]` prefix
- Verify email credentials are correct in `.env`
- Some email providers may block password reset emails - check provider settings
- Try a different email provider to test

## Production Deployment

For production:
1. Use a dedicated email service (SendGrid, Mailgun, AWS SES)
2. Never commit `.env` with real credentials to git
3. Use environment variables in your hosting platform
4. Set `FRONTEND_URL` to your production URL (e.g., `https://yourdomain.com`)
5. Consider rate limiting the forgot password endpoint

## Files Modified

- `backend/services/emailService.js` - New email service
- `backend/server.js` - Added email service initialization
- `backend/routes/userRoutes.js` - Updated forgot-password endpoint
- `backend/.env` - Added email configuration
- `frontend/src/pages/userside/userlogin.jsx` - Added forgot password modal
- `frontend/src/pages/userside/userresetpassword.jsx` - New reset password page
- `frontend/src/App.jsx` - Added reset password route
