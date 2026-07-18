const PADDLE_ENVIRONMENT = "sandbox";
const PADDLE_CLIENT_TOKEN = "test_f064724204c4f6b64b7e3b5c6f2";

const PLANS = {
  weekly: {
    name: "Weekly",
    priceId: "pri_01kxtznxnrvrypjknbww2abarw",
    fallbackPrice: "R$19.90"
  },
  annual: {
    name: "Annual",
    priceId: "pri_01kxtzs8qz31053wbx1245sywf",
    fallbackPrice: "R$119.90"
  },
  lifetime: {
    name: "Lifetime",
    priceId: "pri_01kxtztt3bp295ya3kxxtwzndx",
    fallbackPrice: "R$429.00"
  }
};

const PLAN_ORDER = ["weekly", "annual", "lifetime"];

let paddleReady = false;

document.addEventListener("DOMContentLoaded", () => {
  setupPlanButtons();
  initializePaddle();
});

function setupPlanButtons() {
  document.querySelectorAll("[data-plan]").forEach((button) => {
    button.addEventListener("click", () => openCheckout(button.dataset.plan));
  });
}

function initializePaddle() {
  if (!window.Paddle) {
    setStatus("Paddle did not load. Check your internet connection and try again.");
    return;
  }

  if (PADDLE_ENVIRONMENT === "sandbox") {
    Paddle.Environment.set("sandbox");
  }

  Paddle.Initialize({
    token: PADDLE_CLIENT_TOKEN,
    eventCallback: (event) => {
      if (event && event.name === "checkout.completed") {
        setStatus("Payment completed. Check Paddle > Transactions in your sandbox dashboard.");
      }
    }
  });

  paddleReady = true;
  updateLocalizedPrices();
  openPlanFromUrl();
}

function openPlanFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const plan = params.get("plan");

  if (plan && PLANS[plan]) {
    window.setTimeout(() => openCheckout(plan), 450);
  }
}

async function updateLocalizedPrices() {
  const request = {
    items: PLAN_ORDER.map((planKey) => ({
      priceId: PLANS[planKey].priceId,
      quantity: 1
    }))
  };

  try {
    const result = await Paddle.PricePreview(request);
    const lineItems = result && result.data && result.data.details
      ? result.data.details.lineItems || []
      : [];

    PLAN_ORDER.forEach((planKey, index) => {
      const lineItem = lineItems[index];
      const formatted = lineItem && (
        (lineItem.formattedTotals && lineItem.formattedTotals.subtotal) ||
        (lineItem.formattedUnitTotals && lineItem.formattedUnitTotals.subtotal)
      );

      if (formatted) {
        document.getElementById(`${planKey}Price`).textContent = formatted;
      }
    });
  } catch (error) {
    setStatus("Prices are using the dashboard defaults. Checkout still works in sandbox.");
  }
}

function openCheckout(planKey) {
  const plan = PLANS[planKey];

  if (!plan) {
    return;
  }

  if (!paddleReady) {
    setStatus("Paddle is still loading. Try again in a moment.");
    return;
  }

  const emailInput = document.getElementById("emailInput");
  const email = emailInput.value.trim().toLowerCase();

  if (!email || !email.includes("@")) {
    emailInput.focus();
    setStatus("Enter your email before opening checkout. This email unlocks your purchase later.");
    return;
  }

  const successUrl = new URL("success.html", window.location.href);
  successUrl.searchParams.set("plan", planKey);

  const checkoutOptions = {
    settings: {
      displayMode: "overlay",
      variant: "one-page",
      theme: "light",
      locale: preferredLocale(),
      successUrl: successUrl.toString()
    },
    items: [
      {
        priceId: plan.priceId,
        quantity: 1
      }
    ],
    customData: {
      app: "pitch-changer-for-youtube",
      plan: planKey,
      email,
      source: "pricing-page"
    }
  };

  checkoutOptions.customer = { email };

  Paddle.Checkout.open(checkoutOptions);
}

function preferredLocale() {
  const language = (navigator.language || "en").slice(0, 2).toLowerCase();
  const supported = ["en", "pt", "es", "fr", "de", "it", "nl"];
  return supported.includes(language) ? language : "en";
}

function setStatus(text) {
  document.getElementById("checkoutStatus").textContent = text;
}
