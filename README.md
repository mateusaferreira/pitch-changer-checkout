# Pitch Changer for YouTube Checkout

Static Paddle checkout page for Pitch Changer for YouTube.

## What is already connected

- Paddle sandbox client token: `test_f064724204c4f6b64b7e3b5c6f2`
- Weekly price: `pri_01kxtznxnrvrypjknbww2abarw`
- Annual price: `pri_01kxtzs8qz31053wbx1245sywf`
- Lifetime price: `pri_01kxtztt3bp295ya3kxxtwzndx`

## Test card

- Card: `4242 4242 4242 4242`
- CVC: `100`
- Expiration: any future date

## Deploy on Vercel without buying a domain

1. Create a GitHub repository, for example `pitch-changer-checkout`.
2. Upload the files from this `checkout-site` folder to that repository.
3. In Vercel, choose `Add New > Project`.
4. Import the GitHub repository.
5. Use the default settings for a static site and deploy.
6. Copy the generated Vercel URL, for example `https://pitch-changer-checkout.vercel.app`.
7. In Paddle sandbox, set `Checkout > Checkout settings > Default payment link` to that Vercel URL.
8. Open the Vercel URL and make a test purchase.

## Before going live

- Replace the sandbox client token with a live client token.
- Replace sandbox price IDs with live price IDs.
- Set `PADDLE_ENVIRONMENT` in `app.js` to `production`.
- Add webhook handling so paid customers unlock premium access in the extension.
