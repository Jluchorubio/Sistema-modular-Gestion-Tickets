import api from './api';

export type AssetStatus = 'disponible' | 'asignado' | 'en_reparacion' | 'dado_de_baja';

export interface AssetListItem {
  id:               string;
  name:             string;
  description:      string | null;
  qr_code:          string;
  serial_number:    string | null;
  status:           AssetStatus;
  version:          number;
  created_at:       string;
  updated_at:       string;
  module_name:      string;
  environment_name: string;
  category_name:    string;
  location_name:    string;
}

export interface AssetDetail extends AssetListItem {
  specifications: Record<string, unknown> | null;
}

export interface CreateAssetDto {
  module_id:       string;
  environment_id:  string;
  category_id:     string;
  name:            string;
  description?:    string;
  serial_number?:  string;
}

export const ASSET_STATUS_LABELS: Record<AssetStatus, string> = {
  disponible:    'Disponible',
  asignado:      'Asignado',
  en_reparacion: 'En reparación',
  dado_de_baja:  'Dado de baja',
};

export const ASSET_STATUS_COLORS: Record<AssetStatus, string> = {
  disponible:    '#22C55E',
  asignado:      '#3B82F6',
  en_reparacion: '#F59E0B',
  dado_de_baja:  '#94A3B8',
};

export const ASSET_STATUSES: AssetStatus[] = ['disponible', 'asignado', 'en_reparacion', 'dado_de_baja'];

export const inventoryService = {
  async getAll(moduleId?: string, status?: AssetStatus | ''): Promise<AssetListItem[]> {
    const params: Record<string, string> = {};
    if (moduleId) params.module_id = moduleId;
    if (status)   params.status    = status;
    const { data } = await api.get('/inventory', { params });
    return data;
  },

  async getOne(id: string): Promise<AssetDetail> {
    const { data } = await api.get(`/inventory/${id}`);
    return data;
  },

  async create(dto: CreateAssetDto): Promise<AssetListItem> {
    const { data } = await api.post('/inventory', dto);
    return data;
  },

  async updateStatus(id: string, status: AssetStatus): Promise<{ id: string; name: string; status: AssetStatus }> {
    const { data } = await api.patch(`/inventory/${id}/status`, { status });
    return data;
  },

  async getQr(id: string): Promise<{ id: string; qr_code: string; qr_image: string }> {
    const { data } = await api.get(`/inventory/${id}/qr`);
    return data;
  },
};
