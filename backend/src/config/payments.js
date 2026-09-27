// Which payment methods the store offers. One place, so checkout (GET /payments/methods) and
// createOrder can never disagree about what is allowed.
//
// Env vars (names are provisional until the gateway docs are checked):
//   PAYMENTS_GATEWAYS_READY  'true' only once the JazzCash/Easypaisa code is actually built.
//                            Without it both stay disabled even if their keys are set, so a
//                            half-built gateway is never shown to buyers.
//   JAZZCASH_MERCHANT_ID, JAZZCASH_PASSWORD, JAZZCASH_INTEGRITY_SALT, JAZZCASH_ENV (sandbox|live),
//   PUBLIC_BASE_URL (public https base of the API, e.g. an ngrok URL in dev)
//   EASYPAISA_STORE_ID, EASYPAISA_HASH_KEY, EASYPAISA_ENV (sandbox|live)

// Store currency. The store sells in PKR, which is also the only currency JazzCash/Easypaisa accept.
// const STORE_CURRENCY = 'USD'
const STORE_CURRENCY = 'PKR'

const isSet = (name) => typeof process.env[name] === 'string' && process.env[name].trim() !== ''
const allSet = (names) => names.every(isSet)

// Read at call time (not module load), so env changes and tests see the current values.
const availableMethods = () => {
  const gatewaysReady = process.env.PAYMENTS_GATEWAYS_READY === 'true'
  return [
    { id: 'cod', label: 'Cash on Delivery', enabled: true },
    {
      id: 'jazzcash',
      label: 'JazzCash',
      // enabled: gatewaysReady && allSet(['JAZZCASH_MERCHANT_ID', 'JAZZCASH_PASSWORD', 'JAZZCASH_INTEGRITY_SALT', 'JAZZCASH_ENV']),
      // PUBLIC_BASE_URL too: JazzCash must reach our return URL, and localhost is not reachable.
      enabled: gatewaysReady && allSet(['JAZZCASH_MERCHANT_ID', 'JAZZCASH_PASSWORD', 'JAZZCASH_INTEGRITY_SALT', 'JAZZCASH_ENV', 'PUBLIC_BASE_URL']),
    },
    {
      id: 'easypaisa',
      label: 'Easypaisa',
      enabled: gatewaysReady && allSet(['EASYPAISA_STORE_ID', 'EASYPAISA_HASH_KEY', 'EASYPAISA_ENV']),
    },
  ]
}

// Methods whose payment is confirmed by the gateway, never by an admin by hand.
const GATEWAY_METHODS = ['jazzcash', 'easypaisa']

module.exports = { availableMethods, STORE_CURRENCY, GATEWAY_METHODS }
