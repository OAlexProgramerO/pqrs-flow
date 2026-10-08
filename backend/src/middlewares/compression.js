import zlib from 'node:zlib';

const DEFAULT_THRESHOLD = 1024;

// The server's order of preference when the client gives both the same weight
const ENCODINGS = ['br', 'gzip'];

const COMPRESSIBLE_TYPES = new Set([
  'application/javascript',
  'application/json',
  'application/xml',
]);

/**
 * Tells if a Content-Type is text that shrinks well (HTML, CSS, JS, JSON, SVG...).
 * Images, fonts and archives are already compressed, so they are left alone.
 */
export function isCompressible(contentType) {
  if (!contentType) return false;

  const type = String(contentType).split(';')[0].trim().toLowerCase();
  return (
    type.startsWith('text/') ||
    COMPRESSIBLE_TYPES.has(type) ||
    type.endsWith('+json') ||
    type.endsWith('+xml')
  );
}

/**
 * Picks the best encoding the client accepts from its Accept-Encoding header.
 * Returns "br", "gzip" or null when the answer must go as it is.
 * Weights are respected: "gzip;q=0.5, br;q=0.4" gives gzip and "br;q=0" refuses brotli.
 */
export function pickEncoding(header) {
  if (!header) return null;

  const weights = new Map();
  for (const part of String(header).split(',')) {
    const [name, ...params] = part.trim().toLowerCase().split(';');
    if (!name.trim()) continue;

    let weight = 1;
    for (const param of params) {
      const [key, value] = param.split('=').map((item) => item.trim());
      if (key === 'q') weight = Number(value);
    }
    weights.set(name.trim(), Number.isNaN(weight) ? 0 : weight);
  }

  let best = null;
  let bestWeight = 0;
  for (const encoding of ENCODINGS) {
    const weight = weights.get(encoding) ?? weights.get('*') ?? 0;
    if (weight > bestWeight) {
      best = encoding;
      bestWeight = weight;
    }
  }
  return best;
}

// The size of the body when it is already known before sending, or undefined when it is not
function knownLength(res, chunk, encoding, isLast) {
  const header = res.getHeader('Content-Length');
  if (header !== undefined) return Number(header);

  if (!isLast) return undefined;
  if (chunk === undefined || chunk === null) return 0;
  if (typeof chunk === 'string') return Buffer.byteLength(chunk, encoding);
  if (chunk instanceof Uint8Array) return chunk.length;
  return undefined;
}

/**
 * Compresses the answers with gzip or brotli, using only the zlib module of Node.
 *
 * It leaves an answer alone when:
 * - the client did not ask for compression (Accept-Encoding)
 * - the content is not text, or it is smaller than `threshold` bytes
 * - the answer is already encoded, is partial (206), has no body (204, 304) or answers a HEAD
 * - the Cache-Control header says "no-transform"
 *
 * The answer is compressed while it is sent, so large files never wait in memory.
 * Every answer that could be compressed gets `Vary: Accept-Encoding`, so caches keep
 * the compressed and the plain version apart.
 */
export function compression({ threshold = DEFAULT_THRESHOLD } = {}) {
  return function compress(req, res, next) {
    const { write, end } = res;
    let decided = false;
    let stream = null;
    let backedUp = false;
    let ended = false;

    // Runs once, just before the first byte leaves, when status and headers are final
    function decide(chunk, encoding, isLast) {
      decided = true;

      if (res.headersSent || req.method === 'HEAD') return;

      const status = res.statusCode;
      if (status < 200 || status === 204 || status === 206 || status === 304) return;
      if (res.getHeader('Content-Encoding') || res.getHeader('Content-Range')) return;
      if (/\bno-transform\b/i.test(String(res.getHeader('Cache-Control') ?? ''))) return;
      if (!isCompressible(res.getHeader('Content-Type'))) return;

      const length = knownLength(res, chunk, encoding, isLast);
      if (length !== undefined && length < threshold) return;

      // Compressed or not, the answer depends on this request header
      res.vary('Accept-Encoding');

      const name = pickEncoding(req.headers['accept-encoding']);
      if (!name) return;

      res.setHeader('Content-Encoding', name);
      res.removeHeader('Content-Length');
      res.removeHeader('Accept-Ranges');

      // A compressed body is not byte for byte the same, so a strong ETag becomes weak
      const etag = res.getHeader('ETag');
      if (typeof etag === 'string' && !etag.startsWith('W/')) res.setHeader('ETag', `W/${etag}`);

      stream =
        name === 'br'
          ? zlib.createBrotliCompress({ params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 } })
          : zlib.createGzip();

      stream.on('data', (data) => {
        // The client is slow: stop compressing until the connection can take more
        if (write.call(res, data) === false) {
          backedUp = true;
          stream.pause();
        }
      });
      stream.on('end', () => end.call(res));
      stream.on('error', () => res.destroy());

      res.on('drain', () => {
        backedUp = false;
        stream.resume();
      });
      res.on('close', () => stream.destroy());
    }

    res.write = function patchedWrite(chunk, encoding, callback) {
      if (!decided) decide(chunk, encoding, false);
      if (!stream) return write.call(this, chunk, encoding, callback);

      if (typeof encoding === 'function') {
        callback = encoding;
        encoding = undefined;
      }
      stream.write(chunk, encoding, callback);

      // Returning false makes the sender wait for the "drain" event of the response
      return !backedUp;
    };

    res.end = function patchedEnd(chunk, encoding, callback) {
      if (typeof chunk === 'function') {
        callback = chunk;
        chunk = undefined;
        encoding = undefined;
      } else if (typeof encoding === 'function') {
        callback = encoding;
        encoding = undefined;
      }

      if (!decided) decide(chunk, encoding, true);
      if (!stream) return end.call(this, chunk, encoding, callback);

      if (ended) return this;
      ended = true;

      if (callback) this.once('finish', callback);
      stream.end(chunk, encoding);
      return this;
    };

    next();
  };
}
