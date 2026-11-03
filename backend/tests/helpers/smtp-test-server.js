import net from 'node:net';

export async function startSmtpTestServer({ rejectRecipientCode = null, rejectAuth = false } = {}) {
  const messages = [];
  const clients = new Set();
  const server = net.createServer((socket) => {
    clients.add(socket);
    socket.setEncoding('utf8');
    socket.write('220 pqrs-flow-test ESMTP\r\n');
    let input = '';
    let message = '';
    let inData = false;
    let authStep = 0;

    socket.on('data', (chunk) => {
      input += chunk;
      while (input.length > 0) {
        if (inData) {
          const end = input.indexOf('\r\n.\r\n');
          if (end === -1) {
            message += input;
            input = '';
            break;
          }
          message += input.slice(0, end);
          input = input.slice(end + 5);
          messages.push(message);
          message = '';
          inData = false;
          socket.write('250 2.0.0 queued\r\n');
          continue;
        }

        const end = input.indexOf('\r\n');
        if (end === -1) break;
        const line = input.slice(0, end);
        input = input.slice(end + 2);

        if (/^EHLO /i.test(line) || /^HELO /i.test(line)) {
          socket.write(
            rejectAuth
              ? '250-pqrs-flow-test\r\n250-AUTH LOGIN PLAIN\r\n250 SIZE 10485760\r\n'
              : '250-pqrs-flow-test\r\n250 SIZE 10485760\r\n',
          );
        } else if (/^AUTH PLAIN /i.test(line)) {
          socket.write(
            rejectAuth ? '535 5.7.8 invalid credentials\r\n' : '235 2.7.0 authenticated\r\n',
          );
        } else if (/^AUTH LOGIN/i.test(line)) {
          authStep = 1;
          socket.write('334 VXNlcm5hbWU6\r\n');
        } else if (authStep === 1) {
          authStep = 2;
          socket.write('334 UGFzc3dvcmQ6\r\n');
        } else if (authStep === 2) {
          authStep = 0;
          socket.write(
            rejectAuth ? '535 5.7.8 invalid credentials\r\n' : '235 2.7.0 authenticated\r\n',
          );
        } else if (/^MAIL FROM:/i.test(line)) {
          socket.write('250 2.1.0 sender ok\r\n');
        } else if (/^RCPT TO:/i.test(line)) {
          socket.write(
            rejectRecipientCode
              ? `${rejectRecipientCode} 5.1.1 recipient rejected\r\n`
              : '250 2.1.5 recipient ok\r\n',
          );
        } else if (/^DATA$/i.test(line)) {
          inData = true;
          socket.write('354 end with <CRLF>.<CRLF>\r\n');
        } else if (/^QUIT$/i.test(line)) {
          socket.write('221 2.0.0 bye\r\n');
          socket.end();
        } else if (/^RSET$/i.test(line)) {
          socket.write('250 2.0.0 reset\r\n');
        } else if (/^NOOP$/i.test(line)) {
          socket.write('250 2.0.0 ok\r\n');
        } else {
          socket.write('500 5.5.2 unsupported command\r\n');
        }
      }
    });
    socket.on('close', () => clients.delete(socket));
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  return {
    port: server.address().port,
    messages,
    async close() {
      for (const client of clients) client.destroy();
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}
