# Prompt: API Test Playground Page for Rakesh QA Hub

Build a page called **API Test Playground** for the **Rakesh QA Hub**: a lightweight, Postman-style tool where QA can build HTTP requests, send them, check the response, add simple assertions, and save requests into collections for reuse.

## Tech stack

Same as the rest of the hub: Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui, lucide-react, Prisma + PostgreSQL, zod.

- **Route:** `/api-playground`
- **Sidebar:** new group **Automation Tools** (see the master prompt), icon `Send`
- **Accent colour:** indigo

## Layout

- Breadcrumb `< Home`, `Send` icon + title "API Test Playground".
- Subtitle: "Build and send HTTP requests, assert on the response, and save them for later."
- Three areas:
  - **Left (narrow):** Collections sidebar.
  - **Centre/top:** Request builder.
  - **Centre/bottom:** Response viewer + assertion results.
- On small screens, the collections sidebar becomes a dropdown.

## 1. Collections sidebar

- **+ New Collection** button (name required).
- Each collection is collapsible and lists its saved requests, each showing a coloured method badge (GET green, POST amber, PUT blue, PATCH purple, DELETE red) and the request name.
- Click a request to load it into the builder.
- Row actions: rename, duplicate, delete (delete needs the admin passcode).
- Empty state: "No collections yet — create one to save requests."

## 2. Request builder

**Top row:** method dropdown (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS) · URL input (placeholder `https://api.example.com/users`) · **Send** button (indigo) · **Save** button.

**Tabs below:**

| Tab | Content |
|---|---|
| Params | Key/value table with enable checkboxes; kept in sync with the URL query string |
| Headers | Key/value table with enable checkboxes; suggestions for common headers (`Content-Type`, `Authorization`, `Accept`) |
| Auth | None / Bearer token / Basic auth / API key (header or query) |
| Body | None / JSON (code editor with format and validate buttons) / form-urlencoded (key/value) / raw text |
| Assertions | List of checks to run after the response arrives (see below) |

**Environment variables**
- An **Environment** dropdown at the top right (e.g. "Local", "Staging") with a small editor for key/value pairs.
- Use `{{variableName}}` anywhere in the URL, headers, params or body; it is replaced before sending.
- Unknown variables are highlighted in red.

### Assertions

Each assertion row: type · target · operator · expected value · delete icon.

| Type | Example |
|---|---|
| Status code | `equals 200` |
| Response time | `less than 1000` ms |
| Header | `Content-Type` `contains` `application/json` |
| JSON path | `$.data[0].id` `exists` / `equals` / `contains` / `is type` (`string`, `number`, `array`, `object`, `boolean`) |
| Body text | `contains` `"success"` |

## 3. Response viewer

- Status line: status code pill (2xx green, 3xx blue, 4xx amber, 5xx red), response time in ms, size in KB.
- Tabs:
  - **Body:** pretty-printed JSON with collapsible nodes, or raw text; a copy button; search inside.
  - **Headers:** table.
  - **Assertions:** each assertion with ✅ pass / ❌ fail, the actual value, and a summary like "4 of 5 passed".
- **Copy as cURL** button for the current request.
- **History** drawer: last 20 requests sent from this browser (stored in `localStorage`), click to reload.

## How requests are sent (important for a public app)

Requests go through a server route `POST /api/api-playground/send` so CORS doesn't block them. Because the hub is public, this route must be locked down against abuse:

- **Block private and internal addresses:** resolve the hostname and refuse loopback, private ranges (10.x, 172.16–31.x, 192.168.x), link-local (169.254.x, including cloud metadata), `localhost` and IPv6 equivalents. Re-check after redirects.
- Only `http` and `https`.
- Timeout 15 seconds; max response size 2 MB (truncate with a notice); max request body 1 MB.
- Rate limit: 30 sends per 10 minutes per IP.
- Never log request headers or bodies (they may contain tokens).
- Strip hop-by-hop headers; don't forward the visitor's cookies.

## Data model

```ts
ApiCollection   { id, name, sortOrder, createdAt }
ApiRequest      { id, collectionId, name, method, url,
                  params Json, headers Json, auth Json, body Json,
                  assertions Json, sortOrder, createdAt, updatedAt }
ApiEnvironment  { id, name, variables Json, createdAt }
```

Saved auth values are stored as entered; show a warning in the Save dialog: "Saved requests are visible to anyone using this hub — don't save real secrets."

## API routes

| Route | Purpose |
|---|---|
| `POST /api/api-playground/send` | Proxy the request (with the protections above) and return status, headers, body, time, size |
| `GET/POST /api/api-playground/collections` | List / create collections |
| `PATCH/DELETE /api/api-playground/collections/[id]` | Rename / delete (delete needs passcode) |
| `GET/POST /api/api-playground/requests` | List / save requests |
| `PATCH/DELETE /api/api-playground/requests/[id]` | Update / delete (delete needs passcode) |
| `GET/POST/PATCH/DELETE /api/api-playground/environments` | Manage environments |

## Behaviour

- Assertions run on the client after the response arrives.
- Ctrl/Cmd + Enter sends the request.
- Unsaved changes show a dot on the request name; warn before loading another request.
- Import/export a collection as JSON.

## Tests

- Unit tests: variable substitution, JSON path assertions, cURL export, private-IP blocking.
- E2E: create a collection, save a request, send to a public test API (e.g. `https://httpbin.org/get`), assertions show pass/fail. Mock the send route in CI if outbound network is unreliable.
