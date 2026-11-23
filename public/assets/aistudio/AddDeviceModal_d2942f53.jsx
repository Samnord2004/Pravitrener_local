import { useState, useEffect } from 'react';
import { Modal, Stack, Text, Select, Button, Loader, Alert, Group, Paper, Tabs, List, ThemeIcon } from '@mantine/core';
import { IconInfoCircle, IconRefresh, IconBluetooth, IconHelp } from '@tabler/icons-react';
import { useBluetoothContext } from '../contexts/BluetoothContext';
import { useCreateDevice } from '../hooks/useDevices';

const deviceTypeOptions = [
  { value: 'scale', label: 'Напольные весы (Xiaomi)' },
  { value: 'heart_rate', label: 'Пульсометр' },
  { value: 'blood_pressure', label: 'Тонометр' },
  { value: 'limb_scale', label: 'Мио-датчики (конечности)' },
  { value: 'winch_scale', label: 'Весы на лебёдку' },
];

export default function AddDeviceModal({ opened, onClose, onDeviceAdded }) {
  const [step, setStep] = useState('select'); // select, scanning, success, error
  const [deviceType, setDeviceType] = useState('');
  const [timer, setTimer] = useState(21);
  const [foundDevice, setFoundDevice] = useState(null);
  const [scanError, setScanError] = useState(null);
  const [connecting, setConnecting] = useState(false);

  const { connectToDevice, addScannedDevice, scanForDevice } = useBluetoothContext();
  const createDevice = useCreateDevice();

  // Сброс состояния при открытии
  useEffect(() => {
    if (opened) {
      setStep('select');
      setDeviceType('');
      setFoundDevice(null);
      setScanError(null);
    }
  }, [opened]);

  // Сканирование при переходе на шаг scanning
  useEffect(() => {
    if (step === 'scanning') {
      setTimer(21);
      const interval = setInterval(() => {
        setTimer(prev => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      const performScan = async () => {
        try {
          let device;
          // Для весов используем фильтр по сервису состава тела, для остальных – общее сканирование
          if (deviceType === 'scale') {
            device = await navigator.bluetooth.requestDevice({
              filters: [{ services: ['0000181b-0000-1000-8000-00805f9b34fb'] }],
              optionalServices: ['0000181b-0000-1000-8000-00805f9b34fb']
            });
          } else {
            // Для пульсометра, тонометра – используем универсальное сканирование
            // Но можно добавить фильтры для известных сервисов
            const optionalServices = [];
            if (deviceType === 'heart_rate') optionalServices.push('0000180d-0000-1000-8000-00805f9b34fb');
            if (deviceType === 'blood_pressure') optionalServices.push('00001810-0000-1000-8000-00805f9b34fb', 'cdeacd80-5235-4c07-8846-93a37ee6b86d');
            device = await navigator.bluetooth.requestDevice({
              acceptAllDevices: true,
              optionalServices
            });
          }
          addScannedDevice(device);
          setFoundDevice(device);
          setStep('success');
        } catch (err) {
          console.error('Scan error:', err);
          setScanError(err.message || 'Устройство не найдено');
          setStep('error');
        }
      };
      performScan();

      return () => clearInterval(interval);
    }
  }, [step, deviceType, addScannedDevice]);

  const handleTypeSelect = () => {
    if (!deviceType) return;
    setStep('scanning');
  };

  const handleConnect = async () => {
    if (!foundDevice) return;
    setConnecting(true);
    try {
      // Пытаемся подключиться (не критично, если не получится – устройство всё равно сохраним)
      try {
        await connectToDevice(foundDevice.id);
      } catch (err) {
        console.warn('Не удалось установить BLE-соединение, но устройство будет сохранено:', err);
      }

      // Сохраняем устройство в БД
      await createDevice.mutateAsync({
        device_type: deviceType,
        name: foundDevice.name || (deviceType === 'scale' ? 'Весы' : deviceType === 'heart_rate' ? 'Пульсометр' : 'Тонометр'),
        mac_address: foundDevice.id,
        notes: '',
      });

      if (onDeviceAdded) onDeviceAdded();
      onClose();
    } catch (err) {
      console.error('Ошибка сохранения устройства:', err);
      setScanError(err.message);
      setStep('error');
    } finally {
      setConnecting(false);
    }
  };

  const handleRetry = () => {
    setStep('scanning');
    setScanError(null);
    setFoundDevice(null);
  };

  const getInstructionText = () => {
    switch (deviceType) {
      case 'scale': return 'Встаньте на весы босиком и не сходите с них до окончания измерения. Убедитесь, что весы включены и находятся в режиме сопряжения (обычно мигает экран или индикатор).';
      case 'heart_rate': return 'Наденьте пульсометр на грудь или запястье, убедитесь, что он включён и находится в режиме сопряжения.';
      case 'blood_pressure': return 'Наденьте манжету тонометра на руку, сядьте ровно, не разговаривайте. Включите тонометр и дождитесь окончания измерения.';
      default: return 'Подготовьте устройство к подключению (включите его и переведите в режим сопряжения).';
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Добавление устройства" size="md">
      <Stack>
        {step === 'select' && (
          <>
            <Tabs defaultValue="instruction">
              <Tabs.List>
                <Tabs.Tab value="instruction" leftSection={<IconHelp size={16} />}>Инструкция</Tabs.Tab>
                <Tabs.Tab value="add" leftSection={<IconBluetooth size={16} />}>Добавить</Tabs.Tab>
              </Tabs.List>
              <Tabs.Panel value="instruction" pt="md">
                <Stack>
                  <Text size="sm">
                    Для подключения Bluetooth-устройства выполните следующие шаги:
                  </Text>
                  <List spacing="sm" icon={<ThemeIcon color="blue" size={20} radius="xl"><IconBluetooth size={12} /></ThemeIcon>}>
                    <List.Item>Убедитесь, что устройство включено и находится в режиме сопряжения.</List.Item>
                    <List.Item>Нажмите на вкладку <strong>«Добавить»</strong> и выберите тип устройства.</List.Item>
                    <List.Item>Нажмите <strong>«Далее»</strong> – начнётся поиск.</List.Item>
                    <List.Item>Когда устройство будет найдено, нажмите <strong>«Подключить»</strong> для сохранения.</List.Item>
                    <List.Item>Если устройство требует пароль, введите <strong>0000</strong> или <strong>1234</strong>.</List.Item>
                  </List>
                </Stack>
              </Tabs.Panel>
              <Tabs.Panel value="add" pt="md">
                <Stack>
                  <Select
                    label="Выберите тип устройства"
                    placeholder="Тип"
                    data={deviceTypeOptions}
                    value={deviceType}
                    onChange={setDeviceType}
                  />
                  <Paper withBorder p="xs" bg="gray.0">
                    <Text size="xs" fw={500}>💡 Совет:</Text>
                    <Text size="xs">{getInstructionText()}</Text>
                  </Paper>
                  <Group justify="flex-end">
                    <Button variant="default" onClick={onClose}>Отмена</Button>
                    <Button onClick={handleTypeSelect} disabled={!deviceType}>Далее</Button>
                  </Group>
                </Stack>
              </Tabs.Panel>
            </Tabs>
          </>
        )}

        {step === 'scanning' && (
          <Paper withBorder p="lg" style={{ textAlign: 'center' }}>
            <Text size="lg" fw={500} mb="md">{getInstructionText()}</Text>
            <Text size="xl" fw={700} c="blue" mb="md">{timer} сек</Text>
            <Loader size="lg" />
            <Text size="sm" c="dimmed" mt="md">Поиск устройства...</Text>
          </Paper>
        )}

        {step === 'success' && (
          <Paper withBorder p="lg">
            <Text c="green" size="lg" fw={500} mb="md">✅ Устройство найдено!</Text>
            <Text mb="md">Название: {foundDevice?.name || 'Неизвестное устройство'}</Text>
            <Text size="xs" c="dimmed" mb="md">ID: {foundDevice?.id}</Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={onClose}>Отмена</Button>
              <Button onClick={handleConnect} loading={connecting}>Подключить</Button>
            </Group>
          </Paper>
        )}

        {step === 'error' && (
          <Paper withBorder p="lg">
            <Alert color="red" icon={<IconInfoCircle size={16} />} title="Ошибка" mb="md">
              {scanError || 'Устройство не обнаружено'}
            </Alert>
            <Group justify="center">
              <Button variant="light" onClick={() => window.open('/help', '_blank')}>Справка</Button>
              <Button leftSection={<IconRefresh size={16} />} onClick={handleRetry}>Повторить</Button>
            </Group>
          </Paper>
        )}
      </Stack>
    </Modal>
  );
}
