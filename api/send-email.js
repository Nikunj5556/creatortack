const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {

  try {

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Fetch pending emails
    const { data: pendingEmails, error } = await supabase
      .from('automation_email')
      .select(`
        id,
        order_id,
        email_type,
        Orders (
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
        )
      `)
      .eq('is_sent', false)
      .limit(10);

    if (error) {
      throw new Error(error.message);
    }

    if (!pendingEmails?.length) {
      return res.status(200).json({
        success: true,
        message: 'No pending emails'
      });
    }

    for (const job of pendingEmails) {

      try {

        const order = job.Orders;

        if (!order) continue;

        const customerName =
          order.Customer_name || 'Customer';

        const customerEmail =
          order.Customer_email;

        const orderNumber =
          order.Order_number;

        const product =
          order.Products || {};

        const productName =
          product.Product_name || 'Digital Product';

        const productPrice =
          product.Product_price || 0;

        const downloadLink =
          product.Product_download_link || '#';

        const formattedDate =
          new Date(order.created_at)
            .toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'long',
              year: 'numeric'
            });

        // Send email using Brevo
        const brevoResponse = await fetch(
          'https://api.brevo.com/v3/smtp/email',
          {
            method: 'POST',
            headers: {
              'accept': 'application/json',
              'api-key': process.env.BREVO_API_KEY,
              'content-type': 'application/json'
            },
            body: JSON.stringify({

              sender: {
                name: 'Creatorstack',
                email: 'hello@creatorstack.breakfastclub.co.in'
              },

              to: [
                {
                  email: customerEmail,
                  name: customerName
                }
              ],

              subject:
                `Your ${productName} is ready`,

              htmlContent: `

<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1.0" />
</head>

<body style="
  margin:0;
  padding:0;
  background:#f6f5f1;
  font-family:Arial,sans-serif;
">

<table width="100%" cellpadding="0" cellspacing="0" style="
  background:#f6f5f1;
  padding:40px 20px;
">

<tr>
<td align="center">

<table width="100%" cellpadding="0" cellspacing="0" style="
  max-width:620px;
  background:#ffffff;
  border-radius:20px;
  overflow:hidden;
">

<!-- Header -->
<tr>
<td style="
  padding:50px 40px 40px;
  text-align:center;
  background:linear-gradient(180deg,#faf8f3,#ffffff);
">

<div style="
  width:74px;
  height:74px;
  margin:0 auto 24px;
  border-radius:50%;
  background:#e8f5ef;
  text-align:center;
  line-height:74px;
  font-size:34px;
">
✓
</div>

<h1 style="
  margin:0 0 12px;
  font-size:38px;
  font-weight:600;
  color:#1b1b1b;
">
Thank You
</h1>

<p style="
  margin:0;
  color:#666666;
  font-size:16px;
  line-height:1.7;
">
Your payment was successful and your digital product is ready.
</p>

</td>
</tr>

<!-- Order Info -->
<tr>
<td style="padding:0 40px 10px;">

<table width="100%" cellpadding="0" cellspacing="0" style="
  border:1px solid #ece8df;
  border-radius:14px;
">

<tr>
<td style="
  padding:18px 22px;
  border-bottom:1px solid #f1eee8;
  color:#888;
  font-size:13px;
">
ORDER NUMBER
</td>

<td align="right" style="
  padding:18px 22px;
  border-bottom:1px solid #f1eee8;
  color:#111;
  font-size:14px;
  font-weight:600;
">
${orderNumber}
</td>
</tr>

<tr>
<td style="
  padding:18px 22px;
  border-bottom:1px solid #f1eee8;
  color:#888;
  font-size:13px;
">
PRODUCT
</td>

<td align="right" style="
  padding:18px 22px;
  border-bottom:1px solid #f1eee8;
  color:#111;
  font-size:14px;
  font-weight:600;
">
${productName}
</td>
</tr>

<tr>
<td style="
  padding:18px 22px;
  border-bottom:1px solid #f1eee8;
  color:#888;
  font-size:13px;
">
AMOUNT
</td>

<td align="right" style="
  padding:18px 22px;
  border-bottom:1px solid #f1eee8;
  color:#0d7a5f;
  font-size:18px;
  font-weight:700;
">
₹${productPrice}
</td>
</tr>

<tr>
<td style="
  padding:18px 22px;
  color:#888;
  font-size:13px;
">
DATE
</td>

<td align="right" style="
  padding:18px 22px;
  color:#111;
  font-size:14px;
  font-weight:600;
">
${formattedDate}
</td>
</tr>

</table>

</td>
</tr>

<!-- Download -->
<tr>
<td style="
  padding:36px 40px 10px;
  text-align:center;
">

<a
  href="${downloadLink}"
  style="
    display:inline-block;
    background:#111111;
    color:#ffffff;
    text-decoration:none;
    padding:18px 34px;
    border-radius:12px;
    font-size:16px;
    font-weight:600;
  "
>
Download Product
</a>

</td>
</tr>

<!-- Info -->
<tr>
<td style="
  padding:26px 40px 20px;
">

<div style="
  background:#faf8f3;
  border-radius:14px;
  padding:18px 20px;
  color:#666;
  font-size:14px;
  line-height:1.7;
">

You can access your product anytime using the download button above.

If you face any issue accessing your purchase, simply reply to this email.

</div>

</td>
</tr>

<!-- Footer -->
<tr>
<td style="
  padding:30px 40px 40px;
  text-align:center;
">

<p style="
  margin:0 0 8px;
  font-size:15px;
  color:#111;
  font-weight:600;
">
Creatorstack
</p>

<p style="
  margin:0;
  font-size:13px;
  color:#999;
">
Digital Product Delivery System
</p>

</td>
</tr>

</table>

</td>
</tr>

</table>

</body>
</html>

              `
            })
          }
        );

        if (!brevoResponse.ok) {

          const errorText =
            await brevoResponse.text();

          console.error(
            'Brevo API error:',
            errorText
          );

          continue;
        }

        // Mark email sent
        await supabase
          .from('automation_email')
          .update({
            is_sent: true
          })
          .eq('id', job.id);

        // Update order
        await supabase
          .from('Orders')
          .update({
            Email_delivered: true
          })
          .eq('id', order.id);

      } catch (err) {

        console.error(
          'Email send failed:',
          err.message
        );
      }
    }

    return res.status(200).json({
      success: true
    });

  } catch (err) {

    console.error(err);

    return res.status(500).json({
      error: err.message
    });
  }
};
