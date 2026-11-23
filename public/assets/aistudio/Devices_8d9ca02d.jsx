import { useState, useEffect, useRef } from 'react';
import {
  Container, Title, Paper, Group, Button, SimpleGrid, Card, Text, Badge,
  Modal, Stack, TextInput, Select, Textarea, NumberInput, ActionIcon, Tooltip, Loader, Alert,
  ThemeIcon, Center, RingProgress, Divider
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconEdit, IconTrash, IconPlus, IconBattery, IconBolt,
  IconHeart, IconDeviceHeartMonitor, IconWeight, IconHandGrab,
  IconPlug, IconPlugOff, IconInfoCircle, IconHeartbeat
} from '@tabler/icons-react';
import { useDevices, useCreateDevice, useUpdateDevice, useDeleteDevice, useDeviceMeasurements } from '../hooks/useDevices';
import { useBluetoothContext } from '../contexts/BluetoothContext';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import AddDeviceModal from '../components/AddDeviceModal';

const deviceTypeIcons = {
  heart_rate: IconHeart,
  blood_pressure: IconDeviceHeartMonitor,
  scale: IconWeight,
  limb_scale: IconHandGrab,
  winch_scale: IconHandGrab,
  default: IconPlug,
};

const deviceTypeColors = {
  heart_rate: 'red',
  blood_pressure: 'blue',
  scale: 'green',
  limb_scale: 'orange',
  winch_scale: 'orange',
  default: 'gray',
};

const deviceTypeLabels = {
  scale: 'Весы',
  heart_rate: 'Пульсометр',
  blood_pressure: 'Тонометр',
  limb_scale: 'Весы на конечность',
  winch_scale: 'Весы на лебёдку',
};

export default function Devices() {
  const [opened, { open, close }] = useDisclosure(false);
  const [addModalOpened, { open: openAddModal, close: closeAddModal }] = useDisclosure(false);
  const [editingId, setEditingId] = useState(null);
  const [calibrationModal, setCalibrationModal] = useState({ opened: false, device: null });
  const [measurementsModal, setMeasurementsModal] = useState({ opened: false, device: null });
  const autoConnectDone = useRef(false);

  const {
    devices: btDevices,
    connectedDevices,
    deviceBatteryLevel,
    leftArmWeight,
    rightArmWeight,
    leftLegWeight,
    rightLegWeight,
    winchWeight,
    heartRate,
    bloodPressure,
    weightScaleValue,
    error: btError,
    isHeartRateConnected,
    isBloodPressureConnected,
    isWeightScaleConnected,
    connectToDevice,
    disconnectDevice,
    scanForSpecificDevice,
  } = useBluetoothContext();

  const { data: savedDevices, isLoading, refetch } = useDevices();
  const { data: measurements } = useDeviceMeasurements(measurementsModal.device?.id);
  const createDevice = useCreateDevice();
  const updateDevice = useUpdateDevice();
  const deleteDevice = useDeleteDevice();

  const form = useForm({
    initialValues: {
      device_type: '',
      name: '',
      mac_address: '',
      notes: '',
      battery_level: null,
    },
    validate: {
      device_type: (value) => (value ? null : 'Выберите тип'),
      name: (value) => (value?.length > 0 ? null : 'Введите название'),
      mac_address: (value) => (value?.length > 0 ? null : 'Введите идентификатор'),
      battery_level: (value) => {
        if (value === null || value === '') return null;
        if (value < 0 || value > 100) return 'Значение от 0 до 100';
        return null;
      },
    },
  });

  // Автоматическое подключение сохранённых устройств при загрузке страницы
  useEffect(() => {
    if (autoConnectDone.current) return;
    if (!savedDevices || savedDevices.length === 0) return;
    if (!btDevices || btDevices.length === 0) return;

    const tryConnect = async () => {
      for (const device of savedDevices) {
        const found = btDevices.find(d => d.id === device.mac_address || d.name === device.name);
        if (found && !connectedDevices.includes(found.id)) {
          try {
            await connectToDevice(found.id);
          } catch (err) {
            console.warn(`Не удалось автоматически подключить ${device.name}:`, err);
          }
        }
      }
      autoConnectDone.current = true;
    };
    tryConnect();
  }, [savedDevices, btDevices, connectedDevices, connectToDevice]);

  const handleOpenCreate = () => {
    setEditingId(null);
    form.reset();
    open();
  };

  const handleOpenEdit = (device) => {
    setEditingId(device.id);
    form.setValues({
      device_type: device.device_type,
      name: device.name,
      mac_address: device.mac_address,
      notes: device.notes || '',
      battery_level: device.battery_level,
    });
    open();
  };

  const handleSubmit = (values) => {
    const payload = {
      ...values,
      battery_level: values.battery_level === '' ? null : values.battery_level,
    };
    if (editingId) {
      updateDevice.mutate({ id: editingId, ...payload }, {
        onSuccess: () => {
          close();
          refetch();
        },
      });
    } else {
      createDevice.mutate(payload, {
        onSuccess: () => {
          close();
          refetch();
        },
      });
    }
  };

  const openCalibration = (device) => {
    setCalibrationModal({ opened: true, device });
  };

  const closeCalibration = () => {
    setCalibrationModal({ opened: false, device: null });
  };

  const openMeasurements = (device) => {
    setMeasurementsModal({ opened: true, device });
  };

  const closeMeasurements = () => {
    setMeasurementsModal({ opened: false, device: null });
  };

  const getBatteryColor = (level) => {
    if (level === null) return 'gray';
    if (level < 20) return 'red';
    return 'green';
  };

  const handleConnectSavedDevice = async (device) => {
    let found = btDevices.find(d => d.id === device.mac_address || d.name === device.name);
    if (!found) {
      try {
        const newDevice = await scanForSpecificDevice(device.name);
        found = newDevice;
        notifications.show({
          title: 'Устройство найдено',
          message: `Найдено устройство ${device.name}`,
          color: 'green'
        });
      } catch (err) {
        notifications.show({
          title: 'Устройство не найдено',
          message: err.message || 'Не удалось найти устройство. Убедитесь, что оно включено и находится рядом.',
          color: 'yellow'
        });
        return;
      }
    }
    try {
      const success = await connectToDevice(found.id);
      if (success) {
        // После подключения данные о батарее обновятся автоматически через state
      }
    } catch (err) {
      notifications.show({ title: 'Ошибка', message: err.message, color: 'red' });
    }
  };

  const handleDisconnectSavedDevice = (device) => {
    const found = btDevices.find(d => d.id === device.mac_address || d.name === device.name);
    if (found) {
      disconnectDevice(found.id);
    } else {
      notifications.show({ title: 'Ошибка', message: 'Устройство не найдено', color: 'yellow' });
    }
  };

  if (isLoading) return <Loader size="xl" />;

  return (
    <Container size="xl" py="xl">
      <Group justify="space-between" mb="lg">
        <Title order={2}>Оборудование</Title>
        <Button leftSection={<IconPlus size={20} />} onClick={openAddModal}>
          Добавить устройство
        </Button>
      </Group>

      {btError && (
        <Alert color="red" mb="md">
          {btError}
        </Alert>
      )}

      {savedDevices?.length === 0 ? (
        <Paper withBorder p="xl" ta="center">
          <Text c="dimmed" size="lg">Нет добавленных устройств</Text>
          <Text c="dimmed" mt="sm">Нажмите «Добавить устройство», чтобы начать.</Text>
        </Paper>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3, lg: 4 }} spacing="lg">
          {savedDevices?.map((device) => {
            const Icon = deviceTypeIcons[device.device_type] || deviceTypeIcons.default;
            const iconColor = deviceTypeColors[device.device_type] || deviceTypeColors.default;
            const battery = deviceBatteryLevel[device.mac_address];
            const batteryColor = getBatteryColor(battery);
            const batteryPercent = battery ?? 0;

            // ========== УЛУЧШЕННАЯ ПРОВЕРКА ПОДКЛЮЧЕНИЯ ==========
            // Стандартная проверка через connectedDevices
            let isConnected = btDevices.some(d => d.id === device.mac_address && connectedDevices.includes(d.id));
            // Дополнительная проверка по фактическим данным (если устройство шлёт показания, значит оно подключено)
            if (!isConnected) {
              if (device.device_type === 'heart_rate' && heartRate !== null) isConnected = true;
              else if (device.device_type === 'blood_pressure' && bloodPressure !== null) isConnected = true;
              else if (device.device_type === 'scale' && weightScaleValue && weightScaleValue.weight !== null) isConnected = true;
            }
            // ========== КОНЕЦ УЛУЧШЕНИЙ ==========

            // Формируем показания для отображения (используем реальные данные из контекста)
            let reading = null;
            if (device.device_type === 'heart_rate' && heartRate !== null) {
              reading = (
                <Group gap="xs" mt="xs" justify="center">
                  <IconHeartbeat size={20} color="red" />
                  <Text fw={600} size="lg">{heartRate} уд/мин</Text>
                </Group>
              );
            } else if (device.device_type === 'blood_pressure' && bloodPressure) {
              reading = (
                <Group gap="xs" mt="xs" justify="center">
                  <IconDeviceHeartMonitor size={20} color="blue" />
                  <Text fw={600} size="lg">{bloodPressure.systolic}/{bloodPressure.diastolic}</Text>
                  <Text size="xs" c="dimmed">Пульс: {bloodPressure.pulse}</Text>
                </Group>
              );
            } else if (device.device_type === 'scale' && isConnected && weightScaleValue && weightScaleValue.weight !== null) {
              reading = (
                <Group gap="xs" mt="xs" justify="center">
                  <IconWeight size={20} color="green" />
                  <Text fw={600} size="lg">{weightScaleValue.weight.toFixed(1)} кг</Text>
                </Group>
              );
            }

            return (
              <Card
                key={device.id}
                withBorder
                shadow="sm"
                padding="lg"
                radius="md"
                style={{ cursor: 'default', transition: 'transform 0.2s', position: 'relative' }}
                onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
              >
                {/* Горизонтальные кнопки действий в левом верхнем углу */}
                <Group gap={4} style={{ position: 'absolute', top: 8, left: 8 }}>
                  <Tooltip label={isConnected ? 'Отключить' : 'Подключить'}>
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      color={isConnected ? 'red' : 'green'}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isConnected) handleDisconnectSavedDevice(device);
                        else handleConnectSavedDevice(device);
                      }}
                    >
                      {isConnected ? <IconPlugOff size={14} /> : <IconPlug size={14} />}
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Редактировать">
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      color="blue"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenEdit(device);
                      }}
                    >
                      <IconEdit size={14} />
                    </ActionIcon>
                  </Tooltip>
                  {(device.device_type === 'limb_scale' || device.device_type === 'winch_scale') && (
                    <Tooltip label="Калибровка">
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="orange"
                        onClick={(e) => {
                          e.stopPropagation();
                          openCalibration(device);
                        }}
                      >
                        <IconBolt size={14} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                  <Tooltip label="Удалить">
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      color="red"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm('Удалить устройство?')) deleteDevice.mutate(device.id);
                      }}
                    >
                      <IconTrash size={14} />
                    </ActionIcon>
                  </Tooltip>
                </Group>

                <Center>
                  <ThemeIcon
                    size={80}
                    radius="xl"
                    variant="light"
                    color={iconColor}
                    style={{ marginBottom: 16, marginTop: 16 }}
                  >
                    <Icon size={48} stroke={1.5} />
                  </ThemeIcon>
                </Center>

                <Text fw={700} size="xl" ta="center" mt="md">
                  {deviceTypeLabels[device.device_type] || device.device_type}
                </Text>
                <Text size="sm" c="dimmed" ta="center">
                  {device.name}
                </Text>

                {reading && (
                  <>
                    <Divider my="sm" />
                    <div>{reading}</div>
                  </>
                )}

                <Group justify="space-between" mt={reading ? 'md' : 'lg'}>
                  <Group gap="xs">
                    {battery !== undefined && (
                      <RingProgress
                        size={40}
                        thickness={3}
                        sections={[{ value: batteryPercent, color: batteryColor }]}
                        label={
                          <Text size="xs" fw={500} ta="center">
                            {battery}%
                          </Text>
                        }
                      />
                    )}
                    <Badge color={isConnected ? 'green' : 'gray'} variant="light">
                      {isConnected ? 'Подключено' : 'Не подключено'}
                    </Badge>
                  </Group>
                </Group>
              </Card>
            );
          })}
        </SimpleGrid>
      )}

      <Modal opened={opened} onClose={close} title={editingId ? 'Редактировать устройство' : 'Новое устройство'} size="md">
        <form onSubmit={form.onSubmit(handleSubmit)}>
          <Stack>
            <Select
              label="Тип устройства"
              data={Object.entries(deviceTypeLabels).map(([value, label]) => ({ value, label }))}
              required
              {...form.getInputProps('device_type')}
            />
            <TextInput
              label="Название"
              placeholder="Pravilo_left_arm"
              required
              {...form.getInputProps('name')}
            />
            <TextInput
              label="Идентификатор (MAC или device ID)"
              placeholder="AA:BB:CC:DD:EE:FF или строка из Bluetooth"
              required
              {...form.getInputProps('mac_address')}
            />
            <NumberInput
              label="Уровень заряда батареи (%)"
              placeholder="0-100"
              min={0}
              max={100}
              {...form.getInputProps('battery_level')}
            />
            <Textarea
              label="Примечания"
              {...form.getInputProps('notes')}
            />
            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={close}>Отмена</Button>
              <Button type="submit" loading={createDevice.isPending || updateDevice.isPending}>
                Сохранить
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal opened={calibrationModal.opened} onClose={closeCalibration} title={`Калибровка: ${calibrationModal.device?.name}`} size="md">
        <Stack>
          <Text>Здесь будет интерфейс калибровки в зависимости от типа устройства.</Text>
          <Text>Для весов на конечности и лебёдки можно задать коэффициенты.</Text>
          <Group justify="flex-end">
            <Button onClick={closeCalibration}>Закрыть</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={measurementsModal.opened} onClose={closeMeasurements} title={`История показаний: ${measurementsModal.device?.name}`} size="xl">
        <Paper withBorder p="md">
          {measurements && measurements.length > 0 ? (
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Время</Table.Th>
                  <Table.Th>Значение</Table.Th>
                  <Table.Th>Примечание</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {measurements.map((m) => (
                  <Table.Tr key={m.id}>
                    <Table.Td>{new Date(m.timestamp).toLocaleString()}</Table.Td>
                    <Table.Td>{JSON.stringify(m.value)}</Table.Td>
                    <Table.Td>{m.notes || '—'}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          ) : (
            <Text c="dimmed" ta="center">Нет сохранённых показаний</Text>
          )}
        </Paper>
      </Modal>

      <AddDeviceModal
        opened={addModalOpened}
        onClose={closeAddModal}
        onDeviceAdded={refetch}
      />
    </Container>
  );
}
