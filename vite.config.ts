import { defineConfig, loadEnv, type ProxyOptions, type UserConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Optional same-origin proxy to Traccar.
 *
 * Traccar authenticates its WebSocket by session cookie and nothing else, and
 * on Traccar 4 that cookie arrives without a SameSite attribute — Chrome
 * reports `SameSiteUnspecifiedTreatedAsLax` and refuses to store it, so a page
 * on a different origin can never send it. Serving Traccar from the app's own
 * origin removes the problem entirely: the cookie is then first-party and
 * SameSite does not apply.
 *
 * Set VITE_TRACCAR_ORIGIN to switch it on, and point the Traccar URLs at the
 * proxied paths:
 *
 *   VITE_TRACCAR_ORIGIN=https://old.malimspotter.dz
 *   VITE_TRACCAR_URL=/traccar
 *   VITE_TRACCAR_WS_URL=/traccar/socket
 *
 * This is the development equivalent of the nginx `location /traccar/` block
 * production needs. Left unset, nothing is proxied and the config is unchanged.
 */
async function traccarSession(env: Record<string, string>): Promise<string> {
  const origin = env.VITE_TRACCAR_ORIGIN
  const cookiesFrom = (res: Response) =>
    (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')

  try {
    // A login is the documented way to open a session and the only reliable
    // one here: GET /session?token= answers 404 on this server and hands back
    // an anonymous cookie, which then fails every authenticated call.
    if (env.VITE_TRACCAR_USER && env.VITE_TRACCAR_PASSWORD) {
      const res = await fetch(`${origin}/api/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          email: env.VITE_TRACCAR_USER,
          password: env.VITE_TRACCAR_PASSWORD,
        }),
      })

      if (res.ok) return cookiesFrom(res)
    }

    const res = await fetch(
      `${origin}/api/session?token=${encodeURIComponent(env.VITE_TRACCAR_TOKEN)}`
    )

    return res.ok ? cookiesFrom(res) : ''
  } catch {
    return ''
  }
}

export default defineConfig(async ({ mode }): Promise<UserConfig> => {
  const env = loadEnv(mode, process.cwd(), '')
  const origin = env.VITE_TRACCAR_ORIGIN

  // The proxy authenticates once, server-side, where no cookie policy applies.
  const cookie = origin ? await traccarSession(env) : ''

  if (origin) {
    console.log(`[traccar proxy] ${origin} -> /traccar   session: ${cookie ? 'ok' : 'FAILED'}`)
  }

  const traccar: ProxyOptions = {
    target: origin,
    changeOrigin: true,
    ws: true,
    rewrite: (path) => path.replace(/^\/traccar/, '/api'),
    configure: (proxy) => {
      proxy.on('proxyReq', (proxyReq) => {
        if (cookie) proxyReq.setHeader('Cookie', cookie)
      })
      proxy.on('proxyReqWs', (proxyReq) => {
        if (cookie) proxyReq.setHeader('Cookie', cookie)
      })
    },
  }

  return {
    plugins: [react()],
    server: {
      host: true,
      port: 5173,
      strictPort: true,
      proxy: origin ? { '/traccar': traccar } : undefined,
    },
  }
})
