# Cloudflare R2 WebDAV Server

Un servidor WebDAV de alto rendimiento construido sobre **Cloudflare Workers** y respaldado por **Cloudflare R2** (Object Storage compatible con S3), utilizando el framework [Hono](https://hono.dev).

Permite conectar clientes WebDAV estándar (como el Explorador de Windows, Finder de macOS, Cyberduck, Infuse, VLC o Kodi) directamente a tu bucket R2 como si fuese un disco o unidad de red compartida.

---

## Características

- **Soporte WebDAV Completo**: Implementa los métodos `OPTIONS`, `PROPFIND`, `GET`, `HEAD`, `PUT`, `DELETE`, `MKCOL`, `COPY`, `MOVE`, `LOCK`, `UNLOCK` y `PROPPATCH`.
- **Streaming Multimedia**: Soporte completo para peticiones por rango (`Range: bytes=...` / `206 Partial Content`), ideal para reproducción fluida de video y audio.
- **Autenticación Básica**: Middleware HTTP Basic Auth configurable mediante variables de entorno (`WEBDAV_USER` y `WEBDAV_PASS`).
- **Detección Automática de MIME Types**: Reconocimiento de tipos para formatos populares de video, audio y archivos generales.
- **Sin Servidores que Mantener (Serverless)**: Escalabilidad global y latencia mínima en el edge de Cloudflare.

---

## Requisitos Previos

- [Node.js](https://nodejs.org/) (v18 o superior) o [Bun](https://bun.sh/)
- Cuenta en [Cloudflare](https://dash.cloudflare.com/) con **R2** habilitado
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) configurado y autenticado (`npx wrangler login`)

---

## Configuración

### 1. Bucket R2 en `wrangler.jsonc`

Verifica que el binding hacia tu bucket de R2 esté correctamente definido en [wrangler.jsonc](file:///c:/proyectos/webdav/wrangler.jsonc):

```jsonc
"r2_buckets": [
  {
    "binding": "MULTIMEDIA",
    "bucket_name": "multimedia",
    "remote": true
  }
]
```

### 2. Variables de Entorno y Credenciales

Para el desarrollo local, puedes definir tus credenciales en un archivo `.dev.vars`:

```env
WEBDAV_USER=admin
WEBDAV_PASS=tu_contraseña_segura
```

Para producción en Cloudflare Workers, añade los secretos mediante Wrangler:

```bash
npx wrangler secret put WEBDAV_USER
npx wrangler secret put WEBDAV_PASS
```

*(Si no se configuran estas variables, el servidor responderá de forma pública sin exigir autenticación).*

---

## Scripts Disponibles

```bash
# Instalar dependencias
npm install

# Iniciar servidor de desarrollo local
npm run dev

# Desplegar en Cloudflare Workers
npm run deploy

# Generar o sincronizar tipos TypeScript basados en Wrangler
npm run cf-typegen
```

---

## Conexión desde Clientes WebDAV

Una vez desplegado tu Worker, obtendrás una URL como `https://webdav.<tu-subdominio>.workers.dev`.

### Windows (Explorador de Archivos)
1. Abre **Este equipo** en el Explorador de Windows.
2. Haz clic derecho y selecciona **Conectar a unidad de red** o **Agregar una ubicación de red**.
3. Ingresa la URL de tu Worker: `https://webdav.<tu-subdominio>.workers.dev/`.
4. Ingresa el usuario (`WEBDAV_USER`) y contraseña (`WEBDAV_PASS`) cuando te lo solicite.

### macOS (Finder)
1. En Finder, presiona `Cmd + K` (o menú **Ir** > **Conectarse al servidor...**).
2. Ingresa `https://webdav.<tu-subdominio>.workers.dev/`.
3. Introduce tus credenciales.

### Clientes de Terceros (Cyberduck, WinSCP, Infuse, Kodi, etc.)
- **Protocolo**: WebDAV (HTTPS)
- **Servidor / Host**: `webdav.<tu-subdominio>.workers.dev`
- **Puerto**: `443`
- **Ruta**: `/`
- **Usuario / Contraseña**: Credenciales definidas en `WEBDAV_USER` y `WEBDAV_PASS`.
