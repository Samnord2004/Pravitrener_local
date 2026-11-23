import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { notifications } from '@mantine/notifications';

export const useDevices = () => {
  return useQuery({
    queryKey: ['devices'],
    queryFn: async () => {
      const { data } = await api.get('/devices');
      return data;
    },
  });
};

export const useDevice = (id) => {
  return useQuery({
    queryKey: ['devices', id],
    queryFn: async () => {
      const { data } = await api.get(`/devices/${id}`);
      return data;
    },
    enabled: !!id,
  });
};

export const useCreateDevice = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (device) => {
      const { data } = await api.post('/devices', device);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      notifications.show({ title: 'Успешно', message: 'Устройство добавлено', color: 'green' });
    },
    onError: (error) => {
      notifications.show({
        title: 'Ошибка',
        message: error.response?.data?.detail || 'Не удалось добавить устройство',
        color: 'red'
      });
    },
  });
};

export const useUpdateDevice = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }) => {
      const { data: response } = await api.put(`/devices/${id}`, data);
      return response;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      queryClient.invalidateQueries({ queryKey: ['devices', data.id] });
      notifications.show({ title: 'Успешно', message: 'Устройство обновлено', color: 'green' });
    },
    onError: (error) => {
      notifications.show({
        title: 'Ошибка',
        message: error.response?.data?.detail || 'Не удалось обновить устройство',
        color: 'red'
      });
    },
  });
};

export const useDeleteDevice = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      await api.delete(`/devices/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      notifications.show({ title: 'Успешно', message: 'Устройство удалено', color: 'green' });
    },
    onError: (error) => {
      notifications.show({
        title: 'Ошибка',
        message: error.response?.data?.detail || 'Не удалось удалить устройство',
        color: 'red'
      });
    },
  });
};

export const useDeviceMeasurements = (deviceId) => {
  return useQuery({
    queryKey: ['measurements', deviceId],
    queryFn: async () => {
      const { data } = await api.get(`/devices/${deviceId}/measurements`);
      return data;
    },
    enabled: !!deviceId,
  });
};

export const useCreateMeasurement = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ deviceId, measurement }) => {
      const { data } = await api.post(`/devices/${deviceId}/measurements`, measurement);
      return data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['measurements', variables.deviceId] });
    },
    onError: (error) => {
      notifications.show({
        title: 'Ошибка',
        message: error.response?.data?.detail || 'Не удалось сохранить показание',
        color: 'red'
      });
    },
  });
};
