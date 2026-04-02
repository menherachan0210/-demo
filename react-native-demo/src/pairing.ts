import type { PairConfig } from './types';

function normalizeServerUrl(rawValue: string): string | null {
  const trimmed = rawValue.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^/\s]+$/i.test(trimmed)) {
    return null;
  }

  return trimmed;
}

function parseQuery(queryString: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const segment of queryString.split('&')) {
    if (!segment) {
      continue;
    }

    const [left, right = ''] = segment.split('=');
    const key = decodeURIComponent(left || '').trim();
    if (!key) {
      continue;
    }

    result[key] = decodeURIComponent(right).trim();
  }

  return result;
}

function parseCustomScheme(rawText: string): PairConfig | null {
  const prefix = 'electron-scan-demo://pair?';
  if (!rawText.startsWith(prefix)) {
    return null;
  }

  const params = parseQuery(rawText.slice(prefix.length));
  const serverUrl = normalizeServerUrl(params.serverUrl || '');
  const token = (params.token || '').trim();

  if (!serverUrl || !token) {
    return null;
  }

  return {
    serverUrl,
    token,
  };
}

function parseLegacyJson(rawText: string): PairConfig | null {
  try {
    const payload = JSON.parse(rawText) as {
      type?: string;
      serverUrl?: string;
      token?: string;
    };

    if (payload?.type !== 'electron-scan-demo-pair') {
      return null;
    }

    const serverUrl = normalizeServerUrl(payload.serverUrl || '');
    const token = (payload.token || '').trim();

    if (!serverUrl || !token) {
      return null;
    }

    return {
      serverUrl,
      token,
    };
  } catch {
    return null;
  }
}

export function parsePairCode(rawValue: string): PairConfig | null {
  const text = rawValue.trim();
  if (!text) {
    return null;
  }

  return parseCustomScheme(text) || parseLegacyJson(text);
}

export function formatServerLabel(serverUrl: string): string {
  return serverUrl.replace(/^https?:\/\//i, '');
}
