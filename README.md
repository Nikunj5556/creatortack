# Creatorstack — Digital Product Store

Production-ready storefront for selling digital products via Razorpay + Supabase.

---

## 🚀 Deploy to Vercel in 3 Steps

### 1. Supabase — Set up Row Level Security

Run this in your Supabase SQL editor:

```sql
-- Allow public (anonymous) reads on Products
ALTER TABLE public."Products" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read products"
  ON public."Products"
  FOR SELECT USING (true);

-- Allow inserts on Orders via service role only (done server-side)
ALTER TABLE public."Orders" ENABLE ROW LEVEL SECURITY;

-- No public policies for Orders — only the service role key (used in api/verify-payment.js) can insert
```

### 2. Environment Variables

In Vercel → Project → Settings → Environment Variables, add:

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL (e.g. `https://xxxx.supabase.co`) |
| `SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-only, never exposed to client) |
| `RAZORPAY_KEY_ID` | Razorpay key ID (starts with `rzp_live_` or `rzp_test_`) |
| `RAZORPAY_KEY_SECRET` | Razorpay key secret (server-only, never exposed to client) |

### 3. Deploy

```bash
# Install Vercel CLI (if not installed)
npm i -g vercel

# Deploy
vercel --prod
```

Or connect your GitHub repo to Vercel for automatic deployments.

---

## 📦 Adding Products

Insert a row into the `Products` table:

| Column | Example |
|---|---|
| `Product_name` | "Ultimate Notion Dashboard" |
| `Product_description` | "A complete productivity system…" |
| `Product_image_url` | `https://cdn.example.com/img1.jpg,https://cdn.example.com/img2.jpg` |
| `Product_price` | `499` (in INR, no decimals needed) |
| `Product_download_link` | `https://drive.google.com/…` |

The `id` column is auto-generated as a UUID.

### Product URL format

```
https://yourstore.com/{product-uuid}
```

Example: `https://creatorstack.com/550e8400-e29b-41d4-a716-446655440000`

---

## 🔒 Security Notes

- **`RAZORPAY_KEY_SECRET`** is only used in `api/verify-payment.js` (server-side). Never in HTML.
- **`SUPABASE_SERVICE_ROLE_KEY`** is only used in `api/verify-payment.js` (server-side). Never in HTML.
- Payment signatures are cryptographically verified before any order is written to the database.
- Duplicate payment protection: same `razorpay_payment_id` cannot be inserted twice.
- Email validation is performed server-side before database writes.

---

## 📁 File Structure

```
/
├── index.html              ← SPA (product + checkout + thank you)
├── vercel.json             ← Routing: all paths → index.html, except /api/*
├── package.json            ← Dependencies for serverless functions
├── api/
│   ├── config.js           ← Returns public keys to client (safe)
│   ├── create-order.js     ← Creates Razorpay order (server-side)
│   └── verify-payment.js   ← Verifies signature + writes to Supabase (server-side)
└── README.md
```
