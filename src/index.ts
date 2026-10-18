import { Hono } from 'hono'
import { Env } from './types'
import { handleWebDAV } from './webdav/handler'

const app = new Hono<{ Bindings: Env }>()

const webdavMethods = [
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'DELETE',
  'OPTIONS',
  'PROPFIND',
  'MKCOL',
  'COPY',
  'MOVE',
  'LOCK',
  'UNLOCK',
  'PROPPATCH',
]

// Basic Auth Middleware applied to all WebDAV methods
app.on(webdavMethods, '*', async (c, next) => {
  const { WEBDAV_USER, WEBDAV_PASS } = c.env

  if (WEBDAV_USER && WEBDAV_PASS) {
    const authHeader = c.req.header('Authorization')
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      return new Response('Unauthorized', {
        status: 401,
        headers: {
          'WWW-Authenticate': 'Basic realm="WebDAV Server"',
        },
      })
    }

    const base64Credentials = authHeader.slice(6).trim()
    try {
      const credentials = atob(base64Credentials)
      const [reqUser, reqPass] = credentials.split(':')

      if (reqUser !== WEBDAV_USER || reqPass !== WEBDAV_PASS) {
        return new Response('Unauthorized', {
          status: 401,
          headers: {
            'WWW-Authenticate': 'Basic realm="WebDAV Server"',
          },
        })
      }
    } catch {
      return new Response('Unauthorized', {
        status: 401,
        headers: {
          'WWW-Authenticate': 'Basic realm="WebDAV Server"',
        },
      })
    }
  }

  await next()
})

app.on(webdavMethods, '*', (c) => {
  return handleWebDAV(c)
})

export default app
