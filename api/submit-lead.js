// api/submit-lead.js

export default async function handler(req, res) {
  // ===== 1. CORS HEADERS FOR PRODUCTION & DEVELOPMENT =====
  const allowedOrigins = [
    'https://gravityhomes.siliciti.com', // Development
    'https://gravityhomes.in',           // Live Production
    'https://www.gravityhomes.in'        // Live Production (with www)
  ];

  const origin = req.headers.origin;

  // If the request comes from one of our verified domains, echo it back
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle Preflight OPTIONS requests from browser
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Reject any request method that isn't POST
  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'error', msg: 'Method Not Allowed' });
  }

  try {
    const data = req.body;
    console.log("=== Incoming Request Payload ===", data);

    // ===== 2. CONFIGURATION (SECURE VIA ENVIRONMENT VARIABLES) =====
    const recaptchaSecret = process.env.RECAPTCHA_SECRET;
    const leadRatApiUrl   = 'https://connect.leadrat.com/api/v1/integration/Website';
    const leadratApiKey   = process.env.LEADRAT_API_KEY;

    if (!recaptchaSecret || !leadratApiKey) {
      console.error("CRITICAL CONFIG ERROR: Missing Vercel Environment Variables.");
      return res.status(500).json({ 
        status: 'error', 
        msg: 'Server configuration error. Missing API configurations.' 
      });
    }

    // ===== 3. reCAPTCHA VALIDATION =====
    const recaptchaToken = data.token || '';
    if (!recaptchaToken) {
      return res.status(400).json({ status: 'error', msg: 'Missing reCAPTCHA token' });
    }
    
    const recaptchaVerifyUrl = `https://www.google.com/recaptcha/api/siteverify?secret=${recaptchaSecret}&response=${recaptchaToken}`;
    const captchaRes = await fetch(recaptchaVerifyUrl, { method: 'POST' });
    const captchaData = await captchaRes.json();

    console.log("=== reCAPTCHA Response ===", captchaData);

    if (!captchaData.success || (captchaData.score ?? 0) < 0.5) {
      return res.status(400).json({ 
        status: 'error', 
        msg: 'reCAPTCHA validation failed', 
        recaptcha: captchaData 
      });
    }

    // ===== 4. EXTRACT & VALIDATE FORM DATA =====
    const name    = data.name    || '';
    const email   = data.email   || '';
    const mobile  = data.mobile  || '';
    const message = data.message || '';

    if (!name || !mobile || !message) {
      return res.status(400).json({ status: 'error', msg: 'Missing required fields' });
    }

    // ===== 5. BUILD LEADRAT PAYLOAD =====
    const leadPayload = {
      name: name,
      mobile: mobile,
      notes: message,
      email: email,
      source: "Website"
    };

    console.log("=== Submitting Payload to LeadRat ===", leadPayload);

    // ===== 6. SUBMIT TO LEADRAT =====
    const crmResponse = await fetch(leadRatApiUrl, {
      method: 'POST',
      headers: {
        'API-Key': leadratApiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(leadPayload)
    });

    const crmTextResult = await crmResponse.text();
    console.log(`=== LeadRat Response (HTTP Status: ${crmResponse.status}) ===`, crmTextResult);

    // ===== 7. RETURN COMPLETION STATUS =====
    if (crmResponse.ok) {
      return res.status(200).json({
        status: 'success',
        msg: 'Lead submitted successfully',
        crm_response: crmTextResult
      });
    } else {
      return res.status(crmResponse.status).json({
        status: 'error',
        msg: 'Failed to submit lead to LeadRat CRM',
        httpCode: crmResponse.status,
        crm_response: crmTextResult
      });
    }

  } catch (error) {
    console.error("=== System Serverless Error ===", error);
    return res.status(500).json({ 
      status: 'error', 
      msg: 'Internal Server Error', 
      error: error.message 
    });
  }
}
