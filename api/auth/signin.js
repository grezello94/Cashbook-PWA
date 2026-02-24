function normalizeEnvValue(value) {
  if (!value) {
    return "";
  }
  return String(value).trim().replace(/^['"]|['"]$/g, "").trim();
}

function readConfig() {
  const url = normalizeEnvValue(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
  const anonKey = normalizeEnvValue(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY);
  return { url, anonKey };
}

function sendJson(res, status, payload) {
  res.status(status).setHeader("content-type", "application/json; charset=utf-8");
  res.send(JSON.stringify(payload));
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  const { url, anonKey } = readConfig();
  if (!url || !anonKey) {
    return sendJson(res, 500, { error: "Server auth relay is not configured." });
  }

  const body = typeof req.body === "string" ? (() => {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  })() : (req.body || {});

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    return sendJson(res, 400, { error: "Email and password are required." });
  }

  try {
    const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        email,
        password
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message =
        (data && typeof data.error_description === "string" && data.error_description) ||
        (data && typeof data.msg === "string" && data.msg) ||
        (data && typeof data.error === "string" && data.error) ||
        "Authentication failed.";
      return sendJson(res, response.status, { error: message });
    }

    return sendJson(res, 200, {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
      token_type: data.token_type
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Relay request failed";
    return sendJson(res, 502, { error: message });
  }
};
