// const log = require('book')
const Koa = require('koa')
const tldjs = require('tldjs')
const {Debug} = require('@secrez/utils')
const http = require('http')
const Router = require('koa-router')
const {version} = require('../package.json')
const {Crypto, Secrez} = require('@secrez/core')

const ClientManager = require('./lib/ClientManager')
const debug = Debug('hub:server')
const {getRandomId, isValidRandomId} = require('./utils')

const allIds = {}

module.exports = function (opt) {
  opt = opt || {}

  const validHosts = (opt.domain) ? [opt.domain] : undefined
  const myTldjs = tldjs.fromUserSettings({validHosts})
  const landingPage = opt.landing

  function GetClientIdFromHostname(hostname) {
    return myTldjs.getSubdomain(hostname)
  }

  const manager = new ClientManager(opt)

  const schema = opt.secure ? 'https' : 'http'

  const app = new Koa()
  const router = new Router()

  function error(ctx, code, message) {
    debug('Error %s "%s"', code, message)
    const result = {
      status_code: code,
      message: message
    }
    ctx.status = code
    ctx.body = result
  }

  router.get('/api/v1/status', async (ctx, next) => {
    const stats = manager.stats
    ctx.body = {
      tunnels: stats.tunnels,
      mem: process.memoryUsage(),
    }
  })

  router.get('/api/v1/tunnels/:id/status', async (ctx, next) => {
    const clientId = ctx.params.id
    const client = manager.getClient(clientId)
    if (!client) {
      error(ctx, 404, 'Not found')
      return
    }

    const stats = client.stats()
    ctx.body = {
      connected_sockets: stats.connectedSockets,
    }
  })

  router.get('/api/v1/tunnel/new', async (ctx, next) => {
    let payload, signature, id, publicKey, reqId
    try {
      let q = ctx.request.query
      payload = q.payload
      signature = q.signature
      let parsedPayload = JSON.parse(payload)
      id = parsedPayload.id
      publicKey = parsedPayload.publicKey
      reqId = id !== 0 ? id : undefined
    } catch(e) {
      error(ctx, 400, 'Wrong parameters')
      return
    }
    if (!Secrez.isValidPublicKey(publicKey)) {
      error(ctx, 400, 'Wrong public key')
      return
    }
    let signPublicKey = Secrez.getSignPublicKey(publicKey)
    if (!Crypto.verifySignature(payload, signature, signPublicKey)) {
      error(ctx, 400, 'Wrong signature')
      return
    }
    if (reqId) {
      if (!isValidRandomId(reqId)) {
        error(ctx, 400, 'Wrong requested id')
        return
      }
    }
    if (!reqId) {
      reqId = getRandomId(publicKey, allIds)
    }
    if (manager.hasClient(reqId)) {
      debug('returning existed client with id %s', reqId)
      ctx.body = manager.getClient(reqId)
      return
    }
    debug('making new client with id %s', reqId)
    const info = await manager.newClient(reqId, debug)

    const url = schema + '://' + info.id + '.' + ctx.request.host
    info.url = url
    ctx.body = info
    allIds[reqId] = true
  })

  router.get('/api/v1/courier/:cmd', async (ctx, next) => {

    const hostname = ctx.request.headers.host
    const clientId = GetClientIdFromHostname(hostname)

    if (!clientId) {
      const result = {
        status_code: 400,
        message: 'Missed id'
      }
      ctx.status = 400
      ctx.body = result
      return
    }

    const client = manager.getClient(clientId)

    if (!client) {
      const result = {
        status_code: 404,
        message: 'Not found'
      }
      ctx.status = 404
      ctx.body = result
      return
    }

    client.handleRequest(ctx.request, ctx.response)

  })

  app.use(router.routes())
  app.use(router.allowedMethods())

  // root endpoint
  app.use(async (ctx, next) => {
    const path = ctx.request.path

    const hostname = ctx.request.headers.host

    // skip anything not on the root path
    if (path !== '/' || GetClientIdFromHostname(hostname)) {
      await next()
      return
    }
    if (landingPage) {
      // no new client request, send to landing page
      ctx.redirect(landingPage)
    } else {
      ctx.body = {
        welcome_to: 'This is a Secrez hub',
        version,
        more_info_at: 'https://secrez.github.io/secrez'
      }
      return
    }
  })

  // anything after the / path is a request for a specific client name
  // This is a backwards compat feature
  // TODO (sullo) extend this for servers that cannot handle subdomains
  app.use(async (ctx, next) => {
    const parts = ctx.request.path.split('/')

    // any request with several layers of paths is not allowed
    // rejects /foo/bar
    // allow /foo
    if (parts.length !== 2) {
      await next()
      return
    }

    const reqId = parts[1]

    if (!isValidRandomId(reqId)) {
      error(ctx, 400, 'Wrong requested id')
      return
    }

    debug('making new client with id %s', reqId)
    const info = await manager.newClient(reqId)

    const url = schema + '://' + info.id + '.' + ctx.request.host
    info.url = url
    ctx.body = info
    return
  })

  const server = http.createServer()

  const appCallback = app.callback()

  server.on('request', (req, res) => {
    // without a hostname, we won't know who the request is for

    const hostname = req.headers.host

    debug('hostname %s', hostname)

    if (!hostname) {
      res.statusCode = 400
      let result = {
        status_code: 400,
        message: 'Host header is required'
      }
      res.end(JSON.stringify(result))
      return
    }

    let clientId = GetClientIdFromHostname(hostname)

    debug('clientId %s', clientId, hostname)

    if (!clientId) {
      appCallback(req, res)
      return
    }

    const client = manager.getClient(clientId)

    if (!client) {
      res.statusCode = 404
      let result = {
        status_code: 404,
        message: 'Not found'
      }
      res.end(JSON.stringify(result))
      return
    }

    client.handleRequest(req, res)
  })

  server.on('upgrade', (req, socket, head) => {

    const hostname = req.headers.host
    if (!hostname) {
      socket.destroy()
      return
    }

    const clientId = GetClientIdFromHostname(hostname)
    if (!clientId) {
      socket.destroy()
      return
    }

    const client = manager.getClient(clientId)

    if (!client) {
      socket.destroy()
      return
    }

    client.handleUpgrade(req, socket)
  })

  return server
}
