# Gmail Verification Setup

RoyalMind can send real registration verification codes through Gmail.

## 1. Turn on 2-Step Verification

On the Gmail account you want to send from:
- Open your Google Account security settings
- Enable 2-Step Verification

## 2. Create an App Password

After 2-Step Verification is enabled:
- Open Google Account
- Go to `Security`
- Open `App passwords`
- Create a new app password for Mail

Google gives you a 16-character password. Use that value for `GMAIL_APP_PASSWORD`.

## 3. Add these variables to `server/.env`

```env
GMAIL_USER=yourgmail@gmail.com
GMAIL_APP_PASSWORD=your_16_character_app_password
MAIL_FROM="RoyalMind <yourgmail@gmail.com>"
VERIFICATION_SECRET=replace_with_a_different_secure_secret
```

`MAIL_FROM` can be the same Gmail address.

## 4. Restart the backend

From the project root:

```powershell
.\scripts\start-all.bat
```

or inside the server folder:

```powershell
npm.cmd start
```

## 5. Test the flow

1. Open the registration page
2. Register with a fresh email and a fresh Nepal phone number
3. Check the Gmail inbox of the registered email address
4. Enter the 6-digit verification code

## Notes

- Phone numbers are unique in the app, but phone OTP/SMS is not used.
- If Gmail is not configured, the app falls back to development-mode verification codes.
