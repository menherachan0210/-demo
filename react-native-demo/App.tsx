import { StatusBar } from 'expo-status-bar';
import {
  BarcodeScanningResult,
  CameraType,
  CameraView,
  useCameraPermissions,
} from 'expo-camera';
import * as Device from 'expo-device';
import { useMemo, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar as NativeStatusBar,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { sendHeartbeat, sendScan } from './src/api';
import { parsePairCode } from './src/pairing';
import type { ConnectionState, LocalScanRecord } from './src/types';

type ScreenMode = 'home' | 'pair' | 'scan';

type ScanGuard = {
  inflight: boolean;
  lastText: string;
  lastAt: number;
};

const SAME_TEXT_COOLDOWN_MS = 1200;
const MIN_SCAN_GAP_MS = 280;

function createScanGuard(): ScanGuard {
  return {
    inflight: false,
    lastText: '',
    lastAt: 0,
  };
}

function buildDevicePayload() {
  return {
    deviceName:
      Device.deviceName || Device.modelName || 'React Native Demo Device',
    platform: `${Platform.OS} ${String(Platform.Version)}`,
  };
}

function shortenText(value: string, maxLength = 36): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}…`;
}

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [screenMode, setScreenMode] = useState<ScreenMode>('home');
  const [cameraFacing, setCameraFacing] = useState<CameraType>('front');
  const [cameraSessionKey, setCameraSessionKey] = useState(0);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [connection, setConnection] = useState<ConnectionState | null>(null);
  const [statusText, setStatusText] = useState('先扫描电脑端配对码');
  const [busyText, setBusyText] = useState('');
  const [recentScans, setRecentScans] = useState<LocalScanRecord[]>([]);

  const devicePayload = useMemo(() => buildDevicePayload(), []);
  const scanGuardRef = useRef<ScanGuard>(createScanGuard());
  const isConnected = Boolean(connection);

  function resetScanGuard() {
    scanGuardRef.current = createScanGuard();
  }

  function markScan(text: string) {
    scanGuardRef.current.lastText = text;
    scanGuardRef.current.lastAt = Date.now();
  }

  function shouldIgnoreScan(text: string) {
    const now = Date.now();
    const guard = scanGuardRef.current;

    if (guard.inflight) {
      return true;
    }

    if (now - guard.lastAt < MIN_SCAN_GAP_MS) {
      return true;
    }

    if (guard.lastText === text && now - guard.lastAt < SAME_TEXT_COOLDOWN_MS) {
      return true;
    }

    return false;
  }

  async function ensureCameraPermission() {
    if (permission?.granted) {
      return true;
    }

    const next = await requestPermission();
    if (!next.granted) {
      setStatusText('没有摄像头权限，无法开始扫码');
      return false;
    }

    return true;
  }

  function openScanner(
    nextMode: Exclude<ScreenMode, 'home'>,
    nextStatus: string,
    preferredFacing: CameraType
  ) {
    resetScanGuard();
    setBusyText('');
    setTorchEnabled(false);
    setCameraFacing(preferredFacing);
    setCameraSessionKey((current) => current + 1);
    setStatusText(nextStatus);
    setScreenMode(nextMode);
  }

  async function handleOpenPairScanner() {
    const granted = await ensureCameraPermission();
    if (!granted) {
      return;
    }

    openScanner('pair', '配对扫码默认使用后置镜头，对准电脑屏幕即可', 'back');
  }

  async function handleOpenWorkScanner() {
    if (!connection) {
      setStatusText('请先扫描电脑端配对码');
      return;
    }

    const granted = await ensureCameraPermission();
    if (!granted) {
      return;
    }

    setBusyText('检查电脑连接...');

    try {
      await sendHeartbeat(connection, devicePayload);
      openScanner('scan', '菲票扫码默认使用前置镜头，保持镜头开启连续扫过去即可', 'front');
    } catch (error) {
      setStatusText(
        error instanceof Error ? error.message : '连接电脑失败，请重新配对'
      );
    } finally {
      setBusyText('');
    }
  }

  async function handlePairScanned(result: BarcodeScanningResult) {
    const rawText = result.data?.trim();
    if (!rawText || shouldIgnoreScan(rawText)) {
      return;
    }

    const pair = parsePairCode(rawText);
    if (!pair) {
      markScan(rawText);
      setStatusText('这不是电脑端配对码');
      return;
    }

    scanGuardRef.current.inflight = true;
    setBusyText('正在连接电脑...');

    try {
      await sendHeartbeat(pair, devicePayload);
      setConnection({
        ...pair,
        pairedAt: new Date().toISOString(),
      });
      setStatusText('已连接电脑端，可以开始连续扫码');
      setScreenMode('home');
    } catch (error) {
      setStatusText(
        error instanceof Error ? error.message : '配对失败，请重试'
      );
    } finally {
      scanGuardRef.current.inflight = false;
      markScan(rawText);
      setBusyText('');
    }
  }

  async function handleWorkScanned(result: BarcodeScanningResult) {
    const rawText = result.data?.trim();
    if (!rawText || !connection || shouldIgnoreScan(rawText)) {
      return;
    }

    if (parsePairCode(rawText)) {
      markScan(rawText);
      setStatusText('当前是业务扫码模式，这张是配对码');
      return;
    }

    scanGuardRef.current.inflight = true;
    setBusyText('正在发送到电脑...');

    try {
      const response = await sendScan(
        connection,
        devicePayload,
        rawText,
        result.type || 'qr'
      );

      if (response.duplicate) {
        setStatusText(`重复菲票编号，电脑端未入库：${shortenText(rawText, 24)}`);
        return;
      }

      const nextRecord: LocalScanRecord = {
        id: response.id || `${Date.now()}`,
        content: response.content,
        codeType: response.codeType || (result.type || 'qr'),
        sentAt: response.receivedAt || new Date().toISOString(),
      };

      setRecentScans((current) => [nextRecord, ...current].slice(0, 12));
      setStatusText(`已发送：${shortenText(response.content, 28)}`);
    } catch (error) {
      setStatusText(
        error instanceof Error ? error.message : '发送失败，请稍后重试'
      );
    } finally {
      scanGuardRef.current.inflight = false;
      markScan(rawText);
      setBusyText('');
    }
  }

  function renderHome() {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />
        <NativeStatusBar backgroundColor="#f5f7fa" barStyle="dark-content" />
        <ScrollView
          contentContainerStyle={styles.homeScrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.eyebrow}>扫码联动</Text>
          <Text style={styles.heroTitle}>手机扫码联动电脑端</Text>
          <Text style={styles.heroSubtitle}>
            先完成连接，再进入连续扫码模式把菲票二维码内容推送到电脑端。
          </Text>

          <View style={styles.statusCard}>
            <View style={styles.statusRow}>
              <Text style={styles.panelLabel}>连接状态</Text>
              <View
                style={[
                  styles.statusBadge,
                  isConnected ? styles.statusBadgeSuccess : styles.statusBadgeIdle,
                ]}
              >
                <View
                  style={[
                    styles.statusDot,
                    isConnected ? styles.statusDotSuccess : styles.statusDotIdle,
                  ]}
                />
                <Text
                  style={[
                    styles.statusBadgeText,
                    isConnected
                      ? styles.statusBadgeTextSuccess
                      : styles.statusBadgeTextIdle,
                  ]}
                >
                  {isConnected ? '已连接' : '未连接'}
                </Text>
              </View>
            </View>
            <Text style={styles.statusTitle}>
              {isConnected ? '电脑端已连接' : '请先扫描配对码'}
            </Text>
            <Text style={styles.panelHint}>{statusText}</Text>
            {!!busyText && <Text style={styles.busyText}>{busyText}</Text>}
          </View>

          <View style={styles.actionRow}>
            <Pressable
              style={({ pressed }) => [
                styles.actionCard,
                styles.actionCardPlain,
                pressed && styles.actionCardPressed,
              ]}
              onPress={handleOpenPairScanner}
            >
              <Text style={styles.actionOverline}>步骤一</Text>
              <Text style={styles.actionTitle}>扫描配对码</Text>
              <Text style={styles.actionDesc}>
                使用后置镜头扫描电脑端二维码，建立连接。
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.actionCard,
                styles.actionCardPrimary,
                !connection && styles.actionCardDisabled,
                pressed && connection && styles.actionCardPressed,
              ]}
              onPress={handleOpenWorkScanner}
              disabled={!connection}
            >
              <Text style={[styles.actionOverline, styles.actionOverlinePrimary]}>
                步骤二
              </Text>
              <Text style={styles.actionTitle}>连续扫码发送</Text>
              <Text style={styles.actionDesc}>
                使用前置镜头连续识别菲票二维码，并实时发送到电脑。
              </Text>
            </Pressable>
          </View>

          <View style={styles.panel}>
            <Text style={styles.panelLabel}>最近发送</Text>
            {recentScans.length === 0 ? (
              <Text style={styles.emptyText}>还没有扫码记录</Text>
            ) : (
              recentScans.slice(0, 6).map((item) => (
                <View key={item.id} style={styles.scanItem}>
                  <Text style={styles.scanItemType}>{item.codeType}</Text>
                  <Text numberOfLines={2} style={styles.scanItemContent}>
                    {item.content}
                  </Text>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  function renderScanner() {
    const isPairMode = screenMode === 'pair';

    return (
      <View style={styles.scannerRoot}>
        <StatusBar style="light" />
        <CameraView
          key={`${screenMode}-${cameraFacing}-${cameraSessionKey}`}
          style={StyleSheet.absoluteFill}
          facing={cameraFacing}
          enableTorch={torchEnabled}
          mirror={cameraFacing === 'front'}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={isPairMode ? handlePairScanned : handleWorkScanned}
          active
        />

        <SafeAreaView style={styles.scannerOverlay}>
          <View style={styles.scannerTopCard}>
            <Text style={styles.eyebrow}>SCAN</Text>
            <Text style={styles.scannerTitle}>
              {isPairMode ? '扫描配对码' : '连续扫码中'}
            </Text>
            <Text style={styles.scannerSubtitle}>{statusText}</Text>
            {!!busyText && <Text style={styles.scannerBusy}>{busyText}</Text>}
          </View>

          <View style={styles.scanFrameWrap}>
            <View
              style={[
                styles.scanFrame,
                isPairMode ? styles.scanFramePair : styles.scanFrameWork,
              ]}
            >
              <View style={[styles.corner, styles.cornerTopLeft]} />
              <View style={[styles.corner, styles.cornerTopRight]} />
              <View style={[styles.corner, styles.cornerBottomLeft]} />
              <View style={[styles.corner, styles.cornerBottomRight]} />
            </View>
          </View>

          <View style={styles.bottomActions}>
            <Pressable
              style={({ pressed }) => [
                styles.bottomButton,
                styles.bottomButtonPlain,
                pressed && styles.bottomButtonPressed,
              ]}
              onPress={() => {
                setScreenMode('home');
                setBusyText('');
                setTorchEnabled(false);
                resetScanGuard();
              }}
            >
              <Text style={styles.bottomButtonText}>返回</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.bottomButton,
                styles.bottomButtonPlain,
                pressed && styles.bottomButtonPressed,
              ]}
              onPress={() => {
                const nextFacing = cameraFacing === 'front' ? 'back' : 'front';
                setCameraFacing(nextFacing);
                setCameraSessionKey((current) => current + 1);
                setStatusText(
                  cameraFacing === 'front'
                    ? '已切到后置镜头'
                    : '已切到前置镜头'
                );
              }}
            >
              <Text style={styles.bottomButtonText}>
                {cameraFacing === 'front' ? '切到后摄' : '切到前摄'}
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.bottomButton,
                styles.bottomButtonPrimary,
                pressed && styles.bottomButtonPressed,
              ]}
              onPress={() => {
                setTorchEnabled((current) => !current);
                setStatusText(torchEnabled ? '补光已关闭' : '补光已打开');
              }}
            >
              <Text style={[styles.bottomButtonText, styles.bottomButtonTextPrimary]}>
                {torchEnabled ? '关闭补光' : '打开补光'}
              </Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return screenMode === 'home' ? renderHome() : renderScanner();
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f7fa',
  },
  homeScrollContent: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 28,
    gap: 14,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '600',
    color: '#909399',
    letterSpacing: 0.6,
  },
  heroTitle: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    color: '#303133',
    marginTop: 6,
  },
  heroSubtitle: {
    fontSize: 14,
    lineHeight: 22,
    color: '#606266',
    marginTop: 6,
  },
  panel: {
    backgroundColor: '#ffffff',
    borderColor: '#dcdfe6',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  statusCard: {
    backgroundColor: '#ffffff',
    borderColor: '#dcdfe6',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  panelLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#909399',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  statusBadgeSuccess: {
    backgroundColor: '#f0f9eb',
  },
  statusBadgeIdle: {
    backgroundColor: '#f4f4f5',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusDotSuccess: {
    backgroundColor: '#67c23a',
  },
  statusDotIdle: {
    backgroundColor: '#c0c4cc',
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statusBadgeTextSuccess: {
    color: '#67c23a',
  },
  statusBadgeTextIdle: {
    color: '#909399',
  },
  statusTitle: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '700',
    color: '#303133',
  },
  panelHint: {
    fontSize: 14,
    lineHeight: 20,
    color: '#606266',
  },
  busyText: {
    fontSize: 13,
    color: '#409eff',
    fontWeight: '600',
  },
  actionRow: {
    gap: 14,
  },
  actionCard: {
    borderRadius: 12,
    padding: 18,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dcdfe6',
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  actionCardPlain: {
    backgroundColor: '#ffffff',
  },
  actionCardPrimary: {
    borderColor: '#b3d8ff',
    backgroundColor: '#ecf5ff',
  },
  actionCardDisabled: {
    opacity: 0.45,
  },
  actionCardPressed: {
    transform: [{ scale: 0.985 }],
  },
  actionOverline: {
    fontSize: 12,
    fontWeight: '600',
    color: '#909399',
  },
  actionOverlinePrimary: {
    color: '#409eff',
  },
  actionTitle: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '700',
    color: '#303133',
  },
  actionDesc: {
    fontSize: 14,
    lineHeight: 21,
    color: '#606266',
  },
  emptyText: {
    fontSize: 14,
    color: '#909399',
  },
  scanItem: {
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#ebeef5',
    gap: 4,
  },
  scanItemType: {
    fontSize: 12,
    fontWeight: '600',
    color: '#409eff',
  },
  scanItemContent: {
    fontSize: 14,
    lineHeight: 20,
    color: '#303133',
  },
  scannerRoot: {
    flex: 1,
    backgroundColor: '#111827',
  },
  scannerOverlay: {
    flex: 1,
    justifyContent: 'space-between',
    backgroundColor: 'rgba(17, 24, 39, 0.24)',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 18,
  },
  scannerTopCard: {
    gap: 8,
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
  },
  scannerTitle: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
    color: '#303133',
  },
  scannerSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: '#606266',
  },
  scannerBusy: {
    fontSize: 13,
    lineHeight: 18,
    color: '#409eff',
    fontWeight: '600',
  },
  scanFrameWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanFrame: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.55)',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  scanFramePair: {
    width: '82%',
    aspectRatio: 1,
  },
  scanFrameWork: {
    width: '96%',
    height: '85%',
    borderRadius: 32,
  },
  corner: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderColor: '#409eff',
  },
  cornerTopLeft: {
    top: -1,
    left: -1,
    borderTopWidth: 5,
    borderLeftWidth: 5,
    borderTopLeftRadius: 24,
  },
  cornerTopRight: {
    top: -1,
    right: -1,
    borderTopWidth: 5,
    borderRightWidth: 5,
    borderTopRightRadius: 24,
  },
  cornerBottomLeft: {
    bottom: -1,
    left: -1,
    borderBottomWidth: 5,
    borderLeftWidth: 5,
    borderBottomLeftRadius: 24,
  },
  cornerBottomRight: {
    right: -1,
    bottom: -1,
    borderBottomWidth: 5,
    borderRightWidth: 5,
    borderBottomRightRadius: 24,
  },
  bottomActions: {
    flexDirection: 'row',
    gap: 12,
  },
  bottomButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dcdfe6',
  },
  bottomButtonPlain: {
    backgroundColor: '#ffffff',
  },
  bottomButtonPrimary: {
    backgroundColor: '#409eff',
    borderColor: '#409eff',
  },
  bottomButtonPressed: {
    opacity: 0.84,
  },
  bottomButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#303133',
  },
  bottomButtonTextPrimary: {
    color: '#ffffff',
  },
});
