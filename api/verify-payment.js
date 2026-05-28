const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

// ── Cookie helpers ─────────────────────────────────────────────────────────────
function getCookieSecret() {
  return process.env.COOKIE_SECRET || process.env.RAZORPAY_KEY_SECRET;
}

function createSessionToken(orderId) {
  return crypto
    .createHmac('sha256', getCookieSecret())
    .update(String(orderId))
    .digest('hex');
}

function buildCookieHeader(orderId, token) {
  // Use Secure flag only on HTTPS (always true on Vercel)
  const isSecure =
    process.env.VERCEL_ENV === 'production' || process.env.VERCEL_ENV === 'preview';
  return [
    `cs_${orderId}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=604800',          // 7 days
    ...(isSecure ? ['Secure'] : []),
  ].join('; ');
}

// ─────────────────────────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      productId,
      customerName,
      customerEmail,
      affiliateId,   // optional — from URL ?ref=
      couponId,      // optional — validated coupon DB id
    } = req.body;

    // ── Required field checks ──────────────────────────────────────
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing Razorpay payment fields' });
    }
    if (!productId || !customerName || !customerEmail) {
      return res.status(400).json({ error: 'Missing customer or product fields' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(customerEmail)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    // ── Verify Razorpay signature ──────────────────────────────────
    const sigPayload = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(sigPayload)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ error: 'Payment verification failed: invalid signature' });
    }

    // ── Supabase (service role — bypasses RLS) ─────────────────────
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // ── Idempotency — prevent duplicate orders ─────────────────────
    const { data: existing } = await supabase
      .from('Orders')
      .select('id, Order_number')
      .eq('Razorpay_payment_id', razorpay_payment_id)
      .maybeSingle();

    if (existing) {
      const token = createSessionToken(existing.id);
      res.setHeader('Set-Cookie', buildCookieHeader(existing.id, token));
      return res.status(200).json({
        success: true,
        orderNumber: existing.Order_number,
        orderId: existing.id,
      });
    }

    // ── Validate affiliate (if provided) ──────────────────────────
    let validatedAffiliateId = null;
    if (affiliateId) {
      const affId = parseInt(affiliateId, 10);
      if (!isNaN(affId) && affId > 0) {
        const { data: aff } = await supabase
          .from('affiliates')
          .select('id')
          .eq('id', affId)
          .maybeSingle();
        if (aff) validatedAffiliateId = affId;
      }
    }

    // ── Validate coupon (if provided) ─────────────────────────────
    let validatedCouponId = null;
    if (couponId) {
      const cpnId = parseInt(couponId, 10);
      if (!isNaN(cpnId) && cpnId > 0) {
        const { data: cpn } = await supabase
          .from('coupons')
          .select('id, affiliate_id')
          .eq('id', cpnId)
          .maybeSingle();
        if (cpn) {
          validatedCouponId = cpnId;
          // Coupon's affiliated partner takes precedence over URL ref
          if (cpn.affiliate_id) validatedAffiliateId = cpn.affiliate_id;
        }
      }
    }

    // ── Create order ───────────────────────────────────────────────
    const orderNumber = 'CS-' + Date.now().toString(36).toUpperCase();

    const insertPayload = {
      Order_number:          orderNumber,
      Product:               productId,
      Customer_name:         customerName.trim(),
      Customer_email:        customerEmail.trim().toLowerCase(),
      Razorpay_payment_id:   razorpay_payment_id,
      Is_paid:               true,
      Email_delivered:       false,
    };
    if (validatedCouponId)   insertPayload.coupon_used   = validatedCouponId;
    if (validatedAffiliateId) insertPayload.affiliate_id = validatedAffiliateId;

    const { data, error } = await supabase
      .from('Orders')
      .insert(insertPayload)
      .select('id, Order_number')
      .single();

    if (error) {
      console.error('Supabase insert error:', error);
      throw new Error(error.message);
    }

    // ── Queue delivery email ───────────────────────────────────────
    const { error: emailError } = await supabase
      .from('automation_email')
      .insert({
        order_id:        data.id,
        is_sent:         false,
        email_type:      'delivery',
        number_of_resend: 0,
      });

    if (emailError) {
      console.error('Email automation insert error:', emailError);
      // Non-critical — order already created
    }

    // ── Set secure session cookie ──────────────────────────────────
    const token = createSessionToken(data.id);
    res.setHeader('Set-Cookie', buildCookieHeader(data.id, token));

    return res.status(200).json({
      success:     true,
      orderNumber: data.Order_number,
      orderId:     data.id,
    });
  } catch (err) {
    console.error('verify-payment error:', err);
    return res.status(500).json({ error: err.message || 'Verification failed' });
  }
};
