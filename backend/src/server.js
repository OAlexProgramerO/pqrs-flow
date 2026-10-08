import { app } from './app.js';
import { env } from './config/env.js';

if (env.trustProxy === true) {
  console.warn(
    'TRUST_PROXY=true trusts every X-Forwarded-For value, so anyone can fake their ' +
      'address and skip the rate limits. Use the number of proxies in front of the app ' +
      'instead, for example 1.',
  );
}

const server = app.listen(env.port, () => {
  console.log(`PQRS Flow listening on http://localhost:${env.port}`);
});

// Proxies and load balancers keep idle connections open for about a minute. Node closes them
// after 5 seconds by default, which shows up as random 502 errors. These values stay above that.
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;
