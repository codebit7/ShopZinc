const assert = require('assert')
const User = require('../models/userModel.js')

const paths = User.schema.paths
assert.ok(paths.isVerified, 'userModel needs an isVerified path')
assert.strictEqual(paths.isVerified.options.default, false, 'isVerified must default to false')
assert.ok(paths.verifyTokenHash, 'userModel needs verifyTokenHash')
assert.ok(paths.verifyTokenExpires, 'userModel needs verifyTokenExpires')
console.log('OK user verification fields present')
