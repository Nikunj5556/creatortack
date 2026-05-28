const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { couponCode, productId } = req.body;

  if (!couponCode || !productId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Fetch actual product price from DB
    const { data: product, error: productError } = await supabase
      .from('Products')
      .select('Product_price')
      .eq('id', productId)
      .single();

    if (productError || !product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Fetch coupon (case-insensitive match)
    const { data: coupon, error: couponError } = await supabase
      .from('coupons')
      .select('id, coupon_code, discount_type, discount, validity_type, validity, affiliate_id')
      .eq('coupon_code', couponCode.toUpperCase().trim())
      .single();

    if (couponError || !coupon) {
      return res.status(404).json({ error: 'Invalid coupon code' });
    }

    // Validate date-based expiry
    if (coupon.validity_type === 'date' && coupon.validity) {
      // validity stored as Unix timestamp (seconds)
      const expiryDate = new Date(Number(coupon.validity) * 1000);
      if (expiryDate < new Date()) {
        return res.status(400).json({ error: 'This coupon has expired' });
      }
    }

    const originalPrice = parseFloat(product.Product_price);
    let discountAmount = 0;

    if (coupon.discount_type === 'percentage') {
      discountAmount = Math.round((originalPrice * parseFloat(coupon.discount)) / 100);
    } else if (coupon.discount_type === 'fixed') {
      discountAmount = Math.min(Math.round(parseFloat(coupon.discount)), originalPrice - 1);
    }

    discountAmount = Math.max(0, discountAmount);
    const finalPrice = Math.max(1, Math.round(originalPrice - discountAmount));

    return res.status(200).json({
      valid: true,
      couponId: coupon.id,
      couponCode: coupon.coupon_code,
      affiliateId: coupon.affiliate_id || null,
      discountType: coupon.discount_type,
      discountValue: parseFloat(coupon.discount),
      discountAmount,
      originalPrice: Math.round(originalPrice),
      finalPrice,
    });
  } catch (err) {
    console.error('validate-coupon error:', err);
    return res.status(500).json({ error: err.message || 'Validation failed' });
  }
};
