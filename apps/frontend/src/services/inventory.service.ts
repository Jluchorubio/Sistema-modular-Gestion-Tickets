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

export interface FieldDef {
  key:       string;
  label:     string;
  type:      'text' | 'number' | 'date' | 'select' | 'boolean';
  required?: boolean;
  options?:  string[];
}

export interface AssetChild {
  id:            string;
  name:          string;
  status:        AssetStatus;
  qr_code:       string;
  serial_number: string | null;
  category_name: string;
}

export interface AssetDetail extends AssetListItem {
  specifications:      Record<string, unknown> | null;
  parent_asset_id:     string | null;
  parent_asset_name:   string | null;
  parent_asset_status: AssetStatus | null;
  module_id:           string;
  environment_id:      string;
  category_id:         string;
  field_schema:        FieldDef[];
  children_count:      number;
  tickets_count:       number;
  files_count:         number;
}

export interface AssetAssignment {
  id:                string;
  assigned_at:       string;
  notes:             string | null;
  assignment_status: string;
  user_id:           string;
  user_name:         string;
  user_email:        string;
  avatar_url:        string | null;
  assigned_by_name:  string;
}

export interface AssetHistoryEntry {
  id:          string;
  action:      string;
  reason:      string | null;
  created_at:  string;
  user_name:   string;
  actor_name:  string;
}

export interface AssetImage {
  id:               string;
  file_name:        string;
  file_size:        number;
  mime_type:        string;
  storage_url:      string;
  created_at:       string;
  uploaded_by_name: string;
}

export interface AssetTicket {
  id:           string;
  title:        string;
  priority:     string;
  created_at:   string;
  state_label:  string;
  state_name:   string;
  is_final:     boolean;
  creator_name: string;
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

export const ASSET_ACTION_LABELS: Record<string, string> = {
  asignado:     'Asignado a',
  devuelto:     'Devuelto por',
  transferido:  'Transferido',
  dado_de_baja: 'Dado de baja',
  reparacion:   'Enviado a reparación',
};

export const ASSET_ACTION_COLORS: Record<string, string> = {
  asignado:     '#3B82F6',
  devuelto:     '#22C55E',
  transferido:  '#8B5CF6',
  dado_de_baja: '#94A3B8',
  reparacion:   '#F59E0B',
};

export const inventoryService = {
  async getAll(moduleId?: string, status?: AssetStatus | '', q?: string): Promise<AssetListItem[]> {
    const params: Record<string, string> = {};
    if (moduleId) params.module_id = moduleId;
    if (q)        params.q         = q;
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

  async assign(id: string, dto: { user_id: string; notes?: string }): Promise<{ ok: boolean; assignment_id: string }> {
    const { data } = await api.post(`/inventory/${id}/assign`, dto);
    return data;
  },

  async unassign(id: string, reason?: string): Promise<{ ok: boolean }> {
    const { data } = await api.post(`/inventory/${id}/unassign`, { reason });
    return data;
  },

  async transition(id: string, dto: { status: AssetStatus; reason?: string }): Promise<{ ok: boolean; status: AssetStatus }> {
    const { data } = await api.post(`/inventory/${id}/transition`, dto);
    return data;
  },

  async getCurrentAssignment(id: string): Promise<AssetAssignment | null> {
    const { data } = await api.get(`/inventory/${id}/assignment`);
    return data;
  },

  async getHistory(id: string): Promise<AssetHistoryEntry[]> {
    const { data } = await api.get(`/inventory/${id}/history`);
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

  async update(id: string, dto: {
    name?: string; description?: string; serial_number?: string;
    specifications?: Record<string, unknown>;
    environment_id?: string; category_id?: string;
  }): Promise<{ id: string; name: string; serial_number: string; status: AssetStatus }> {
    const { data } = await api.patch(`/inventory/${id}`, dto);
    return data;
  },

  async remove(id: string): Promise<{ ok: boolean }> {
    const { data } = await api.delete(`/inventory/${id}`);
    return data;
  },

  async getAssetTickets(id: string): Promise<AssetTicket[]> {
    const { data } = await api.get(`/inventory/${id}/tickets`);
    return data;
  },

  async getChildAssets(id: string): Promise<AssetChild[]> {
    const { data } = await api.get(`/inventory/${id}/children`);
    return data;
  },

  async getAssetImages(id: string): Promise<AssetImage[]> {
    const { data } = await api.get(`/inventory/${id}/images`);
    return data;
  },

  async uploadAssetImage(id: string, file: File): Promise<AssetImage> {
    const form = new FormData();
    form.append('file', file);
    const { data } = await api.post(`/inventory/${id}/images`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  },

  async deleteAssetImage(id: string, imageId: string): Promise<{ ok: boolean }> {
    const { data } = await api.delete(`/inventory/${id}/images/${imageId}`);
    return data;
  },

  async bulkImport(
    moduleId: string,
    rows: Array<Omit<CreateAssetDto, 'module_id'>>,
  ): Promise<{ created: number; errors: { row: number; message: string }[] }> {
    const { data } = await api.post('/inventory/bulk', { module_id: moduleId, rows });
    return data;
  },
};
