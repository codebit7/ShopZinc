// JazzCash hosted checkout (HTTP POST page redirection, pp_Version 1.1). Node crypto only.
// Spec and sources: docs/payments/jazzcash-easypaisa-spec.md (Part A).
//
// The buyer types their wallet details on JazzCash's own page, never on ours. We sign the
// request; JazzCash signs its reply with the same Integrity Salt, and we check that signature.
//
// Env: JAZZCASH_ENV (sandbox|live), JAZZCASH_MERCHANT_ID, JAZZCASH_PASSWORD,
//      JAZZCASH_INTEGRITY_SALT, PUBLIC_BASE_URL (public https base of this API, used for the return URL).

const crypto = require('crypto')

// [UNVERIFIED] hostnames: from plugin listings, not an official page. Confirm in the sandbox portal.
const FORM_URLS = {
  sandbox: 'https://sandbox.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/',
  live: 'https://payments.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/',
}

// Official algorithm (guide v4.2 §14.2): pp* fields sorted by name, values joined with '&',
// salt prepended, HMAC-SHA256 keyed by the salt. Empty values are skipped (what JazzCash's own
// plugin does; otherwise the string gets '&&').
const jazzcashHash = (fields, salt) => {
  const keys = Object.keys(fields)
    .filter((k) => k.toLowerCase().startsWith('pp') && k !== 'pp_SecureHash')
    .filter((k) => fields[k] !== undefined && fields[k] !== null && String(fields[k]) !== '')
    .sort()
  const msg = [salt, ...keys.map((k) => String(fields[k]))].join('&')
  return crypto.createHmac('sha256', salt).update(msg, 'utf8').digest('hex').toUpperCase()
}

// Case-insensitive, constant-time: JazzCash has sent both upper and lower case hashes.
const jazzcashVerify = (posted, salt) => {
  // No salt (JazzCash not set up) means nothing can be verified; createHmac would throw on it.
  if (!salt || !posted || typeof posted.pp_SecureHash !== 'string') return false
  const expected = Buffer.from(jazzcashHash(posted, salt), 'utf8')
  const got = Buffer.from(posted.pp_SecureHash.toUpperCase(), 'utf8')
  return expected.length === got.length && crypto.timingSafeEqual(expected, got)
}

// yyyyMMddHHmmss in Pakistan time (UTC+5, no daylight saving), whatever the server's timezone.
const pktStamp = (date) => {
  const d = new Date(date.getTime() + 5 * 60 * 60 * 1000)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`
}

// Unique per attempt (a retry of the same order gets a new one). 'T' + 14 + 5 = 20 chars, the max.
const newTxnRef = (now = new Date()) => `T${pktStamp(now)}${String(crypto.randomInt(0, 100000)).padStart(5, '0')}`

// PKR 1,499.50 -> "149950" (paisa, no decimal point).
const toPaisa = (amount) => String(Math.round(Number(amount) * 100))

const returnUrl = () => `${String(process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '')}/api/v1/payments/jazzcash/return`

// Returns { action, fields }: the browser POSTs `fields` to `action` as a normal HTML form.
const buildCheckout = ({ txnRef, amount, orderId, now = new Date() }) => {
  const env = process.env.JAZZCASH_ENV === 'live' ? 'live' : 'sandbox'
  const fields = {
    pp_Version: '1.1',
    // MWALLET: checkout promises "pay from your JazzCash mobile account". Vouchers (OTC) are
    // left out on purpose: they are paid later and need the IPN endpoint, which is not built.
    pp_TxnType: 'MWALLET',
    pp_Language: 'EN',
    pp_MerchantID: process.env.JAZZCASH_MERCHANT_ID,
    pp_SubMerchantID: '',
    pp_Password: process.env.JAZZCASH_PASSWORD,
    pp_BankID: '',
    pp_ProductID: '',
    pp_TxnRefNo: txnRef,
    pp_Amount: toPaisa(amount),
    pp_TxnCurrency: 'PKR',
    pp_TxnDateTime: pktStamp(now),
    // Max 20 chars; a Mongo id is 24, so the last 20 (still unique enough to find it by eye).
    pp_BillReference: String(orderId).slice(-20),
    pp_Description: `ShopZinc order ${String(orderId).slice(-8).toUpperCase()}`,
    pp_TxnExpiryDateTime: pktStamp(new Date(now.getTime() + 60 * 60 * 1000)),
    pp_ReturnURL: returnUrl(),
  }
  fields.pp_SecureHash = jazzcashHash(fields, process.env.JAZZCASH_INTEGRITY_SALT)
  return { action: FORM_URLS[env], fields }
}

// JazzCash response code -> our payment status (spec A6).
// 000 success, 121 confirmed by merchant; 124/157 still pending; everything else failed.
const outcomeFor = (code) => {
  const c = String(code || '')
  if (c === '000' || c === '121') return 'completed'
  if (c === '124' || c === '157') return 'pending'
  return 'failed'
}

// [UNVERIFIED] hostnames (third-party libs); the path is official (guide v4.2 §12.11). Spec A2.
const INQUIRY_URLS = {
  sandbox: 'https://sandbox.jazzcash.com.pk/ApplicationAPI/API/PaymentInquiry/Inquire',
  live: 'https://payments.jazzcash.com.pk/ApplicationAPI/API/PaymentInquiry/Inquire',
}

// Inquiry codes we trust enough to act on. Anything else is 'unknown' on purpose: on an inquiry a
// code like 115 (bad hash) or 110 can be about the inquiry request itself, not the payment, and
// reading it as "failed" would let the expiry job cancel an order that was actually paid.
const INQUIRY_OUTCOMES = {
  '000': 'completed', '121': 'completed',
  '124': 'pending', '157': 'pending',
  '112': 'failed', '116': 'failed', '134': 'failed', '129': 'failed',
}

const has = (o, k) => o[k] !== undefined && o[k] !== null && String(o[k]).trim() !== ''

// Picks the payment's own code out of an inquiry reply. [UNVERIFIED] shape (spec A6): the newer
// reply has pp_ResponseCode = "the inquiry worked" and pp_PaymentResponseCode = the payment result,
// so pp_ResponseCode alone is only trusted when the reply does not look like that newer shape.
const inquiryOutcome = (raw) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return 'unknown'
  let code
  if (has(raw, 'pp_PaymentResponseCode')) code = raw.pp_PaymentResponseCode
  else if (has(raw, 'pp_ResponseCode') && !('pp_Status' in raw) && !('pp_PaymentResponseCode' in raw)) code = raw.pp_ResponseCode
  else return 'unknown'
  return INQUIRY_OUTCOMES[String(code).trim()] || 'unknown'
}

// Server-to-server Status Inquiry for one attempt. Never throws: any doubt (network, timeout,
// non-JSON, odd shape, another ref echoed back) is 'unknown', so callers simply wait and retry.
// Returns { outcome, raw } with the secret fields removed from raw.
const inquire = async (txnRef) => {
  const salt = process.env.JAZZCASH_INTEGRITY_SALT
  if (!txnRef || !salt || !process.env.JAZZCASH_MERCHANT_ID) return { outcome: 'unknown', raw: null }
  const env = process.env.JAZZCASH_ENV === 'live' ? 'live' : 'sandbox'
  const body = {
    pp_TxnRefNo: String(txnRef),
    pp_MerchantID: process.env.JAZZCASH_MERCHANT_ID,
    pp_Password: process.env.JAZZCASH_PASSWORD,
    pp_Version: '1.1',
  }
  body.pp_SecureHash = jazzcashHash(body, salt)
  let raw = null
  try {
    const res = await fetch(INQUIRY_URLS[env], {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    })
    raw = await res.json().catch(() => null)
    if (raw && typeof raw === 'object') {
      // Never keep secrets JazzCash might echo back.
      const { pp_Password, pp_SecureHash, ...kept } = raw
      raw = kept
    }
    if (!res.ok) return { outcome: 'unknown', raw }
  } catch (err) {
    // Only the error name: the message/cause could carry the request details.
    return { outcome: 'unknown', raw: null, error: err && err.name }
  }
  // A reply about a different transaction is not an answer about ours.
  if (raw && has(raw, 'pp_TxnRefNo') && String(raw.pp_TxnRefNo) !== String(txnRef)) return { outcome: 'unknown', raw }
  return { outcome: inquiryOutcome(raw), raw }
}

module.exports = { jazzcashHash, jazzcashVerify, buildCheckout, newTxnRef, toPaisa, pktStamp, outcomeFor, inquire, inquiryOutcome }
