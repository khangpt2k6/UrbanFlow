# Deploying UrbanFlow (Vercel vs Render)

Short answer: **backend on Render, frontend on Vercel.** They are not interchangeable for this
project - the split is forced by one hard constraint, explained below.

## The deciding constraint: a persistent WebSocket

UrbanFlow's backend is a stateful Spring Boot engine. It runs ~30 long-lived threads, holds the
whole simulated world in memory, and streams it to every browser at ~30 Hz over a STOMP/SockJS
**WebSocket** that stays open for the life of the session.

- **Vercel** runs serverless functions. Each invocation terminates after it responds, so there is
  no persistent process to hold a socket open - Vercel cannot host a WebSocket server, and this is
  still true with Fluid Compute enabled. It also can't keep the in-memory world or the thread pool
  alive between requests. So the backend **cannot** run on Vercel.
- **Render** Web Services are persistent containers (a real JVM that keeps running), and they
  support WebSockets. As of Feb 2026, free Web Services no longer spin down while they are still
  receiving WebSocket messages, which suits a 30 Hz feed. So the backend **fits** Render.

The frontend, by contrast, is a plain static Vite/React build (`dist/`). Static SPAs are exactly
what Vercel is best at (global CDN, instant deploys), though Render can also serve it as a Static
Site. Recommendation: **Vercel for the frontend.**

| | Backend (Spring Boot + WebSocket) | Frontend (static Vite SPA) |
|---|---|---|
| Vercel | No - no persistent WebSocket / process | Yes - ideal |
| Render Web Service | Yes - persistent JVM, WebSockets | Overkill (use a Static Site) |
| Render Static Site | n/a | Yes - fine alternative |

## What was already wired up for deployment

- `frontend` reads the backend URL from `VITE_WS_URL` (falls back to `http://localhost:8080/ws`
  for local dev). See `frontend/.env.example`.
- `backend` binds to `$PORT` in production (`server.port: ${PORT:8080}` in `application.yml`).
- The STOMP endpoint and REST CORS already allow all origins (`setAllowedOriginPatterns("*")`), so
  a cross-origin frontend works without backend changes. Tighten these to your Vercel domain for
  production if you care about who can connect.
- `backend/Dockerfile` - multi-stage Maven build to a slim JRE image.
- `render.yaml` - Render Blueprint that provisions the backend service.
- `frontend/vercel.json` - Vite framework preset + SPA rewrite to `index.html`.

## Step 1 - Backend on Render

1. Push this repo to GitHub (already the case).
2. In Render: **New + -> Blueprint**, select this repo. Render reads `render.yaml` and creates the
   `urbanflow-backend` Docker Web Service (free plan). Or do it manually: **New + -> Web Service**,
   runtime **Docker**, Dockerfile path `backend/Dockerfile`, context `backend`.
3. Deploy. First build takes a few minutes (Maven downloads + image build). Note the public URL,
   e.g. `https://urbanflow-backend.onrender.com`.
4. Sanity check: the WebSocket endpoint is that URL + `/ws`.

Free-tier caveats:
- The instance spins down after 15 minutes with no traffic; the next visitor triggers a ~1 minute
  cold start while the JVM boots. Upgrade to a paid instance to keep it always-on.
- 512 MB RAM. The `JAVA_TOOL_OPTIONS=-Xmx400m` in `render.yaml` keeps the heap under that ceiling.

## Step 2 - Frontend on Vercel

1. In Vercel: **Add New -> Project**, import this repo.
2. Set the **Root Directory** to `frontend` (the Vite app is not at the repo root). Vercel then
   picks up `frontend/vercel.json` automatically.
3. Add an environment variable:
   - `VITE_WS_URL = https://urbanflow-backend.onrender.com/ws` (your Render URL + `/ws`, https).
   It must be set at build time - Vite inlines `import.meta.env.*` into the bundle.
4. Deploy. Open the Vercel URL and press **Launch simulation**.

## Common pitfalls

- **Mixed content / wrong scheme.** `VITE_WS_URL` must be `https://.../ws` (SockJS upgrades it to
  `wss`). An `http://` value from an `https://` page is blocked by the browser.
- **404 on refresh.** Handled by the SPA rewrite in `vercel.json`; if you host the frontend on
  Render Static Site instead, add the same rewrite (`/* -> /index.html`).
- **First load looks frozen.** That is the Render free-tier cold start (~1 min). The status pill
  shows "offline" until the backend is up and the WebSocket connects.
- **Stricter CORS.** To lock it down, replace `setAllowedOriginPatterns("*")` in `StompConfig` (and
  the mapping in `WebConfig`) with your exact Vercel domain, then redeploy the backend.

## Alternatives

- **All-on-Render:** backend as a Web Service + frontend as a Render Static Site - one dashboard,
  one provider, no cross-origin at all if you put them under the same domain with a rewrite.
- **Always-on backend:** any persistent-container host works (Railway, Fly.io, a small VPS). The
  only requirement is "a process that stays running and speaks WebSocket" - the thing Vercel
  fundamentally is not.

## Sources

- [Render: free Web Services stay active while receiving WebSocket messages](https://render.com/changelog/free-web-services-now-remain-active-while-receiving-websocket-messages)
- [Render docs: Deploy for Free (spin-down / cold start)](https://render.com/docs/free)
- [Vercel KB: do Serverless Functions support WebSocket connections?](https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections)
- [Why serverless functions can't host WebSockets (Vercel)](https://ably.com/topic/ai-stack/websockets-on-vercel-why-serverless-functions-cant-host-them)
- [Vercel backend limitations](https://northflank.com/blog/vercel-backend-limitations)
