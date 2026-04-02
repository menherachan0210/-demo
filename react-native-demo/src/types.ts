export type PairConfig = {
  serverUrl: string;
  token: string;
};

export type ConnectionState = PairConfig & {
  pairedAt: string;
};

export type LocalScanRecord = {
  id: string;
  content: string;
  codeType: string;
  sentAt: string;
};

export type HeartbeatResponse = {
  ok: boolean;
  deviceName: string;
  platform: string;
  receivedAt: string;
  clientIp: string;
};

export type ScanResponse = {
  ok: boolean;
  id?: string;
  content: string;
  codeType?: string;
  scannedAt?: string | null;
  receivedAt?: string;
  deviceName?: string;
  platform?: string;
  clientIp?: string;
  duplicate?: boolean;
  skippedStorage?: boolean;
  existingScan?: {
    id: string;
    content: string;
    codeType: string;
    scannedAt: string | null;
    receivedAt: string;
    deviceName: string;
    platform: string;
    clientIp: string;
  } | null;
};
