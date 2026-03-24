# Octavius Authentication System

## 🚀 Auto-Initialization

The auth database tables are **automatically created** on the first API call to:
- `/api/auth/register` - Create account
- `/api/auth/login` - Login
- `/api/auth/device/approve` - Approve device

**No manual setup required!** ✅

## 📦 Database Schema

Tables created automatically in `/.data/memory.sqlite`:
- `users` - User accounts
- `passkeys` - WebAuthn credentials
- `devices` - Device fingerprints & trust status
- `device_approvals` - TOTP approval codes
- `sessions` - JWT sessions

## 🔒 Security Features

- Password hashing: scrypt (N=16384, r=8, p=1)
- JWT sessions: 30-day expiry
- Device MFA: Required for new devices
- Approval codes: 6-digit, 10-minute expiry

## 🛠️ For Production Deployments

**IMPORTANT:** Each new Octavius installation will auto-create these tables. No action needed!

The schema file is at: `src/lib/auth/database-schema.sql`

If you need to manually reset auth:
```bash
# Delete the database (WARNING: loses all users/sessions!)
rm .data/memory.sqlite

# Restart the app - tables will be recreated on first auth call
npm run dev
```

## 🧪 Testing

```bash
# Create a test account
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!"}'

# Login (will require device approval)
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!"}'
```

---

*Auto-initialization ensures zero-config setup for all users!*
