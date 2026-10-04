# Email Configuration Guide for Password Reset

The resident forgot password flow sends a 6-digit reset code through SendGrid.

## Quick Setup (SendGrid)

### Step 1: Create a SendGrid API key

1. Sign in to SendGrid.
2. Go to Settings > API Keys.
3. Create an API key with Mail Send permission.
4. Copy the API key. SendGrid only shows it once.

### Step 2: Verify a sender

In SendGrid, verify either a single sender email address or a domain. The `SENDGRID_FROM_EMAIL` value must be a verified sender.

### Step 3: Update .env

In `backend/.env`, add:

```bash
SENDGRID_API_KEY=SG.your-sendgrid-api-key
SENDGRID_FROM_EMAIL=verified-sender@example.com
SENDGRID_FROM_NAME=NCESS
EMAIL_TIMEOUT_MS=10000
FRONTEND_URL=http://localhost:5173
```

`SENDGRID_FROM_NAME` is optional. If omitted, emails are sent as `NCESS`. `EMAIL_TIMEOUT_MS` is optional and defaults to `10000`.

### Step 4: Restart Backend

```bash
npm start
# or
npm run dev
```

You should see:

```text
[EmailService] SendGrid initialized
[EmailService] SendGrid configured and ready to send emails
```

## Testing the Flow

1. Open the user login page.
2. Click "Forgot password?"
3. Enter a resident email address.
4. Check the email inbox or spam folder.
5. Enter the reset code.
6. Set the new password.
7. Log in with the new password.

## Troubleshooting

### "Email service is not configured"

- Check that `SENDGRID_API_KEY` is set.
- Check that `SENDGRID_FROM_EMAIL` is set.
- Restart the backend after changing `.env`.

### SendGrid rejects the message

- Make sure `SENDGRID_FROM_EMAIL` is verified in SendGrid.
- Make sure the API key has Mail Send permission.
- Check the backend console for `[EmailService]` errors returned by SendGrid.

### No email received

- Check spam or junk mail.
- Verify the resident email address is correct.
- Check SendGrid Activity for delivery, bounce, or block events.

## Production Deployment

1. Store SendGrid credentials in the hosting platform's environment variables.
2. Never commit `.env` with real credentials to git.
3. Use a verified domain sender for better deliverability.
4. Set `FRONTEND_URL` to your production URL, for example `https://yourdomain.com`.
5. Consider rate limiting the forgot password endpoint.

## Files Modified

- `backend/services/emailService.js` - SendGrid email service
- `backend/package.json` - SendGrid dependency
- `backend/package-lock.json` - dependency lockfile
