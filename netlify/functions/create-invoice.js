const https = require('https');

// ── OBTENIR TOKEN PAYPAL ──
function getPayPalToken() {
  return new Promise((resolve, reject) => {
    const credentials = Buffer.from(
      `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_SECRET}`
    ).toString('base64');

    const options = {
      hostname: 'api-m.paypal.com',
      path: '/v1/oauth2/token',
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const json = JSON.parse(data);
        resolve(json.access_token);
      });
    });
    req.on('error', reject);
    req.write('grant_type=client_credentials');
    req.end();
  });
}

// ── CRÉER FACTURE PAYPAL ──
function createPayPalInvoice(token, invoiceData) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      detail: {
        invoice_number: `PC-${Date.now()}`,
        invoice_date: new Date().toISOString().split('T')[0],
        currency_code: 'EUR',
        note: 'Merci pour votre confiance — ProConvoi',
        payment_term: { term_type: 'DUE_ON_RECEIPT' }
      },
      invoicer: {
        name: { given_name: 'Mickaël', surname: 'PLE' },
        email_address: 'mickaelple066@gmail.com',
        phones: [{ country_code: '33', national_number: '763082637', phone_type: 'MOBILE' }],
        website: 'https://proconvoi.netlify.app',
        tax_id: '53229346100044',
        logo_url: 'https://proconvoi.netlify.app/logo.png'
      },
      primary_recipients: [{
        billing_info: {
          name: { full_name: invoiceData.nom },
          email_address: invoiceData.email
        }
      }],
      items: [{
        name: invoiceData.description,
        description: `Convoyage ${invoiceData.depart} → ${invoiceData.arrivee}`,
        quantity: '1',
        unit_amount: { currency_code: 'EUR', value: invoiceData.montant },
        unit_of_measure: 'AMOUNT'
      }],
      amount: {
        breakdown: {
          item_total: { currency_code: 'EUR', value: invoiceData.montant }
        }
      }
    });

    const options = {
      hostname: 'api-m.paypal.com',
      path: '/v2/invoicing/invoices',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── ENVOYER FACTURE ──
function sendInvoice(token, invoiceId) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ send_to_recipient: true, send_to_invoicer: true });
    const options = {
      hostname: 'api-m.paypal.com',
      path: `/v2/invoicing/invoices/${invoiceId}/send`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = https.request(options, (res) => {
      res.on('data', () => {});
      res.on('end', resolve);
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── HANDLER NETLIFY ──
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const data = JSON.parse(event.body);
    const token = await getPayPalToken();
    const invoice = await createPayPalInvoice(token, data);
    await sendInvoice(token, invoice.id);

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ success: true, invoiceId: invoice.id })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
