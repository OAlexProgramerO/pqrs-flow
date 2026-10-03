# API reference

Base URL in development: `http://localhost:3000/api`

All responses are JSON. Errors always have the shape `{ "error": "message" }`.

## Implemented

### `GET /api/health`

Checks that the server is running. Used by the frontend and by monitoring tools.

**Response `200 OK`**

```json
{
  "status": "ok",
  "service": "pqrs-flow",
  "version": "0.0.2",
  "timestamp": "2026-10-03T12:00:00.000Z"
}
```

| Field       | Description                              |
| ----------- | ---------------------------------------- |
| `status`    | Always `ok` when the server answers      |
| `service`   | Service name                             |
| `version`   | Version read from `backend/package.json` |
| `timestamp` | Current server time in ISO 8601 format   |

### Unknown routes

Any request under `/api` that does not match a route returns:

**Response `404 Not Found`**

```json
{ "error": "Route not found" }
```

### Unexpected errors

Unhandled errors return `500 Internal Server Error` with `{ "error": "Internal server error" }`. Details are logged on the server and never sent to the client.

## Planned

| Method | Path                    | Version | Description                                 |
| ------ | ----------------------- | ------- | ------------------------------------------- |
| `POST` | `/api/pqrs`             | 0.1.0   | Create a request and return its case number |
| `GET`  | `/api/pqrs/:caseNumber` | 0.1.1   | Public status lookup by case number         |
