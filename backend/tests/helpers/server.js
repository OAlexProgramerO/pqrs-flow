import { once } from 'node:events';

process.env.NODE_ENV = 'test';
const { app, createApp } = await import('../../src/app.js');

/**
 * Starts the app on a random free port and returns its base URL plus a function to stop it.
 * Pass createApp options (for example a getRepository function) to run an isolated instance.
 */
export async function startServer(options) {
  const server = (options ? createApp(options) : app).listen(0);
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
