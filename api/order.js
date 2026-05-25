const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const rawId = req.query.id;
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

    // Fetch order joined with product — only expose what the thank-you page needs
    const { data: order, error } = await supabase
      .from('Orders')
      .select(`
        id,
        Order_number,
        Customer_name,
        Customer_email,
        Is_paid,
        created_at,
        Products:Product (
          Product_name,
          Product_price,
          Product_download_link
        )
      `)
      .eq('id', orderId)
      .eq('Is_paid', true)
      .single();

    if (error || !order) {
      return res.status(404).json({ error: 'Order not found or payment not confirmed' });
    }

    // Fetch email automation record for resend count
    const { data: emailRecord } = await supabase
      .from('automation_email')
      .select('id, number_of_resend, is_sent')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return res.status(200).json({
      id: order.id,
      orderNumber: order.Order_number,
      customerName: order.Customer_name,
      customerEmail: order.Customer_email,
      isPaid: order.Is_paid,
      createdAt: order.created_at,
      product: {
        name: order.Products?.Product_name || 'Digital Product',
        price: order.Products?.Product_price,
        downloadLink: order.Products?.Product_download_link,
      },
      email: {
        resendCount: emailRecord?.number_of_resend ?? 0,
        isSent: emailRecord?.is_sent ?? false,
      },
    });
  } catch (err) {
    console.error('order fetch error:', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch order' });
  }
};
