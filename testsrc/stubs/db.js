
let proxyquire = require('proxyquire')
let electron = require('./electron')

let noop = async () => undefined

let self = {
  '@noCallThru': true
}

let db = proxyquire('../../app/util/db', electron)

Object.keys(db).forEach((key) => {
  self[key] = noop
})

db.promised_methods.forEach((key) => {
  self[key] = noop
})

module.exports = self
