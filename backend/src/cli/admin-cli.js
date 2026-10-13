import readline from 'node:readline';
import { Writable } from 'node:stream';
import { AccountError } from '../services/admin-accounts.js';

export const USAGE = `Usage: npm run admin -- <command> [options]

Commands:
  create          --email <address> --name "<full name>" [--password-stdin]
  reset-password  --email <address> [--password-stdin]
  deactivate      --email <address>
  activate        --email <address>
  list

The password is never taken from the command line or from the environment, because both
end up in shell history and process listings. Without --password-stdin it is asked twice in
the terminal, and what you type is not shown. For scripts, send it through standard input:

  printf '%s' "$PASSWORD" | npm run admin -- create --email ana@example.com --name "Ana Gomez" --password-stdin
`;

const VALUE_OPTIONS = { '--email': 'email', '--name': 'name' };

/**
 * Reads the command and its options. Returns { command, options } or { error }.
 */
export function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = { passwordStdin: false };

  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index];

    if (flag === '--password-stdin') {
      options.passwordStdin = true;
    } else if (Object.hasOwn(VALUE_OPTIONS, flag)) {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith('--')) return { error: `${flag} needs a value.` };
      options[VALUE_OPTIONS[flag]] = value;
      index += 1;
    } else if (flag === '--password' || flag.startsWith('--password=')) {
      return {
        error: 'Passwords are not accepted as arguments. Use --password-stdin or the prompt.',
      };
    } else {
      return { error: `Unknown option: ${flag}` };
    }
  }

  return { command, options };
}

/**
 * Asks for a text in the terminal without showing what is typed.
 * The question goes to stderr, so stdout stays clean for scripts.
 */
export function promptHidden(question, { input = process.stdin, output = process.stderr } = {}) {
  return new Promise((resolve) => {
    let muted = false;
    const sink = new Writable({
      write(chunk, encoding, callback) {
        if (!muted) output.write(chunk, encoding);
        callback();
      },
    });

    const rl = readline.createInterface({ input, output: sink, terminal: true });
    rl.question(question, (answer) => {
      rl.close();
      output.write('\n');
      resolve(answer);
    });

    // The question is already on the screen: from here on the typed characters are hidden
    muted = true;
  });
}

/**
 * Reads the whole standard input as a password. One final line break is removed.
 */
export async function readPasswordFromStdin(input = process.stdin) {
  let text = '';
  input.setEncoding('utf8');
  for await (const chunk of input) text += chunk;

  return text.replace(/\r?\n$/, '');
}

async function obtainPassword(options, { stdin, ask, isTerminal }) {
  if (options.passwordStdin) return stdin();

  if (!isTerminal) {
    throw new AccountError('There is no terminal to ask for the password. Use --password-stdin.');
  }

  const password = await ask('Password: ');
  const confirmation = await ask('Repeat the password: ');
  if (password !== confirmation) throw new AccountError('The two passwords are not the same.');

  return password;
}

function printAdmin(log, admin) {
  log(
    `${admin.email}  ${admin.isActive ? 'active' : 'DEACTIVATED'}  "${admin.displayName}"  id ${admin.id}`,
  );
}

/**
 * Runs a command of the account tool. Resolves with the exit code (0 when everything went well).
 * The dependencies are injected, so the tests run it without a terminal.
 */
export async function runAdminCli(
  argv,
  {
    accountService,
    stdin = readPasswordFromStdin,
    ask = promptHidden,
    isTerminal = Boolean(process.stdin.isTTY),
    log = console.log,
    logError = console.error,
  },
) {
  const parsed = parseArgs(argv);

  if (parsed.error || !parsed.command || parsed.command === 'help') {
    if (parsed.error) logError(parsed.error);
    logError(USAGE);
    return parsed.error ? 1 : 0;
  }

  const { command, options } = parsed;

  try {
    switch (command) {
      case 'create': {
        if (!options.email || !options.name)
          throw new AccountError('--email and --name are required.');

        const password = await obtainPassword(options, { stdin, ask, isTerminal });
        const admin = await accountService.create({
          email: options.email,
          displayName: options.name,
          password,
        });

        log(`Administrator created: ${admin.email} (id ${admin.id}).`);
        log('They can log in at /admin/login.html');
        return 0;
      }

      case 'reset-password': {
        if (!options.email) throw new AccountError('--email is required.');

        const password = await obtainPassword(options, { stdin, ask, isTerminal });
        const admin = await accountService.resetPassword({ email: options.email, password });

        log(`Password changed for ${admin.email}. Every session of that account was closed.`);
        return 0;
      }

      case 'deactivate':
      case 'activate': {
        if (!options.email) throw new AccountError('--email is required.');

        const admin = accountService.setActive(options.email, command === 'activate');
        log(`${admin.email} is now ${admin.isActive ? 'active' : 'deactivated'}.`);
        return 0;
      }

      case 'list': {
        const admins = accountService.list();
        if (admins.length === 0) log('There are no administrators yet. Create one with: create');
        for (const admin of admins) printAdmin(log, admin);
        return 0;
      }

      default:
        logError(`Unknown command: ${command}`);
        logError(USAGE);
        return 1;
    }
  } catch (error) {
    if (!(error instanceof AccountError)) throw error;

    logError(error.message);
    for (const message of Object.values(error.details ?? {})) logError(`  - ${message}`);
    return 1;
  }
}
