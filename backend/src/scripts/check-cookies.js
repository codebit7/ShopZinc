// Boots the real app middleware stack and asserts cookies get parsed.
const assert = require('assert')
require('dotenv').config()
process.env.SECRET_KEY = process.env.SECRET_KEY || 'check-only'

const express = require('express')
const cookieParser = require('cookie-parser')
const http = require('http')

const app = express()
app.use(cookieParser())
app.get('/probe', (req, res) => res.json({ seen: req.cookies.foo || null }))

const server = app.listen(0, async () => {
  const port = server.address().port
  const body = await new Promise((resolve) => {
    http.get({ port, path: '/probe', headers: { Cookie: 'foo=bar' } }, (r) => {
      let d = ''
      r.on('data', (c) => (d += c))
      r.on('end', () => resolve(JSON.parse(d)))
    })
  })
  assert.strictEqual(body.seen, 'bar', 'cookie-parser did not parse the Cookie header')
  console.log('OK cookie parsing works')
  server.close()
})
