# When CI is red

CI runs the same three checks you run on your computer: **lint**, **formatting** and **tests**, on Node 22 and Node 24. This page explains how to read a red build and fix it.

## Before you push

| Command         | What it does                                                    |
| --------------- | --------------------------------------------------------------- |
| `npm run ready` | Formats every file, then runs lint, formatting check and tests  |
| `npm run check` | Runs lint, formatting check and tests without changing any file |

Run `npm run ready` every time you extract a zip or edit files by hand. The pre-push hook runs `npm run check` for you and stops the push if something fails, so a red build can only happen when the hook was skipped.

## Reading a red build

Open the run on GitHub, then click the job (`quality (Node 22)` or `quality (Node 24)`) and look for the step with the red cross.

| Red step                     | What it means                                     | Fix                                                                       |
| ---------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------- |
| Install root tooling         | `package-lock.json` does not match `package.json` | Run `npm install` at the root and commit `package-lock.json`              |
| Install backend dependencies | Same problem inside `backend/`                    | Run `npm --prefix backend install` and commit `backend/package-lock.json` |
| Lint                         | ESLint found a code problem                       | Run `npm run lint` and read the file and line it prints                   |
| Check formatting             | Some files are not formatted with Prettier        | Run `npm run format`, then commit the changed files                       |
| Run tests                    | A test failed                                     | Run `npm test` and read the first `not ok` or `failing tests` block       |
| audit                        | A production dependency has a known vulnerability | Run `npm --prefix backend audit` and update that package                  |

The three checks always run, so one red build lists every problem. Fix them all before pushing again.

## One job is red and the other is green

| Pattern                              | Likely cause                                                                             |
| ------------------------------------ | ---------------------------------------------------------------------------------------- |
| Only Node 24 fails                   | Something changed in newer Node. Run `npm test` locally if you use Node 24.              |
| Only Node 22 fails                   | A feature used in the code does not exist in Node 22.                                    |
| Passes on your computer, fails in CI | Linux is case sensitive and Windows is not. Check the letters in file names and imports. |
| Formatting fails only in CI          | A file was reformatted on your computer but never committed. Run `git status`.           |

## Reading the log

Logs need a GitHub login. Open the red step, scroll to the end and copy the last 30 lines when you ask for help. The line that starts with `not ok`, `Error` or `[warn]` is the one that matters.

## Dependabot pull requests

Dependabot opens one grouped pull request per week for minor and patch updates. Major versions (for example Express 4 to 5) are not proposed automatically. They are planned as their own version, with a branch, because they can change how the app behaves.
