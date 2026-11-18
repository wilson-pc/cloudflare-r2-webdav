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
      const nameXml = isRoot || !res.name ? '<D:displayname/>' : `<D:displayname>${escapeXml(res.name)}</D:displayname>`
      const lastMod = res.lastModified ? res.lastModified.toUTCString() : new Date().toUTCString()
      const creationDate = res.lastModified ? res.lastModified.toISOString() : new Date().toISOString()
      const etag = res.etag ? escapeXml(res.etag) : ''

      const resourceType = res.isCollection ? '<D:resourcetype><D:collection/></D:resourcetype>' : '<D:resourcetype/>'
      const contentLengthProp = res.isCollection
        ? '<D:getcontentlength>0</D:getcontentlength>'
        : `<D:getcontentlength>${res.size}</D:getcontentlength>`
      const contentTypeProp = res.isCollection
        ? '<D:getcontenttype>httpd/unix-directory</D:getcontenttype>'
        : `<D:getcontenttype>${escapeXml(res.contentType || 'application/octet-stream')}</D:getcontenttype>`
      const etagProp = etag ? `<D:getetag>${etag}</D:getetag>` : ''

      return `    <D:response>
      <D:href>${href}</D:href>
      <D:propstat>
        <D:prop>
          ${nameXml}
          ${resourceType}
          ${contentLengthProp}
          ${contentTypeProp}
          <D:getlastmodified>${lastMod}</D:getlastmodified>
          <D:creationdate>${creationDate}</D:creationdate>
          ${etagProp}
        </D:prop>
        <D:status>HTTP/1.1 200 OK</D:status>
      </D:propstat>
    </D:response>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:">
${responsesXml}
</D:multistatus>`
}

export function buildLockResponseXml(path: string, lockToken: string): string {
  const href = encodeHref(path)
  return `<?xml version="1.0" encoding="utf-8"?>
<D:prop xmlns:D="DAV:">
  <D:lockdiscovery>
    <D:activelock>
      <D:locktype><D:write/></D:locktype>
      <D:lockscope><D:exclusive/></D:lockscope>
      <D:depth>infinity</D:depth>
      <D:owner>WebDAV Proxy</D:owner>
      <D:timeout>Second-3600</D:timeout>
      <D:locktoken>
        <D:href>${lockToken}</D:href>
      </D:locktoken>
      <D:lockroot>
        <D:href>${href}</D:href>
      </D:lockroot>
    </D:activelock>
  </D:lockdiscovery>
</D:prop>`
}
