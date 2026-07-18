const { createHmac, timingSafeEqual } = require("crypto");

const PRICE_TO_PLAN = {
  pri_01kxtznxnrvrypjknbww2abarw: "weekly",
  pri_01kxtzs8qz31053wbx1245sywf: "annual",
  pri_01kxtztt3bp295ya3kxxtwzndx: "lifetime"
};

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return send(res, 405, { error: "Method not allowed" });
  }

  try {
    const rawBody = await readBody(req);
    verifyPaddleSignature(req.headers["paddle-signature"], rawBody);

    const event = JSON.parse(rawBody);
    await storeEvent(event);
    await processEvent(event);

    return send(res, 200, { ok: true });
  } catch (error) {
    return send(res, 400, { ok: false, error: error.message });
  }
};

async function processEvent(event) {
  const type = event.event_type;
  const data = event.data || {};

  if (type === "transaction.completed") {
    return upsertCustomerFromTransaction(data);
  }

  if (type.startsWith("subscription.")) {
    return upsertCustomerFromSubscription(type, data);
  }
}

async function upsertCustomerFromTransaction(data) {
  if (data.status && data.status !== "completed") {
    return;
  }

  const email = extractEmail(data);
  if (!email) {
    return;
  }

  const priceId = extractPriceId(data);
  const plan = data.custom_data?.plan || PRICE_TO_PLAN[priceId] || "paid";
  const status = "active";

  await upsertCustomer({
    email,
    status,
    plan,
    price_id: priceId,
    paddle_customer_id: data.customer_id || null,
    paddle_subscription_id: data.subscription_id || null,
    paddle_transaction_id: data.id || null,
    access_until: plan === "lifetime" ? null : data.billing_period?.ends_at || null,
    updated_at: new Date().toISOString()
  });
}

async function upsertCustomerFromSubscription(type, data) {
  const email = extractEmail(data);
  if (!email) {
    return;
  }

  const priceId = extractPriceId(data);
  const plan = data.custom_data?.plan || PRICE_TO_PLAN[priceId] || "subscription";
  const status = normalizeSubscriptionStatus(type, data.status);

  await upsertCustomer({
    email,
    status,
    plan,
    price_id: priceId,
    paddle_customer_id: data.customer_id || null,
    paddle_subscription_id: data.id || null,
    paddle_transaction_id: data.transaction_id || null,
    access_until: data.current_billing_period?.ends_at || null,
    updated_at: new Date().toISOString()
  });
}

function normalizeSubscriptionStatus(type, status) {
  if (type === "subscription.canceled") {
    return "canceled";
  }

  if (["active", "trialing"].includes(status)) {
    return status;
  }

  return status || "inactive";
}

function extractEmail(data) {
  return String(
    data.custom_data?.email ||
    data.customer?.email ||
    data.customer_email ||
    ""
  ).trim().toLowerCase();
}

function extractPriceId(data) {
  return data.items?.[0]?.price?.id || data.items?.[0]?.price_id || null;
}

async function storeEvent(event) {
  await supabaseRequest("/paddle_events?on_conflict=event_id", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify({
      event_id: event.event_id,
      event_type: event.event_type,
      occurred_at: event.occurred_at || null,
      payload: event
    })
  });
}

async function upsertCustomer(customer) {
  await supabaseRequest("/customers?on_conflict=email", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify(customer)
  });
}

function verifyPaddleSignature(signatureHeader, rawBody) {
  const secret = requiredEnv("PADDLE_WEBHOOK_SECRET_KEY");

  if (!signatureHeader) {
    throw new Error("Missing Paddle signature");
  }

  const parts = Object.fromEntries(
    signatureHeader.split(";").map((part) => {
      const [key, ...value] = part.split("=");
      return [key, value.join("=")];
    })
  );

  const timestamp = parts.ts;
  const signature = parts.h1;

  if (!timestamp || !signature) {
    throw new Error("Invalid Paddle signature header");
  }

  const toleranceSeconds = Number(process.env.PADDLE_WEBHOOK_TOLERANCE_SECONDS || 300);
  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));

  if (ageSeconds > toleranceSeconds) {
    throw new Error("Webhook signature expired");
  }

  const signedPayload = `${timestamp}:${rawBody}`;
  const expected = createHmac("sha256", secret).update(signedPayload).digest("hex");
  const actualBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");

  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    throw new Error("Webhook signature mismatch");
  }
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
    const text = await response.text();
    throw new Error(`Supabase error ${response.status}: ${text}`);
  }

  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
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
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  return res.end(JSON.stringify(body));
}
