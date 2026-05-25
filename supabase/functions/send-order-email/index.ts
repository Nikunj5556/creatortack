// supabase/functions/send-order-email/index.ts
// Triggered by a Supabase Database Webhook on INSERT or UPDATE to automation_email.
// Fetches the related order, sends a Brevo email, then marks is_sent = true.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // ── Security: verify webhook secret ──────────────────────────────
  // This secret is set when creating the webhook in Supabase Dashboard
  // and stored as a Supabase Edge Function secret (WEBHOOK_SECRET).
  const webhookSecret = Deno.env.get('WEBHOOK_SECRET')
  if (webhookSecret) {
    const incomingSecret = req.headers.get('x-webhook-secret')
    if (incomingSecret !== webhookSecret) {
      console.error('Invalid webhook secret')
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }

  try {
    // ── Parse webhook payload ─────────────────────────────────────
    // Supabase Database Webhooks send:
    // { type: 'INSERT'|'UPDATE', table, schema, record, old_record }
    const payload = await req.json()
    const record = payload.record

    console.log('Webhook received:', JSON.stringify({ type: payload.type, record_id: record?.id, is_sent: record?.is_sent }))

    // Only act when is_sent is false (new request or resend request)
    if (!record || record.is_sent === true) {
      return new Response(JSON.stringify({ message: 'No action needed — already sent or no record' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const emailJobId = record.id
    const orderId    = record.order_id

    if (!orderId) {
      return new Response(JSON.stringify({ error: 'Missing order_id in automation_email record' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Supabase client (service role — bypasses RLS) ─────────────
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // ── Fetch order + product ─────────────────────────────────────
    const { data: order, error: orderError } = await supabase
      .from('Orders')
      .select(`
        id,
        Order_number,
        Customer_name,
        Customer_email,
        created_at,
        Products:Product (
          Product_name,
          Product_price,
          Product_download_link
        )
      `)
      .eq('id', orderId)
      .eq('Is_paid', true)
      .single()

    if (orderError || !order) {
      console.error('Order fetch error:', orderError)
      return new Response(JSON.stringify({ error: 'Order not found or not paid' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Build email content ───────────────────────────────────────
    const customerName  = order.Customer_name  || 'Customer'
    const customerEmail = order.Customer_email
    const orderNumber   = order.Order_number   || `ORD-${order.id}`
    const product       = (order as any).Products || {}
    const productName   = product.Product_name         || 'Digital Product'
    const productPrice  = product.Product_price        || 0
    const downloadLink  = product.Product_download_link || '#'

    const formattedDate = new Date(order.created_at).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'long', year: 'numeric',
    })

    const priceFormatted = '₹' + Number(productPrice).toLocaleString('en-IN')

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#f6f5f1;font-family:Arial,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f1;padding:40px 20px;">
<tr>
<td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#ffffff;border-radius:20px;overflow:hidden;">

<!-- Header -->
<tr>
<td style="padding:50px 40px 40px;text-align:center;background:linear-gradient(180deg,#faf8f3,#ffffff);">
  <div style="width:74px;height:74px;margin:0 auto 24px;border-radius:50%;background:#e8f5ef;text-align:center;line-height:74px;font-size:34px;">✓</div>
  <h1 style="margin:0 0 12px;font-size:38px;font-weight:600;color:#1b1b1b;">Thank You</h1>
  <p style="margin:0;color:#666666;font-size:16px;line-height:1.7;">Your payment was successful and your digital product is ready.</p>
</td>
</tr>

<!-- Order Info -->
<tr>
<td style="padding:0 40px 10px;">
<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #ece8df;border-radius:14px;">
  <tr>
    <td style="padding:18px 22px;border-bottom:1px solid #f1eee8;color:#888;font-size:13px;">ORDER NUMBER</td>
    <td align="right" style="padding:18px 22px;border-bottom:1px solid #f1eee8;color:#111;font-size:14px;font-weight:600;">${orderNumber}</td>
  </tr>
  <tr>
    <td style="padding:18px 22px;border-bottom:1px solid #f1eee8;color:#888;font-size:13px;">PRODUCT</td>
    <td align="right" style="padding:18px 22px;border-bottom:1px solid #f1eee8;color:#111;font-size:14px;font-weight:600;">${productName}</td>
  </tr>
  <tr>
    <td style="padding:18px 22px;border-bottom:1px solid #f1eee8;color:#888;font-size:13px;">AMOUNT</td>
    <td align="right" style="padding:18px 22px;border-bottom:1px solid #f1eee8;color:#0d7a5f;font-size:18px;font-weight:700;">${priceFormatted}</td>
  </tr>
  <tr>
    <td style="padding:18px 22px;color:#888;font-size:13px;">DATE</td>
    <td align="right" style="padding:18px 22px;color:#111;font-size:14px;font-weight:600;">${formattedDate}</td>
  </tr>
</table>
</td>
</tr>

<!-- Download -->
<tr>
<td style="padding:36px 40px 10px;text-align:center;">
  <a href="${downloadLink}" style="display:inline-block;background:#111111;color:#ffffff;text-decoration:none;padding:18px 34px;border-radius:12px;font-size:16px;font-weight:600;">
    Download Product
  </a>
</td>
</tr>

<!-- Info -->
<tr>
<td style="padding:26px 40px 20px;">
  <div style="background:#faf8f3;border-radius:14px;padding:18px 20px;color:#666;font-size:14px;line-height:1.7;">
    You can access your product anytime using the download button above.<br/><br/>
    If you face any issue accessing your purchase, simply reply to this email.
  </div>
</td>
</tr>

<!-- Footer -->
<tr>
<td style="padding:30px 40px 40px;text-align:center;">
  <p style="margin:0 0 8px;font-size:15px;color:#111;font-weight:600;">Creatorstack</p>
  <p style="margin:0;font-size:13px;color:#999;">Digital Product Delivery System</p>
</td>
</tr>

</table>
</td>
</tr>
</table>

</body>
</html>`

    // ── Send via Brevo ────────────────────────────────────────────
    const brevoKey = Deno.env.get('BREVO_API_KEY') ?? ''
    if (!brevoKey) {
      throw new Error('BREVO_API_KEY secret is not set on this Edge Function')
    }

    const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': brevoKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: {
          name: 'Creatorstack',
          email: 'hello@breakfastclub.co.in',
        },
        to: [{ email: customerEmail, name: customerName }],
        subject: `Your ${productName} is ready`,
        htmlContent,
      }),
    })

    if (!brevoRes.ok) {
      const errText = await brevoRes.text()
      console.error('Brevo API error:', errText)
      throw new Error(`Brevo returned ${brevoRes.status}: ${errText}`)
    }

    console.log(`Email sent to ${customerEmail} for order ${orderNumber}`)

    // ── Mark as sent in automation_email ──────────────────────────
    const { error: updateEmailErr } = await supabase
      .from('automation_email')
      .update({ is_sent: true })
      .eq('id', emailJobId)

    if (updateEmailErr) {
      console.error('Failed to mark email as sent:', updateEmailErr)
      // Non-fatal — email was already sent
    }

    // ── Mark Email_delivered on Order ─────────────────────────────
    const { error: updateOrderErr } = await supabase
      .from('Orders')
      .update({ Email_delivered: true })
      .eq('id', order.id)

    if (updateOrderErr) {
      console.error('Failed to update Email_delivered on order:', updateOrderErr)
      // Non-fatal
    }

    return new Response(
      JSON.stringify({ success: true, emailSentTo: customerEmail, orderNumber }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err: any) {
    console.error('Edge function error:', err)
    return new Response(
      JSON.stringify({ error: err.message || 'Unexpected error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
