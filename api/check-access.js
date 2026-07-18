const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    return send(res, 204, {});
  }

  if (!["GET", "POST"].includes(req.method)) {
    return send(res, 405, { error: "Method not allowed" });
  }

  try {
    const email = await getEmail(req);

    if (!email) {
      return send(res, 400, { active: false, error: "Email is required" });
    }

    const customer = await supabaseRequest(`/customers?email=eq.${encodeURIComponent(email)}&select=email,status,plan,access_until,updated_at&limit=1`);
    const record = Array.isArray(customer) ? customer[0] : null;

    if (!record) {
      return send(res, 200, { active: false });
    }

    const hasTimeAccess = !record.access_until || new Date(record.access_until).getTime() > Date.now();
    const active = ["active", "trialing"].includes(record.status) && hasTimeAccess;

    return send(res, 200, {
      active,
      status: record.status,
      plan: record.plan || null,
      accessUntil: record.access_until || null,
      updatedAt: record.updated_at || null
    });
  } catch (error) {
    return send(res, 500, { active: false, error: "Access check failed" });
  }
};

async function getEmail(req) {
  if (req.method === "GET") {
    const url = new URL(req.url, "https://example.com");
    return normalizeEmail(url.searchParams.get("email"));
  }

  const body = await readJson(req);
  return normalizeEmail(body.email);
}

async function readJson(req) {
  const raw = await readBody(req);
  return raw ? JSON.parse(raw) : {};
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

async function supabaseRequest(path, options = {}) {
  const url = requiredEnv("SUPABASE_URL").replace(/\/$/, "");
  const key = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(`${url}/rest/v1${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    throw new Error(`Supabase error ${response.status}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function send(res, status, body) {
  Object.entries(corsHeaders).forEach(([key, value]) => res.setHeader(key, value));
  res.statusCode = status;
  if (status === 204) {
    return res.end();
  }
  res.setHeader("Content-Type", "application/json");
  return res.end(JSON.stringify(body));
}
