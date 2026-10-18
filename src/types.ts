export interface Env {
  MULTIMEDIA: R2Bucket
  WEBDAV_USER?: string
  WEBDAV_PASS?: string
}

export interface ResourceInfo {
  href: string
  name: string
  isCollection: boolean
  size: number
  lastModified: Date | null
  etag?: string
}
