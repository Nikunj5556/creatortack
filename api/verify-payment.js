const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

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
    } = req.body;

    // Validate required fields
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing Razorpay payment fields' });
    }
    if (!productId || !customerName || !customerEmail) {
      return res.status(400).json({ error: 'Missing customer or product fields' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(customerEmail)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    // ── Verify Razorpay signature ──────────────────────────────────────────────
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ error: 'Payment verification failed: invalid signature' });
    }

    // ── Write to Supabase with service role key (bypasses RLS) ────────────────
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Prevent duplicate entries for same payment
    const { data: existing } = await supabase
      .from('Orders')
      .select('id, Order_number')
      .eq('Razorpay_payment_id', razorpay_payment_id)
      .maybeSingle();

    if (existing) {
      // Already recorded — idempotent, return success
      return res.status(200).json({
        success: true,
        orderNumber: existing.Order_number,
        orderId: existing.id,
      });
    }

    const orderNumber = 'CS-' + Date.now().toString(36).toUpperCase();

    const { data, error } = await supabase
      .from('Orders')
      .insert({
        Order_number: orderNumber,
        Product: productId,
        Customer_name: customerName.trim(),
        Customer_email: customerEmail.trim().toLowerCase(),
        Razorpay_payment_id: razorpay_payment_id,
        Is_paid: true,
        Email_delivered: false,
      })
      .select('id, Order_number')
      .single();

    if (error) {
      console.error('Supabase insert error:', error);
      throw new Error(error.message);
    }

    // Insert email automation request
    const { error: emailError } = await supabase
      .from('automation_email')
      .insert({
        order_id: data.id,
        is_sent: false,
        email_type: 'delivery',
        number_of_resend: 0,
      });

    if (emailError) {
      console.error('Email automation insert error:', emailError);
      // Continue - this is not critical
    }

    return res.status(200).json({
      success: true,
      orderNumber: data.Order_number,
      orderId: data.id,
    });
  } catch (err) {
    console.error('verify-payment error:', err);
    return res.status(500).json({ error: err.message || 'Verification failed' });
  }
};
