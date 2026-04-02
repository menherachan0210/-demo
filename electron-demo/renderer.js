const elements = {
  qrPlaceholder: document.getElementById('qrPlaceholder'),
  pairQrImage: document.getElementById('pairQrImage'),
  deviceCount: document.getElementById('deviceCount'),
  deviceList: document.getElementById('deviceList'),
  scanCount: document.getElementById('scanCount'),
  scanList: document.getElementById('scanList')
};

function renderPairQr(dataUrl) {
  elements.qrPlaceholder.textContent = '正在生成配对二维码';
  elements.qrPlaceholder.classList.remove('hidden');
  elements.pairQrImage.classList.add('hidden');

  if (!dataUrl) {
    elements.qrPlaceholder.textContent = '配对二维码生成失败';
    return;
  }

  elements.pairQrImage.src = dataUrl;
  elements.pairQrImage.classList.remove('hidden');
  elements.qrPlaceholder.classList.add('hidden');
}

function formatTime(value) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

function renderDeviceList(devices) {
  const items = Array.isArray(devices) ? devices : [];
  elements.deviceCount.textContent = `${items.length} 台`;
  elements.deviceList.innerHTML = '';

  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-record';
    empty.textContent = '等待手机连接';
    elements.deviceList.appendChild(empty);
    return;
  }

  for (const device of items) {
    const item = document.createElement('article');
    item.className = 'device-item';

    const head = document.createElement('div');
    head.className = 'device-item-head';

    const name = document.createElement('strong');
    name.className = 'device-name';
    name.textContent = device.deviceName || '未知设备';

    const time = document.createElement('span');
    time.className = 'device-time';
    time.textContent = formatTime(device.lastSeenAt);

    head.appendChild(name);
    head.appendChild(time);

    const meta = document.createElement('div');
    meta.className = 'device-meta';
    meta.textContent = device.platform || 'unknown-platform';

    item.appendChild(head);
    item.appendChild(meta);
    elements.deviceList.appendChild(item);
  }
}

function renderScanList(scans) {
  const items = Array.isArray(scans) ? scans : [];
  elements.scanCount.textContent = `${items.length} 条`;
  elements.scanList.innerHTML = '';

  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-record';
    empty.textContent = '等待扫码';
    elements.scanList.appendChild(empty);
    return;
  }

  for (const scan of items) {
    const item = document.createElement('article');
    item.className = 'scan-item';

    const meta = document.createElement('div');
    meta.className = 'scan-meta';

    const device = document.createElement('strong');
    device.textContent = scan.deviceName || '未知设备';

    const time = document.createElement('span');
    time.textContent = formatTime(scan.receivedAt);

    meta.appendChild(device);
    meta.appendChild(time);

    const content = document.createElement('pre');
    content.className = 'scan-content';
    content.textContent = scan.content || '';

    item.appendChild(meta);
    item.appendChild(content);
    elements.scanList.appendChild(item);
  }
}

function render(state) {
  renderPairQr(state?.pairQrDataUrl || '');
  renderDeviceList(state?.devices || []);
  renderScanList(state?.scans || []);
}

async function initialize() {
  render(await window.demoApi.getState());

  window.demoApi.subscribe((nextState) => {
    render(nextState);
  });
}

initialize().catch((error) => {
  console.error('Renderer bootstrap failed:', error);
});
