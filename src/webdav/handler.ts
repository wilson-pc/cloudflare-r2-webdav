import { Context } from 'hono'
import { Env, ResourceInfo } from '../types'
import { buildMultiStatusXml, buildLockResponseXml } from './xml'

export async function handleWebDAV(c: Context<{ Bindings: Env }>): Promise<Response> {
  const method = c.req.method.toUpperCase()
  const bucket = c.env.MULTIMEDIA

  if (!bucket) {
    return c.text('R2 bucket binding "MULTIMEDIA" is missing.', 500)
  }

  const url = new URL(c.req.url)
  const pathname = decodeURIComponent(url.pathname)
  const cleanKey = pathname.replace(/^\/+/, '')

  switch (method) {
    case 'OPTIONS':
      return handleOptions()

    case 'PROPFIND':
      return handlePropfind(c, bucket, pathname, cleanKey)

    case 'GET':
    case 'HEAD':
      return handleGetOrHead(c, bucket, cleanKey, method === 'HEAD')

    case 'PUT':
      return handlePut(c, bucket, cleanKey)

    case 'MKCOL':
      return handleMkcol(c, bucket, cleanKey)

    case 'DELETE':
      return handleDelete(c, bucket, cleanKey)

    case 'COPY':
    case 'MOVE':
      return handleCopyOrMove(c, bucket, cleanKey, method === 'MOVE')

    case 'LOCK':
      return handleLock(c, pathname)

    case 'UNLOCK':
      return new Response(null, { status: 204 })

    case 'PROPPATCH':
      return handleProppatch(pathname)

    default:
      return c.text('Method Not Allowed', 405)
  }
}

const MIME_TYPES: Record<string, string> = {
  // Video
  mp4: 'video/mp4',
  mkv: 'video/x-matroska',
  webm: 'video/webm',
  avi: 'video/x-msvideo',
  mov: 'video/quicktime',
  m4v: 'video/x-m4v',
  ts: 'video/mp2t',
  m3u8: 'application/x-mpegURL',
  mpd: 'application/dash+xml',
  flv: 'video/x-flv',
  wmv: 'video/x-ms-wmv',
  ogv: 'video/ogg',
  vob: 'video/x-ms-vob',
  // Audio
  mp3: 'audio/mpeg',
  flac: 'audio/flac',
  aac: 'audio/aac',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  opus: 'audio/opus',
}

function getMimeType(key: string, existingContentType?: string): string {
  if (existingContentType && existingContentType !== 'application/octet-stream') {
    return existingContentType
  }
  const ext = key.split('.').pop()?.toLowerCase()
  if (ext && MIME_TYPES[ext]) {
    return MIME_TYPES[ext]
  }
  return existingContentType || 'application/octet-stream'
}

function parseRangeHeader(rangeHeader: string): R2Range | undefined {
  const suffixMatch = rangeHeader.match(/bytes=\s*-\s*(\d+)/i)
  if (suffixMatch) {
    const suffix = parseInt(suffixMatch[1], 10)
    if (!isNaN(suffix) && suffix > 0) {
      return { suffix }
    }
  }

  const rangeMatch = rangeHeader.match(/bytes=\s*(\d+)-(\d+)?/i)
  if (rangeMatch) {
    const offset = parseInt(rangeMatch[1], 10)
    if (!isNaN(offset)) {
      const end = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : undefined
      if (end !== undefined && !isNaN(end) && end >= offset) {
        const length = end - offset + 1
        return { offset, length }
      }
      return { offset }
    }
  }

  return undefined
}

function handleOptions(): Response {
  return new Response(null, {
    status: 200,
    headers: {
      'DAV': '1, 2',
      'Allow': 'OPTIONS, GET, HEAD, POST, PUT, DELETE, PROPFIND, MKCOL, COPY, MOVE, LOCK, UNLOCK, PROPPATCH',
      'MS-Author-Via': 'DAV',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'OPTIONS, GET, HEAD, POST, PUT, DELETE, PROPFIND, MKCOL, COPY, MOVE, LOCK, UNLOCK, PROPPATCH',
      'Access-Control-Allow-Headers': 'Authorization, Depth, Content-Type, Range, Destination, If-Match, If-None-Match, If-Modified-Since, If-Unmodified-Since',
      'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges, ETag, Last-Modified, Content-Type, DAV, Lock-Token',
    },
  })
}

async function handlePropfind(
  c: Context,
  bucket: R2Bucket,
  pathname: string,
  cleanKey: string
): Promise<Response> {
  const depthHeader = c.req.header('Depth') ?? '1'
  const depth = depthHeader === '0' ? 0 : 1

  const isRoot = cleanKey === '' || cleanKey === '/'

  const resources: ResourceInfo[] = []

  if (isRoot) {
    resources.push({
      href: '/',
      name: '/',
      isCollection: true,
      size: 0,
      lastModified: new Date(),
    })

    if (depth === 1) {
      const list = await bucket.list({ prefix: '', delimiter: '/' })

      for (const prefix of list.delimitedPrefixes) {
        const folderName = prefix.replace(/\/$/, '')
        resources.push({
          href: '/' + prefix,
          name: folderName,
          isCollection: true,
          size: 0,
          lastModified: new Date(),
        })
      }

      for (const obj of list.objects) {
        if (obj.key === '' || obj.key.endsWith('/')) continue
        resources.push({
          href: '/' + obj.key,
          name: obj.key,
          isCollection: false,
          size: obj.size,
          lastModified: obj.uploaded,
          etag: obj.httpEtag,
        })
      }
    }
  } else {
    const isExplicitCollection = pathname.endsWith('/') || cleanKey.endsWith('/')
    const cleanKeyNoSlash = cleanKey.replace(/\/$/, '')
    const prefix = cleanKeyNoSlash + '/'

    let isCollection = false
    let isFile = false
    let fileObj: R2Object | null = null

    if (!isExplicitCollection) {
      // Check if an exact file object exists (that does not end with /)
      fileObj = await bucket.head(cleanKeyNoSlash)
      if (fileObj && !fileObj.key.endsWith('/')) {
        isFile = true
      }
    }

    if (!isFile) {
      // Query R2 for collection matching this directory prefix
      const list = await bucket.list({ prefix, delimiter: '/', limit: 1000 })
      if (list.objects.length > 0 || list.delimitedPrefixes.length > 0) {
        isCollection = true

        const folderName = cleanKeyNoSlash.split('/').pop() || cleanKeyNoSlash
        const folderHref = pathname.endsWith('/') ? pathname : pathname + '/'

        resources.push({
          href: folderHref,
          name: folderName,
          isCollection: true,
          size: 0,
          lastModified: new Date(),
        })

        if (depth === 1) {
          for (const dirPrefix of list.delimitedPrefixes) {
            const subName = dirPrefix.slice(prefix.length).replace(/\/$/, '')
            resources.push({
              href: '/' + dirPrefix,
              name: subName,
              isCollection: true,
              size: 0,
              lastModified: new Date(),
            })
          }

          for (const obj of list.objects) {
            if (obj.key === prefix || obj.key.endsWith('/')) continue
            const fileName = obj.key.slice(prefix.length)
            if (!fileName) continue
            resources.push({
              href: '/' + obj.key,
              name: fileName,
              isCollection: false,
              size: obj.size,
              lastModified: obj.uploaded,
              etag: obj.httpEtag,
            })
          }
        }
      }
    }

    if (isFile && fileObj) {
      const name = cleanKeyNoSlash.split('/').pop() || cleanKeyNoSlash
      resources.push({
        href: pathname,
        name,
        isCollection: false,
        size: fileObj.size,
        lastModified: fileObj.uploaded,
        etag: fileObj.httpEtag,
      })
    } else if (!isCollection) {
      return new Response('Not Found', { status: 404 })
    }
  }

  const xml = buildMultiStatusXml(resources)

  return new Response(xml, {
    status: 207,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
    },
  })
}

async function handleGetOrHead(
  c: Context,
  bucket: R2Bucket,
  cleanKey: string,
  isHead: boolean
): Promise<Response> {
  const isRoot = cleanKey === '' || cleanKey === '/'

  if (isRoot || cleanKey.endsWith('/')) {
    const html = '<!DOCTYPE html><html><body><h1>WebDAV Server</h1></body></html>'
    const headers = new Headers({
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': html.length.toString(),
      'Access-Control-Allow-Origin': '*',
    })
    return new Response(isHead ? null : html, { status: 200, headers })
  }

  const rangeHeader = c.req.header('Range')
  const rangeOptions = rangeHeader ? parseRangeHeader(rangeHeader) : undefined

  // Optimized handling for HEAD requests
  if (isHead) {
    const headObj = await bucket.head(cleanKey)
    if (!headObj) {
      const prefix = cleanKey + '/'
      const list = await bucket.list({ prefix, delimiter: '/', limit: 1 })
      if (list.objects.length > 0 || list.delimitedPrefixes.length > 0) {
        const html = '<!DOCTYPE html><html><body><h1>WebDAV Server</h1></body></html>'
        const headers = new Headers({
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Length': html.length.toString(),
          'Access-Control-Allow-Origin': '*',
        })
        return new Response(null, { status: 200, headers })
      }
      return new Response('Not Found', { status: 404 })
    }

    const headers = new Headers()
    headers.set('Content-Type', getMimeType(cleanKey, headObj.httpMetadata?.contentType))
    headers.set('Accept-Ranges', 'bytes')
    headers.set('Access-Control-Allow-Origin', '*')
    headers.set('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges, ETag, Last-Modified, Content-Type')
    headers.set('Cache-Control', 'public, max-age=3600, s-maxage=86400')

    if (headObj.httpEtag) {
      headers.set('ETag', headObj.httpEtag)
    }
    if (headObj.uploaded) {
      headers.set('Last-Modified', headObj.uploaded.toUTCString())
    }

    if (rangeOptions) {
      let offset = 0
      let length = headObj.size

      if ('suffix' in rangeOptions) {
        length = Math.min(rangeOptions.suffix, headObj.size)
        offset = Math.max(0, headObj.size - length)
      } else {
        offset = rangeOptions.offset ?? 0
        if (rangeOptions.length !== undefined) {
          length = Math.min(rangeOptions.length, headObj.size - offset)
        } else {
          length = headObj.size - offset
        }
      }

      const end = Math.max(offset, offset + length - 1)
      headers.set('Content-Length', length.toString())
      headers.set('Content-Range', `bytes ${offset}-${end}/${headObj.size}`)
      return new Response(null, { status: 206, headers })
    }

    headers.set('Content-Length', headObj.size.toString())
    return new Response(null, { status: 200, headers })
  }

  // GET request
  const object = await bucket.get(cleanKey, rangeOptions ? { range: rangeOptions } : undefined)

  if (!object) {
    const prefix = cleanKey + '/'
    const list = await bucket.list({ prefix, delimiter: '/', limit: 1 })
    if (list.objects.length > 0 || list.delimitedPrefixes.length > 0) {
      const html = '<!DOCTYPE html><html><body><h1>WebDAV Server</h1></body></html>'
      const headers = new Headers({
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': html.length.toString(),
        'Access-Control-Allow-Origin': '*',
      })
      return new Response(html, { status: 200, headers })
    }

    return new Response('Not Found', { status: 404 })
  }

  const headers = new Headers()
  headers.set('Content-Type', getMimeType(cleanKey, object.httpMetadata?.contentType))
  headers.set('Accept-Ranges', 'bytes')
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges, ETag, Last-Modified, Content-Type')
  headers.set('Cache-Control', 'public, max-age=3600, s-maxage=86400')

  if (object.httpEtag) {
    headers.set('ETag', object.httpEtag)
  }
  if (object.uploaded) {
    headers.set('Last-Modified', object.uploaded.toUTCString())
  }

  if (rangeHeader && object.range) {
    const r = object.range as { offset: number; length: number }
    headers.set('Content-Length', r.length.toString())
    headers.set('Content-Range', `bytes ${r.offset}-${r.offset + r.length - 1}/${object.size}`)
    return new Response(object.body, { status: 206, headers })
  }

  headers.set('Content-Length', object.size.toString())
  return new Response(object.body, { status: 200, headers })
}

async function handlePut(c: Context, bucket: R2Bucket, cleanKey: string): Promise<Response> {
  if (!cleanKey) {
    return new Response('Bad Request', { status: 400 })
  }

  const body = c.req.raw.body
  const contentType = c.req.header('Content-Type') || 'application/octet-stream'

  await bucket.put(cleanKey, body, {
    httpMetadata: { contentType },
  })

  return new Response(null, { status: 201 })
}

async function handleMkcol(c: Context, bucket: R2Bucket, cleanKey: string): Promise<Response> {
  if (!cleanKey) {
    return new Response('Bad Request', { status: 400 })
  }

  const folderKey = cleanKey.endsWith('/') ? cleanKey : cleanKey + '/'
  await bucket.put(folderKey, new Uint8Array(0))

  return new Response(null, { status: 201 })
}

async function handleDelete(c: Context, bucket: R2Bucket, cleanKey: string): Promise<Response> {
  if (!cleanKey) {
    return new Response('Forbidden', { status: 403 })
  }

  // Delete single file if present
  await bucket.delete(cleanKey)

  // Also delete directory prefix if collection
  const prefix = cleanKey.endsWith('/') ? cleanKey : cleanKey + '/'
  let truncated = true
  let cursor: string | undefined

  while (truncated) {
    const list = await bucket.list({ prefix, cursor })
    if (list.objects.length > 0) {
      await bucket.delete(list.objects.map((obj) => obj.key))
    }
    truncated = list.truncated
    cursor = list.truncated ? list.cursor : undefined
  }

  return new Response(null, { status: 204 })
}

async function handleCopyOrMove(
  c: Context,
  bucket: R2Bucket,
  srcKey: string,
  isMove: boolean
): Promise<Response> {
  const destHeader = c.req.header('Destination')
  if (!destHeader) {
    return new Response('Bad Request: Missing Destination header', { status: 400 })
  }

  const destUrl = new URL(destHeader, c.req.url)
  const destPath = decodeURIComponent(destUrl.pathname)
  const destKey = destPath.replace(/^\/+/, '')

  if (!srcKey || !destKey) {
    return new Response('Bad Request', { status: 400 })
  }

  // Check if single object
  const srcObj = await bucket.get(srcKey)

  if (srcObj) {
    await bucket.put(destKey, srcObj.body, {
      httpMetadata: srcObj.httpMetadata,
    })
    if (isMove) {
      await bucket.delete(srcKey)
    }
    return new Response(null, { status: 201 })
  }

  // Check if collection
  const srcPrefix = srcKey.endsWith('/') ? srcKey : srcKey + '/'
  const destPrefix = destKey.endsWith('/') ? destKey : destKey + '/'

  const list = await bucket.list({ prefix: srcPrefix })
  if (list.objects.length === 0) {
    return new Response('Source Not Found', { status: 404 })
  }

  for (const obj of list.objects) {
    const relative = obj.key.slice(srcPrefix.length)
    const targetKey = destPrefix + relative

    const item = await bucket.get(obj.key)
    if (item) {
      await bucket.put(targetKey, item.body, {
        httpMetadata: item.httpMetadata,
      })
      if (isMove) {
        await bucket.delete(obj.key)
      }
    }
  }

  return new Response(null, { status: 201 })
}

function handleLock(c: Context, pathname: string): Response {
  const lockToken = `urn:uuid:${crypto.randomUUID()}`
  const xml = buildLockResponseXml(pathname, lockToken)

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Lock-Token': `<${lockToken}>`,
    },
  })
}

function handleProppatch(pathname: string): Response {
  const href = encodeURI(pathname)
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:">
  <d:response>
    <d:href>${href}</d:href>
    <d:propstat>
      <d:prop/>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>`

  return new Response(xml, {
    status: 207,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
    },
  })
}
