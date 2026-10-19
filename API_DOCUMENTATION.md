# Agency OS Client Hub API

Base path: `/api`. The browser uses the same-origin Next.js proxy. IDs are UUIDs, timestamps use ISO 8601, and target dates use YYYY-MM-DD. The server assigns agency ownership, responsible users and timestamps.

## Authentication

Backend protected requests require `Authorization: Bearer <JWT>`. Tokens must have a valid HS256 signature, configured issuer/audience, expiry and UUID subject. Active user, agency, role and permissions are loaded from PostgreSQL on each request. Record access is scoped to this authenticated context.

POST /auth/login is available when `DEMO_AUTH_ENABLED=true` outside production. Request: `{ email, password }`. Response data: `{ accessToken, expiresIn: 3600, user: { displayName, email } }`. Failed attempts are limited to eight per email in a 15-minute process-local window.

The Next proxy consumes the token server-side and returns only `{ user }`, storing an HttpOnly, SameSite=Strict cookie (Secure in production). Mutations require an exact configured Origin. POST /api/auth/logout clears the browser session. GET /api/auth/me returns authenticated actor identity and permission keys. An inactive user returns 401 UNAUTHENTICATED.

## Response format

Successful JSON response:

```json
{
  "success": true,
  "data": {},
  "message": "Operation completed successfully"
}
```

Error response:

```json
{
  "success": false,
  "message": "Human-readable error message",
  "code": "STABLE_ERROR_CODE",
  "details": {}
}
```

Validation errors contain `details: { errors: string[] }`. Error responses contain field messages and safe error codes. Successful file downloads return attachment bytes; download errors use the JSON error format.

List data is `{ items: T[], total, page, limit, totalPages }`. Query fields: `page` (integer 1-21474836, default 1), `limit` (default 20, maximum 100), `q` (up to 200 characters), `sort=newest|oldest`. Body and query properties are restricted to the fields defined for each route.

## Endpoints and permissions

All paths below are relative to /api. All protected endpoints may return 401 UNAUTHENTICATED or 403 FORBIDDEN. Tenant-mismatched or unavailable IDs return the same 404 NOT_FOUND as nonexistent records. Creation succeeds with 201; reads/patch/archive succeed with 200.

| Method / path                       | Permission(s)                                            | Input                                                            | Success data                                                                                     |
| ----------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| POST /auth/login                    | Explicitly enabled demo adapter                          | email/password                                                   | Backend token + user; proxy strips token                                                         |
| GET /auth/me                        | Valid user                                               | None                                                             | Actor including server-derived agency and permission keys                                        |
| GET /clients                        | client.read                                              | List query + status=ACTIVE/ARCHIVED                              | Page<Client>                                                                                     |
| POST /clients                       | client.write                                             | Client DTO                                                       | Client                                                                                           |
| PATCH /clients/:id                  | client.write                                             | Full Client DTO + optional status                                | Updated Client                                                                                   |
| GET /clients/:id/hub                | client.read                                              | None                                                             | Hub summary                                                                                      |
| GET /clients/:id/requirements       | client.read, requirement.read                            | List query + requirement status                                  | Page<Requirement>, ordered items and preparer                                                    |
| POST /clients/:id/requirements      | requirement.write                                        | Requirement content DTO                                          | Requirement with items and preparer                                                              |
| GET /requirements/:id               | requirement.read                                         | None                                                             | Full content, permitted related material, confirmed revision summaries, available status actions |
| PATCH /requirements/:id             | requirement.write                                        | Full content DTO + expectedVersion                               | Updated editable requirement                                                                     |
| PATCH /requirements/:id/status      | requirement.write; requirement.review for review actions | Status DTO                                                       | Updated requirement including responsible confirmer/time                                         |
| GET /requirements/:id/export        | requirement.read, file.read                              | Optional positive integer version                                | Immutable confirmed snapshot                                                                     |
| GET /clients/:id/communications     | communication.read                                       | List query + type/from/to/requirementId                          | Page<Communication>                                                                              |
| POST /clients/:id/communications    | communication.write                                      | Communication DTO                                                | Communication and author summary                                                                 |
| GET /clients/:id/notes              | note.read                                                | List query + requirementId                                       | Page<ClientNote>                                                                                 |
| POST /clients/:id/notes             | note.write                                               | Internal note DTO                                                | ClientNote and author summary                                                                    |
| GET /clients/:id/timeline           | timeline.read                                            | List query                                                       | Page<AuditLog>, event type/time/actor                                                            |
| GET /clients/:id/files              | file.read                                                | List query + includeArchived=true/false + optional requirementId | Page<ClientFile>, without storage keys                                                           |
| POST /clients/:id/files             | file.write                                               | Reference DTO                                                    | Reference metadata                                                                               |
| POST /clients/:id/files/upload      | file.write                                               | Multipart file + optional requirementId                          | Private file metadata                                                                            |
| GET /files/:id/download             | file.read                                                | None                                                             | Private attachment bytes                                                                         |
| DELETE /files/:id                   | file.write                                               | None                                                             | { id, archived: true }                                                                           |
| POST /auth/logout (Next proxy only) | Same-origin session                                      | None                                                             | { signedOut: true }                                                                              |

## Request bodies

**Client:** name, company and contactName (required strings, 1–160 chars); optional nullable email (valid, <=254), phone (<=50), website (http/https URL without credentials, <=2000). Updates use the complete editable client profile. Status is ACTIVE/ARCHIVED. Archiving retains records; child writes become read-only. Client profile edits may reactivate a client.

**Requirement content:** title (required, 1–180), objective (required, 1–8000), items (1–100), services (array, <=30 names of 1–100 chars), designPreferences, referenceLinks (<=30 http/https URLs without credentials), constraints, assumptions, internalRecommendations, clientNotes, timeline, targetDate, budgetMin, budgetMax, currency. Optional text defaults to empty; services/references default to empty arrays. Text limits: 4000 for design/constraints/assumptions/recommendations/client notes; 2000 for timeline and reference URLs.

Each item: title (required, 1–160), description (<=4000), category (<=80), priority=LOW/MEDIUM/HIGH/MUST_HAVE (default MEDIUM), notes (<=2000). Array order is authoritative; the backend assigns contiguous positions. The submitted complete item array defines additions, updates, removals and ordering. Writable item fields are title, description, category, priority and notes. Item IDs and positions are read-only response fields.

Budget fields are nullable **decimal strings**, up to 16 integer digits and 2 fractional digits, nonnegative. Currency is a three-uppercase-letter code and is required whenever either amount exists. Minimum must not exceed maximum. PostgreSQL stores Decimal(18,2); serialized decimal strings may omit trailing zeros. Target date is nullable date-only. Budget and timeline fields record client expectations.

PATCH replaces the complete editable content and requires `expectedVersion` equal to the last-read `lockVersion`. Omitted optional fields reset to defaults or null. Content is editable in DRAFT and CHANGES_REQUESTED. Draft item replacements generate new IDs; confirmed snapshots retain their captured item IDs.

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
  "assumptions": "Content review takes one week",
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

Reason is required for change requests, archiving and leaving CONFIRMED. Review permission is additionally required when leaving UNDER_REVIEW/CONFIRMED or requesting changes/confirmation. Writers can submit their editable drafts for review. Requirement detail supplies `allowedTransitions` and `editAllowed` for the authenticated user.

**Communication:** type=CALL/EMAIL/MEETING/WHATSAPP_MESSAGE/VIDEO_MEETING/OTHER; subject (1–180), summary (1–8000), occurredAt (ISO timestamp with seconds and explicit Z or +/-HH:MM timezone; optional 1-3 fractional digits), participants (<=50 names of 1–160 chars, default []), followUp (<=4000, default empty), optional requirementId. Occurrence time is distinct from createdAt. GET supports type, q, requirementId, from/to and standard pagination. Date bounds are inclusive: date-only values cover UTC days; timestamp bounds use their exact instants. The from value must be less than or equal to to.

**Internal note:** `{ body: string (1–8000), requirementId?: UUID }`. GET supports q, requirementId and standard pagination. Notes and communications can be appended to confirmed or archived requirements while the client remains active.

**Reference:** `{ originalName: string (1–200), referenceUrl: http/https URL without credentials, requirementId?: UUID }`. Reference creation stores URL metadata without server-side fetching.

**Upload:** multipart part `file` and optional text part `requirementId` only. Default maximum is 5 MiB, configured by MAX_FILE_BYTES (hard configuration ceiling 20 MiB). Default allowed MIME types: application/pdf, image/png, image/jpeg, text/plain. Validation checks size, nonempty content, MIME type, file signatures and valid UTF-8 text. Storage is private and downloads are authenticated. Metadata records original name/type/size/uploader/time. Download uses attachment disposition and private/no-store caching.

Requirement-linked files and references can change in DRAFT and CHANGES_REQUESTED. DELETE archives metadata and keeps private bytes for history. Archived metadata is omitted from normal lists; authorized historical downloads remain private.

## Version conflicts and revisions

Content and status PATCH requests require an integer `expectedVersion` from 1 through 2147483647, matching the last-read `lockVersion`. Each accepted change increments `lockVersion`. The separate `version` field identifies the content revision.

Multi-record updates use serializable transactions. Content, ordered items, confirmation metadata, snapshots and activity commit together. Stale writes return 409 STALE_VERSION; serialization conflicts return 409 CONFLICT. Requirement conflicts include current version/status metadata scoped to the authenticated agency.

Example response:

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

The `currentVersion` field contains the latest `lockVersion`. A subsequent update requires a fresh record read and its corresponding `lockVersion`.

Confirmation assigns `confirmedBy` and `confirmedAt` from authenticated server context. Reopening CONFIRMED to DRAFT increments the content version and clears the working confirmation fields. Previous confirmed snapshots remain accessible by explicit version. ARCHIVED is terminal, with authorized detail, history and confirmed exports retained.

## Hub and activity

GET /clients/:id/hub returns the client profile, permission keys and up to ten entries per requirement, communication, file, note and activity collection. `summaryLimit` is 10. The response includes `counts: { requirements, communications, files, notes, timeline }`. Collections and counts are null when the corresponding read permission is absent. Authorized empty collections are [] with count 0. Requirement counts include archived requirements; file counts exclude archived metadata. Counts and summaries share a database snapshot.

`relatedRecords` entries contain `{ kind, available, reason }`. Unconnected providers return `available: false`.

GET /clients/:id/timeline returns paginated, actor-attributed events for client changes, requirement creation/edit/review/confirmation/archive, notes, communication and file/reference activity. Ordering uses timestamp and ID for deterministic pagination.

## Confirmed export

Confirmation creates an immutable requirement snapshot. Export without a version requires the current record to be CONFIRMED. `?version=N` reads an explicitly confirmed historical version even during a later draft or after archival. Export reads the selected confirmed snapshot.

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

The stable consumer key is `requirementId + version`. Item entries retain captured relationship and timestamp metadata. Reference metadata contains authorized file IDs; attachment bytes are available through GET /files/:id/download.

A current draft or archived record requires an explicit confirmed version. Unversioned export returns 409 NOT_CONFIRMED unless the current status is CONFIRMED. A specified version without a confirmed snapshot returns 404 NOT_FOUND.

## Export response example

`GET /api/requirements/36e132bd-a878-475d-8a22-8e49753da602/export?version=1` requires requirement.read + file.read and authenticated server-derived ownership. Example response excerpt; snapshot items may additionally include captured relationship and timestamp fields.

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
      "assumptions": "Content review takes one week",
      "recommendations": "Validate accessibility"
    },
    "preparedBy": {
      "id": "725954d8-2cdb-4bcb-8b94-bae23a59531b",
      "displayName": "Maya Perera"
    },
    "confirmedBy": {
      "id": "725954d8-2cdb-4bcb-8b94-bae23a59531b",
      "displayName": "Maya Perera"
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

## Error codes

| HTTP / code                                                                      | Meaning / response                                                                                           |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 400 VALIDATION_ERROR                                                             | Unknown properties, missing/invalid inputs, malformed UUID/date/status/query; details.errors explains fields |
| 400 CURRENCY_REQUIRED / INVALID_BUDGET                                           | Missing currency or reversed decimal range                                                                   |
| 400 INVALID_DATE_RANGE                                                           | Start date is later than end date                                                                            |
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
| 500 STORAGE_WRITE_FAILED                                                         | Private storage operation failed                                                                             |
| 500 INTERNAL_ERROR                                                               | Safe generic error; no database/stack details                                                                |
| Proxy 403 INVALID_ORIGIN                                                         | Mutation did not originate from APP_ORIGIN                                                                   |
| Proxy 502 SERVICE_UNAVAILABLE / UPSTREAM_ERROR                                   | Backend unavailable or unexpected response                                                                   |
| Proxy 503 CONFIGURATION_ERROR                                                    | Required server proxy configuration missing                                                                  |
