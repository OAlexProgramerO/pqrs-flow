import { once } from 'node:events';

process.env.NODE_ENV = 'test';
const { app } = await import('../../src/app.js');

/**
 * Starts the app on a random free port and returns its base URL
 * plus a function to stop it.
 */
export async function startServer() {
  const server = app.listen(0);
  await once(server, 'listening');
  const { port } = server.address();

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => {
      server.closeAllConnections();
      return new Promise((resolve) => server.close(resolve));
    },
  };
}
