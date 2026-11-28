const { execFile, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const ALLOWED_BAUDS = new Set([9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600]);
const MAC_REGEX = /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/;
const HEX12_REGEX = /^[0-9A-Fa-f]{12}$/;
const WIN_COM_REGEX = /^COM\d{1,3}$/i;
const POSIX_SERIAL_REGEX = /^\/dev\/(cu|rfcomm|tty)[A-Za-z0-9._-]+$/;
const SAFE_COMMAND_REGEX = /^[\x20-\x7E\r\n]{1,64}$/;

const activeConnections = new Map();

function detectRecommendedTypes(name) {
  const lower = String(name || '').toLowerCase();
  const out = [];
  if (/esp32|pravilo|править|правило|hx711|tenzo|тензо|hub|hc-05|hc-06|spp|uart/.test(lower)) {
    out.push('esp32_limbs');
  }
  if (/myo|emg|мио|muscle/.test(lower)) {
    out.push('myoblue_emg');
  }
  if (/tickr|wahoo|heart|hr|hrm|polar|garmin|coospo|magene|puls|пульс/.test(lower)) {
    out.push('wahoo_tickr');
  }
  if (/mibfs|mibcs|miscale|mi scale|mi_scale|xmtzc|xiaomi|okok|scale|вес/.test(lower)) {
    out.push('xiaomi_scale');
  }
  if (
    /b05|bpm|bp|omron|yuwell|yonker|contec|sinocare|medisana|beurer|blemodule|ibp|тонометр|blood/.test(
      lower
    )
  ) {
    out.push('bp_b05');
  }
  return out;
}

function extractMacFromText(text) {
  const s = String(text || '');
  const colonMatch = s.match(/([0-9A-Fa-f]{2}(?::|-)){5}[0-9A-Fa-f]{2}/);
  if (colonMatch) return colonMatch[0].replace(/-/g, ':').toUpperCase();
  const hex12Match = s.match(/(?:DEV_|_|-)([0-9A-Fa-f]{12})(?:[_&\\]|$)/i);
  if (hex12Match) {
    const h = hex12Match[1].toUpperCase();
    return `${h.slice(0, 2)}:${h.slice(2, 4)}:${h.slice(4, 6)}:${h.slice(6, 8)}:${h.slice(8, 10)}:${h.slice(10, 12)}`;
  }
  return '';
}

function formatUlongMac(numVal) {
  try {
    const hex = BigInt(numVal).toString(16).padStart(12, '0').slice(-12).toUpperCase();
    return `${hex.slice(0, 2)}:${hex.slice(2, 4)}:${hex.slice(4, 6)}:${hex.slice(6, 8)}:${hex.slice(8, 10)}:${hex.slice(10, 12)}`;
  } catch {
    return '';
  }
}

function sanitizeBaudRate(baud) {
  const n = Number(baud || 115200);
  return ALLOWED_BAUDS.has(n) ? n : 115200;
}

function normalizeSafeSerialPort(rawPort) {
  if (!rawPort) return null;
  const trimmed = String(rawPort).trim();
  if (process.platform === 'win32') {
    return WIN_COM_REGEX.test(trimmed) ? trimmed.toUpperCase() : null;
  }
  const resolved = path.resolve(trimmed);
  if (!resolved.startsWith('/dev/') || !POSIX_SERIAL_REGEX.test(resolved)) {
    return null;
  }
  return resolved;
}

function normalizeSafeBtAddress(rawAddr) {
  if (!rawAddr) return null;
  const trimmed = String(rawAddr).trim();
  if (MAC_REGEX.test(trimmed)) return trimmed.replace(/-/g, ':').toUpperCase();
  if (HEX12_REGEX.test(trimmed)) {
    const h = trimmed.toUpperCase();
    return `${h.slice(0, 2)}:${h.slice(2, 4)}:${h.slice(4, 6)}:${h.slice(6, 8)}:${h.slice(8, 10)}:${h.slice(10, 12)}`;
  }
  return null;
}

function encodePowerShell(script) {
  return Buffer.from(script, 'utf16le').toString('base64');
}

const PS_ENUM_WINDOWS = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 } | Select-Object -First 1)
function Await-WinRT($op, $resType) {
  $t = $asTaskGeneric.MakeGenericMethod($resType).Invoke($null, @($op))
  $t.Wait(4500) | Out-Null
  if ($t.IsCompleted) { return $t.Result }
  return $null
}

$bleFound = @{}
try {
  [Windows.Devices.Bluetooth.Advertisement.BluetoothLEAdvertisementWatcher, Windows.Devices.Bluetooth, ContentType=WindowsRuntime] | Out-Null
  $watcher = New-Object Windows.Devices.Bluetooth.Advertisement.BluetoothLEAdvertisementWatcher
  $watcher.ScanningMode = [Windows.Devices.Bluetooth.Advertisement.BluetoothLEScanningMode]::Active
  $null = Register-ObjectEvent -InputObject $watcher -EventName 'Received' -Action {
    $addr = $EventArgs.BluetoothAddress
    $localName = ''
    try { $localName = [string]$EventArgs.Advertisement.LocalName } catch {}
    if (-not $bleFound.ContainsKey($addr) -or ($localName -and -not $bleFound[$addr].name)) {
      $bleFound[$addr] = @{ addr = [string]$addr; name = $localName; rssi = [int]$EventArgs.RawSignalStrengthInDBm }
    }
  }
  $watcher.Start()
  Start-Sleep -Milliseconds 2600
  $watcher.Stop()
} catch {}

$pairedLe = @()
try {
  [Windows.Devices.Bluetooth.BluetoothLEDevice, Windows.Devices.Bluetooth, ContentType=WindowsRuntime] | Out-Null
  [Windows.Devices.Enumeration.DeviceInformation, Windows.Devices.Enumeration, ContentType=WindowsRuntime] | Out-Null
  $leSel = [Windows.Devices.Bluetooth.BluetoothLEDevice]::GetDeviceSelectorFromPairingState($true)
  $leDevs = Await-WinRT ([Windows.Devices.Enumeration.DeviceInformation]::FindAllAsync($leSel)) ([Windows.Devices.Enumeration.DeviceInformationCollection])
  if ($leDevs) {
    foreach ($d in $leDevs) {
      $pairedLe += [PSCustomObject]@{ id = [string]$d.Id; name = [string]$d.Name; kind = 'le' }
    }
  }
  $btSel = [Windows.Devices.Bluetooth.BluetoothDevice]::GetDeviceSelectorFromPairingState($true)
  $btDevs = Await-WinRT ([Windows.Devices.Enumeration.DeviceInformation]::FindAllAsync($btSel)) ([Windows.Devices.Enumeration.DeviceInformationCollection])
  if ($btDevs) {
    foreach ($d in $btDevs) {
      $pairedLe += [PSCustomObject]@{ id = [string]$d.Id; name = [string]$d.Name; kind = 'classic' }
    }
  }
} catch {}

$bt = @()
try {
  Get-PnpDevice -Class Bluetooth -ErrorAction SilentlyContinue | ForEach-Object {
    $bt += [PSCustomObject]@{
      name = [string]$_.FriendlyName
      instanceId = [string]$_.InstanceId
      status = [string]$_.Status
      present = [bool]$_.Present
    }
  }
} catch {}

$ports = @()
try {
  Get-CimInstance Win32_SerialPort -ErrorAction SilentlyContinue | ForEach-Object {
    $ports += [PSCustomObject]@{
      name = [string]$_.Name
      deviceId = [string]$_.DeviceID
      pnpId = [string]$_.PNPDeviceID
    }
  }
} catch {}
try {
  Get-PnpDevice -Class Ports -ErrorAction SilentlyContinue | Where-Object { $_.FriendlyName -match 'COM\\d+' } | ForEach-Object {
    $ports += [PSCustomObject]@{
      name = [string]$_.FriendlyName
      instanceId = [string]$_.InstanceId
      status = [string]$_.Status
    }
  }
} catch {}

$advList = @()
foreach ($k in $bleFound.Keys) {
  $v = $bleFound[$k]
  $advList += [PSCustomObject]@{ addr = [string]$v.addr; name = [string]$v.name; rssi = [int]$v.rssi }
}

@{ bluetooth = @($bt); ports = @($ports); pairedWinRt = @($pairedLe); bleAdv = @($advList) } | ConvertTo-Json -Depth 4 -Compress
`.trim();

const WIN_SERIAL_PS = `
$portName = $env:ETALON_COM_PORT
$baud = [int]$env:ETALON_BAUD
$sp = New-Object System.IO.Ports.SerialPort $portName, $baud, ([System.IO.Ports.Parity]::None), 8, ([System.IO.Ports.StopBits]::One)
$sp.ReadTimeout = 500
$sp.NewLine = "\`n"
$sp.Open()
[Console]::Out.WriteLine("READY|" + $portName)
[Console]::Out.Flush()
try {
  while ($sp.IsOpen) {
    if ([Console]::In.Peek() -ge 0) {
      $cmd = [Console]::In.ReadLine()
      if ($cmd -eq '__QUIT__') { break }
      if ($cmd) { $sp.WriteLine($cmd) }
    }
    try {
      $line = $sp.ReadLine()
      if ($line) {
        [Console]::Out.WriteLine("LINE|" + $line)
        [Console]::Out.Flush()
      }
    } catch [System.TimeoutException] {}
  }
} finally {
  if ($sp.IsOpen) { $sp.Close() }
}
`.trim();

const WIN_WINRT_BLE_PS = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
[Windows.Devices.Bluetooth.BluetoothLEDevice, Windows.Devices.Bluetooth, ContentType=WindowsRuntime] | Out-Null
[Windows.Devices.Bluetooth.BluetoothCacheMode, Windows.Devices.Bluetooth, ContentType=WindowsRuntime] | Out-Null
[Windows.Devices.Bluetooth.GenericAttributeProfile.GattCharacteristic, Windows.Devices.Bluetooth, ContentType=WindowsRuntime] | Out-Null
[Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType=WindowsRuntime] | Out-Null
[Windows.Storage.Streams.DataWriter, Windows.Storage.Streams, ContentType=WindowsRuntime] | Out-Null

function Await-AsyncOp($op, $resultType) {
  $asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 } | Select-Object -First 1
  $task = $asTask.MakeGenericMethod($resultType).Invoke($null, @($op))
  $task.Wait() | Out-Null
  return $task.Result
}

$macHex = ($env:ETALON_BT_MAC -replace '[:\\-]', '')
$addr = [Convert]::ToUInt64($macHex, 16)
$dev = Await-AsyncOp ([Windows.Devices.Bluetooth.BluetoothLEDevice]::FromBluetoothAddressAsync($addr)) ([Windows.Devices.Bluetooth.BluetoothLEDevice])
if ($null -eq $dev) { throw "BLE device not reachable via Windows Bluetooth" }

$svcResult = Await-AsyncOp ($dev.GetGattServicesAsync([Windows.Devices.Bluetooth.BluetoothCacheMode]::Uncached)) ([Windows.Devices.Bluetooth.GenericAttributeProfile.GattDeviceServicesResult])
$subscribed = @()
$writeChar = $null
foreach ($svc in $svcResult.Services) {
  $chRes = Await-AsyncOp ($svc.GetCharacteristicsAsync([Windows.Devices.Bluetooth.BluetoothCacheMode]::Uncached)) ([Windows.Devices.Bluetooth.GenericAttributeProfile.GattCharacteristicsResult])
  foreach ($ch in $chRes.Characteristics) {
    $props = [int]$ch.CharacteristicProperties
    if ($null -eq $writeChar -and (($props -band 4) -ne 0 -or ($props -band 8) -ne 0)) {
      $writeChar = $ch
    }
    if (($props -band 16) -ne 0 -or ($props -band 32) -ne 0) {
      $cccd = if (($props -band 16) -ne 0) {
        [Windows.Devices.Bluetooth.GenericAttributeProfile.GattClientCharacteristicConfigurationDescriptorValue]::Notify
      } else {
        [Windows.Devices.Bluetooth.GenericAttributeProfile.GattClientCharacteristicConfigurationDescriptorValue]::Indicate
      }
      $null = Register-ObjectEvent -InputObject $ch -EventName 'ValueChanged' -Action {
        $argsVal = $EventArgs.CharacteristicValue
        $bytes = New-Object byte[] $argsVal.Length
        $reader = [Windows.Storage.Streams.DataReader]::FromBuffer($argsVal)
        $reader.ReadBytes($bytes)
        $b64 = [Convert]::ToBase64String($bytes)
        $cu = $Event.Sender.Uuid.ToString()
        [Console]::Out.WriteLine("DATA|" + $cu + "|" + $b64)
        [Console]::Out.Flush()
      }
      try {
        $null = Await-AsyncOp ($ch.WriteClientCharacteristicConfigurationDescriptorAsync($cccd)) ([Windows.Devices.Bluetooth.GenericAttributeProfile.GattCommunicationStatus])
        $subscribed += $ch.Uuid.ToString()
      } catch {}
    }
  }
}
[Console]::Out.WriteLine("READY|" + ($subscribed -join ','))
[Console]::Out.Flush()
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line -or $line -eq '__QUIT__') { break }
  if ($line -and $null -ne $writeChar) {
    try {
      $dw = New-Object Windows.Storage.Streams.DataWriter
      $dw.WriteBytes([System.Text.Encoding]::UTF8.GetBytes($line + "\`n"))
      $null = Await-AsyncOp ($writeChar.WriteValueAsync($dw.DetachBuffer())) ([Windows.Devices.Bluetooth.GenericAttributeProfile.GattCommunicationStatus])
    } catch {}
  }
}
$dev.Dispose()
`.trim();

async function listDevices() {
  const devices = [];
  const seen = new Set();

  if (process.platform === 'win32') {
    try {
      const { stdout } = await execFileAsync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodePowerShell(PS_ENUM_WINDOWS)],
        { timeout: 14000, windowsHide: true }
      );
      const parsed = JSON.parse((stdout || '{}').trim() || '{}');
      const ports = Array.isArray(parsed.ports) ? parsed.ports : parsed.ports ? [parsed.ports] : [];
      const macToCom = new Map();

      for (const p of ports) {
        const comMatch = String(p.deviceId || p.name || '').match(/COM\d+/i);
        if (!comMatch) continue;
        const com = comMatch[0].toUpperCase();
        const mac = extractMacFromText(p.pnpId || p.instanceId || '');
        if (mac) macToCom.set(mac, com);
        const isBt = /BTHENUM|BLUETOOTH/i.test(String(p.pnpId || p.instanceId || p.name || ''));
        if (isBt && !seen.has(`com:${com}`)) {
          seen.add(`com:${com}`);
          const label = String(p.name || com).trim();
          devices.push({
            id: com,
            name: label,
            address: mac || com,
            transport: 'spp',
            paired: true,
            connected: p.status === 'OK',
            port: com,
            platform: 'windows',
            sourceBackend: 'desktop_ipc',
            recommendedFor: detectRecommendedTypes(label),
          });
        }
      }

      // Live active BLE scan results (even unpaired sensors!)
      const bleAdv = Array.isArray(parsed.bleAdv) ? parsed.bleAdv : parsed.bleAdv ? [parsed.bleAdv] : [];
      for (const adv of bleAdv) {
        const mac = formatUlongMac(adv.addr);
        if (!mac) continue;
        const name = String(adv.name || '').trim() || `BLE-устройство ${mac.slice(-5)}`;
        const key = `${mac}:le`;
        if (seen.has(key)) continue;
        seen.add(key);
        devices.push({
          id: mac,
          name,
          address: mac,
          transport: 'gatt',
          paired: false,
          connected: false,
          rssi: typeof adv.rssi === 'number' ? adv.rssi : undefined,
          platform: 'windows',
          sourceBackend: 'desktop_ipc',
          recommendedFor: detectRecommendedTypes(name),
        });
      }

      // Paired WinRT BLE / Classic devices
      const pairedWinRt = Array.isArray(parsed.pairedWinRt)
        ? parsed.pairedWinRt
        : parsed.pairedWinRt
        ? [parsed.pairedWinRt]
        : [];
      for (const d of pairedWinRt) {
        const name = String(d.name || '').trim();
        const idStr = String(d.id || '');
        const mac = extractMacFromText(idStr);
        const isLe = d.kind === 'le';
        const key = mac ? `${mac}:${isLe ? 'le' : 'bt'}` : name;
        if (!name || !key || seen.has(key)) continue;
        seen.add(key);
        const com = mac ? macToCom.get(mac) : undefined;
        devices.push({
          id: com || mac || idStr,
          name,
          address: mac || idStr,
          transport: isLe ? 'gatt' : com ? 'spp' : 'dual',
          paired: true,
          connected: false,
          port: com,
          platform: 'windows',
          sourceBackend: 'desktop_ipc',
          recommendedFor: detectRecommendedTypes(name),
        });
      }

      const btList = Array.isArray(parsed.bluetooth)
        ? parsed.bluetooth
        : parsed.bluetooth
        ? [parsed.bluetooth]
        : [];
      for (const b of btList) {
        const iid = String(b.instanceId || '');
        const name = String(b.name || '').trim();
        if (
          !name ||
          /Microsoft Bluetooth|Radio|Enum|Transport|Service|A2DP|Avrcp|Hands-Free|RFCOMM Protocol|Device Information|Generic Attribute/i.test(
            name
          )
        ) {
          continue;
        }
        const mac = extractMacFromText(iid);
        const isLe = /BTHLE/i.test(iid);
        const com = mac ? macToCom.get(mac) : undefined;
        const key = mac ? `${mac}:${isLe ? 'le' : 'bt'}` : name;
        if (seen.has(key)) continue;
        seen.add(key);
        devices.push({
          id: com || mac || iid,
          name,
          address: mac || iid,
          transport: isLe ? 'gatt' : com ? 'spp' : 'dual',
          paired: true,
          connected: b.status === 'OK' && Boolean(b.present),
          port: com,
          platform: 'windows',
          sourceBackend: 'desktop_ipc',
          recommendedFor: detectRecommendedTypes(name),
        });
      }
      return { platform: 'windows', adapterSupported: true, devices };
    } catch {
      return { platform: 'windows', adapterSupported: true, devices };
    }
  }

  if (process.platform === 'darwin') {
    try {
      const files = fs.readdirSync('/dev');
      for (const f of files) {
        if (!f.startsWith('cu.')) continue;
        if (/Bluetooth-Incoming-Port|debug-console|wlan-debug|MALS|SOC|BLTH/i.test(f)) continue;
        const full = `/dev/${f}`;
        seen.add(full);
        const cleanName = f.replace(/^cu\./, '').replace(/-ESP32SPP|-SPPDev/gi, '');
        devices.push({
          id: full,
          name: `${cleanName} (Serial / SPP)`,
          address: full,
          transport: 'spp',
          paired: true,
          connected: true,
          port: full,
          platform: 'macos',
          sourceBackend: 'desktop_ipc',
          recommendedFor: detectRecommendedTypes(cleanName),
        });
      }
    } catch {
      // ignore
    }

    try {
      const { stdout } = await execFileAsync(
        'system_profiler',
        ['SPBluetoothDataType', '-json'],
        { timeout: 12000 }
      );
      const data = JSON.parse(stdout || '{}');
      const root = data.SPBluetoothDataType?.[0] || {};
      const extractMacEntry = (devName, info, isConn) => {
        if (!info || typeof info !== 'object') return;
        const addr = String(info.device_address || info.address || '').toUpperCase();
        if (!addr || seen.has(addr)) return;
        seen.add(addr);
        const cuMatch = devices.find((d) =>
          d.name.toLowerCase().includes(String(devName).toLowerCase().slice(0, 8))
        );
        devices.push({
          id: cuMatch?.port || addr,
          name: String(devName),
          address: addr,
          transport: cuMatch ? 'dual' : 'gatt',
          paired: true,
          connected: isConn,
          port: cuMatch?.port,
          platform: 'macos',
          sourceBackend: 'desktop_ipc',
          recommendedFor: detectRecommendedTypes(devName),
        });
      };

      for (const [arr, isConn] of [
        [root.device_connected, true],
        [root.device_not_connected, false],
      ]) {
        if (!Array.isArray(arr)) continue;
        for (const entry of arr) {
          for (const [devName, info] of Object.entries(entry || {})) {
            extractMacEntry(devName, info, isConn);
          }
        }
      }
    } catch {
      // ignore
    }

    return { platform: 'macos', adapterSupported: true, devices };
  }

  try {
    const files = fs.readdirSync('/dev');
    for (const f of files) {
      if (!/^(rfcomm\d+|ttyUSB\d+|ttyACM\d+)$/.test(f)) continue;
      const full = `/dev/${f}`;
      seen.add(full);
      devices.push({
        id: full,
        name: `Bluetooth / Serial (${f})`,
        address: full,
        transport: 'spp',
        paired: true,
        connected: true,
        port: full,
        platform: 'linux',
        sourceBackend: 'desktop_ipc',
        recommendedFor: ['esp32_limbs', 'myoblue_emg'],
      });
    }
  } catch {
    // ignore
  }
  return { platform: 'linux', adapterSupported: devices.length > 0, devices };
}

async function disconnectDevice(type) {
  const existing = activeConnections.get(type);
  if (!existing) return false;
  activeConnections.delete(type);
  await existing.disconnect().catch(() => undefined);
  return true;
}

async function connectDevice(params, emitEvent) {
  const { type, deviceId, deviceName, address, port, protocol = 'auto', baudRate } = params;
  await disconnectDevice(type);

  const safeBaud = sanitizeBaudRate(baudRate);
  const safePort = normalizeSafeSerialPort(
    port ||
      (String(address || '').startsWith('/dev/') || WIN_COM_REGEX.test(String(address || ''))
        ? address
        : undefined)
  );
  const safeMac = normalizeSafeBtAddress(address || (!safePort ? deviceId : undefined));
  const label = String(deviceName || safePort || safeMac || 'Штатный Bluetooth').slice(0, 90);

  if (safePort && (protocol === 'spp' || protocol === 'auto')) {
    if (process.platform === 'win32') {
      return new Promise((resolve) => {
        let settled = false;
        let closedManually = false;
        const child = spawn(
          'powershell.exe',
          ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodePowerShell(WIN_SERIAL_PS)],
          {
            windowsHide: true,
            env: { ...process.env, ETALON_COM_PORT: safePort, ETALON_BAUD: String(safeBaud) },
          }
        );

        let buf = '';
        const conn = {
          disconnect: async () => {
            closedManually = true;
            try {
              child.stdin.write('__QUIT__\n');
              child.kill();
            } catch {}
          },
          write: async (cmd) => {
            if (SAFE_COMMAND_REGEX.test(cmd) && child.stdin.writable) {
              child.stdin.write(`${cmd.replace(/[\r\n]+$/, '')}\n`);
            }
          },
        };

        const timer = setTimeout(() => {
          if (!settled) {
            settled = true;
            conn.disconnect().catch(() => undefined);
            resolve({
              success: false,
              deviceName: label,
              message: `Таймаут открытия COM-порта ${safePort}.`,
            });
          }
        }, 8000);

        child.stdout.on('data', (chunk) => {
          buf += chunk.toString('utf-8');
          const lines = buf.split(/\r?\n/);
          buf = lines.pop() || '';
          for (const rawLine of lines) {
            if (rawLine.startsWith('READY|') && !settled) {
              settled = true;
              clearTimeout(timer);
              activeConnections.set(type, conn);
              resolve({
                success: true,
                deviceName: label,
                message: `Подключено через штатный Bluetooth Windows (${safePort}): ${label}.`,
              });
            } else if (rawLine.startsWith('LINE|')) {
              emitEvent({
                type: 'data',
                equipmentType: type,
                deviceName: label,
                line: rawLine.slice(5),
              });
            }
          }
        });

        child.on('exit', () => {
          activeConnections.delete(type);
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve({
              success: false,
              deviceName: label,
              message: `Не удалось подключиться к ${safePort}.`,
            });
          } else if (!closedManually) {
            emitEvent({
              type: 'disconnected',
              equipmentType: type,
              reason: `Порт ${safePort} закрыт.`,
            });
          }
        });
      });
    }

    if (!fs.existsSync(safePort)) {
      return { success: false, deviceName: label, message: `Порт ${safePort} недоступен.` };
    }

    const sttyFlag = process.platform === 'darwin' ? '-f' : '-F';
    await execFileAsync('stty', [sttyFlag, safePort, String(safeBaud), 'raw', '-echo'], {
      timeout: 3000,
    }).catch(() => undefined);

    const stream = fs.createReadStream(safePort);
    let closedManually = false;
    let buf = '';

    activeConnections.set(type, {
      disconnect: async () => {
        closedManually = true;
        stream.destroy();
      },
      write: async (cmd) => {
        if (SAFE_COMMAND_REGEX.test(cmd)) {
          await fs.promises.writeFile(safePort, cmd);
        }
      },
    });

    stream.on('data', (chunk) => {
      buf += chunk.toString('utf-8');
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() || '';
      for (const line of lines) {
        emitEvent({ type: 'data', equipmentType: type, deviceName: label, line });
      }
    });

    stream.on('close', () => {
      activeConnections.delete(type);
      if (!closedManually) {
        emitEvent({
          type: 'disconnected',
          equipmentType: type,
          reason: `Порт ${safePort} отключён.`,
        });
      }
    });

    return {
      success: true,
      deviceName: label,
      message: `Подключено через штатный Bluetooth SPP (${safePort}): ${label}.`,
    };
  }

  if (process.platform === 'win32' && safeMac) {
    return new Promise((resolve) => {
      let settled = false;
      let closedManually = false;
      const child = spawn(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodePowerShell(WIN_WINRT_BLE_PS)],
        {
          windowsHide: true,
          env: { ...process.env, ETALON_BT_MAC: safeMac },
        }
      );

      let outBuf = '';
      const conn = {
        disconnect: async () => {
          closedManually = true;
          try {
            child.stdin.write('__QUIT__\n');
            child.kill();
          } catch {}
        },
        write: async (cmd) => {
          if (SAFE_COMMAND_REGEX.test(cmd) && child.stdin.writable) {
            child.stdin.write(`${cmd.replace(/[\r\n]+$/, '')}\n`);
          }
        },
      };

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          conn.disconnect().catch(() => undefined);
          resolve({
            success: false,
            fallbackToWebBluetooth: true,
            deviceName: label,
            message: `Таймаут подключения по штатному Bluetooth к ${label}.`,
          });
        }
      }, 12000);

      child.stdout.on('data', (chunk) => {
        outBuf += chunk.toString('utf-8');
        const lines = outBuf.split(/\r?\n/);
        outBuf = lines.pop() || '';
        for (const rawLine of lines) {
          if (rawLine.startsWith('READY|') && !settled) {
            settled = true;
            clearTimeout(timer);
            activeConnections.set(type, conn);
            resolve({
              success: true,
              deviceName: label,
              message: `Подключено через штатный Bluetooth Windows: ${label}.`,
            });
          } else if (rawLine.startsWith('DATA|')) {
            const parts = rawLine.split('|');
            if (parts.length >= 3) {
              emitEvent({
                type: 'data',
                equipmentType: type,
                deviceName: label,
                charUuid: parts[1],
                base64: parts[2],
              });
            }
          }
        }
      });

      child.on('exit', () => {
        activeConnections.delete(type);
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve({
            success: false,
            fallbackToWebBluetooth: true,
            deviceName: label,
            message: `Датчик ${label} (${safeMac}) не отвечает по WinRT — переключаемся на прямой BLE-поиск.`,
          });
        } else if (!closedManually) {
          emitEvent({
            type: 'disconnected',
            equipmentType: type,
            reason: `Соединение с ${label} разорвано.`,
          });
        }
      });
    });
  }

  return {
    success: false,
    fallbackToWebBluetooth: true,
    deviceName: label,
    message:
      'Для BLE-датчиков без последовательного порта используем прямой системный CoreBluetooth / BLE-сканер.',
  };
}

async function writeCommand(type, cmd) {
  const existing = activeConnections.get(type);
  if (!existing?.write || !SAFE_COMMAND_REGEX.test(String(cmd || ''))) return false;
  await existing.write(String(cmd));
  return true;
}

module.exports = {
  listDevices,
  connectDevice,
  disconnectDevice,
  writeCommand,
};
