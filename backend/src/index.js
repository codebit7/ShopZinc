const express = require('express')
// const mongoose = require('mongoose')
const MongoDb = require('./DB/dbConnection.js')
require('dotenv').config();
// const {addCategory} = require('./controllers/addCategory.js')

// Fail fast instead of falling back to a hardcoded JWT secret.
// Without this, a missing SECRET_KEY let anyone sign their own admin token.
if (!process.env.SECRET_KEY) {
    console.error("FATAL: SECRET_KEY is not set. Copy .env.example to .env and fill it in.")
    process.exit(1)
}

const app = express()

// Why: hides "X-Powered-By: Express" so the stack is not advertised to scanners.
app.disable('x-powered-by')

// Why by hand, not helmet: a few basic headers need no new dependency.
// nosniff stops browsers guessing file types; DENY blocks clickjacking in iframes.
// No CSP on purpose - a wrong CSP could break the frontend.
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
    next()
})

// Why: behind a reverse proxy req.ip is the proxy's IP, so the rate limiter
// would put every user in one bucket. Opt-in only (e.g. TRUST_PROXY=1): trusting
// X-Forwarded-For with no proxy in front lets clients spoof their IP.
// Env values are strings, but Express reads a string as an IP list, so "1"
// must become the number 1 (hop count) and "true" the boolean.
if (process.env.TRUST_PROXY) {
    const tp = process.env.TRUST_PROXY.trim()
    app.set('trust proxy', /^\d+$/.test(tp) ? Number(tp) : tp === 'true' ? true : tp)
}

const cors = require('cors');
const cookieParser = require('cookie-parser');

// Credentialed requests cannot use a wildcard origin, so the open cors() call
// had to become an allowlist. Frontend runs on 5173 via the Vite dev proxy.
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173').split(',')
app.use(cors({ origin: allowedOrigins, credentials: true }));

app.use(cookieParser());
app.use(express.json())

// import route from router folder
const userRouter =  require('./routes/userRoutes.js')
const productRouter = require('./routes/productRoutes.js')
const cartRouter  = require('./routes/cartRoutes.js')
const wishlistRouter = require('./routes/wishlistRoutes.js')
const categoryRouter  = require('./routes/CategoryRoutes.js')
const orderRouter = require('./routes/orderRoutes.js')
const paymentRouter = require('./routes/paymentRoutes.js')
const reportRouter = require('./routes/reportRoutes.js')
const carouselRouter = require('./routes/carouselRoutes.js')



app.use("/api/v1/users",userRouter)
app.use("/api/v1/",productRouter)
app.use('/api/v1/cart',cartRouter)
app.use('/api/v1/wishlist',wishlistRouter)
app.use('/api/v1/category', categoryRouter)
app.use('/api/v1/orders',orderRouter)
app.use('/api/v1/payments',paymentRouter)
// Admin sales reports (profit / growth) and printable order receipts.
app.use('/api/v1/reports', reportRouter)
// Home-page carousel: public read, admin manage.
app.use('/api/v1/carousel', carouselRouter)
// Admin Courier page: ready-to-ship list, shipments, courier settings.
app.use('/api/v1/courier', require('./routes/courierRoutes.js'))

// Why: unknown /api URLs used to get Express's default HTML 404 page; the frontend expects JSON.
app.use('/api', (req, res) => {
    res.status(404).json({ message: 'Route not found' })
})

// Central error handler (4 args, so Express treats it as one). Why: without it, errors passed
// to next(err) - multer, bad JSON, thrown sync errors - got Express's HTML page with a stack trace.
app.use((err, req, res, next) => {
    // Response already started: let Express close the connection.
    if (res.headersSent) return next(err)
    // Bad JSON body from express.json().
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ message: 'Invalid JSON' })
    }
    // Upload errors (too many files, file too big...) are the client's fault.
    if (err.name === 'MulterError') {
        return res.status(400).json({ message: err.message })
    }
    // Errors that carry their own 4xx status (e.g. multer file filter sets err.status = 400).
    const status = Number(err.status || err.statusCode)
    if (status >= 400 && status < 500) {
        return res.status(status).json({ message: err.message })
    }
    // Anything else is a server bug: log it here, never send the message (may leak internals).
    console.error('Unhandled error:', err)
    res.status(500).json({ message: 'Server error' })
})

// Why: an async error nobody caught would otherwise only print a warning (or crash on some
// Node settings). Log it so it is seen; do not exit, the other requests keep working.
process.on('unhandledRejection', (reason) => {
    console.error('Unhandled promise rejection:', reason)
})

// Why: PostEx has no webhook we could verify, so shipped orders are checked on a timer. When
// PostEx says "Delivered" the order is marked delivered (and a COD order paid) without an admin.
// POSTEX_SYNC_MINUTES: default 180; 0 turns it off. Does nothing until POSTEX_TOKEN is set.
// const startShipmentSync = () => {
//     const { isConfigured } = require('./utils/postex.js')
//     const { syncAllShipments } = require('./controllers/shipmentController.js')
//     const raw = process.env.POSTEX_SYNC_MINUTES
//     const minutes = raw === undefined || raw.trim() === '' ? 180 : Number(raw)
//     if (!isConfigured() || !(minutes > 0)) return
//     let running = false
//     const tick = async () => {
//         // A slow run must not overlap the next one.
//         if (running) return
//         running = true
//         try {
//             const r = await syncAllShipments()
//             if (r.checked) console.log(`PostEx sync: ${r.checked} checked, ${r.delivered} delivered, ${r.failed} failed`)
//         } catch (err) {
//             console.error('PostEx sync failed:', err.message)
//         } finally {
//             running = false
//         }
//     }
//     setInterval(tick, minutes * 60 * 1000).unref()
// }
// Replaced: the minutes are now also editable on the admin Courier page, so each run re-reads them
// (setTimeout chain instead of a fixed setInterval). 0 = off; checked again every 5 min so turning
// it back on works without a restart.
const startShipmentSync = () => {
    const { isConfigured } = require('./utils/postex.js')
    const { syncAllShipments } = require('./controllers/shipmentController.js')
    const { getCourierSettings } = require('./config/courierSettings.js')
    const currentMinutes = () => {
        const s = getCourierSettings()
        if (typeof s.syncMinutes === 'number') return s.syncMinutes
        const raw = process.env.POSTEX_SYNC_MINUTES
        const n = raw === undefined || raw.trim() === '' ? 180 : Number(raw)
        return Number.isFinite(n) && n >= 0 ? n : 180
    }
    const schedule = (minutes) => setTimeout(tick, minutes * 60 * 1000).unref()
    const tick = async () => {
        const minutes = currentMinutes()
        if (!(minutes > 0) || !isConfigured()) return schedule(5)
        try {
            const r = await syncAllShipments()
            if (r.checked) console.log(`PostEx sync: ${r.checked} checked, ${r.delivered} delivered, ${r.failed} failed`)
        } catch (err) {
            console.error('PostEx sync failed:', err.message)
        }
        // Scheduled only after the run ends, so a slow run can never overlap the next one.
        schedule(currentMinutes() > 0 ? currentMinutes() : 5)
    }
    schedule(currentMinutes() > 0 ? currentMinutes() : 5)
}

// Why: a JazzCash "pending" reply was never re-checked, and an unpaid JazzCash order held its
// stock forever. This re-asks JazzCash and cancels expired unpaid orders (stock restored).
// JAZZCASH_SYNC_MINUTES: default 15; 0 turns it off. Does nothing while JazzCash is disabled.
const startJazzCashSync = () => {
    const { syncJazzCashPayments } = require('./jobs/jazzcashSync.js')
    const raw = process.env.JAZZCASH_SYNC_MINUTES
    const minutes = raw === undefined || raw.trim() === '' ? 15 : Number(raw)
    if (!(minutes > 0)) return
    let running = false
    const tick = async () => {
        // A slow run must not overlap the next one.
        if (running) return
        running = true
        try {
            const r = await syncJazzCashPayments()
            if (r.checked || r.expired || r.errors) console.log(`JazzCash sync: ${r.checked} checked, ${r.completed} paid, ${r.failed} failed, ${r.expired} expired, ${r.skipped} skipped, ${r.errors} errors`)
        } catch (err) {
            console.error('JazzCash sync failed:', err.message)
        } finally {
            running = false
        }
    }
    setInterval(tick, minutes * 60 * 1000).unref()
}




MongoDb()
// Admin courier settings (delivery fee...) must be in memory before the first cart request.
.then(()=>require('./config/courierSettings.js').loadCourierSettings().catch((err)=>{
    console.error('Could not load courier settings, using .env defaults:', err.message)
}))
.then(()=>{
    const PORT = process.env.PORT || 3000
    app.listen(PORT, ()=>{
        console.log(`Server is running on port ${PORT}`)
    })
    startShipmentSync()
    startJazzCashSync()
})
.catch((error)=>{
    console.log("Conction failed : ",error);
    
})




// ( async ()=>{
//     try {
//         await mongoose.connect(`${process.env.MONGODB_URI}/ecommerce`)
//         app.on("error",(error)=>{
//             console.log("error", error);
            
//         })
//     } catch (error) {
//         console.log("Error",error);
        
//     }
// })()

