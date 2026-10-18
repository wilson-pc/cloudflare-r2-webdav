import { ResourceInfo } from '../types'

export function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function encodeHref(path: string): string {
  // Ensure path starts with /
  const normalized = path.startsWith('/') ? path : '/' + path
  // Encode each segment preserving slashes
  return normalized
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

export function buildMultiStatusXml(resources: ResourceInfo[]): string {
  const responsesXml = resources
    .map((res) => {
      const href = encodeHref(res.href)
      const isRoot = res.href === '/' || res.name === '/'
      const nameXml = isRoot || !res.name ? '<d:displayname/>' : `<d:displayname>${escapeXml(res.name)}</d:displayname>`
      const lastMod = res.lastModified ? res.lastModified.toUTCString() : new Date().toUTCString()
      const creationDate = res.lastModified ? res.lastModified.toISOString() : new Date().toISOString()
      const etag = res.etag ? escapeXml(res.etag) : ''

      const resourceType = res.isCollection ? '<d:resourcetype><d:collection/></d:resourcetype>' : '<d:resourcetype/>'
      const contentLengthProp = res.isCollection
        ? ''
        : `<d:getcontentlength>${res.size}</d:getcontentlength>`
      const etagProp = etag ? `<d:getetag>${etag}</d:getetag>` : ''

      return `    <d:response>
      <d:href>${href}</d:href>
      <d:propstat>
        <d:prop>
          ${nameXml}
          ${resourceType}
          ${contentLengthProp}
          <d:getlastmodified>${lastMod}</d:getlastmodified>
          <d:creationdate>${creationDate}</d:creationdate>
          ${etagProp}
        </d:prop>
        <d:status>HTTP/1.1 200 OK</d:status>
      </d:propstat>
    </d:response>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:">
${responsesXml}
</d:multistatus>`
}

export function buildLockResponseXml(path: string, lockToken: string): string {
  const href = encodeHref(path)
  return `<?xml version="1.0" encoding="utf-8"?>
<d:prop xmlns:d="DAV:">
  <d:lockdiscovery>
    <d:activelock>
      <d:locktype><d:write/></d:locktype>
      <d:lockscope><d:exclusive/></d:lockscope>
      <d:depth>infinity</d:depth>
      <d:owner>WebDAV Proxy</d:owner>
      <d:timeout>Second-3600</d:timeout>
      <d:locktoken>
        <d:href>${lockToken}</d:href>
      </d:locktoken>
      <d:lockroot>
        <d:href>${href}</d:href>
      </d:lockroot>
    </d:activelock>
  </d:lockdiscovery>
</d:prop>`
}
