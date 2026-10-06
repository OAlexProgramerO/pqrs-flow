# Contributing

This is the workflow used in PQRS Flow, even though it is a solo project. Following it from day one keeps the history readable.

## Setup

Requires Node.js 22 or newer.

```bash
npm run install:all
cp .env.example .env
npm run dev
```

## Daily commands

| Command          | What it does                                                        |
| ---------------- | ------------------------------------------------------------------- |
| `npm run dev`    | Start the server with auto-reload                                   |
| `npm test`       | Run the tests                                                       |
| `npm run lint`   | Find code problems with ESLint                                      |
| `npm run format` | Format all files with Prettier                                      |
| `npm run check`  | Lint + format check + tests (run before every push)                 |
| `npm run ready`  | Format everything, then run `check` (run it after extracting a zip) |

## Working directly on main

Branches and pull requests are the safest way to work. If you commit straight to `main`, these rules keep it green:

1. After extracting a zip or editing files, run `npm run ready`. It formats everything, then runs lint, formatting and tests.
2. Commit in small steps, but **push once, at the end**. Every push starts a CI run.
3. The pre-push hook runs `npm run check` before a push and refuses to push if it fails. It is turned on by `npm install` (or manually with `git config core.hooksPath .githooks`). Skip it only in an emergency with `git push --no-verify`.
4. If CI turns red anyway, follow [docs/ci-troubleshooting.md](./docs/ci-troubleshooting.md) and fix it before starting anything new.
5. Major dependency upgrades are planned as their own version. Close the Dependabot pull request instead of merging it.

## Branching (GitHub Flow)

`main` always works. Every change goes through a short-lived branch and a pull request.

| Prefix   | Use for                         | Example                |
| -------- | ------------------------------- | ---------------------- |
| `feat/`  | New functionality               | `feat/submission-form` |
| `fix/`   | Bug fixes                       | `fix/email-validation` |
| `docs/`  | Documentation only              | `docs/update-roadmap`  |
| `chore/` | Tooling, config, dependencies   | `chore/add-eslint`     |
| `test/`  | Experiments and throwaway tests | `test/playground`      |

```bash
git switch -c feat/submission-form
# ...work...
git add . ; git commit -m "feat(frontend): add the submission form" ; git push -u origin feat/submission-form
```

Then open a pull request and use **Squash and merge**, so `main` gets one clean commit per change.

## Commit messages (Conventional Commits)

Format: `type(scope): explain what changed`

| Type       | Use for                                                 |
| ---------- | ------------------------------------------------------- |
| `feat`     | A new feature                                           |
| `fix`      | A bug fix                                               |
| `docs`     | Documentation only                                      |
| `style`    | Formatting, no logic change                             |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `test`     | Adding or fixing tests                                  |
| `chore`    | Tooling, config, dependencies                           |
| `ci`       | CI workflow changes                                     |

Rules:

- Write the subject in the imperative: "add form", not "added form".
- Keep the subject under 72 characters, and add a body with `-m` when the reason is not obvious.
- While experimenting on a `test/` branch, a placeholder message such as `TEST` is fine. Squash it when merging.

## Version numbers

| Number  | Meaning                                                 | Example                  |
| ------- | ------------------------------------------------------- | ------------------------ |
| `0.X.0` | A new capability for users. Each one is a pull request. | `0.1.0` submit a request |
| `0.X.Y` | The next step inside the same phase.                    | `0.1.1` track a request  |
| `1.0.0` | First stable release with a public demo.                |                          |

The full plan, with the branch name of each version, is in [ROADMAP.md](./ROADMAP.md).

## Releases

1. Move the entries from `[Unreleased]` to a new version in `CHANGELOG.md`.
2. Update `version` in `package.json` and `backend/package.json`.
3. Commit: `chore(release): vX.Y.Z`.
4. Tag and push: `git tag vX.Y.Z` then `git push origin vX.Y.Z`.
