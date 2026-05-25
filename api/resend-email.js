const { createClient } = require('@supabase/supabase-js');

const MAX_RESENDS = 5;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const rawId = req.body?.orderId;
  const orderId = parseInt(rawId, 10);

  if (!rawId || isNaN(orderId) || orderId <= 0) {
    return res.status(400).json({ error: 'Invalid order ID' });
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Confirm the order exists and is paid (prevents abuse)
    const { data: order } = await supabase
      .from('Orders')
      .select('id')
      .eq('id', orderId)
      .eq('Is_paid', true)
      .maybeSingle();

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Fetch existing automation_email record
    const { data: existing } = await supabase
      .from('automation_email')
      .select('id, number_of_resend')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!existing) {
      // No record yet — create the initial one
      const { error } = await supabase
        .from('automation_email')
        .insert({
          order_id: orderId,
          is_sent: false,
          email_type: 'delivery',
          number_of_resend: 1,
        });

      if (error) throw new Error(error.message);

      return res.status(200).json({ success: true, resendCount: 1, remaining: MAX_RESENDS - 1 });
    }

    const currentCount = existing.number_of_resend ?? 0;

    if (currentCount >= MAX_RESENDS) {
      return res.status(429).json({
        error: 'Maximum resend limit reached',
        resendCount: currentCount,
        remaining: 0,
      });
    }

    // Increment resend count, mark unsent so the worker picks it up again
    const newCount = currentCount + 1;
    const { error } = await supabase
      .from('automation_email')
      .update({
        number_of_resend: newCount,
        is_sent: false,
      })
      .eq('id', existing.id);

    if (error) throw new Error(error.message);

    return res.status(200).json({
      success: true,
      resendCount: newCount,
      remaining: MAX_RESENDS - newCount,
    });
  } catch (err) {
    console.error('resend-email error:', err);
    return res.status(500).json({ error: err.message || 'Failed to process resend request' });
  }
};
