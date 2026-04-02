import type {
  HeartbeatResponse,
  PairConfig,
  ScanResponse,
} from './types';

type DevicePayload = {
  deviceName: string;
  platform: string;
};

async function readJsonSafely(response: Response): Promise<any> {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error('电脑端返回了无法解析的响应');
  }
}

async function postJson<T>(
  url: string,
  body: Record<string, unknown>,
  timeoutMs = 8000
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const payload = await readJsonSafely(response);

    if (!response.ok || payload?.ok === false) {
      throw new Error(payload?.error || `请求失败：${response.status}`);
    }

    return payload as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('连接电脑超时，请确认手机和电脑在同一网络');
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function sendHeartbeat(
  pair: PairConfig,
  device: DevicePayload
): Promise<HeartbeatResponse> {
  return postJson<HeartbeatResponse>(`${pair.serverUrl}/api/heartbeat`, {
    token: pair.token,
    ...device,
  });
}

export async function sendScan(
  pair: PairConfig,
  device: DevicePayload,
  content: string,
  codeType: string
): Promise<ScanResponse> {
  return postJson<ScanResponse>(`${pair.serverUrl}/api/scans`, {
    token: pair.token,
    content,
    codeType,
    scannedAt: new Date().toISOString(),
    ...device,
  });
}
