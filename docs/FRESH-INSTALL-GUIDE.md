# 🚀 Octavius Fresh Installation Guide

## ✅ Zero-Config Setup

Octavius is designed to work **out of the box** with zero manual database setup!

### **Step 1: Install & Run**

```bash
git clone https://github.com/wabecerra/octavius.git
cd octavius
npm install
npm run dev
```

That's it! No database initialization, no manual setup.

### **Step 2: Create Your First Account**

Visit `http://localhost:3000/register` or call the API:

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"YourPassword123!"}'
```

**The database tables will be auto-created on this first request!** ✅

### **Step 3: Login & Approve Device**

```bash
# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"YourPassword123!"}'

# You'll receive an approval code
# Approve your device:
octavius approve-device <CODE>
```

---

## 🔧 **What Happens Automatically:**

### **First Auth API Call:**
1. ✅ Database file created: `.data/memory.sqlite`
2. ✅ Auth tables created:
   - `users` - User accounts
   - `devices` - Device fingerprints
   - `sessions` - JWT sessions
   - `device_approvals` - MFA codes
   - `passkeys` - WebAuthn credentials (optional)
3. ✅ Ready for production!

### **Security Defaults:**
- Password hashing: scrypt (N=16384, r=8, p=1)
- JWT expiry: 30 days
- Device MFA: Required for new devices
- Approval codes: 6-digit, 10-minute expiry

---

## 📦 **For Production Deployment:**

### **Environment Variables (Optional):**

Create `.env.local`:

```bash
# Session secret (auto-generated if not set)
OCTAVIUS_SESSION_SECRET=your-super-secret-key-min-32-chars

# Octavius URL (for CLI)
OCTAVIUS_API_URL=https://your-domain.com
```

### **Cloudflare Tunnel (Recommended):**

```bash
# Install cloudflared
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb

# Create tunnel
cloudflared tunnel create octavius

# Configure (replace with your tunnel ID)
cat > ~/.cloudflared/config.yml <<EOF
tunnel: YOUR_TUNNEL_ID
credentials-file: /home/user/.cloudflared/credentials.json

ingress:
  - hostname: octavius.yourdomain.com
    service: http://localhost:3000
  - service: http_status:404
EOF

# Run
cloudflared tunnel run octavius
```

---

## 🧪 **Testing Fresh Install:**

```bash
# Simulate fresh install
rm .data/memory.sqlite

# Make first auth call (tables will be auto-created)
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!"}'

# Verify tables created
sqlite3 .data/memory.sqlite ".tables" | grep -E "user|device|session"
# Output should show: users devices sessions device_approvals
```

---

## ❓ **Troubleshooting:**

### **"no such table: users" error:**
- ✅ **Fixed!** Tables now auto-create on first auth call
- If you still see this, check server logs for schema path issues

### **"memory limit exceeded" on registration:**
- ✅ **Fixed!** Scrypt params reduced for server compatibility
- Uses N=16384 instead of N=32768

### **Database file not created:**
- Check `.data/` directory exists
- Check write permissions
- Check server logs for errors

---

## 📝 **Database Schema Location:**

The auth schema is at: `src/lib/auth/database-schema.sql`

This file is automatically loaded on first use. No manual execution needed!

---

*Octavius is production-ready with zero-config auth! 🎉*
