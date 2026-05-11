import api from './api';

export const uploadService = {
  async uploadFile(file: File, endpoint = '/files/upload'): Promise<string> {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await api.post(endpoint, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data.url as string;
  },
};
