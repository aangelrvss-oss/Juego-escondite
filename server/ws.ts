// WebSocket mínimo (RFC 6455) sobre node:http, sin dependencias. Solo lo que necesita el juego:
// mensajes de texto UTF-8 sin fragmentar, ping/pong y cierre. Todo lo demás cierra la conexión.
// Los navegadores, la WebView de Android y el WebSocket nativo de Node envían mensajes pequeños
// sin fragmentar, así que no hace falta reensamblar fragmentos.

import { createHash } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

export interface WsOptions {
  maxPayloadBytes: number; // mensaje más grande admitido; por encima se cierra con 1009
  maxBufferedBytes: number; // cliente que no lee: por encima se corta la conexión
  idleTimeoutMs: number; // sin recibir nada en este tiempo se corta (el cliente hace ping)
  // Ping de protocolo del servidor. Lo contesta la pila de red del cliente, sin JavaScript: mantiene
  // viva la conexión con la página dormida (pantalla bloqueada) y evita que un túnel la cierre por
  // inactividad. 0 lo desactiva.
  pingIntervalMs?: number;
}

export interface WsConnection {
  send(text: string): void;
  close(code: number, reason: string): void;
  onMessage: (text: string) => void;
  onClose: () => void;
  readonly open: boolean;
}

const decoder = new TextDecoder('utf-8', { fatal: true });

function frame(opcode: number, payload: Buffer): Buffer {
  const len = payload.length;
  const head = len < 126 ? Buffer.alloc(2) : len < 65_536 ? Buffer.alloc(4) : Buffer.alloc(10);
  head[0] = 0x80 | opcode; // FIN + opcode; el servidor nunca enmascara
  if (len < 126) head[1] = len;
  else if (len < 65_536) {
    head[1] = 126;
    head.writeUInt16BE(len, 2);
  } else {
    head[1] = 127;
    head.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([head, payload]);
}

/** Comprueba la petición de upgrade. Devuelve la clave del cliente o null si no es un WebSocket válido. */
export function handshakeKey(req: IncomingMessage): string | null {
  const key = req.headers['sec-websocket-key'];
  if (req.method !== 'GET' || typeof key !== 'string') return null;
  if (String(req.headers.upgrade).toLowerCase() !== 'websocket') return null;
  if (req.headers['sec-websocket-version'] !== '13') return null;
  return Buffer.from(key, 'base64').length === 16 ? key : null;
}

export function rejectUpgrade(socket: Duplex, status: number, text: string): void {
  socket.end(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}

export function acceptWebSocket(socket: Duplex, key: string, head: Buffer, opts: WsOptions): WsConnection {
  const accept = createHash('sha1').update(key + GUID).digest('base64');
  socket.write(
    `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
  );

  let buffer: Buffer = head.length > 0 ? Buffer.from(head) : Buffer.alloc(0);
  let open = true;
  let idle: NodeJS.Timeout | undefined;
  let pinger: NodeJS.Timeout | undefined;

  const conn: WsConnection = {
    onMessage: () => {},
    onClose: () => {},
    get open() {
      return open;
    },
    send(text: string) {
      if (!open) return;
      if ((socket as Duplex & { writableLength: number }).writableLength > opts.maxBufferedBytes) {
        terminate();
        return;
      }
      socket.write(frame(0x1, Buffer.from(text, 'utf8')));
    },
    close(code: number, reason: string) {
      if (!open) return;
      const payload = Buffer.alloc(2 + Buffer.byteLength(reason));
      payload.writeUInt16BE(code, 0);
      payload.write(reason, 2);
      socket.write(frame(0x8, payload));
      finish();
      socket.end();
    },
  };

  function finish(): void {
    if (!open) return;
    open = false;
    if (idle) clearTimeout(idle);
    if (pinger) clearInterval(pinger);
    conn.onClose();
  }

  function terminate(): void {
    finish();
    socket.destroy();
  }

  function touch(): void {
    if (idle) clearTimeout(idle);
    idle = setTimeout(terminate, opts.idleTimeoutMs);
    idle.unref?.();
  }

  // Analiza todas las tramas completas del búfer; ante cualquier violación del protocolo, cierra.
  function parse(): void {
    while (open && buffer.length >= 2) {
      const b0 = buffer[0]!;
      const b1 = buffer[1]!;
      const fin = (b0 & 0x80) !== 0;
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f;
      let offset = 2;
      if (len === 126) {
        if (buffer.length < 4) return;
        len = buffer.readUInt16BE(2);
        offset = 4;
      } else if (len === 127) {
        if (buffer.length < 10) return;
        const big = buffer.readBigUInt64BE(2);
        if (big > BigInt(opts.maxPayloadBytes)) return conn.close(1009, 'too big');
        len = Number(big);
        offset = 10;
      }
      if ((b0 & 0x70) !== 0 || !masked) return conn.close(1002, 'protocol error');
      if (len > opts.maxPayloadBytes) return conn.close(1009, 'too big');
      if (buffer.length < offset + 4 + len) return;
      const mask = buffer.subarray(offset, offset + 4);
      const payload = Buffer.from(buffer.subarray(offset + 4, offset + 4 + len));
      for (let i = 0; i < payload.length; i++) payload[i]! ^= mask[i % 4]!;
      buffer = buffer.subarray(offset + 4 + len);

      if (opcode === 0x8) {
        // Cierre del cliente: se responde con el mismo código si lo trae.
        const code = payload.length >= 2 ? payload.readUInt16BE(0) : 1000;
        return conn.close(code === 1005 || code < 1000 || code >= 5000 ? 1000 : code, '');
      }
      if (opcode === 0x9) {
        if (len > 125) return conn.close(1002, 'protocol error');
        socket.write(frame(0xa, payload));
        continue;
      }
      if (opcode === 0xa) continue;
      if (opcode !== 0x1 || !fin) return conn.close(1003, 'text only');
      let text: string;
      try {
        text = decoder.decode(payload);
      } catch {
        return conn.close(1007, 'invalid utf-8');
      }
      conn.onMessage(text);
    }
  }

  socket.on('data', (chunk: Buffer) => {
    if (!open) return;
    touch();
    buffer = buffer.length === 0 ? chunk : Buffer.concat([buffer, chunk]);
    if (buffer.length > opts.maxPayloadBytes + 14) {
      // Una trama no puede ocupar más que el máximo más su cabecera: es un abuso.
      parse();
      if (open && buffer.length > opts.maxPayloadBytes + 14) conn.close(1009, 'too big');
      return;
    }
    parse();
  });
  socket.on('close', finish);
  socket.on('error', terminate);
  touch();
  if (opts.pingIntervalMs) {
    pinger = setInterval(() => {
      if (open) socket.write(frame(0x9, Buffer.alloc(0)));
    }, opts.pingIntervalMs);
    pinger.unref?.();
  }
  queueMicrotask(parse); // por si el cliente envió datos junto con la petición de upgrade
  return conn;
}
