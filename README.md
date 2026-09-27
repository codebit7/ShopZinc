# ShopZinc

A full-stack e-commerce store built with **Express + MongoDB** on the backend and **Preact + Vite + Redux Toolkit**
on the frontend. It includes a customer storefront, checkout with cash on delivery (and JazzCash, once set up),
delivery charges, PostEx courier booking and tracking, customer accounts, and an admin panel with sales and
profit reports. Prices are in Pakistani Rupees (PKR).

---

## Features

### Storefront
- Product catalog with server-side search, filters (category, price, brand, condition, rating) and sorting
- Filters kept in the URL, so links can be shared and Back/Forward works
- Product pages with images, choices such as size or color (each can add to the price), stock status and
  verified-buyer reviews
- Home page with an admin-managed carousel, deals, category sections, new arrivals, shop by category
  (with live product counts), shop by brand, recently viewed products and a reminder of items left in the cart.
  Every section uses real store data and hides itself when there is nothing to show
- Cart with server-calculated totals and **delivery charges** (default Rs 200, free from Rs 3,000), and a wishlist
- Checkout with saved addresses, a mobile number for the courier, **cash on delivery**, and **JazzCash**
  (switched off until its keys are set)
- Account area: profile, addresses, order history, order details, courier tracking number, and order
  cancellation (not for orders already paid online)

### Admin panel
- Dashboard with key numbers and a sales chart
- Products: create, edit and delete, with image upload, choices, cost price and discount
- Inventory: quick stock and cost edits, low-stock warnings
- Categories, home-page sections and the carousel manager
- Orders: status updates, marking payments as paid, adding a phone number, booking the courier, printable receipts
- **Courier page:** orders ready to ship (book many with PostEx at once), shipments with courier status,
  and settings for the delivery fee, free-delivery amount, PostEx pickup code and auto-check time
- Payments and customers
- Sales and profit reports with **PDF and Excel export**
- Light, dark and system theme

### Security
- Sign-in cookies that JavaScript cannot read (`httpOnly`); no tokens in `localStorage`
  (the browser only stores the admin theme and the recently viewed product ids)
- Refresh tokens that change on every use and are stored only as a hash; reusing an old token ends every session
- Email verification before first login, and password reset by email
- Rate limits on login, registration and password reset
- Password rules (8–128 characters, at least one letter and one number)
- Role checks against the database on every admin request
- Order totals and stock are calculated on the server inside database transactions; prices sent by the
  browser are ignored
- Uploads accept only images (JPEG, PNG, WebP, GIF), up to 5 MB each
- Allowed-origin list for CORS, basic security headers, and one central error handler

---

## Tech stack

| Layer | Technology |
|---|---|
| Backend | Node.js (CommonJS), Express 4, Mongoose 8 |
| Database | MongoDB — **replica set required** (MongoDB Atlas works out of the box) |
| Auth | JWT access token + rotating refresh token in `httpOnly` cookies, bcryptjs |
| Email | Nodemailer (Gmail SMTP) |
| Images | Multer + Cloudinary |
| Payments | Cash on delivery; JazzCash hosted checkout (Node `crypto`, no SDK) |
| Courier | PostEx API (Node's built-in `fetch`, no SDK) |
| Frontend | Preact 10, Vite 6, Redux Toolkit, React Router 7, Axios |
| Charts and exports | Chart.js, jsPDF, ExcelJS |
| Styling | Plain CSS per component; Bootstrap 5 in the admin panel |

---

## Project structure

```
shopzinc/
├── backend/            Express API
│   └── src/
│       ├── index.js        App setup, middleware, routes, error handling
│       ├── config/         Payment methods, delivery fee, courier settings cache
│       ├── jobs/           JazzCash payment re-check and unpaid-order expiry
│       ├── controllers/    Business logic
│       ├── routes/         API routes
│       ├── models/         Mongoose schemas
│       ├── middlewares/    Auth, roles, rate limits, uploads
│       ├── utils/          Tokens, email, pricing, reports, Cloudinary, PostEx, JazzCash
│       └── scripts/        Check scripts, seed data and migration scripts
├── frontend/           Preact single-page app
│   └── src/
│       ├── app.jsx         All routes
│       ├── api/client.js   Shared HTTP client with automatic sign-in refresh
│       ├── Store/          Redux store and slices
│       ├── Pages/          Storefront and account pages
│       ├── components/     Storefront components (HomeExtras/ = home page sections)
│       └── Admin/          Admin panel
└── docs/               Design documents (auth, payment gateways)
```

---

## Getting started

### Prerequisites
- **Node.js 18 or newer**
- A **MongoDB replica set**. A free MongoDB Atlas cluster is the easiest option. A single local `mongod` will
  not work, because orders use transactions.
- A **Cloudinary** account for product images
- *(Optional)* A Gmail account with an app password for sending emails

### 1. Install

```bash
cd backend  && npm install
cd ../frontend && npm install
```

### 2. Configure the backend

Create `backend/.env`:

```env
# Required
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>/<database-name>
SECRET_KEY=<a long random string>
APP_URL=http://localhost:5173

CLOUDINARY_NAME=<cloud name>
CLOUDINARY_API_KEY=<api key>
CLOUDINARY_API_SECRET=<api secret>

# Optional
PORT=3000
NODE_ENV=development
CORS_ORIGINS=http://localhost:5173
ACCESS_TOKEN_MINUTES=15
REFRESH_TOKEN_TTL_DAYS=7
SMTP_USER=
SMTP_PASS=
MAIL_FROM=ShopZinc <no-reply@example.com>
TRUST_PROXY=

# Optional: delivery charges (the admin Courier page can override these)
SHIPPING_FEE=200
FREE_SHIPPING_MIN=3000

# Optional: PostEx courier (off while POSTEX_TOKEN is empty)
POSTEX_TOKEN=
POSTEX_PICKUP_ADDRESS_CODE=
POSTEX_SYNC_MINUTES=180

# Optional: JazzCash (off unless all of these are set)
PAYMENTS_GATEWAYS_READY=
JAZZCASH_ENV=sandbox
JAZZCASH_MERCHANT_ID=
JAZZCASH_PASSWORD=
JAZZCASH_INTEGRITY_SALT=
PUBLIC_BASE_URL=
JAZZCASH_SYNC_MINUTES=15
JAZZCASH_UNPAID_EXPIRE_MINUTES=120
```

| Variable | Required | Description |
|---|---|---|
| `MONGODB_URI` | yes | Connection string. **Include the database name** in the URI. |
| `SECRET_KEY` | yes | Signs access tokens. The server will not start without it. |
| `APP_URL` | yes | Frontend address, used in verification and password-reset emails. |
| `CLOUDINARY_*` | yes | Image hosting details. |
| `PORT` | no | API port, default `3000`. |
| `NODE_ENV` | no | Set to `production` to send cookies only over HTTPS. |
| `CORS_ORIGINS` | no | Comma-separated list of allowed origins, default `http://localhost:5173`. |
| `ACCESS_TOKEN_MINUTES` | no | Access token lifetime in minutes, default `15`. |
| `REFRESH_TOKEN_TTL_DAYS` | no | Refresh token lifetime in days, default `7`. |
| `SMTP_USER`, `SMTP_PASS` | no | Gmail address and app password. **If left empty, email links are printed in the backend console instead of being sent.** |
| `MAIL_FROM` | no | Sender name and address. |
| `TRUST_PROXY` | no | Set when running behind a reverse proxy (for example `1`), so rate limits see real client IPs. |
| `SHIPPING_FEE` | no | Delivery fee in Rs, default `200`. The admin Courier page value wins. |
| `FREE_SHIPPING_MIN` | no | Free delivery from this order total, default `3000` (`0` = never free). The admin Courier page value wins. |
| `POSTEX_TOKEN` | no | PostEx merchant API token. Courier booking and tracking are off while it is empty. Kept only in `.env`. |
| `POSTEX_PICKUP_ADDRESS_CODE` | no | PostEx pickup address code. The admin Courier page value wins. |
| `POSTEX_SYNC_MINUTES` | no | How often shipped parcels are checked, default `180` (`0` = off). The admin Courier page value wins. |
| `PAYMENTS_GATEWAYS_READY` | no | Set to `true` to allow JazzCash (it also needs the variables below). |
| `JAZZCASH_ENV` | no | `sandbox` or `live`. |
| `JAZZCASH_MERCHANT_ID`, `JAZZCASH_PASSWORD`, `JAZZCASH_INTEGRITY_SALT` | no | From the JazzCash merchant portal. |
| `PUBLIC_BASE_URL` | no | Public HTTPS address of the API (for example an ngrok URL in development). JazzCash sends the payment result here. |
| `JAZZCASH_SYNC_MINUTES` | no | How often pending JazzCash payments are re-checked, default `15`. |
| `JAZZCASH_UNPAID_EXPIRE_MINUTES` | no | Unpaid JazzCash orders are cancelled and restocked after this, default `120`. |

The frontend needs no configuration. In development, Vite forwards `/api` requests to `http://localhost:3000`,
so the app and the API share one origin and the cookies work.

### 3. Run

In two terminals:

```bash
cd backend && npm start        # API on http://localhost:3000
```
```bash
cd frontend && npm run dev     # App on http://localhost:5173
```

### 4. Sample data (optional)

```bash
cd backend
node src/scripts/seed-dummy.js
```

This writes to your database. It first deletes any earlier seed data, then adds sample users, categories and
products. The seed user password is `Seed@1234`. Run it with `--clean` to only delete the seed data.

### 5. Make an admin

New accounts get the `user` role. To make an admin, set `role` to `"admin"` on that user in MongoDB
(for example with Atlas Data Explorer or Compass).

---

## Build for production

```bash
cd frontend && npm run build   # output in frontend/dist
```

The frontend calls the API at the relative path `/api/v1`. In production, serve `frontend/dist` and the API
from **the same domain**. For example, use a reverse proxy such as Nginx that sends `/api` to the Express
server. Also set `NODE_ENV=production`, `APP_URL`, `CORS_ORIGINS` and `TRUST_PROXY`.

---

## API overview

Base URL: `/api/v1`

| Area | Routes |
|---|---|
| Users | `/users/register`, `/login`, `/logout`, `/refresh`, `/me`, `/verify/:token`, `/resend-verification`, `/forgot-password`, `/reset-password` |
| Products | `/products`, `/products/facets`, `/brands`, `/product/:id`, `/product/:id/reviews`, `/productDeals`, `/recommendedProducts`, admin: `/create`, `/update/:id`, `/delete/:id` |
| Cart | `/cart`, `/cart/add`, `/cart/update/:itemId`, `/cart/delete/:itemId`, `/cart/clear` |
| Wishlist | `/wishlist`, `/wishlist/remove`, `/wishlist/clear` |
| Categories | `/category`, `/category/:id`, `/category/:id/cover` |
| Orders | `/orders`, `/orders/me`, `/orders/:orderId`, `/orders/:orderId/status`, `/orders/:orderId/cancel`, admin: `/orders/:orderId/ship`, `/orders/:orderId/track` |
| Payments | `/payments/methods`, `/payments`, `/payments/:id`, `/payments/:id/status`, `/payments/jazzcash/init`, `/payments/jazzcash/return` |
| Courier (admin) | `/courier/ready`, `/courier/shipments`, `/courier/book`, `/courier/sync`, `/courier/settings` |
| Reports (admin) | `/reports/sales`, `/reports/receipt/:orderId` |
| Carousel | `/carousel`, `/carousel/admin`, `/carousel/order`, `/carousel/settings` |

A full route reference, with auth rules and status codes, is in [CLAUDE.md](CLAUDE.md#6-api-reference).

---

## Checks

The project has no test framework yet. Small `assert`-based scripts check the most important parts:

```bash
cd backend
node src/scripts/check-options.js       # product choices, cart merge, pricing
node src/scripts/check-report.js        # sales and profit math
node src/scripts/check-verify-token.js  # auth middleware
node src/scripts/check-cart.js          # cart merge, quantity and totals
node src/scripts/check-postex.js        # PostEx courier helper (no network)
node src/scripts/check-jazzcash.js      # JazzCash signing
node src/scripts/check-jazzcash-sync.js # JazzCash re-check and unpaid-order expiry
node src/scripts/check-courier.js       # courier settings and delivery fee
node src/scripts/check-tokens.js        # refresh token rotation (needs MongoDB)
```
```bash
cd frontend
node scripts/check-api-client.mjs       # automatic sign-in refresh logic
python scripts/check-imports.py         # import file-name case (catches Linux build failures)
```

---

## Payments

**Cash on delivery** is fully supported. The order is marked paid automatically when PostEx reports it as
delivered, or an admin marks it paid by hand.

**JazzCash** (mobile wallet, on JazzCash's own payment page) is built but switched off until
`PAYMENTS_GATEWAYS_READY=true` and all `JAZZCASH_*` variables and `PUBLIC_BASE_URL` are set. It has not been
tested against the real JazzCash sandbox yet. Unpaid JazzCash orders are cancelled after 2 hours and their
stock is returned. There is no automatic refund: refunds are made by hand in the JazzCash merchant portal.

**Easypaisa** is not built yet; its official guide is only given to merchants. The research is in
[docs/payments/jazzcash-easypaisa-spec.md](docs/payments/jazzcash-easypaisa-spec.md).

---

## Delivery and courier

- **Delivery charge:** Rs 200 per order, free from Rs 3,000 (change it on the admin Courier page or in `.env`).
  It is calculated on the server and included in the order total.
- **PostEx:** an admin books orders from the Courier page or the order drawer. The server saves the tracking
  number, and customers see it on their order page. Shipped parcels are checked with PostEx every 3 hours.
  Courier booking is off until `POSTEX_TOKEN` is set, and it has not been tested with a real PostEx account yet.

---

## Status and roadmap

The store works end to end: browse, cart, checkout (cash on delivery), delivery charges, order management and
reports. Planned next:
- Test PostEx and JazzCash with real sandbox accounts, then switch them on
- Easypaisa online payments
- More consistent API error responses
- Remove the last placeholder content (newsletter box on the product list page, some cart buttons)
- Load the admin panel separately so shoppers download less code
- ESLint, an automated API test suite, and CI

Known issues are tracked with stable IDs in [CLAUDE.md](CLAUDE.md#10-known-bugs-and-issues).

---

## Author

**Wamiq Rahim**
