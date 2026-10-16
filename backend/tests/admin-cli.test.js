import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/db/database.js';
import { createAdminContext } from '../src/admin-context.js';
import { parseArgs, runAdminCli } from '../src/cli/admin-cli.js';
import { verifyPassword } from '../src/services/password.js';
import { CHEAP_SCRYPT, OTHER_PASSWORD, TEST_PASSWORD } from './helpers/admin.js';

const databases = [];
after(() => databases.forEach((db) => db.close()));

function setup() {
  const db = openDatabase({ filename: ':memory:' });
  databases.push(db);
  const context = createAdminContext(db, { passwordParams: CHEAP_SCRYPT });
  const out = [];
  const err = [];

  return {
    db,
    ...context,
    out,
    err,
    run: (argv, extra = {}) =>
      runAdminCli(argv, {
        accountService: context.accountService,
        log: (line) => out.push(line),
        logError: (line) => err.push(line),
        isTerminal: false,
        ...extra,
      }),
  };
}

const stdinWith = (text) => async () => text;

test('parseArgs reads commands, values and flags', () => {
  assert.deepEqual(
    parseArgs(['create', '--email', 'a@b.co', '--name', 'Ana Gomez', '--password-stdin']),
    {
      command: 'create',
      options: { passwordStdin: true, email: 'a@b.co', name: 'Ana Gomez' },
    },
  );
  assert.deepEqual(parseArgs(['list']), { command: 'list', options: { passwordStdin: false } });
});

test('parseArgs refuses passwords on the command line and unknown or incomplete options', () => {
  assert.match(parseArgs(['create', '--password', 'x']).error, /not accepted as arguments/);
  assert.match(parseArgs(['create', '--password=x']).error, /not accepted as arguments/);
  assert.match(parseArgs(['create', '--email']).error, /needs a value/);
  assert.match(parseArgs(['create', '--email', '--name']).error, /needs a value/);
  assert.match(parseArgs(['create', '--admin']).error, /Unknown option/);
});

test('create makes an administrator from a password on standard input', async () => {
  const t = setup();
  const code = await t.run(
    ['create', '--email', 'Ana@Example.com', '--name', 'Ana Gomez', '--password-stdin'],
    { stdin: stdinWith(TEST_PASSWORD) },
  );

  assert.equal(code, 0);
  assert.match(t.out[0], /Administrator created: ana@example.com/);

  const credentials = t.adminRepository.findCredentialsByEmail('ana@example.com');
  assert.equal(await verifyPassword(TEST_PASSWORD, credentials.passwordHash), true);
  assert.equal(credentials.passwordHash.includes(TEST_PASSWORD), false);
});

test('create asks for the password twice in a terminal and they must match', async () => {
  const t = setup();
  const answers = [TEST_PASSWORD, TEST_PASSWORD];
  const ask = async () => answers.shift();

  assert.equal(
    await t.run(['create', '--email', 'a@b.co', '--name', 'Ana Gomez'], { isTerminal: true, ask }),
    0,
  );

  const other = setup();
  const mismatch = [TEST_PASSWORD, OTHER_PASSWORD];
  assert.equal(
    await other.run(['create', '--email', 'a@b.co', '--name', 'Ana Gomez'], {
      isTerminal: true,
      ask: async () => mismatch.shift(),
    }),
    1,
  );
  assert.match(other.err.join('\n'), /not the same/);
  assert.equal(other.adminRepository.list().length, 0);
});

test('without a terminal and without --password-stdin nothing is created', async () => {
  const t = setup();
  const code = await t.run(['create', '--email', 'a@b.co', '--name', 'Ana Gomez']);

  assert.equal(code, 1);
  assert.match(t.err.join('\n'), /--password-stdin/);
  assert.equal(t.adminRepository.list().length, 0);
});

test('weak passwords, bad emails, missing options and duplicates are refused with a clear message', async () => {
  const t = setup();

  assert.equal(
    await t.run(['create', '--email', 'a@b.co', '--name', 'Ana Gomez', '--password-stdin'], {
      stdin: stdinWith('short'),
    }),
    1,
  );
  assert.match(t.err.join('\n'), /at least 12 characters/);

  assert.equal(
    await t.run(['create', '--email', 'nope', '--name', 'Ana Gomez', '--password-stdin'], {
      stdin: stdinWith(TEST_PASSWORD),
    }),
    1,
  );
  assert.equal(await t.run(['create', '--password-stdin'], { stdin: stdinWith(TEST_PASSWORD) }), 1);
  assert.equal(t.adminRepository.list().length, 0);

  await t.run(['create', '--email', 'a@b.co', '--name', 'Ana Gomez', '--password-stdin'], {
    stdin: stdinWith(TEST_PASSWORD),
  });
  t.err.length = 0;
  assert.equal(
    await t.run(['create', '--email', 'A@B.co', '--name', 'Other Name', '--password-stdin'], {
      stdin: stdinWith(TEST_PASSWORD),
    }),
    1,
  );
  assert.match(t.err.join('\n'), /already exists/);
});

test('the password never appears in the output', async () => {
  const t = setup();
  await t.run(['create', '--email', 'a@b.co', '--name', 'Ana Gomez', '--password-stdin'], {
    stdin: stdinWith(TEST_PASSWORD),
  });
  await t.run(['list']);

  assert.equal([...t.out, ...t.err].join('\n').includes(TEST_PASSWORD), false);
  assert.equal(/scrypt/.test([...t.out, ...t.err].join('\n')), false);
});

test('reset-password changes the password and closes every session of that account', async () => {
  const t = setup();
  await t.run(['create', '--email', 'a@b.co', '--name', 'Ana Gomez', '--password-stdin'], {
    stdin: stdinWith(TEST_PASSWORD),
  });
  const { token } = await t.authService.login({ email: 'a@b.co', password: TEST_PASSWORD });
  assert.ok(t.authService.authenticate(token));

  const code = await t.run(['reset-password', '--email', 'a@b.co', '--password-stdin'], {
    stdin: stdinWith(OTHER_PASSWORD),
  });

  assert.equal(code, 0);
  assert.equal(t.authService.authenticate(token), null);
  await assert.rejects(t.authService.login({ email: 'a@b.co', password: TEST_PASSWORD }), {
    status: 401,
  });
  assert.ok(await t.authService.login({ email: 'a@b.co', password: OTHER_PASSWORD }));
});

test('reset-password for an unknown account or with a weak password changes nothing', async () => {
  const t = setup();
  await t.run(['create', '--email', 'a@b.co', '--name', 'Ana Gomez', '--password-stdin'], {
    stdin: stdinWith(TEST_PASSWORD),
  });

  assert.equal(
    await t.run(['reset-password', '--email', 'who@b.co', '--password-stdin'], {
      stdin: stdinWith(OTHER_PASSWORD),
    }),
    1,
  );
  assert.equal(
    await t.run(['reset-password', '--email', 'a@b.co', '--password-stdin'], {
      stdin: stdinWith('short'),
    }),
    1,
  );
  assert.ok(await t.authService.login({ email: 'a@b.co', password: TEST_PASSWORD }));
});

test('a reset does not reactivate a deactivated account', async () => {
  const t = setup();
  await t.run(['create', '--email', 'a@b.co', '--name', 'Ana Gomez', '--password-stdin'], {
    stdin: stdinWith(TEST_PASSWORD),
  });
  await t.run(['create', '--email', 'b@b.co', '--name', 'Backup Admin', '--password-stdin'], {
    stdin: stdinWith(TEST_PASSWORD),
  });
  await t.run(['deactivate', '--email', 'a@b.co']);
  await t.run(['reset-password', '--email', 'a@b.co', '--password-stdin'], {
    stdin: stdinWith(OTHER_PASSWORD),
  });

  await assert.rejects(t.authService.login({ email: 'a@b.co', password: OTHER_PASSWORD }), {
    status: 401,
  });

  await t.run(['activate', '--email', 'a@b.co']);
  assert.ok(await t.authService.login({ email: 'a@b.co', password: OTHER_PASSWORD }));
});

test('deactivate closes the sessions of the account', async () => {
  const t = setup();
  await t.run(['create', '--email', 'a@b.co', '--name', 'Ana Gomez', '--password-stdin'], {
    stdin: stdinWith(TEST_PASSWORD),
  });
  await t.run(['create', '--email', 'b@b.co', '--name', 'Backup Admin', '--password-stdin'], {
    stdin: stdinWith(TEST_PASSWORD),
  });
  const { token } = await t.authService.login({ email: 'a@b.co', password: TEST_PASSWORD });

  assert.equal(await t.run(['deactivate', '--email', 'a@b.co']), 0);
  assert.equal(t.authService.authenticate(token), null);
  assert.equal(await t.run(['deactivate', '--email', 'nobody@b.co']), 1);
});

test('list shows the accounts and whether they are active', async () => {
  const t = setup();
  await t.run(['list']);
  assert.match(t.out[0], /no administrators yet/);

  await t.run(['create', '--email', 'a@b.co', '--name', 'Ana Gomez', '--password-stdin'], {
    stdin: stdinWith(TEST_PASSWORD),
  });
  await t.run(['create', '--email', 'b@b.co', '--name', 'Backup Admin', '--password-stdin'], {
    stdin: stdinWith(TEST_PASSWORD),
  });
  await t.run(['deactivate', '--email', 'a@b.co']);
  t.out.length = 0;
  await t.run(['list']);

  assert.match(t.out[0], /a@b\.co\s+DEACTIVATED\s+"Ana Gomez"/);
});

test('unknown commands print the usage and fail; help does not fail', async () => {
  const t = setup();

  assert.equal(await t.run(['explode']), 1);
  assert.match(t.err.join('\n'), /Unknown command/);
  assert.equal(await t.run([]), 0);
  assert.match(t.err.join('\n'), /Usage: npm run admin/);
});

test('no administrator exists in a fresh database: there are no default credentials', () => {
  const t = setup();

  assert.deepEqual(t.adminRepository.list(), []);
  assert.equal(t.db.prepare('SELECT COUNT(*) AS n FROM admins').get().n, 0);
});
