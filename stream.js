require('dotenv').config()
const express = require('express')
const bodyParser = require('body-parser')

const app = express()
app.use(bodyParser.json())

app.get('/', (req, res) => {
  res.sendStatus(418)
})

app.get('/info', (req, res) => {
  res.status(200).send(process.env.npm_package_name + ' v' + process.env.npm_package_version)
})

app.get('/ping', (req, res) => {
  res.sendStatus(200)
})

app.post('/', (req, res) => {
  const debug = (process.env.DEBUG == 1 || process.env.DEBUG == true) ? true : false

  const body = req.body.body
  const number = req.body.from
  if(typeof body === 'string' && body.trim().length === 0) {
    let error = 'Err(1): Empty message'
    let emptyerror = { "id": null, "message": error, "sent": false, "error": "Empty message", "errno": 1, "date": timestamp() }
    if(debug) console.error('Err(1)', emptyerror)
    return callback(JSON.stringify(emptyerror), null, res, 422)
  }
  const provider = (process.env.PROVIDER.endsWith('/') ? process.env.PROVIDER : process.env.PROVIDER + '/') + process.env.ENDPOINT

  const txms = require('txms.js')
  const axios = require('axios')

  const parts = body.split(/\u000a/u)

  parts.forEach(function (msg, index) {
    let rawmsg = msg.trim()
    const hextest = /^(0[xX])?[0-9a-fA-F]+$/
    let hextx = ''
    if (hextest.test(rawmsg)) {
      if (rawmsg.toLowerCase().startsWith('0x')) {
        hextx = rawmsg
      } else {
        hextx = '0x' + rawmsg
      }
      if(debug) console.log('Info', 'HEX message: ' + hextx)
    } else if(typeof rawmsg === 'string' && rawmsg.length !== 0) {
      hextx = txms.decode(rawmsg)
      if(debug) console.log('Info', 'TxMS message: ' + hextx)
    } else {
      let error = 'Err(2): Empty message part'
      let perror = { "id": null, "message": error, "sent": false, "error": "Empty message part", "errno": 2, "date": timestamp() }
      if(debug) console.error('Err(2)', perror)
      return callback(JSON.stringify(perror), null, res, 422)
    }

    axios.post(provider, hextx, {
      headers: {
        'Content-Type': 'text/plain',
        'User-Agent': 'txms'
      }
    })
    .then(function (response) {
      if(response.result) {
        let ok = 'OK: <'+hextx.substring(2, 5)+hextx.slice(-3)+'> '+response.result
        let oks = { "message": ok, "sent": true, "hash": response.result, "date": timestamp() }
        if(debug) console.log('OK', oks)
        return callback(null, JSON.stringify(oks), res, 200)
      } else {
        let ok = 'OK: <'+hextx.substring(2, 5)+hextx.slice(-3)+'>'
        let oks = { "message": ok, "sent": true, "date": timestamp() }
        if(debug) console.log('OK', oks)
        return callback(null, JSON.stringify(oks), res, 200)
      }
    })
    .catch(function (err) {
      let error = 'Err(3): <'+hextx.substring(2, 5)+hextx.slice(-3)+'>'
      let errors = { "message": error, "sent": false, "error": err.message, "errno": 3, "date": timestamp() }
      if(debug) console.error('Err(3)', errors)
      return callback(JSON.stringify(errors), null, res, 500)
    })
  })
})

function callback(error, ok, res, code) {
  if (ok) {
    res.status((code ? code : 200)).send(ok)
  } else if (error) {
    res.status((code ? code : 500)).send(error)
  } else {
    res.sendStatus(500)
  }
}

function timestamp() {
  return new Date().toISOString()
}

const port = 8080
app.listen(port, () => console.log(`App running on port ${port}`))
