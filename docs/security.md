# Security

This document describes the security model of PQRS Flow 0.3.0, what to do before putting it online, and what it does **not** cover. Passing the automated tests is not a security review. Test the system in your own environment before exposing it.

## What is protected and how

| Threat                           | Protection                                                                                                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stolen database                  | Passwords are salted `scrypt` hashes (N=32768, r=8, p=1). Session tokens are stored as SHA-256 hashes, so no cookie can be rebuilt from the database.                                             |
| Password guessing                | Rate limits per client address (10) and per account (5) every 15 minutes. Generic `401` for every failure. A login for an unknown account costs the same time as a real one.                      |
| Session theft by script (XSS)    | The cookie is `HttpOnly`. The panel builds the page with DOM nodes, never `innerHTML`. The Content Security Policy of Helmet allows only scripts from the same origin and forbids inline scripts. |
| Session theft on the network     | `Secure` cookie with the `__Host-` prefix in production: it is never sent over plain HTTP.                                                                                                        |
| Session fixation                 | The server creates every token. A login closes the session the browser had and opens a new one.                                                                                                   |
| Forged requests (CSRF)           | `SameSite=Strict`, an `Origin` / `Sec-Fetch-Site` check on every change (login included), and a per-session `X-CSRF-Token` checked in constant time.                                              |
| Clickjacking                     | Helmet sends `frame-ancestors 'self'` and `X-Frame-Options: SAMEORIGIN`.                                                                                                                          |
| Reaching the panel without login | The panel folder is outside the public static folder. The gate allows only an exact list of five public files. Every API path answers `401` before routing.                                       |
| SQL injection                    | Every value is a bound parameter. The only text built into SQL is `ORDER BY`, taken from a fixed whitelist. The search escapes `LIKE` wildcards.                                                  |
| Changing the audit history       | One transaction for the status and its record, triggers that refuse `UPDATE` and `DELETE`, and no route that writes it.                                                                           |
| Leaking data to the public       | The public lookup is unchanged: it still needs case number and email and returns four fields. The staff API is never opened by CORS.                                                              |
| Sensitive data in logs           | Passwords and tokens are never logged. The access log drops the query string of `/api/admin`, where searches may hold names and emails.                                                           |

## Deployment checklist

1. **Use HTTPS.** Put a reverse proxy with TLS in front. Without it a `Secure` cookie is never sent and nobody can log in. Do not set `SESSION_COOKIE_SECURE=false` in production: the server warns at start if you do.
2. **Set `TRUST_PROXY`** to the number of proxies (usually `1`). Otherwise every visitor shares the proxy's address and the login limit locks everybody at once. Do not use `true`: it lets anyone fake the address and skip the limits.
3. **Pass the real host.** The origin check compares `Origin` with `Host` (and `X-Forwarded-Host` only when `TRUST_PROXY` is set). The proxy must send the public host name.
4. **Leave `CORS_ORIGINS` empty** unless a different website must call the _public_ API. It never applies to the staff area.
5. **Create the first account** with `npm run admin -- create` on the server. Use a long password from a password manager (12 characters is the minimum, not the goal).
6. **Protect the files.** `data/` holds personal data of citizens and the hashes of staff. Keep it out of backups that others can read, and out of the web root and of Git (it is already ignored).
7. **Back up the database** on a schedule and test the restore. (Automatic backups are planned for 0.5.3.)
8. **Run one server process.** See the limits below.
9. **Keep `.env` out of Git** and never put a password in it. There is no staff password in the environment.
10. **Keep dependencies updated.** Run `npm audit` and read the Dependabot pull requests.

## Operations

- **Lost password or locked account:** `npm run admin -- reset-password --email ...` on the server. It closes every session of that account.
- **Someone left the team:** `npm run admin -- deactivate --email ...`. The sessions end at once and the audit history keeps their name.
- **Suspect a stolen session:** reset the password of the account (it closes its sessions). To close every session, stop the server and run `DELETE FROM admin_sessions;` on the database.
- **Locked by the login limits:** wait for the window or restart the server.
- **Stopping the server:** `Ctrl+C` (`SIGINT`) and `SIGTERM` close the server cleanly: new connections are refused, requests in progress get up to 10 seconds, and the SQLite connection is closed so the `-wal` and `-shm` files are checkpointed and removed. Process managers usually send `SIGTERM` when they stop a service, so leave them at least that long before they force a kill. `SIGKILL`, a crash or a power cut cannot be handled: SQLite recovers the database from its WAL the next time it opens.
- **Audit history:** it can be read with SQL on the server (`pqrs_audit`). A screen for it is planned for 0.3.2.

## Known limits of 0.3.0

- **One process.** Login counters are in memory. With several processes each one counts alone, so the effective limit is higher. Sessions are in SQLite and would be shared. Persistent, shared limits are planned for 0.5.1.
- **No second factor.** A stolen password gives access. TOTP is planned for 0.5.1.
- **No "forgot my password" link** and no email. Recovery needs the server terminal.
- **One kind of staff user.** Every active account can see and change every request. Roles are planned for 0.3.1.
- **Lookup lockout by others.** The public lookup (`POST /api/pqrs/lookup`) has two limits in memory, counted every 15 minutes: 30 attempts per client address and 8 attempts per case number. They are fixed values in `backend/src/app.js` and are not set in `.env`. The limit per case number counts every attempt, wrong or right, whoever makes it, so a person who knows (or guesses) a case number can use up its 8 attempts and make the real owner see "Too many attempts" until the window ends or the server restarts. This does not reveal any data: the answer is the same for every case number, and a lookup still needs the email. It only delays a legitimate check of that one case. Version 0.3.0 does not change these limits. The shared, persistent limits planned for 0.5.1 are the roadmap work that applies to them.
- **Account lockout by others.** The per-account limit counts every attempt, so a person who knows an email can make that account wait. The per-address limit and the terminal recovery are the mitigation.
- **Sessions are not bound to a device.** A stolen token works from anywhere until it ends (30 idle minutes, 8 hours at most) or is closed.
- **No security event log** (logins, failures, changes of password) other than the access log and the audit of status changes. Planned for 0.5.1.
- **Personal data.** Requests hold names, emails and free text. Retention, deletion on request and consent are not implemented. Check the law that applies to your organization.
- **SQLite** is a single file on one machine. It is fine for a small service and does not give high availability.
- **The text of a request is untrusted.** The panel shows it as text. Keep it that way when adding features (for example, never render it as HTML in emails or exports; CSV export in 0.4.1 will escape formulas).

## Reporting a problem

Open a private security advisory in the GitHub repository, or contact the maintainer directly. Please do not publish details of a vulnerability in a public issue before it is fixed.
