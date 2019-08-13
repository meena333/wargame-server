const jwt = require('jsonwebtoken')

const secret = process.env.JWT_SECRET || '9rp^findejg&^*&the)DSUA)seCreTs8394jc0de#@sfn,m'

function toJWT(data) {
  return jwt.sign(data, secret, { expiresIn: '2h' })
}

function toData(token) {
  return jwt.verify(token, secret)
}

module.exports = { toJWT, toData }