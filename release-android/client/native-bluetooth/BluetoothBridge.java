package ru.etalonpravilo.client;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.BluetoothSocket;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanResult;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Queue;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Штатный Android Bluetooth-мост для WebView / Capacitor (BLE GATT + BLE Advertisements + Classic SPP RFCOMM).
 * Регистрируется в MainActivity как webView.addJavascriptInterface(new BluetoothBridge(this, webView), "EtalonNativeBluetooth");
 */
public class BluetoothBridge {
  public static final int REQUEST_BT_PERMISSIONS = 4401;
  private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
  private static final UUID CCCD_UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");

  private final Activity activity;
  private final WebView webView;
  private final Handler mainHandler = new Handler(Looper.getMainLooper());
  private final BluetoothAdapter adapter;

  private final Map<String, BluetoothGatt> activeGatts = new ConcurrentHashMap<>();
  private final Map<String, SppWorker> activeSpp = new ConcurrentHashMap<>();
  private final Map<String, String> equipmentTypeByAddress = new ConcurrentHashMap<>();

  private ScanCallback leScanCallback;
  private BroadcastReceiver classicDiscoveryReceiver;
  private boolean scanning = false;

  public BluetoothBridge(Activity activity, WebView webView) {
    this.activity = activity;
    this.webView = webView;
    BluetoothManager mgr = (BluetoothManager) activity.getSystemService(Context.BLUETOOTH_SERVICE);
    this.adapter = mgr != null ? mgr.getAdapter() : BluetoothAdapter.getDefaultAdapter();
  }

  private boolean hasBluetoothPermissions() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      return ContextCompat.checkSelfPermission(activity, Manifest.permission.BLUETOOTH_SCAN)
          == PackageManager.PERMISSION_GRANTED
          && ContextCompat.checkSelfPermission(activity, Manifest.permission.BLUETOOTH_CONNECT)
              == PackageManager.PERMISSION_GRANTED;
    }
    return ContextCompat.checkSelfPermission(activity, Manifest.permission.ACCESS_FINE_LOCATION)
        == PackageManager.PERMISSION_GRANTED;
  }

  @JavascriptInterface
  public boolean isAvailable() {
    return adapter != null;
  }

  @JavascriptInterface
  public boolean isEnabled() {
    return adapter != null && adapter.isEnabled();
  }

  @JavascriptInterface
  public boolean ensurePermissions() {
    if (hasBluetoothPermissions()) {
      return true;
    }
    List<String> perms = new ArrayList<>();
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      perms.add(Manifest.permission.BLUETOOTH_SCAN);
      perms.add(Manifest.permission.BLUETOOTH_CONNECT);
    } else {
      perms.add(Manifest.permission.ACCESS_FINE_LOCATION);
      perms.add(Manifest.permission.BLUETOOTH);
      perms.add(Manifest.permission.BLUETOOTH_ADMIN);
    }
    mainHandler.post(
        () ->
            ActivityCompat.requestPermissions(
                activity, perms.toArray(new String[0]), REQUEST_BT_PERMISSIONS));
    return false;
  }

  @SuppressLint("MissingPermission")
  @JavascriptInterface
  public String getPairedDevices() {
    JSONArray arr = new JSONArray();
    if (adapter == null || !hasBluetoothPermissions()) {
      return arr.toString();
    }
    try {
      Set<BluetoothDevice> bonded = adapter.getBondedDevices();
      if (bonded != null) {
        for (BluetoothDevice d : bonded) {
          arr.put(deviceToJson(d, true, 0));
        }
      }
    } catch (Exception ignored) {
    }
    return arr.toString();
  }

  @SuppressLint("MissingPermission")
  @JavascriptInterface
  public void startScan(String deviceTypeHint) {
    if (adapter == null || !adapter.isEnabled()) {
      emitError("", deviceTypeHint, "Bluetooth на смартфоне выключен. Включите Bluetooth в шторке Android.");
      return;
    }
    if (!ensurePermissions()) {
      emitError("", deviceTypeHint, "Разрешите доступ к Bluetooth в системном диалоге Android и повторите поиск.");
      return;
    }
    stopScan();
    scanning = true;

    Set<String> emittedAddresses = new HashSet<>();
    try {
      Set<BluetoothDevice> bonded = adapter.getBondedDevices();
      if (bonded != null) {
        for (BluetoothDevice d : bonded) {
          emittedAddresses.add(d.getAddress());
          emitDeviceFound(deviceToJson(d, true, 0));
        }
      }
    } catch (Exception ignored) {
    }

    // BLE Scan (for Mi Scale 2, HR 0x180D, BP 0x1810/OEM, ESP32 BLE, MYOblue BLE)
    BluetoothLeScanner leScanner = adapter.getBluetoothLeScanner();
    if (leScanner != null) {
      leScanCallback =
          new ScanCallback() {
            @Override
            public void onScanResult(int callbackType, ScanResult result) {
              BluetoothDevice dev = result.getDevice();
              if (dev == null) return;
              String addr = dev.getAddress();
              // Forward Mi Scale 2 advertisement service data directly if connected in advertising mode
              if (result.getScanRecord() != null
                  && result.getScanRecord().getServiceData() != null
                  && equipmentTypeByAddress.containsKey(addr)
                  && "xiaomi_scale".equals(equipmentTypeByAddress.get(addr))) {
                for (Map.Entry<android.os.ParcelUuid, byte[]> entry :
                    result.getScanRecord().getServiceData().entrySet()) {
                  String u = entry.getKey().toString().toLowerCase();
                  if (u.contains("181b") || u.contains("181d")) {
                    emitData(addr, "xiaomi_scale", u, u, entry.getValue(), null, dev.getName());
                  }
                }
              }
              if (!emittedAddresses.contains(addr)) {
                emittedAddresses.add(addr);
                emitDeviceFound(
                    deviceToJson(dev, dev.getBondState() == BluetoothDevice.BOND_BONDED, result.getRssi()));
              }
            }
          };
      try {
        leScanner.startScan(leScanCallback);
      } catch (Exception ignored) {
      }
    }

    // Classic Bluetooth Discovery (for HC-05 / ESP32 Classic SPP / MYOblue SPP)
    try {
      classicDiscoveryReceiver =
          new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
              if (BluetoothDevice.ACTION_FOUND.equals(intent.getAction())) {
                BluetoothDevice dev = intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
                if (dev != null && !emittedAddresses.contains(dev.getAddress())) {
                  emittedAddresses.add(dev.getAddress());
                  int rssi = intent.getShortExtra(BluetoothDevice.EXTRA_RSSI, Short.MIN_VALUE);
                  emitDeviceFound(
                      deviceToJson(
                          dev, dev.getBondState() == BluetoothDevice.BOND_BONDED, rssi));
                }
              }
            }
          };
      activity.registerReceiver(classicDiscoveryReceiver, new IntentFilter(BluetoothDevice.ACTION_FOUND));
      adapter.startDiscovery();
    } catch (Exception ignored) {
    }
  }

  @SuppressLint("MissingPermission")
  @JavascriptInterface
  public void stopScan() {
    scanning = false;
    if (adapter == null) return;
    try {
      BluetoothLeScanner leScanner = adapter.getBluetoothLeScanner();
      if (leScanner != null && leScanCallback != null && hasBluetoothPermissions()) {
        leScanner.stopScan(leScanCallback);
      }
    } catch (Exception ignored) {
    }
    leScanCallback = null;
    try {
      if (hasBluetoothPermissions() && adapter.isDiscovering()) {
        adapter.cancelDiscovery();
      }
    } catch (Exception ignored) {
    }
    if (classicDiscoveryReceiver != null) {
      try {
        activity.unregisterReceiver(classicDiscoveryReceiver);
      } catch (Exception ignored) {
      }
      classicDiscoveryReceiver = null;
    }
  }

  @SuppressLint("MissingPermission")
  @JavascriptInterface
  public void connect(String address, String equipmentType, String protocol) {
    if (adapter == null || !hasBluetoothPermissions()) {
      ensurePermissions();
      emitError(address, equipmentType, "Нет разрешений Bluetooth на устройстве Android.");
      return;
    }
    stopScan();
    disconnect(address);
    equipmentTypeByAddress.put(address, equipmentType);

    BluetoothDevice device;
    try {
      device = adapter.getRemoteDevice(address);
    } catch (Exception e) {
      emitError(address, equipmentType, "Некорректный Bluetooth-адрес: " + address);
      return;
    }

    String devName = device.getName() != null ? device.getName() : address;
    String proto = protocol != null ? protocol : "auto";
    boolean useSpp =
        "spp".equals(proto)
            || ("auto".equals(proto) && device.getType() == BluetoothDevice.DEVICE_TYPE_CLASSIC);

    if (useSpp) {
      SppWorker worker = new SppWorker(device, address, devName, equipmentType);
      activeSpp.put(address, worker);
      worker.start();
      return;
    }

    // Native Android BLE GATT Connection
    final Queue<BluetoothGattDescriptor> cccdQueue = new ArrayDeque<>();
    final List<String> subscribedUuids = new ArrayList<>();

    BluetoothGattCallback gattCallback =
        new BluetoothGattCallback() {
          private void flushNextDescriptor(BluetoothGatt gatt) {
            BluetoothGattDescriptor next = cccdQueue.poll();
            if (next != null) {
              gatt.writeDescriptor(next);
            } else {
              emitConnected(address, devName, equipmentType, "gatt", subscribedUuids);
            }
          }

          @Override
          public void onConnectionStateChange(BluetoothGatt gatt, int status, int newState) {
            if (newState == BluetoothProfile.STATE_CONNECTED) {
              gatt.discoverServices();
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
              activeGatts.remove(address);
              gatt.close();
              emitDisconnected(address, equipmentType, "Bluetooth GATT-соединение завершено.");
            }
          }

          @Override
          public void onServicesDiscovered(BluetoothGatt gatt, int status) {
            if (status != BluetoothGatt.GATT_SUCCESS) {
              emitError(address, equipmentType, "Ошибка чтения сервисов GATT: " + status);
              return;
            }
            for (BluetoothGattService svc : gatt.getServices()) {
              for (BluetoothGattCharacteristic ch : svc.getCharacteristics()) {
                int props = ch.getProperties();
                boolean canNotify = (props & BluetoothGattCharacteristic.PROPERTY_NOTIFY) != 0;
                boolean canIndicate = (props & BluetoothGattCharacteristic.PROPERTY_INDICATE) != 0;
                if (canNotify || canIndicate) {
                  gatt.setCharacteristicNotification(ch, true);
                  BluetoothGattDescriptor desc = ch.getDescriptor(CCCD_UUID);
                  if (desc != null) {
                    desc.setValue(
                        canIndicate
                            ? BluetoothGattDescriptor.ENABLE_INDICATION_VALUE
                            : BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
                    cccdQueue.add(desc);
                    subscribedUuids.add(ch.getUuid().toString());
                  }
                }
              }
            }
            flushNextDescriptor(gatt);
          }

          @Override
          public void onDescriptorWrite(
              BluetoothGatt gatt, BluetoothGattDescriptor descriptor, int status) {
            flushNextDescriptor(gatt);
          }

          @Override
          public void onCharacteristicChanged(
              BluetoothGatt gatt, BluetoothGattCharacteristic characteristic) {
            byte[] val = characteristic.getValue();
            if (val != null) {
              String svcUuid =
                  characteristic.getService() != null
                      ? characteristic.getService().getUuid().toString()
                      : "";
              emitData(
                  address,
                  equipmentType,
                  svcUuid,
                  characteristic.getUuid().toString(),
                  val,
                  null,
                  devName);
            }
          }
        };

    BluetoothGatt gatt =
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
            ? device.connectGatt(activity, false, gattCallback, BluetoothDevice.TRANSPORT_LE)
            : device.connectGatt(activity, false, gattCallback);
    if (gatt != null) {
      activeGatts.put(address, gatt);
    } else {
      emitError(address, equipmentType, "Не удалось открыть GATT-подключение.");
    }
  }

  @SuppressLint("MissingPermission")
  @JavascriptInterface
  public void disconnect(String address) {
    if (address == null) return;
    BluetoothGatt gatt = activeGatts.remove(address);
    if (gatt != null) {
      try {
        gatt.disconnect();
        gatt.close();
      } catch (Exception ignored) {
      }
    }
    SppWorker spp = activeSpp.remove(address);
    if (spp != null) {
      spp.cancel();
    }
  }

  @SuppressLint("MissingPermission")
  @JavascriptInterface
  public boolean write(String address, String text) {
    SppWorker spp = activeSpp.get(address);
    if (spp != null) {
      return spp.writeText(text);
    }
    BluetoothGatt gatt = activeGatts.get(address);
    if (gatt != null) {
      for (BluetoothGattService svc : gatt.getServices()) {
        for (BluetoothGattCharacteristic ch : svc.getCharacteristics()) {
          if ((ch.getProperties() & BluetoothGattCharacteristic.PROPERTY_WRITE) != 0
              || (ch.getProperties() & BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) != 0) {
            ch.setValue(text.getBytes(StandardCharsets.UTF_8));
            return gatt.writeCharacteristic(ch);
          }
        }
      }
    }
    return false;
  }

  private class SppWorker extends Thread {
    private final BluetoothDevice device;
    private final String address;
    private final String devName;
    private final String equipmentType;
    private BluetoothSocket socket;
    private volatile boolean stopped = false;

    SppWorker(BluetoothDevice device, String address, String devName, String equipmentType) {
      this.device = device;
      this.address = address;
      this.devName = devName;
      this.equipmentType = equipmentType;
    }

    @SuppressLint("MissingPermission")
    @Override
    public void run() {
      try {
        socket = device.createRfcommSocketToServiceRecord(SPP_UUID);
        socket.connect();
        emitConnected(address, devName, equipmentType, "spp", new ArrayList<>());
        InputStream in = socket.getInputStream();
        byte[] buf = new byte[512];
        StringBuilder lineBuf = new StringBuilder();
        while (!stopped) {
          int n = in.read(buf);
          if (n <= 0) break;
          String chunk = new String(buf, 0, n, StandardCharsets.UTF_8);
          lineBuf.append(chunk);
          int idx;
          while ((idx = lineBuf.indexOf("\n")) >= 0) {
            String line = lineBuf.substring(0, idx).trim();
            lineBuf.delete(0, idx + 1);
            if (!line.isEmpty()) {
              emitData(address, equipmentType, "SPP", "RFCOMM", null, line, devName);
            }
          }
        }
      } catch (Exception e) {
        if (!stopped) {
          emitError(address, equipmentType, "Ошибка Bluetooth SPP: " + e.getMessage());
        }
      } finally {
        cancel();
        if (!stopped) {
          emitDisconnected(address, equipmentType, "Bluetooth SPP отключён.");
        }
      }
    }

    boolean writeText(String text) {
      try {
        if (socket != null && socket.isConnected()) {
          OutputStream out = socket.getOutputStream();
          out.write(text.getBytes(StandardCharsets.UTF_8));
          out.flush();
          return true;
        }
      } catch (Exception ignored) {
      }
      return false;
    }

    void cancel() {
      stopped = true;
      try {
        if (socket != null) socket.close();
      } catch (Exception ignored) {
      }
    }
  }

  @SuppressLint("MissingPermission")
  private JSONObject deviceToJson(BluetoothDevice d, boolean paired, int rssi) {
    JSONObject obj = new JSONObject();
    try {
      String addr = d.getAddress();
      String name = d.getName();
      obj.put("id", addr);
      obj.put("address", addr);
      obj.put("name", name != null && !name.isEmpty() ? name : "Bluetooth " + addr);
      int btType = d.getType();
      String tr =
          btType == BluetoothDevice.DEVICE_TYPE_CLASSIC
              ? "spp"
              : btType == BluetoothDevice.DEVICE_TYPE_LE ? "gatt" : "dual";
      obj.put("transport", tr);
      obj.put("paired", paired);
      obj.put("rssi", rssi);
      obj.put("platform", "android");
      obj.put("sourceBackend", "android_bridge");
    } catch (Exception ignored) {
    }
    return obj;
  }

  private void emitEvent(JSONObject payload) {
    String json = payload.toString();
    mainHandler.post(
        () ->
            webView.evaluateJavascript(
                "window.__onEtalonNativeBluetoothEvent && window.__onEtalonNativeBluetoothEvent("
                    + json
                    + ");",
                null));
  }

  private void emitDeviceFound(JSONObject devObj) {
    try {
      JSONObject ev = new JSONObject();
      ev.put("type", "deviceFound");
      ev.put("device", devObj);
      emitEvent(ev);
    } catch (Exception ignored) {
    }
  }

  private void emitConnected(
      String address, String devName, String equipmentType, String proto, List<String> svcs) {
    try {
      JSONObject ev = new JSONObject();
      ev.put("type", "connected");
      ev.put("address", address);
      ev.put("deviceName", devName);
      ev.put("equipmentType", equipmentType);
      ev.put("protocol", proto);
      ev.put("services", new JSONArray(svcs));
      emitEvent(ev);
    } catch (Exception ignored) {
    }
  }

  private void emitDisconnected(String address, String equipmentType, String reason) {
    try {
      JSONObject ev = new JSONObject();
      ev.put("type", "disconnected");
      ev.put("address", address);
      ev.put("equipmentType", equipmentType);
      ev.put("reason", reason);
      emitEvent(ev);
    } catch (Exception ignored) {
    }
  }

  private void emitError(String address, String equipmentType, String message) {
    try {
      JSONObject ev = new JSONObject();
      ev.put("type", "error");
      ev.put("address", address);
      ev.put("equipmentType", equipmentType);
      ev.put("message", message);
      emitEvent(ev);
    } catch (Exception ignored) {
    }
  }

  private void emitData(
      String address,
      String equipmentType,
      String serviceUuid,
      String charUuid,
      byte[] bytes,
      String line,
      String devName) {
    try {
      JSONObject ev = new JSONObject();
      ev.put("type", "data");
      ev.put("address", address);
      ev.put("equipmentType", equipmentType);
      ev.put("serviceUuid", serviceUuid);
      ev.put("charUuid", charUuid);
      ev.put("deviceName", devName);
      if (bytes != null) {
        ev.put("base64", Base64.encodeToString(bytes, Base64.NO_WRAP));
      }
      if (line != null) {
        ev.put("line", line);
      }
      emitEvent(ev);
    } catch (Exception ignored) {
    }
  }
}
