const jwt = require('jsonwebtoken')

const verifyToken = (req, res, next) => {
    // The httpOnly cookie is the real transport now. The Bearer header stays
    // as a fallback so Postman and existing tooling keep working.
    const token = req.cookies?.accessToken
        || req.header('Authorization')?.replace('Bearer ', '')

    // 401, not 400: the frontend interceptor keys off 401 to trigger a
    // refresh-and-retry. A 400 here would silently break that.
    if (!token) return res.status(401).json({ message: "Unauthorized" })

    try {
        req.user = jwt.verify(token, process.env.SECRET_KEY)
        next()
    } catch (error) {
        return res.status(401).json({ message: "Unauthorized" })
    }
}

module.exports = verifyToken
