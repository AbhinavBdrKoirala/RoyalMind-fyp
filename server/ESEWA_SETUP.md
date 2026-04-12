# eSewa Subscription Setup

RoyalMind uses eSewa ePay form integration for subscription payments.

## Required server variables

Add these values to [server/.env](/C:/Users/Acer/OneDrive/Desktop/FYP/Project%20Artefact/RoyalMind_fyp/server/.env):

```env
ESEWA_TEST_MODE=true
ESEWA_PRODUCT_CODE=EPAYTEST
ESEWA_SECRET_KEY=8gBm/:&EnhH.1/q(
ESEWA_FORM_URL=https://rc-epay.esewa.com.np/api/epay/main/v2/form
ESEWA_STATUS_URL=https://rc.esewa.com.np/api/epay/transaction/status/
ESEWA_SUCCESS_BASE_URL=http://127.0.0.1:7000
ESEWA_FAILURE_BASE_URL=http://127.0.0.1:7000
CLIENT_BASE_URL=http://localhost:3000
```

For production, replace:
- `ESEWA_TEST_MODE=false`
- `ESEWA_PRODUCT_CODE` with your live merchant product code
- `ESEWA_SECRET_KEY` with your live secret key
- `ESEWA_FORM_URL=https://epay.esewa.com.np/api/epay/main/v2/form`
- `ESEWA_STATUS_URL=https://esewa.com.np/api/epay/transaction/status/`
- `ESEWA_SUCCESS_BASE_URL` and `ESEWA_FAILURE_BASE_URL` with your live backend base URL
- `CLIENT_BASE_URL` with your live frontend base URL

## Flow

1. Logged-in user opens Subscription page
2. User clicks `Pay with eSewa`
3. RoyalMind creates a pending payment record
4. Browser submits a signed form to eSewa
5. eSewa redirects back to RoyalMind success or failure route
6. RoyalMind verifies the returned payload signature
7. RoyalMind calls eSewa transaction status check
8. Only if the status is `COMPLETE`, premium access is activated

## Test details from eSewa docs

- Test form URL: [https://rc-epay.esewa.com.np/api/epay/main/v2/form](https://rc-epay.esewa.com.np/api/epay/main/v2/form)
- Test status URL: [https://rc.esewa.com.np/api/epay/transaction/status/](https://rc.esewa.com.np/api/epay/transaction/status/)
- Test product code: `EPAYTEST`
- Test secret key: `8gBm/:&EnhH.1/q(`
- Test OTP token: `123456`

## Important note for local development

Because eSewa redirects the browser back to your backend callback URL, the backend must be running and reachable at the `ESEWA_SUCCESS_BASE_URL` and `ESEWA_FAILURE_BASE_URL` you configure.
