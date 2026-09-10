/**
 * Toppers Classroom — contact form relay (Cloudflare Worker).
 *
 * The site is plain static HTML with no backend, and Resend's API can only
 * be called with a secret key on a server — never from browser JS, or the
 * key would be visible to anyone viewing the page source. This Worker is
 * that server: the contact form POSTs its fields here as JSON, the Worker
 * validates them, then calls Resend with the key held in `env.RESEND_API_KEY`.
 *
 * Deploy (one-time):
 *   1. npm install -g wrangler   (or: npx wrangler ...)
 *   2. wrangler login
 *   3. cd cloudflare-worker
 *   4. wrangler secret put RESEND_API_KEY      # paste your Resend API key
 *   5. wrangler deploy
 *   6. Copy the printed workers.dev URL into index.html's
 *      <form data-endpoint="...">.
 *
 * Requires a domain verified in Resend (Domains -> Add Domain) so `FROM`
 * below can send as that domain — Resend rejects unverified from-addresses.
 * Until you verify toppersclassroom.com, you can send test mail from
 * "onboarding@resend.dev", but Resend will only deliver those to the email
 * address on your own Resend account, not to CONTACT_TO.
 */

const CONTACT_TO = 'romancebcc1573@gmail.com';
const FROM = 'Toppers Classroom Website <contact@toppersclassroom.com>';

// Browser-enforced only (CORS does not stop server-to-server requests) —
// keeps casual cross-site abuse out, not a full security boundary on its own.
const ALLOWED_ORIGINS = [
  'https://toppersclassroom.com',
  'https://www.toppersclassroom.com',
];

function corsHeaders(origin) {
  var allow = ALLOWED_ORIGINS.indexOf(origin) !== -1 ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders(origin)),
  });
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

const TOPICS = ['Course inquiry', 'Admission & payment', 'Model test / result', 'Technical problem', 'Other'];

export default {
  async fetch(request, env) {
    var origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (request.method !== 'POST') {
      return json({ ok: false, message: 'Method not allowed' }, 405, origin);
    }

    var body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ ok: false, message: 'Invalid request body' }, 400, origin);
    }

    // honeypot: bots fill every field, real visitors never see this one
    if (body.honey) return json({ ok: true }, 200, origin);

    var name = String(body.name || '').trim().slice(0, 200);
    var phone = String(body.phone || '').trim().slice(0, 40);
    var email = String(body.email || '').trim().slice(0, 200);
    var topic = TOPICS.indexOf(body.topic) !== -1 ? body.topic : 'Other';
    var message = String(body.message || '').trim().slice(0, 5000);

    var digits = phone.replace(/\D/g, '');
    var errors = {};
    if (name.length < 2) errors.name = 'Please enter your name.';
    if (digits.length < 10) errors.phone = 'Please enter a valid phone number.';
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Please enter a valid email address.';
    if (message.length < 10) errors.message = 'Please write at least a short message.';
    if (Object.keys(errors).length) {
      return json({ ok: false, message: 'Please correct the highlighted fields.', errors: errors }, 422, origin);
    }

    if (!env.RESEND_API_KEY) {
      return json({ ok: false, message: 'Email is not configured yet.' }, 500, origin);
    }

    // subject/body are built here from validated fields only — the client
    // never controls raw email headers, which avoids header-injection risk.
    var subject = '[Website] ' + topic + ' — ' + name;
    var html =
      '<table cellpadding="6" cellspacing="0" style="font-family:sans-serif;font-size:14px">' +
      '<tr><td><strong>Name</strong></td><td>' + escapeHtml(name) + '</td></tr>' +
      '<tr><td><strong>Phone</strong></td><td>' + escapeHtml(phone) + '</td></tr>' +
      '<tr><td><strong>Email</strong></td><td>' + escapeHtml(email || '(not given)') + '</td></tr>' +
      '<tr><td><strong>Topic</strong></td><td>' + escapeHtml(topic) + '</td></tr>' +
      '<tr><td style="vertical-align:top"><strong>Message</strong></td><td>' +
        escapeHtml(message).replace(/\n/g, '<br>') + '</td></tr>' +
      '</table>';

    var resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + env.RESEND_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM,
        to: [CONTACT_TO],
        reply_to: email || undefined,
        subject: subject,
        html: html,
      }),
    });

    if (!resendRes.ok) {
      var errText = await resendRes.text().catch(function () { return ''; });
      console.log('Resend error:', resendRes.status, errText);
      return json({ ok: false, message: 'Could not send the message right now.' }, 502, origin);
    }

    return json({ ok: true }, 200, origin);
  },
};
