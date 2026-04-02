const http = require('http');
const os = require('os');
const { randomUUID } = require('crypto');

const DEFAULT_PORT = 38888;
const MAX_PORT_ATTEMPTS = 20;
const MAX_BODY_SIZE = 1024 * 1024;
const MAX_SCANS = 30;

function getAddressScore(address) {
  if (address.startsWith('192.168.')) {
    return 0;
  }

  if (address.startsWith('10.')) {
    return 1;
  }

  if (address.startsWith('172.')) {
    const second = Number(address.split('.')[1]);
    if (second >= 16 && second <= 31) {
      return 2;
    }
  }

  return 3;
}

function listIpv4Addresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];

  for (const group of Object.values(interfaces)) {
    for (const item of group || []) {
      if (!item || item.family !== 'IPv4' || item.internal) {
        continue;
      }

      addresses.push(item.address);
    }
  }

  return Array.from(new Set(addresses)).sort((left, right) => {
    const scoreDelta = getAddressScore(left) - getAddressScore(right);
    if (scoreDelta !== 0) {
      return scoreDelta;
    }

    return left.localeCompare(right);
  });
}

function withCors(response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(response, statusCode, payload) {
  withCors(response);
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8'
  });
  response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, payload) {
  withCors(response);
  response.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8'
  });
  response.end(payload);
}

function normalizeIp(rawIp) {
  if (!rawIp) {
    return '';
  }

  return rawIp.replace('::ffff:', '');
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let received = 0;
    let body = '';

    request.setEncoding('utf8');

    request.on('data', (chunk) => {
      received += chunk.length;
      if (received > MAX_BODY_SIZE) {
        reject(new Error('Request body too large'));
        request.destroy();
        return;
      }

      body += chunk;
    });

    request.on('end', () => {
      if (!body.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error('Invalid JSON body'));
      }
    });

    request.on('error', reject);
  });
}

function createDemoServer(options = {}) {
  const { onStateChange } = options;

  const state = {
    port: null,
    token: randomUUID(),
    startedAt: new Date().toISOString(),
    lastHeartbeat: null,
    scans: [],
    devices: []
  };

  let server = null;
  const seenContents = new Set();

  function buildUrls() {
    const addresses = listIpv4Addresses();
    const recommendedHost = addresses[0] || '127.0.0.1';
    const localhost = `http://127.0.0.1:${state.port}`;
    const recommended = `http://${recommendedHost}:${state.port}`;
    const alternatives = addresses.slice(1).map((host) => `http://${host}:${state.port}`);

    return {
      recommended,
      localhost,
      alternatives,
      rawAddresses: addresses
    };
  }

  function getState() {
    const serverUrls = state.port ? buildUrls() : null;
    const pairPayload = serverUrls
      ? {
          type: 'electron-scan-demo-pair',
          serverUrl: serverUrls.recommended,
          token: state.token
        }
      : null;
    const pairText = pairPayload
      ? `electron-scan-demo://pair?serverUrl=${encodeURIComponent(pairPayload.serverUrl)}&token=${encodeURIComponent(pairPayload.token)}`
      : '';

    return {
      port: state.port,
      token: state.token,
      startedAt: state.startedAt,
      serverUrls,
      lastHeartbeat: state.lastHeartbeat,
      devices: [...state.devices].sort((left, right) => {
        return new Date(right.lastSeenAt).getTime() - new Date(left.lastSeenAt).getTime();
      }),
      scans: [...state.scans],
      lastScan: state.scans[0] || null,
      pairPayload,
      pairText
    };
  }

  function notify() {
    if (typeof onStateChange === 'function') {
      onStateChange(getState());
    }
  }

  function isAuthorized(body) {
    return body && typeof body.token === 'string' && body.token === state.token;
  }

  function getDeviceKey(deviceName, platform, clientIp) {
    return [deviceName, platform, clientIp].join('::');
  }

  function upsertDevice(payload) {
    const deviceName = String(payload.deviceName || 'unknown-device');
    const platform = String(payload.platform || 'unknown-platform');
    const clientIp = normalizeIp(payload.clientIp);
    const key = getDeviceKey(deviceName, platform, clientIp);
    const now = new Date().toISOString();

    const existing = state.devices.find((item) => item.key === key);
    if (existing) {
      existing.deviceName = deviceName;
      existing.platform = platform;
      existing.clientIp = clientIp;
      existing.lastSeenAt = now;
      if (payload.lastHeartbeatAt) {
        existing.lastHeartbeatAt = payload.lastHeartbeatAt;
      }
      if (payload.lastScanAt) {
        existing.lastScanAt = payload.lastScanAt;
      }
      return existing;
    }

    const next = {
      key,
      deviceName,
      platform,
      clientIp,
      connectedAt: now,
      lastSeenAt: now,
      lastHeartbeatAt: payload.lastHeartbeatAt || null,
      lastScanAt: payload.lastScanAt || null
    };

    state.devices.push(next);
    return next;
  }

  async function handleHeartbeat(request, response) {
    const body = await readJsonBody(request);
    if (!isAuthorized(body)) {
      sendJson(response, 401, {
        ok: false,
        error: 'token 不正确'
      });
      return;
    }

    state.lastHeartbeat = {
      deviceName: String(body.deviceName || 'unknown-device'),
      platform: String(body.platform || 'unknown-platform'),
      receivedAt: new Date().toISOString(),
      clientIp: normalizeIp(request.socket.remoteAddress)
    };

    upsertDevice({
      deviceName: state.lastHeartbeat.deviceName,
      platform: state.lastHeartbeat.platform,
      clientIp: state.lastHeartbeat.clientIp,
      lastHeartbeatAt: state.lastHeartbeat.receivedAt
    });

    notify();

    sendJson(response, 200, {
      ok: true,
      ...state.lastHeartbeat
    });
  }

  async function handleScan(request, response) {
    const body = await readJsonBody(request);
    if (!isAuthorized(body)) {
      sendJson(response, 401, {
        ok: false,
        error: 'token 不正确'
      });
      return;
    }

    const content = String(body.content || '').trim();
    if (!content) {
      sendJson(response, 400, {
        ok: false,
        error: '扫码内容不能为空'
      });
      return;
    }

    const device = upsertDevice({
      deviceName: String(body.deviceName || 'unknown-device'),
      platform: String(body.platform || 'unknown-platform'),
      clientIp: normalizeIp(request.socket.remoteAddress),
      lastScanAt: new Date().toISOString()
    });

    if (seenContents.has(content)) {
      const existingScan = state.scans.find((item) => item.content === content) || null;

      notify();

      sendJson(response, 200, {
        ok: true,
        duplicate: true,
        skippedStorage: true,
        content,
        existingScan,
        deviceName: device.deviceName
      });
      return;
    }

    const scan = {
      id: randomUUID(),
      content,
      codeType: String(body.codeType || body.symbology || 'UNKNOWN'),
      scannedAt: body.scannedAt ? String(body.scannedAt) : null,
      receivedAt: device.lastScanAt,
      deviceName: device.deviceName,
      platform: device.platform,
      clientIp: device.clientIp
    };

    seenContents.add(content);
    state.scans.unshift(scan);
    state.scans = state.scans.slice(0, MAX_SCANS);

    notify();

    sendJson(response, 200, {
      ok: true,
      ...scan
    });
  }

  async function route(request, response) {
    if (!request.url) {
      sendJson(response, 400, {
        ok: false,
        error: 'Invalid request'
      });
      return;
    }

    const requestUrl = new URL(request.url, `http://${request.headers.host || '127.0.0.1'}`);

    if (request.method === 'OPTIONS') {
      withCors(response);
      response.writeHead(204);
      response.end();
      return;
    }

    if (request.method === 'GET' && requestUrl.pathname === '/') {
      sendText(
        response,
        200,
        [
          'Electron Scan Demo Server',
          `port=${state.port}`,
          `recommended=${buildUrls().recommended}`,
          `token=${state.token}`
        ].join('\n')
      );
      return;
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/state') {
      sendJson(response, 200, {
        ok: true,
        ...getState()
      });
      return;
    }

    if (request.method === 'GET' && requestUrl.pathname === '/pair') {
      sendJson(response, 200, {
        ok: true,
        ...getState().pairPayload
      });
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/api/heartbeat') {
      await handleHeartbeat(request, response);
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/api/scans') {
      await handleScan(request, response);
      return;
    }

    sendJson(response, 404, {
      ok: false,
      error: 'Not found'
    });
  }

  function createNodeServer() {
    return http.createServer((request, response) => {
      route(request, response).catch((error) => {
        console.error('Request handling failed:', error);
        sendJson(response, 500, {
          ok: false,
          error: error.message || 'Internal server error'
        });
      });
    });
  }

  function listen(serverInstance, port) {
    return new Promise((resolve, reject) => {
      const onError = (error) => {
        serverInstance.removeListener('listening', onListening);
        reject(error);
      };

      const onListening = () => {
        serverInstance.removeListener('error', onError);
        resolve();
      };

      serverInstance.once('error', onError);
      serverInstance.once('listening', onListening);
      serverInstance.listen(port, '0.0.0.0');
    });
  }

  async function start() {
    for (let port = DEFAULT_PORT; port < DEFAULT_PORT + MAX_PORT_ATTEMPTS; port += 1) {
      const candidate = createNodeServer();

      try {
        await listen(candidate, port);
        server = candidate;
        state.port = port;
        notify();
        return getState();
      } catch (error) {
        candidate.close();
        if (error.code !== 'EADDRINUSE') {
          throw error;
        }
      }
    }

    throw new Error(`No free port found between ${DEFAULT_PORT} and ${DEFAULT_PORT + MAX_PORT_ATTEMPTS - 1}`);
  }

  function refresh() {
    notify();
    return getState();
  }

  function clearScans() {
    state.scans = [];
    seenContents.clear();
    notify();
    return getState();
  }

  function close() {
    if (server) {
      server.close();
      server = null;
    }
  }

  return {
    start,
    refresh,
    getState,
    clearScans,
    close
  };
}

module.exports = {
  createDemoServer
};
