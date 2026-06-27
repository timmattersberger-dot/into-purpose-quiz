// netlify/functions/subscribe.js
//
// Creates (or updates) a Flodesk subscriber and adds them to the
// "Into Purpose Quiz" segment. No email is triggered (double_optin = false).
//
// Auth per Flodesk docs (https://developers.flodesk.com):
//   Basic auth, API key as username, empty password:
//   Authorization: Basic base64("<API_KEY>:")
//   A User-Agent header is required on every request.
//
// Required env var:  FLODESK_API_KEY
// Optional env var:  FLODESK_SEGMENT_ID  (if unset, resolved at runtime by name)

const API_BASE = "https://api.flodesk.com/v1";
const SEGMENT_NAME = "Into Purpose Quiz";
const USER_AGENT = "Into Purpose Quiz (ohwonderful.com)";

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function authHeader(apiKey) {
  const token = Buffer.from(apiKey + ":").toString("base64");
  return "Basic " + token;
}

function baseHeaders(apiKey) {
  return {
    Authorization: authHeader(apiKey),
    "User-Agent": USER_AGENT,
    "Content-Type": "application/json",
  };
}

function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// Walk the paginated segments list and find the one named SEGMENT_NAME.
async function resolveSegmentId(apiKey) {
  let page = 1;
  const perPage = 100;
  // hard cap on pages to avoid runaway loops
  for (let i = 0; i < 20; i++) {
    const res = await fetch(`${API_BASE}/segments?page=${page}&per_page=${perPage}`, {
      method: "GET",
      headers: baseHeaders(apiKey),
    });
    if (!res.ok) {
      throw new Error(`segments list failed: ${res.status} ${await safeText(res)}`);
    }
    const json = await res.json();
    const data = (json && json.data) || [];
    const match = data.find(
      (s) => s && typeof s.name === "string" && s.name.trim().toLowerCase() === SEGMENT_NAME.toLowerCase()
    );
    if (match) return match.id;

    const meta = json && json.meta;
    const totalPages = meta && meta.total_pages ? meta.total_pages : page;
    if (page >= totalPages || data.length === 0) break;
    page += 1;
  }
  throw new Error(`segment "${SEGMENT_NAME}" not found`);
}

async function safeText(res) {
  try { return await res.text(); } catch (_) { return ""; }
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: JSON_HEADERS, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: JSON_HEADERS, body: JSON.stringify({ error: "method_not_allowed" }) };
  }

  const apiKey = process.env.FLODESK_API_KEY;
  if (!apiKey) {
    console.error("FLODESK_API_KEY is not set");
    return { statusCode: 500, headers: JSON_HEADERS, body: JSON.stringify({ error: "server_misconfigured" }) };
  }

  let email;
  try {
    const parsed = JSON.parse(event.body || "{}");
    email = parsed.email;
  } catch (_) {
    return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: "bad_request" }) };
  }

  if (!isValidEmail(email)) {
    return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: "invalid_email" }) };
  }
  email = email.trim();

  try {
    // 1) Resolve segment id (env override, else by name).
    let segmentId = process.env.FLODESK_SEGMENT_ID;
    if (!segmentId) {
      segmentId = await resolveSegmentId(apiKey);
    }

    // 2) Create or update the subscriber; attach the segment in the same call.
    const createRes = await fetch(`${API_BASE}/subscribers`, {
      method: "POST",
      headers: baseHeaders(apiKey),
      body: JSON.stringify({
        email: email,
        double_optin: false,
        segment_ids: [segmentId],
      }),
    });
    if (!createRes.ok) {
      throw new Error(`create subscriber failed: ${createRes.status} ${await safeText(createRes)}`);
    }

    // 3) Explicit add-to-segments as a belt-and-suspenders step
    //    (idempotent — safe if the subscriber is already in the segment).
    const segRes = await fetch(
      `${API_BASE}/subscribers/${encodeURIComponent(email)}/segments`,
      {
        method: "POST",
        headers: baseHeaders(apiKey),
        body: JSON.stringify({ segment_ids: [segmentId] }),
      }
    );
    if (!segRes.ok) {
      // Non-fatal: the subscriber already exists and was created above.
      console.error(`add-to-segments warning: ${segRes.status} ${await safeText(segRes)}`);
    }

    return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error("subscribe error:", err && err.message ? err.message : err);
    // Frontend ignores the body and shows the result regardless; surface 502 for logs.
    return { statusCode: 502, headers: JSON_HEADERS, body: JSON.stringify({ error: "upstream_failed" }) };
  }
};
