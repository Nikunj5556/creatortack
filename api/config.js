module.exports = (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Only expose PUBLIC keys — never the service role key or razorpay secret
  const config = {
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
    razorpayKeyId: process.env.RAZORPAY_KEY_ID || '',
  };

  if (!config.supabaseUrl || !config.supabaseAnonKey || !config.razorpayKeyId) {
    return res.status(500).json({ error: 'Server misconfiguration: missing environment variables.' });
  }

  res.status(200).json(config);
};
