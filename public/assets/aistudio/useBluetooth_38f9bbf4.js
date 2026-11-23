import { useState, useCallback, useRef, useEffect } from 'react';
import { api } from '../api/client';

// Сервисы и характеристики
const HEART_RATE_SERVICE = '0000180d-0000-1000-8000-00805f9b34fb';
const HEART_RATE_MEASUREMENT_CHAR = '00002a37-0000-1000-8000-00805f9b34fb';
const BATTERY_SERVICE = '0000180f-0000-1000-8000-00805f9b34fb';
const BATTERY_LEVEL_CHAR = '00002a19-0000-1000-8000-00805f9b34fb';
const WEIGHT_SCALE_SERVICE = '0000180d-0000-1000-8000-00805f9b34fb';
const WEIGHT_MEASUREMENT_CHAR = '00002a9d-0000-1000-8000-00805f9b34fb';
const BODY_COMPOSITION_CHAR = '00002a9c-0000-1000-8000-00805f9b34fb';
// Кастомный сервис тонометра
const BLOOD_PRESSURE_SERVICE_CUSTOM = 'cdeacd80-5235-4c07-8846-93a37ee6b86d';
const BLOOD_PRESSURE_MEASUREMENT_CHAR_CUSTOM = 'cdeacd81-5235-4c07-8846-93a37ee6b86d';
// Стандартный сервис тонометра
const BLOOD_PRESSURE_SERVICE_STANDARD = '00001810-0000-1000-8000-00805f9b34fb';
const BLOOD_PRESSURE_MEASUREMENT_CHAR_STANDARD = '00002a35-0000-1000-8000-00805f9b34fb';
const CUSTOM_WEIGHT_SERVICE = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
const OKOK_SCALE_SERVICE = '80d78b1d-0a8d-afb6-157d-93fd60d99bf4';

export const useBluetooth = () => {
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState([]);
  const [connectedDevices, setConnectedDevices] = useState([]);
  const [deviceBatteryLevel, setDeviceBatteryLevel] = useState({});

  const [leftArmWeight, setLeftArmWeight] = useState(null);
  const [rightArmWeight, setRightArmWeight] = useState(null);
  const [leftLegWeight, setLeftLegWeight] = useState(null);
  const [rightLegWeight, setRightLegWeight] = useState(null);
  const [winchWeight, setWinchWeight] = useState(null);
  const [weightScaleValue, setWeightScaleValue] = useState(null);
  const [bodyComposition, setBodyComposition] = useState(null);

  const [heartRate, setHeartRate] = useState(null);
  const [batteryLevel, setBatteryLevel] = useState(null);
  const [bloodPressure, setBloodPressure] = useState(null);
  const [limbScaleData, setLimbScaleData] = useState(null);

  const [error, setError] = useState(null);
  const [isHeartRateConnected, setIsHeartRateConnected] = useState(false);
  const [isBloodPressureConnected, setIsBloodPressureConnected] = useState(false);
  const [isWeightScaleConnected, setIsWeightScaleConnected] = useState(false);

  const connectionsRef = useRef(new Map());

  const isBluetoothSupported = typeof navigator !== 'undefined' && navigator.bluetooth;

  const getLimbTypeFromName = (name) => {
    const lower = name?.toLowerCase() || '';
    if (lower.includes('левая рука')) return 'leftArm';
    if (lower.includes('правая рука')) return 'rightArm';
    if (lower.includes('левая нога')) return 'leftLeg';
    if (lower.includes('правая нога')) return 'rightLeg';
    if (lower.includes('вес лебёдки') || lower.includes('лебёдка')) return 'winch';
    return null;
  };

  const readBattery = useCallback(async (server, deviceId) => {
    try {
      const batteryService = await server.getPrimaryService(BATTERY_SERVICE).catch(() => null);
      if (!batteryService) return null;
      const batteryChar = await batteryService.getCharacteristic(BATTERY_LEVEL_CHAR);
      const value = await batteryChar.readValue();
      const level = value.getUint8(0);
      setBatteryLevel(level);
      setDeviceBatteryLevel(prev => ({ ...prev, [deviceId]: level }));
      return level;
    } catch (err) {
      console.warn('Не удалось прочитать батарею:', err);
      return null;
    }
  }, []);

  const handleHubData = useCallback((jsonStr) => {
    try {
      const data = JSON.parse(jsonStr);
      if (data.d0 !== undefined) setLeftArmWeight(data.d0);
      if (data.d1 !== undefined) setRightArmWeight(data.d1);
      if (data.d2 !== undefined) setLeftLegWeight(data.d2);
      if (data.d3 !== undefined) setRightLegWeight(data.d3);
      if (data.winch !== undefined) setWinchWeight(data.winch);
      if (data.hub_batt !== undefined) setBatteryLevel(data.hub_batt);
      console.log('Данные хаба:', data);
    } catch (e) {
      console.error('Ошибка парсинга JSON от хаба:', e);
    }
  }, []);

  const handleLimbScaleMeasurement = useCallback((event, deviceId, limbType) => {
    const value = event.target.value;
    const decoder = new TextDecoder('utf-8');
    const weightString = decoder.decode(value.buffer);
    const weight = parseFloat(weightString);
    if (!isNaN(weight)) {
      switch (limbType) {
        case 'leftArm': setLeftArmWeight(weight); break;
        case 'rightArm': setRightArmWeight(weight); break;
        case 'leftLeg': setLeftLegWeight(weight); break;
        case 'rightLeg': setRightLegWeight(weight); break;
        case 'winch': setWinchWeight(weight); break;
        default: setLimbScaleData({ weight });
      }
    }
  }, []);

  const handleHeartRateMeasurement = useCallback((event) => {
    const value = event.target.value;
    const data = new Uint8Array(value.buffer);
    if (data.length >= 2) {
      const flags = data[0];
      const hrValueFormat = flags & 0x01;
      let hr;
      if (hrValueFormat === 0) {
        hr = data[1];
      } else {
        hr = data[1] | (data[2] << 8);
      }
      setHeartRate(hr);
    }
  }, []);

  const handleBloodPressureMeasurement = useCallback((event) => {
    const value = event.target.value;
    const data = new Uint8Array(value.buffer);
    if (data.length >= 4 && data[0] === 129) {
      const systolic = data[1];
      const diastolic = data[2];
      const pulse = data[3];
      setBloodPressure({ systolic, diastolic, pulse });
    }
  }, []);

  const handleWeightMeasurement = useCallback((event) => {
    const value = event.target.value;
    const data = new Uint8Array(value.buffer);
    if (data.length >= 3) {
      const flags = data[0];
      const isMetric = !(flags & 0x01);
      let offset = 1;
      const weightValue = data[offset] | (data[offset + 1] << 8);
      offset += 2;
      const weight = isMetric ? weightValue / 100 : weightValue / 100 * 0.453592;
      setWeightScaleValue({ weight });
    }
  }, []);

  const handleBodyCompositionMeasurement = useCallback((event) => {
    const value = event.target.value;
    const data = new Uint8Array(value.buffer);
    console.log('Body Composition raw data:', Array.from(data));
    if (data.length >= 10) {
      const flags = data[0] | (data[1] << 8);
      let offset = 2;
      const weightValue = data[offset] | (data[offset + 1] << 8);
      offset += 2;
      const weight = weightValue / 200;
      const bodyFat = data[offset] | (data[offset + 1] << 8);
      offset += 2;
      const fatPercentage = bodyFat / 100;
      const muscleMass = data[offset] | (data[offset + 1] << 8);
      offset += 2;
      const muscle = muscleMass / 100;
      const waterPercentage = data[offset] | (data[offset + 1] << 8);
      offset += 2;
      const water = waterPercentage / 100;
      const boneMass = data[offset] | (data[offset + 1] << 8);
      offset += 2;
      const bone = boneMass / 100;
      setBodyComposition({
        weight,
        body_fat_percentage: fatPercentage,
        muscle_mass: muscle,
        water_percentage: water,
        bone_mass: bone,
      });
      setWeightScaleValue({ weight });
    }
  }, []);

  const fetchBloodPressureOnce = useCallback(async (deviceId) => {
    const conn = connectionsRef.current.get(deviceId);
    if (!conn || !conn.server || !conn.server.connected) {
      throw new Error('Тонометр не подключён');
    }
    if (conn.type !== 'blood_pressure') {
      throw new Error('Устройство не является тонометром');
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Превышено время ожидания измерения (60 секунд)'));
      }, 60000);

      const handler = (event) => {
        const value = event.target.value;
        const data = new Uint8Array(value.buffer);
        if (data.length >= 4 && data[0] === 129) {
          clearTimeout(timeout);
          conn.characteristic.removeEventListener('characteristicvaluechanged', handler);
          const systolic = data[1];
          const diastolic = data[2];
          const pulse = data[3];
          setBloodPressure({ systolic, diastolic, pulse });
          resolve({ systolic, diastolic, pulse });
        }
      };

      conn.characteristic.addEventListener('characteristicvaluechanged', handler);
    });
  }, []);

  const handleDisconnect = useCallback((deviceId) => {
    const conn = connectionsRef.current.get(deviceId);
    if (conn) {
      if (conn.type === 'hub') {
        setLeftArmWeight(null); setRightArmWeight(null); setLeftLegWeight(null); setRightLegWeight(null); setWinchWeight(null); setBatteryLevel(null);
      } else if (conn.limbType) {
        switch (conn.limbType) {
          case 'leftArm': setLeftArmWeight(null); break;
          case 'rightArm': setRightArmWeight(null); break;
          case 'leftLeg': setLeftLegWeight(null); break;
          case 'rightLeg': setRightLegWeight(null); break;
          case 'winch': setWinchWeight(null); break;
        }
      } else if (conn.type === 'blood_pressure') {
        setIsBloodPressureConnected(false); setBloodPressure(null);
      } else if (conn.type === 'heart_rate') {
        setIsHeartRateConnected(false); setHeartRate(null);
      } else if (conn.type === 'weight_scale') {
        setIsWeightScaleConnected(false); setWeightScaleValue(null); setBodyComposition(null);
      }
    }
    connectionsRef.current.delete(deviceId);
    setConnectedDevices(prev => prev.filter(id => id !== deviceId));
    setDeviceBatteryLevel(prev => {
      const newState = { ...prev };
      delete newState[deviceId];
      return newState;
    });
  }, []);

  const addScannedDevice = useCallback((device) => {
    setDevices(prev => {
      if (prev.find(d => d.id === device.id)) return prev;
      return [...prev, { id: device.id, name: device.name || 'Неизвестное устройство', device }];
    });
  }, []);

  const scanForDevice = useCallback(async (timeout = 21000) => {
    if (!isBluetoothSupported) {
      throw new Error('Web Bluetooth не поддерживается');
    }
    setScanning(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [
          HEART_RATE_SERVICE,
          BATTERY_SERVICE,
          BLOOD_PRESSURE_SERVICE_CUSTOM,
          BLOOD_PRESSURE_SERVICE_STANDARD,
          WEIGHT_SCALE_SERVICE,
          CUSTOM_WEIGHT_SERVICE,
          OKOK_SCALE_SERVICE,
        ],
      });
      clearTimeout(timeoutId);
      return device;
    } catch (err) {
      if (err.name === 'AbortError' || err.message.includes('abort')) {
        throw new Error('Время поиска истекло');
      }
      throw err;
    } finally {
      setScanning(false);
    }
  }, [isBluetoothSupported]);

  const scanForSpecificDevice = useCallback(async (name, timeout = 15000) => {
    if (!isBluetoothSupported) {
      throw new Error('Web Bluetooth не поддерживается');
    }
    setScanning(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ name }],
        optionalServices: [
          HEART_RATE_SERVICE,
          BATTERY_SERVICE,
          BLOOD_PRESSURE_SERVICE_CUSTOM,
          BLOOD_PRESSURE_SERVICE_STANDARD,
          WEIGHT_SCALE_SERVICE,
          CUSTOM_WEIGHT_SERVICE,
          OKOK_SCALE_SERVICE,
        ],
      });
      clearTimeout(timeoutId);
      addScannedDevice(device);
      return device;
    } catch (err) {
      if (err.name === 'AbortError' || err.message.includes('abort')) {
        throw new Error('Устройство не найдено');
      }
      throw err;
    } finally {
      setScanning(false);
    }
  }, [isBluetoothSupported, addScannedDevice]);

  const scanDevices = useCallback(async () => {
    if (!isBluetoothSupported) {
      setError('Web Bluetooth не поддерживается в этом браузере');
      return;
    }
    setScanning(true);
    setDevices([]);
    setError(null);
    try {
      let device;
      const names = ['Bluetooth1', 'OKOK', 'Scale'];
      for (const name of names) {
        try {
          device = await navigator.bluetooth.requestDevice({
            filters: [{ name }],
            optionalServices: [
              HEART_RATE_SERVICE,
              BATTERY_SERVICE,
              BLOOD_PRESSURE_SERVICE_CUSTOM,
              BLOOD_PRESSURE_SERVICE_STANDARD,
              WEIGHT_SCALE_SERVICE,
              CUSTOM_WEIGHT_SERVICE,
              OKOK_SCALE_SERVICE,
            ],
          });
          if (device) break;
        } catch (e) {}
      }
      if (!device) {
        device = await navigator.bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: [
            HEART_RATE_SERVICE,
            BATTERY_SERVICE,
            BLOOD_PRESSURE_SERVICE_CUSTOM,
            BLOOD_PRESSURE_SERVICE_STANDARD,
            WEIGHT_SCALE_SERVICE,
            CUSTOM_WEIGHT_SERVICE,
            OKOK_SCALE_SERVICE,
          ],
        });
      }
      console.log('Найдено устройство:', device.name, device.id);
      try {
        const server = await device.gatt.connect();
        await new Promise(resolve => setTimeout(resolve, 1000));
        const services = await server.getPrimaryServices();
        console.log('Сервисы устройства:', services.map(s => s.uuid));
        for (const service of services) {
          const chars = await service.getCharacteristics();
          console.log(`Сервис ${service.uuid} имеет характеристики:`, chars.map(c => c.uuid));
        }
        await server.disconnect();
      } catch (connErr) {
        console.log('Не удалось подключиться для получения сервисов:', connErr);
      }
      setDevices(prev => {
        if (prev.find(d => d.id === device.id)) return prev;
        return [...prev, { id: device.id, name: device.name || 'Неизвестное устройство', device }];
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setScanning(false);
    }
  }, [isBluetoothSupported]);

  const connectToDevice = useCallback(async (deviceId) => {
    if (!isBluetoothSupported) {
      setError('Web Bluetooth не поддерживается');
      return false;
    }
    if (connectionsRef.current.has(deviceId)) return true;

    const selected = devices.find(d => d.id === deviceId);
    if (!selected) {
      setError('Устройство не найдено в списке сканированных');
      return false;
    }

    setError(null);
    let device = selected.device;

    if (device.gatt.connected) {
      await device.gatt.disconnect();
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    try {
      const server = await device.gatt.connect();
      console.log('Подключение установлено, ждём готовности...');
      await new Promise(resolve => setTimeout(resolve, 1000));

      let services;
      let retries = 3;
      while (retries > 0) {
        try {
          services = await server.getPrimaryServices();
          console.log('Сервисы получены:', services.map(s => s.uuid));
          break;
        } catch (err) {
          console.warn(`Попытка ${4 - retries} не удалась:`, err);
          retries--;
          if (retries === 0) throw err;
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      // Логируем все сервисы и характеристики для отладки
      console.log('=== Полный список сервисов и характеристик ===');
      for (const service of services) {
        const chars = await service.getCharacteristics();
        console.log(`Сервис ${service.uuid} -> характеристики:`, chars.map(c => ({ uuid: c.uuid, properties: c.properties })));
      }

      let battery = null;
      if (services.some(s => s.uuid === BATTERY_SERVICE)) {
        battery = await readBattery(server, deviceId);
      }

      // Проверка на кастомный тонометр
      const bpCustomService = services.find(s => s.uuid === BLOOD_PRESSURE_SERVICE_CUSTOM);
      if (bpCustomService) {
        console.log('Обнаружен кастомный сервис тонометра');
        const characteristics = await bpCustomService.getCharacteristics();
        const bpChar = characteristics.find(c => c.uuid === BLOOD_PRESSURE_MEASUREMENT_CHAR_CUSTOM);
        if (bpChar && bpChar.properties.notify) {
          connectionsRef.current.set(deviceId, { server, characteristic: bpChar, type: 'blood_pressure', deviceName: device.name, battery });
          await bpChar.startNotifications();
          bpChar.addEventListener('characteristicvaluechanged', handleBloodPressureMeasurement);
          setConnectedDevices(prev => [...prev, deviceId]);
          setIsBloodPressureConnected(true);
          device.addEventListener('gattserverdisconnected', () => handleDisconnect(deviceId));
          return true;
        }
      }

      // Проверка на стандартный тонометр (НОВОЕ!)
      const bpStandardService = services.find(s => s.uuid === BLOOD_PRESSURE_SERVICE_STANDARD);
      if (bpStandardService) {
        console.log('Обнаружен стандартный сервис тонометра');
        const characteristics = await bpStandardService.getCharacteristics();
        const bpChar = characteristics.find(c => c.uuid === BLOOD_PRESSURE_MEASUREMENT_CHAR_STANDARD);
        if (bpChar && bpChar.properties.notify) {
          connectionsRef.current.set(deviceId, { server, characteristic: bpChar, type: 'blood_pressure', deviceName: device.name, battery });
          await bpChar.startNotifications();
          bpChar.addEventListener('characteristicvaluechanged', handleBloodPressureMeasurement);
          setConnectedDevices(prev => [...prev, deviceId]);
          setIsBloodPressureConnected(true);
          device.addEventListener('gattserverdisconnected', () => handleDisconnect(deviceId));
          return true;
        }
      }

      // OKOK весы
      const okokService = services.find(s => s.uuid.toLowerCase() === OKOK_SCALE_SERVICE.toLowerCase());
      if (okokService) {
        console.log('Обнаружен сервис OKOK весов');
        const characteristics = await okokService.getCharacteristics();
        for (const char of characteristics) {
          if (char.properties.notify) {
            connectionsRef.current.set(deviceId, { server, characteristic: char, type: 'weight_scale', deviceName: device.name, battery });
            await char.startNotifications();
            char.addEventListener('characteristicvaluechanged', handleWeightMeasurement);
            setConnectedDevices(prev => [...prev, deviceId]);
            setIsWeightScaleConnected(true);
            device.addEventListener('gattserverdisconnected', () => handleDisconnect(deviceId));
            return true;
          }
        }
        if (characteristics.length > 0) {
          const char = characteristics[0];
          if (char.properties.read) {
            const value = await char.readValue();
            handleWeightMeasurement({ target: { value } });
            connectionsRef.current.set(deviceId, { server, characteristic: char, type: 'weight_scale', deviceName: device.name, battery });
            setConnectedDevices(prev => [...prev, deviceId]);
            setIsWeightScaleConnected(true);
            device.addEventListener('gattserverdisconnected', () => handleDisconnect(deviceId));
            return true;
          }
        }
      }

      // Стандартный сервис весов
      const wsService = services.find(s => s.uuid === WEIGHT_SCALE_SERVICE);
      if (wsService) {
        console.log('Обнаружен сервис весов');
        const characteristics = await wsService.getCharacteristics();
        const bodyCompChar = characteristics.find(c => c.uuid === BODY_COMPOSITION_CHAR);
        if (bodyCompChar && bodyCompChar.properties.notify) {
          connectionsRef.current.set(deviceId, { server, characteristic: bodyCompChar, type: 'weight_scale', deviceName: device.name, battery });
          await bodyCompChar.startNotifications();
          bodyCompChar.addEventListener('characteristicvaluechanged', handleBodyCompositionMeasurement);
          setConnectedDevices(prev => [...prev, deviceId]);
          setIsWeightScaleConnected(true);
          device.addEventListener('gattserverdisconnected', () => handleDisconnect(deviceId));
          return true;
        }
        const wsChar = characteristics.find(c => c.uuid === WEIGHT_MEASUREMENT_CHAR);
        if (wsChar && wsChar.properties.notify) {
          connectionsRef.current.set(deviceId, { server, characteristic: wsChar, type: 'weight_scale', deviceName: device.name, battery });
          await wsChar.startNotifications();
          wsChar.addEventListener('characteristicvaluechanged', handleWeightMeasurement);
          setConnectedDevices(prev => [...prev, deviceId]);
          setIsWeightScaleConnected(true);
          device.addEventListener('gattserverdisconnected', () => handleDisconnect(deviceId));
          return true;
        }
      }

      // Пульсометр
      const hrService = services.find(s => s.uuid === HEART_RATE_SERVICE);
      if (hrService) {
        console.log('Обнаружен сервис пульсометра');
        const characteristics = await hrService.getCharacteristics();
        const hrChar = characteristics.find(c => c.uuid === HEART_RATE_MEASUREMENT_CHAR);
        if (hrChar && hrChar.properties.notify) {
          connectionsRef.current.set(deviceId, { server, characteristic: hrChar, type: 'heart_rate', deviceName: device.name, battery });
          await hrChar.startNotifications();
          hrChar.addEventListener('characteristicvaluechanged', handleHeartRateMeasurement);
          setConnectedDevices(prev => [...prev, deviceId]);
          setIsHeartRateConnected(true);
          device.addEventListener('gattserverdisconnected', () => handleDisconnect(deviceId));
          return true;
        }
      }

      // Если не распознано, отключаемся
      await device.gatt.disconnect();
      setError('Устройство не поддерживается');
      return false;
    } catch (err) {
      console.error('Ошибка подключения:', err);
      setError(err.message);
      return false;
    }
  }, [devices, handleWeightMeasurement, handleBodyCompositionMeasurement, handleHeartRateMeasurement, handleBloodPressureMeasurement, handleDisconnect, readBattery, isBluetoothSupported]);

  const disconnectDevice = useCallback((deviceId) => {
    const conn = connectionsRef.current.get(deviceId);
    if (conn && conn.server && conn.server.connected) conn.server.disconnect();
  }, []);

  const disconnectAll = useCallback(() => {
    connectionsRef.current.forEach((conn, deviceId) => {
      if (conn.server && conn.server.connected) conn.server.disconnect();
    });
  }, []);

  useEffect(() => {
    const checkConnections = () => {
      connectionsRef.current.forEach((conn, deviceId) => {
        if (conn.server && !conn.server.connected) {
          handleDisconnect(deviceId);
        }
      });
    };
    const interval = setInterval(checkConnections, 5000);
    return () => clearInterval(interval);
  }, [handleDisconnect]);

  return {
    scanning,
    devices,
    connectedDevices,
    deviceBatteryLevel,
    leftArmWeight,
    rightArmWeight,
    leftLegWeight,
    rightLegWeight,
    winchWeight,
    weightScaleValue,
    bodyComposition,
    heartRate,
    bloodPressure,
    limbScaleData,
    batteryLevel,
    error,
    isHeartRateConnected,
    isBloodPressureConnected,
    isWeightScaleConnected,
    scanDevices,
    scanForDevice,
    scanForSpecificDevice,
    addScannedDevice,
    connectToDevice,
    disconnectDevice,
    disconnectAll,
    fetchBloodPressureOnce,
    isBluetoothSupported,
  };
};
