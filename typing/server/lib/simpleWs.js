const crypto = require('crypto');
const { EventEmitter } = require('events');
const { URL } = require('url');

const READY_STATE = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3
};

function createAcceptValue(clientKey) {
  return crypto
    .createHash('sha1')
    .update(`${clientKey}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`, 'utf8')
    .digest('base64');
}

function encodeFrame(opcode, payloadBuffer) {
  const payload = Buffer.isBuffer(payloadBuffer) ? payloadBuffer : Buffer.from(payloadBuffer || '');
  let header;

  if (payload.length < 126) {
    header = Buffer.alloc(2);
    header[1] = payload.length;
  } else if (payload.length <= 0xffff) {
    header = Buffer.alloc(4);
    header[1] = 126;
    header.writeUInt16BE(payload.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(payload.length), 2);
  }

  header[0] = 0x80 | (opcode & 0x0f);
  return Buffer.concat([header, payload]);
}

class SimpleWebSocket extends EventEmitter {
  constructor(socket) {
    super();
    this.socket = socket;
    this.readyState = READY_STATE.OPEN;
    this.buffer = Buffer.alloc(0);
    this.closeSent = false;
    this._closed = false;

    socket.on('data', (chunk) => {
      this._onData(chunk);
    });

    socket.on('close', () => {
      this._handleClosed();
    });

    socket.on('end', () => {
      this._handleClosed();
    });

    socket.on('error', (error) => {
      this.emit('error', error);
      this._handleClosed();
    });
  }

  send(data) {
    if (this.readyState !== READY_STATE.OPEN) {
      return;
    }

    const payload = Buffer.from(String(data), 'utf8');
    this.socket.write(encodeFrame(0x1, payload));
  }

  close(code = 1000, reason = '') {
    if (this.readyState === READY_STATE.CLOSED || this.readyState === READY_STATE.CLOSING) {
      return;
    }

    this.readyState = READY_STATE.CLOSING;
    const reasonBuffer = Buffer.from(String(reason), 'utf8');
    const payload = Buffer.alloc(2 + reasonBuffer.length);
    payload.writeUInt16BE(code, 0);
    reasonBuffer.copy(payload, 2);

    if (!this.closeSent) {
      this.closeSent = true;
      try {
        this.socket.write(encodeFrame(0x8, payload));
      } catch {
        // noop
      }
    }

    try {
      this.socket.end();
    } catch {
      this._handleClosed();
    }
  }

  _onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (true) {
      const frame = this._readFrame();
      if (!frame) {
        break;
      }

      if (frame.opcode === 0x8) {
        if (!this.closeSent) {
          this.closeSent = true;
          try {
            this.socket.write(encodeFrame(0x8, frame.payload));
          } catch {
            // noop
          }
        }
        this._handleClosed();
        try {
          this.socket.end();
        } catch {
          // noop
        }
        break;
      }

      if (frame.opcode === 0x9) {
        try {
          this.socket.write(encodeFrame(0xA, frame.payload));
        } catch {
          // noop
        }
        continue;
      }

      if (frame.opcode === 0xA) {
        continue;
      }

      if (frame.opcode === 0x1) {
        this.emit('message', frame.payload.toString('utf8'));
      }
    }
  }

  _readFrame() {
    if (this.buffer.length < 2) {
      return null;
    }

    const firstByte = this.buffer[0];
    const secondByte = this.buffer[1];
    const opcode = firstByte & 0x0f;
    const masked = (secondByte & 0x80) !== 0;
    let payloadLength = secondByte & 0x7f;
    let offset = 2;

    if (payloadLength === 126) {
      if (this.buffer.length < 4) {
        return null;
      }
      payloadLength = this.buffer.readUInt16BE(2);
      offset = 4;
    } else if (payloadLength === 127) {
      if (this.buffer.length < 10) {
        return null;
      }
      payloadLength = Number(this.buffer.readBigUInt64BE(2));
      offset = 10;
    }

    const maskLength = masked ? 4 : 0;
    if (this.buffer.length < offset + maskLength + payloadLength) {
      return null;
    }

    const mask = masked ? this.buffer.subarray(offset, offset + 4) : null;
    offset += maskLength;

    const payload = Buffer.from(this.buffer.subarray(offset, offset + payloadLength));
    this.buffer = this.buffer.subarray(offset + payloadLength);

    if (mask) {
      for (let i = 0; i < payload.length; i += 1) {
        payload[i] ^= mask[i % 4];
      }
    }

    return {
      opcode,
      payload
    };
  }

  _handleClosed() {
    if (this._closed) {
      return;
    }
    this._closed = true;
    this.readyState = READY_STATE.CLOSED;
    this.emit('close');
  }
}

class SimpleWebSocketServer extends EventEmitter {
  constructor(options = {}) {
    super();
    this.server = options.server;
    this.path = options.path || '/';

    if (this.server) {
      this.server.on('upgrade', (req, socket) => {
        this._handleUpgrade(req, socket);
      });
    }
  }

  _handleUpgrade(req, socket) {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      if (url.pathname !== this.path) {
        socket.destroy();
        return;
      }
    } catch {
      socket.destroy();
      return;
    }

    const connection = String(req.headers.connection || '').toLowerCase();
    const upgrade = String(req.headers.upgrade || '').toLowerCase();
    const clientKey = req.headers['sec-websocket-key'];

    if (!connection.includes('upgrade') || upgrade !== 'websocket' || !clientKey) {
      socket.destroy();
      return;
    }

    const acceptValue = createAcceptValue(clientKey);
    const headers = [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${acceptValue}`,
      '\r\n'
    ];

    socket.write(headers.join('\r\n'));

    const ws = new SimpleWebSocket(socket);
    this.emit('connection', ws, req);
  }
}

module.exports = {
  SimpleWebSocketServer,
  READY_STATE,
  OPEN: READY_STATE.OPEN
};
