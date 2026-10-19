# Client Hub API

Base: environment-configured backend `/api`. The browser uses the same-origin Next proxy. Dates/times are ISO 8601; date-only target dates are YYYY-MM-DD. IDs are UUIDs. Tenant and responsible-user IDs are derived by the server and are never accepted in mutation payloads.

## Authentication and permissions

Backend protected requests require `Authorization: Bearer <JWT>`. Tokens must have a valid HS256 signature, configured issuer/audience, expiry and UUID subject. Active user/agency/role/permissions are loaded from PostgreSQL on each request; token tenant and permission claims are ignored.

The seeded local adapter exposes POST /auth/login only when explicitly enabled outside production. JSON: `{ "email": "...", "password": "..." }`. Backend success data: `{ accessToken, expiresIn: 3600, user: { displayName, email } }`. Password hashes never leave the backend. Eight attempts per email are allowed per 15-minute process-local window. Replace this adapter with shared Agency OS identity for integration.

The Next proxy consumes the token server-side and returns only `{ user }`, storing an HttpOnly, SameSite=Strict cookie (Secure in production). Mutations require an exact configured Origin. POST /api/auth/logout clears the browser session. GET /api/auth/me returns authenticated actor identity and permission keys. A revoked or disabled user is rejected even if the token is unexpired.

## Exact JSON envelopes

Every JSON success:

```json
{
  "success": true,
  "data": {},
  "message": "Operation completed successfully"
}
```

Every error:

```json
{
  "success": false,
  "message": "Human-readable error message",
  "code": "STABLE_ERROR_CODE",
  "details": {}
}
```

Validation uses `details: { errors: string[] }`, without rejected values or DTO objects. No raw database errors or stack traces are returned. A successful file download returns attachment bytes, not a JSON envelope; errors still use the error envelope.

List data is `{ items: T[], total, page, limit, totalPages }`. Query fields: `page` (integer 1-21474836, default 1), `limit` (default 20, maximum 100), `q` (up to 200 characters), `sort=newest|oldest`. Unknown DTO/body/list-query fields are rejected.

## Endpoint reference

All paths below are relative to /api. All protected endpoints may return 401 UNAUTHENTICATED or 403 FORBIDDEN. Tenant-mismatched or unavailable IDs return the same 404 NOT_FOUND as nonexistent records. Creation succeeds with 201; reads/patch/archive succeed with 200.

| Method / path                       | Permission(s)                                          | Input                                                            | Success data                                                                                     |
| ----------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| POST /auth/login                    | Explicitly enabled demo adapter                        | email/password                                                   | Backend token + user; proxy strips token                                                         |
| GET /auth/me                        | Valid user                                             | None                                                             | Actor including server-derived agency and permission keys                                        |
| GET /clients                        | client.read                                            | List query + status=ACTIVE/ARCHIVED                              | Page<Client>                                                                                     |
| POST /clients                       | client.write                                           | Client DTO                                                       | Client                                                                                           |
| PATCH /clients/:id                  | client.write                                           | Full Client DTO + optional status                                | Updated Client                                                                                   |
| GET /clients/:id/hub                | client.read                                            | None                                                             | Hub summary                                                                                      |
| GET /clients/:id/requirements       | client.read, requirement.read                          | List query + requirement status                                  | Page<Requirement>, ordered items and preparer                                                    |
| POST /clients/:id/requirements      | requirement.write                                      | Requirement content DTO                                          | Requirement with items and preparer                                                              |
| GET /requirements/:id               | requirement.read                                       | None                                                             | Full content, permitted related material, confirmed revision summaries, available status actions |
| PATCH /requirements/:id             | requirement.write                                      | Full content DTO + expectedVersion                               | Updated editable requirement                                                                     |
| PATCH /requirements/:id/status      | requirement.write; review additionally when applicable | Status DTO                                                       | Updated requirement including responsible confirmer/time                                         |
| GET /requirements/:id/export        | requirement.read, file.read                            | Optional positive integer version                                | Immutable confirmed snapshot                                                                     |
| GET /clients/:id/communications     | communication.read                                     | List query + type/from/to                                        | Page<Communication>                                                                              |
| POST /clients/:id/communications    | communication.write                                    | Communication DTO                                                | Communication and author summary                                                                 |
| GET /clients/:id/notes              | note.read                                              | List query                                                       | Page<ClientNote>                                                                                 |
| POST /clients/:id/notes             | note.write                                             | Internal note DTO                                                | ClientNote and author summary                                                                    |
| GET /clients/:id/timeline           | timeline.read                                          | List query                                                       | Page<AuditLog>, event type/time/actor                                                            |
| GET /clients/:id/files              | file.read                                              | List query + includeArchived=true/false + optional requirementId | Page<ClientFile>, without storage keys                                                           |
| POST /clients/:id/files             | file.write                                             | Reference DTO                                                    | Reference metadata                                                                               |
| POST /clients/:id/files/upload      | file.write                                             | Multipart file + optional requirementId                          | Private file metadata                                                                            |
| GET /files/:id/download             | file.read                                              | None                                                             | Private attachment bytes                                                                         |
| DELETE /files/:id                   | file.write                                             | None                                                             | { id, archived: true }                                                                           |
| POST /auth/logout (Next proxy only) | Same-origin session                                    | None                                                             | { signedOut: true }                                                                              |

## Shared DTOs

**Client:** name, company and contactName (required strings, 1–160 chars); optional nullable email (valid, <=254), phone (<=50), website (http/https URL without credentials, <=2000). Updates use the complete editable client profile. Status is ACTIVE/ARCHIVED. Archiving retains records; child writes become read-only. Client profile edits may reactivate a client.

**Requirement content:** title (required, 1–180), objective (required, 1–8000), items (1–100), services (array, <=30 names of 1–100 chars), designPreferences, referenceLinks (<=30 http/https URLs without credentials), constraints, assumptions, internalRecommendations, clientNotes, timeline, targetDate, budgetMin, budgetMax, currency. Optional text defaults to empty; services/references default to empty arrays. Text limits: 4000 for design/constraints/assumptions/recommendations/client notes; 2000 for timeline and reference URLs.

Each item: title (required, 1–160), description (<=4000), category (<=80), priority=LOW/MEDIUM/HIGH/MUST_HAVE (default MEDIUM), notes (<=2000). Array order is authoritative; the backend assigns contiguous positions. To add/remove/reorder, send the updated complete array. Browser item IDs/positions and responsible-user fields are rejected.

Budget fields are nullable **decimal strings**, up to 16 integer digits and 2 fractional digits, nonnegative. Currency is a three-uppercase-letter code and is required whenever either amount exists. Minimum must not exceed maximum. PostgreSQL stores Decimal(18,2); serialized decimal strings may omit trailing zeros. Target date is nullable date-only. Budget and timeline are client estimates, not guaranteed commitments.

PATCH content is intentionally a **full content update**, with an additional `expectedVersion` equal to the current **lockVersion**. Unspecified optional content resets to defaults; clients should submit all editable fields as the provided UI does. Do not send an entire read response back because it contains non-editable fields.

Example requirement request:

```json
{
  "title": "Client portal",
  "objective": "Collect clear briefs and approvals",
  "services": ["UX design", "Web application"],
  "items": [
    {
      "title": "Guided brief",
      "description": "Collect structured scope",
      "category": "Feature",
      "priority": "MUST_HAVE",
      "notes": ""
    },
    {
      "title": "Approval history",
      "description": "Show agreed versions",
      "category": "Feature",
      "priority": "HIGH",
      "notes": ""
    }
  ],
  "designPreferences": "Accessible forms and compact navigation",
  "referenceLinks": ["https://example.com"],
  "budgetMin": "300000.00",
  "budgetMax": "500000.00",
  "currency": "LKR",
  "timeline": "Client preference: eight weeks",
  "targetDate": null,
  "constraints": "Client provides content",
  "clientNotes": "Subject to review",
  "assumptions": "Internal assumption: JWT provider is available",
  "internalRecommendations": "Confirm accessibility criteria"
}
```

**Status:** `{ status, expectedVersion, reason? }`. Status actions use lockVersion; content version is separate.

| Current           | Allowed next statuses                  |
| ----------------- | -------------------------------------- |
| DRAFT             | UNDER_REVIEW, ARCHIVED                 |
| UNDER_REVIEW      | CONFIRMED, CHANGES_REQUESTED, ARCHIVED |
| CHANGES_REQUESTED | DRAFT, UNDER_REVIEW, ARCHIVED          |
| CONFIRMED         | DRAFT (new content version), ARCHIVED  |
| ARCHIVED          | None                                   |

Reason is required for change requests, archiving and leaving CONFIRMED. Review permission is additionally required when leaving UNDER_REVIEW/CONFIRMED or requesting changes/confirmation. Writers can submit their editable drafts for review. Backend detail data supplies `allowedTransitions` and `editAllowed`; the UI does not decide workflow authority.

**Communication:** type=CALL/EMAIL/MEETING/WHATSAPP_MESSAGE/VIDEO_MEETING/OTHER; subject (1–180), summary (1–8000), occurredAt (valid ISO datetime), participants (<=50 names of 1–160 chars, default []), followUp (<=4000, default empty), optional requirementId. Occurrence time is distinct from createdAt. Filters type and from/to are inclusive ISO dates/times; from must not exceed to. UI date filters cover the selected local day.

**Internal note:** `{ body: string (1–8000), requirementId?: UUID }`. Notes are explicitly internal.

**Reference:** `{ originalName: string (1–200), referenceUrl: http/https URL without credentials, requirementId?: UUID }`. URLs are stored as links; the backend never fetches them.

**Upload:** multipart part `file` and optional text part `requirementId` only. Default maximum is 5 MiB, configured by MAX_FILE_BYTES (hard configuration ceiling 20 MiB). Default allowed MIME types: application/pdf, image/png, image/jpeg, text/plain. Content signatures are checked, UTF-8 text excludes binary bytes, and MIME spoofing is rejected. Files are never placed under public/. Metadata records original name/type/size/uploader/time. Download uses attachment disposition and private/no-store caching.

Files and links attached to a requirement can only be changed while its content is editable. DELETE archives metadata and keeps private bytes for history. Archived metadata is omitted from normal lists; authorized historical downloads remain private.

## Hub aggregation and downstream contract

Hub data: client; up to ten recent requirements, communications, files, notes and timeline events; permission keys; relatedRecords. Sections without corresponding read permissions are null. Full lists are separately paginated. Each related record provider entry is `{ kind, available, reason }`; every downstream provider is explicitly unavailable in this standalone repository. No fabricated counts or destination actions are shown.

Confirmation atomically creates a unique RequirementRevision snapshot. Export without a version requires the current record to be CONFIRMED. `?version=N` reads an explicitly confirmed historical version even during a later draft or after archival. Draft data never substitutes for an approved package.

Export data includes:

```text
schemaVersion: 1
requirementId, clientId, version, title, objective, services
items[]: item ID captured in this approved version, title, description, category, priority, notes, position
designPreferences, referenceLinks
references[]: file/reference metadata and stable authenticated download IDs
clientProvided: budgetMin, budgetMax, currency, timeline, targetDate, constraints, notes
internal: assumptions, recommendations
preparedBy, confirmedBy: user ID and display name
confirmedAt: ISO timestamp
```

Item entries may include module relationship/timestamp metadata from the preserved snapshot. Downstream consumers must use requirementId + confirmed version and tolerate additional JSON fields. Reference metadata never exposes storage keys or public object URLs. Fetch binary material through the protected file endpoint. No invoice, quotation, project or other business record is created.

## Important errors

| HTTP / code                                                                      | Meaning / response                                                                                           |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 400 VALIDATION_ERROR                                                             | Unknown properties, missing/invalid inputs, malformed UUID/date/status/query; details.errors explains fields |
| 400 CURRENCY_REQUIRED / INVALID_BUDGET                                           | Missing currency or reversed decimal range                                                                   |
| 400 REASON_REQUIRED                                                              | Missing reason for a controlled action                                                                       |
| 400 INVALID_URL                                                                  | URL contains credentials                                                                                     |
| 400 FILE_REQUIRED / INVALID_FILE_TYPE / INVALID_FILE_CONTENT / INVALID_FILE_SIZE | Upload validation failed                                                                                     |
| 401 UNAUTHENTICATED                                                              | Missing, forged, expired, invalid-subject/wrong-audience token, disabled user or invalid credentials         |
| 403 FORBIDDEN                                                                    | Missing server-side permission                                                                               |
| 404 NOT_FOUND / FILE_UNAVAILABLE                                                 | Missing or foreign record; private bytes unavailable                                                         |
| 409 INVALID_TRANSITION / CONTENT_LOCKED / CLIENT_ARCHIVED                        | Business rule prohibits the action                                                                           |
| 409 STALE_VERSION / CONFLICT                                                     | Optimistic/transaction conflict; reload before retry                                                         |
| 409 NOT_CONFIRMED                                                                | Current version is not approved; select an explicit historical version                                       |
| 409 REFERENCE_ONLY                                                               | A URL reference has no binary download                                                                       |
| 413 FILE_TOO_LARGE                                                               | Configured multipart size limit exceeded                                                                     |
| 429 RATE_LIMITED                                                                 | Demo login window exceeded                                                                                   |
| 500 INTERNAL_ERROR                                                               | Safe generic error; no database/stack details                                                                |
| Proxy 403 INVALID_ORIGIN                                                         | Mutation did not originate from APP_ORIGIN                                                                   |
| Proxy 502 SERVICE_UNAVAILABLE / UPSTREAM_ERROR                                   | Backend unavailable or unexpected response                                                                   |
| Proxy 503 CONFIGURATION_ERROR                                                    | Required server proxy configuration missing                                                                  |

No destructive client/requirement/revision deletion route exists. Canonical shared services, identity and storage integration boundaries are described in docs/HANDOVER.md.

## Day 1 contract and adapter review

The 16 October foundation audit reuses this contract. [DAY_1_FOUNDATION.md](docs/DAY_1_FOUNDATION.md) records the schema relationships/deletion behavior, selected transition policy, revision semantics and absent shared integrations. All permitted status edges are implementation decisions rather than an exhaustive transition list supplied by the PDFs.

The local sample now has two distinct agency users configured through `DEMO_EMAIL` / `DEMO_PASSWORD` and `DEMO_SECONDARY_EMAIL` / `DEMO_SECONDARY_PASSWORD`. These are seed configuration only; neither login accepts a tenant selector. `/auth/me` and all resource ownership derive from the verified user record. No identity/agency header provides authentication. Future shared JWT integration replaces the local identity adapter, preserving this boundary and the response envelopes.

## Day 2 requirement backend contract — 17 October 2026

The existing canonical client list/create/update routes and the thin Nest requirement controller are reused. Requirement operations are implemented in `RequirementsService`; DTO validation remains global and rejects unknown properties. No downstream models or business modules were added.

### Required routes and permission boundary

| Method / path                  | Required server permissions                   | Behavior                                                                                           |
| ------------------------------ | --------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| GET /clients/:id/requirements  | client.read + requirement.read                | Client-scoped page; title/objective case-insensitive q; status; newest/oldest; stable ID tie-break |
| POST /clients/:id/requirements | requirement.write                             | Active client; server-owned agency/preparer/time; DRAFT version 1                                  |
| GET /requirements/:id          | requirement.read                              | Tenant-scoped detail and ordered items; related sections independently permission-gated            |
| PATCH /requirements/:id        | requirement.write                             | Full editable content + expectedVersion; DRAFT or CHANGES_REQUESTED only                           |
| PATCH /requirements/:id/status | requirement.write, plus review where required | Day 1 transition table, mandatory reasons, trusted confirmation metadata                           |

Paths are relative to the backend `/api` base. The JWT guard still validates identity and loads agency/permissions from PostgreSQL. The service now applies the same required permissions directly, so internal service calls do not bypass authorization. Client and requirement ownership are checked within write transactions; related note/communication/file links must refer to the same client and agency. Composite foreign keys additionally reject foreign preparers and wrong-client relationships.

### Item operations and full-content updates

Send the complete intended item array on PATCH to add, update, reorder or remove items. Array order persists as contiguous zero-based positions. This retains the Day 1 replacement strategy: writable item fields are only title, description, category, priority and notes. `items[].id`, `position`, `agencyId` and `requirementId` are not accepted, even if an ID exists in the same agency or requirement. Malformed, nonexistent, foreign and wrong-client supplied IDs all produce `400 VALIDATION_ERROR`; no item is transferred.

Editable item rows receive new database IDs when the complete array is replaced. An item ID captured in an approved snapshot remains unchanged in that historical package; it is not a durable identity across draft edits. Consumers identify approved scope with `requirementId + version` and use saved position for ordering.

Content PATCH continues to replace all editable content, with defaults/null for omitted optional fields. Send all fields that should be retained. Client facts are `clientNotes, budgetMin, budgetMax, currency, timeline, targetDate, constraints`; internal reasoning is separately `assumptions, internalRecommendations`. Budgets use decimal strings and PostgreSQL Decimal(18,2), never binary floating-point arithmetic. Budget and timeline values express client expectations subject to review, not guarantees.

`targetDate` is a real calendar date in YYYY-MM-DD form; timestamps are not accepted in that field. Invalid leap days, URL credentials/unsafe schemes, invalid priorities/currencies and unsupported precision/range are rejected. Client/user/confirmation/timestamp ownership fields cannot be supplied in content or status requests.

### Version conflict behavior

Both content PATCH and status PATCH require an integer `expectedVersion` from **1 through 2147483647**, equal to the last-read **lockVersion**. This counter is independent of approved content `version`.

After ownership/client checks, the service compares the version before checking current edit/transition rules. A delayed edit based on an earlier draft therefore receives a stale-version response even if the requirement has since been confirmed. A request with the current lockVersion still cannot edit UNDER_REVIEW, CONFIRMED or ARCHIVED content.

A conditional update checks both lockVersion and status, increments lockVersion once, and updates content/items/activity in a serializable PostgreSQL transaction. Confirmation additionally writes actor/time and the unique approved snapshot in that transaction. No mutation is automatically replayed after a conflict. A lost conditional update or stale request produces `409 STALE_VERSION`; a serialization conflict produces `409 CONFLICT`. Both requirement edit/status conflicts include safe current metadata read after rollback, scoped to the authenticated agency:

```json
{
  "success": false,
  "message": "Requirement changed; reload the latest version before retrying",
  "code": "STALE_VERSION",
  "details": {
    "requirementId": "36e132bd-a878-475d-8a22-8e49753da602",
    "expectedVersion": 1,
    "currentVersion": 3,
    "currentStatus": "CONFIRMED",
    "reloadRequired": true
  }
}
```

`currentVersion` here is the current lockVersion, not the content revision number. These details are a reload hint; another authorized mutation can occur afterward. Reload before presenting/retrying an action. Foreign IDs still return 404 without version/status metadata. Other modules' generic database conflicts may retain empty details.

### Review, history and rollback

The Day 1 edges, reason requirements and self-review policy are retained unchanged. A writer submits; the review permission is additionally required to decide a review or reopen confirmed content. Confirmation derives `confirmedById` and `confirmedAt` on the server; caller overrides are rejected.

Version N remains immutable after reopening as draft N+1. Explicit `/requirements/:id/export?version=N` works while N+1 is unapproved and after archival; unversioned export during a draft returns `409 NOT_CONFIRMED`. ARCHIVED is terminal and authorized detail/history remains readable. No destructive requirement/revision deletion route exists.

PostgreSQL-backed failure tests force an audit persistence error during create, edit and confirmation. They verify that content, ordered items, lockVersion, confirmation metadata, snapshots and activity all roll back together. Concurrency tests permit exactly one competing edit/submit or confirm/request-changes action, preserving coherent items and at most one approved snapshot.

See [Day 2 traceability](docs/DAY_2_TRACEABILITY.md) and [Day 2 report](docs/DAY_2_REPORT.md) for fresh execution evidence and limitations.

## Day 3 supporting backend contract — 17 October 2026

Manual communications use CALL, EMAIL, MEETING, WHATSAPP_MESSAGE, VIDEO_MEETING and OTHER. POST captures subject, summary, participants, followUp, occurredAt and optional requirementId. Creator and createdAt are server-owned. Nothing is synchronized or sent externally.

occurredAt requires a real ISO timestamp with seconds and an explicit Z or ±HH:MM timezone; fractions may contain 1–3 digits. Date-only and timezone-less occurrence values are rejected. Communication GET supports type, q, from, to, requirementId and standard pagination/sort. Filter dates may be YYYY-MM-DD (UTC day) or explicit-zone timestamps. A date-only from starts at UTC midnight; a date-only to includes 23:59:59.999 UTC. Timestamp bounds remain exact and inclusive. Inverted ranges return INVALID_DATE_RANGE.

Canonical ClientNote is reused for internal discussion. GET notes supports q, requirementId and standard pagination. Notes remain distinct from communication rows. Notes/communications may add discussion linked to an existing confirmed or archived requirement while its client remains active; they never rewrite the approved package. All requirement filters and links are checked against both the client and authenticated agency. Client archival blocks new child writes.

### Hub totals and deterministic activity

GET /clients/:id/hub now returns `summaryLimit: 10` and:

```text
counts: { requirements, communications, files, notes, timeline }
```

Each count is a number, or null when that section's read permission is missing. Each permitted summary has at most ten entries; a permitted empty section is [] with count 0. Counts and summaries are read in one repeatable-read transaction. Requirement totals include archived requirements; file totals exclude archived metadata. Full histories use separate paginated endpoints.

Timeline includes client creation/update, internal note creation, requirement creation/edit/review/change request/confirmation/archive, manual communication, reference/file addition and file archival. Actor/event/server creation time are persisted in the same transaction as the business change. Ordering uses timestamp and UUID together; newest reverses both keys, oldest uses both ascending. Embedded requirement history and related material also have ID tie-breaks. The hub activity summary and paginated timeline use the same deterministic ordering. No unlimited history or fabricated downstream totals are returned.

### Private files, provider and retention

The `PrivateStorage` abstraction is bound to `PrivateStorageService` with Nest useExisting. Replace that binding with approved managed storage at integration. The supplied local provider is private, outside the frontend, and has no public object route. Its configuration rejects frontend directories.

Uploads validate configured size and a nonempty supported MIME subset: PDF, PNG, JPEG, UTF-8 plain text. Signature checks reject mismatched content; text rejects malformed UTF-8 and binary control bytes. These checks are not malware scanning or complete document parsing. Names are bounded/sanitized for metadata; original display name, MIME, bytes, uploader/time and client/requirement link are stored. UUID keys and staging names never appear in API metadata/export.

The local provider writes a private UUID.pending file, closes/syncs it, then publishes it under a generated UUID. Partial-write/publication errors remove staging files and return STORAGE_WRITE_FAILED without filesystem details. If metadata/audit persistence fails, the published uncommitted object is removed. A failed unlink produces a generic cleanup-deferred warning; bytes stay private for reconciliation.

GET /files/:id/download checks file.read and agency ownership before reading storage. It returns attachment disposition with RFC 5987 escaping, validated content type, nosniff and private/no-store caching. Paths are generated from validated UUID keys; traversal, symlink and non-regular object reads are rejected. Archived files remain available for authorized historical download. URLs are metadata only: the server never fetches them, and binary download of a reference-only record returns REFERENCE_ONLY.

Files/references linked to requirements may change only in DRAFT/CHANGES_REQUESTED. Archival retains metadata and private bytes. Confirmed snapshots capture safe references/download IDs; they preserve their exact metadata after later draft changes or file archival. Export still requires requirement.read + file.read and tenant ownership. No export ever substitutes an unapproved working draft for approved content; requirements without any approved version return NOT_CONFIRMED on unversioned export and 404 for an absent explicit version.

[STORAGE_AND_RETENTION.md](docs/STORAGE_AND_RETENTION.md) documents staging, failed-upload cleanup, dry-run reconciliation, retention and the production provider boundary. [Day 3 traceability](docs/DAY_3_TRACEABILITY.md) and [report](docs/DAY_3_REPORT.md) contain fresh evidence.

## Day 4 frontend contract — 18 October 2026

The HTTP routes, envelopes, permission keys and Day 1 workflow remain unchanged. The Next.js feature uses real same-origin requests through `frontend/lib/api/client.ts`, typed resource contracts in `lib/types/hub.ts`, and protected download helpers in `lib/api/downloads.ts`. No browser database or mocked application API is introduced.

| Screen                  | Frontend route / behavior                                                                                                                 | Real API                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Client list/create/edit | `/client-hub`, `/client-hub/clients/new`, `/client-hub/clients/:clientId/edit`                                                            | Client GET/POST/PATCH and hub                                                                   |
| Client workspace        | `/client-hub/clients/:clientId?tab=overview`                                                                                              | Bounded hub summary and actual permission-gated counts                                          |
| Requirements            | `?tab=requirements`; separate `/requirements/new`, `/:requirementId`, `/:requirementId/edit`, `/:requirementId/review` beneath the client | Requirement lists/detail/content/status/export                                                  |
| Communications          | `?tab=communications`                                                                                                                     | Paginated search/type/local-day date filters and manual POST                                    |
| Files                   | `?tab=files`                                                                                                                              | Paginated metadata, multipart upload, URL reference POST, archive and protected binary download |
| Notes                   | `?tab=notes`                                                                                                                              | Canonical internal note list/search/POST                                                        |
| Activity                | `?tab=timeline`, visible label Activity                                                                                                   | Chronological paginated timeline with newest/oldest selection                                   |

Communications, Files and Notes accept an optional `requirementId` in the workspace URL. It scopes their real list requests and preselects the linked record for a new entry. The picker verifies the selection against the client and eligible state; backend ownership checks remain authoritative. A clear link returns to all client records. Attachments offer DRAFT/CHANGES_REQUESTED requirements; notes/communications can discuss approved history while the client remains active.

Requirement forms submit complete editable content and item arrays. Read-only item IDs/positions are stripped. The item order is the submitted array order. Budget strings and currency retain the backend Decimal contract; client expectations remain distinct from internal assumptions. Local occurrence/date filter input is converted to explicit-zone timestamps, while targetDate remains YYYY-MM-DD.

Content/status actions use the last-read lockVersion as expectedVersion. A 409 keeps unsaved requirement inputs. The recovery section reads the latest authorized record separately, offers an explicitly **unapproved** local draft download and requires confirmation before replacing the form with current content. It never automatically merges/rebases/replays a stale write. Review conflicts retain the typed reason and offer reload before another decision.

Detail labels the active content version and last confirmed version separately. Confirmation, archival and starting a controlled revision require explicit dialogs; reason rules and available transitions still come from the server policy. Approved package downloads use the exact selected version. A new unapproved working revision exposes prior confirmed packages only through version history, preserving the existing no-unversioned-draft-export rule.

File downloads use authenticated fetch and attachment blobs. Failures stay on the screen with a safe error and retry; no direct navigation to a JSON error replaces the workspace. Browser identity/permission checks supplement Nest enforcement. Session tokens remain HttpOnly; neither tenant IDs nor identity headers are sent as authentication.

Success messages originate only from completed API operations. A manually supplied `saved=1` query no longer creates a success notice. Forms use immediate submission locks, linked field errors, retained inputs and unsaved-edit guards. Same-app links/back navigation use a confirmation dialog; reload/closing uses the browser's native beforeunload prompt where supported. Drafts are held only in component memory; the optional unapproved JSON backup is an explicit user download.

Review navigation uses a standard same-origin document link to the existing App Router review route. Other module navigation retains Next links and the shared unsaved-edit guard. Mobile drawer state clears on crossing the desktop breakpoint.

## Day 5 acceptance boundary

All paginated endpoints reject page values above 21474836 with 400 VALIDATION_ERROR. This selected bound keeps skip=(page-1)\*limit within a signed 32-bit offset at the maximum limit of 100. NaN, infinite/huge numeric values, nonpositive/fractional values and unknown query properties are rejected before database access. Existing default pagination and ordering remain unchanged.

Day 5 API tests compare exact foreign-ID and nonexistent-ID error bodies across client summaries/collections, requirement detail/export, private download and requirement writes. Malformed JSON returns a safe validation envelope without echoing input. The existing rollback tests verify generic safe 500 responses without raw audit/database errors. No new route or permission key is introduced.

## Confirmed-version export example

`GET /api/requirements/36e132bd-a878-475d-8a22-8e49753da602/export?version=1` requires requirement.read + file.read and authenticated server-derived ownership. Fictional response excerpt below shows all package sections; immutable item relationship/timestamp fields may additionally be present. These IDs are documentation examples, never seed/application constants.

```json
{
  "success": true,
  "data": {
    "schemaVersion": 1,
    "requirementId": "36e132bd-a878-475d-8a22-8e49753da602",
    "clientId": "2e4945f6-73cd-4349-9296-9abfa8fb6701",
    "version": 1,
    "title": "Wholesale brief portal",
    "objective": "Collect wholesale briefs and record approval",
    "services": ["UX design", "Web application"],
    "items": [
      {
        "id": "a30bc49d-4379-4382-9205-84e75bad84c1",
        "title": "Guided brief",
        "description": "Collect structured client scope",
        "category": "Feature",
        "priority": "HIGH",
        "notes": "",
        "position": 0
      },
      {
        "id": "942b5634-ec9a-485d-b6a4-e9da38d16931",
        "title": "Approval history",
        "description": "Retain exact approved versions",
        "category": "Feature",
        "priority": "MUST_HAVE",
        "notes": "",
        "position": 1
      }
    ],
    "designPreferences": "Compact accessible forms",
    "referenceLinks": ["https://example.com/inspiration"],
    "references": [],
    "clientProvided": {
      "budgetMin": "300000",
      "budgetMax": "500000",
      "currency": "LKR",
      "timeline": "Client preference: eight weeks; subject to review",
      "targetDate": "2027-12-15T00:00:00.000Z",
      "constraints": "Client provides content",
      "notes": "Review before any commitment"
    },
    "internal": {
      "assumptions": "Internal assumption: identity adapter available",
      "recommendations": "Validate accessibility"
    },
    "preparedBy": {
      "id": "725954d8-2cdb-4bcb-8b94-bae23a59531b",
      "displayName": "Fictional reviewer"
    },
    "confirmedBy": {
      "id": "725954d8-2cdb-4bcb-8b94-bae23a59531b",
      "displayName": "Fictional reviewer"
    },
    "confirmedAt": "2026-10-18T06:00:00.000Z"
  },
  "message": "Operation completed successfully"
}
```

After reopening into unapproved version 2, this explicit version-1 response remains identical. Omitting `?version=1` returns HTTP 409:

```json
{
  "success": false,
  "message": "Choose an explicitly confirmed version or confirm the current requirement",
  "code": "NOT_CONFIRMED",
  "details": {}
}
```

After archival the explicit confirmed version remains available with the same permissions. A guessed foreign requirement returns the same 404 envelope as an unknown ID; the service does not disclose its status, revisions or existence.
