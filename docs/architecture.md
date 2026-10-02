# Architecture

```
Browser ──HTTP──► Express (backend/)
   │                  ├── /api/*   → REST routes (JSON)
   │                  └── /        → static files from frontend/
   └── frontend/ (HTML + CSS + JS)
```

## Decisions

| Decision | Choice | Reason |
| --- | --- | --- |
| Modules | ES Modules (`"type": "module"`) | Current JavaScript standard |
| Frontend | Static files served by Express | One command runs everything in early phases |
| Tests | Native `node:test` | No extra dependencies |
| Config | Environment variables (`.env`) | Same code locally and in production |

## Backend layers (as it grows)

```
routes/        → define endpoints
controllers/   → receive the request and send the response
services/      → business rules
repositories/  → database access
```

The `controllers/`, `services/` and `repositories/` folders are created when there is logic to justify them (v0.1.0 onwards).
