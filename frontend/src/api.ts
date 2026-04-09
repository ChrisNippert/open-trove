import type { Group, ItemSchema, Item, DirectoryView, ImportResult } from './types';

const BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers as Record<string, string> },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// --- Groups ---
export const api = {
  groups: {
    list: () => request<Group[]>('/groups'),
    get: (id: number) => request<Group>(`/groups/${id}`),
    create: (data: { name: string; description?: string }) =>
      request<Group>('/groups', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: { name?: string; description?: string }) =>
      request<Group>(`/groups/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number) => request<void>(`/groups/${id}`, { method: 'DELETE' }),
    uploadThumbnail: async (id: number, file: File) => {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${BASE}/groups/${id}/thumbnail`, {
        method: 'POST',
        body: form,
      });
      if (!res.ok) throw new Error('Upload failed');
      return res.json() as Promise<Group>;
    },
    deleteThumbnail: (id: number) =>
      request<void>(`/groups/${id}/thumbnail`, { method: 'DELETE' }),
    thumbnailUrl: (id: number) => `${BASE}/groups/${id}/thumbnail`,
  },

  schemas: {
    list: (groupId: number) => request<ItemSchema[]>(`/groups/${groupId}/schemas`),
    get: (groupId: number, schemaId: number) =>
      request<ItemSchema>(`/groups/${groupId}/schemas/${schemaId}`),
    create: (groupId: number, data: { name: string; definition?: object }) =>
      request<ItemSchema>(`/groups/${groupId}/schemas`, { method: 'POST', body: JSON.stringify(data) }),
    update: (groupId: number, schemaId: number, data: { name?: string; definition?: object }) =>
      request<ItemSchema>(`/groups/${groupId}/schemas/${schemaId}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (groupId: number, schemaId: number) =>
      request<void>(`/groups/${groupId}/schemas/${schemaId}`, { method: 'DELETE' }),
  },

  items: {
    list: (groupId: number, opts?: { schema_id?: number; offset?: number; limit?: number }) => {
      const params = new URLSearchParams();
      if (opts?.schema_id) params.set('schema_id', String(opts.schema_id));
      if (opts?.offset) params.set('offset', String(opts.offset));
      if (opts?.limit) params.set('limit', String(opts.limit));
      const qs = params.toString();
      return request<Item[]>(`/groups/${groupId}/items${qs ? `?${qs}` : ''}`);
    },
    get: (groupId: number, itemUuid: string) =>
      request<Item>(`/groups/${groupId}/items/${itemUuid}`),
    create: (groupId: number, data: { name?: string; schema_id: number; data: object; tags?: string[] }) =>
      request<Item>(`/groups/${groupId}/items`, { method: 'POST', body: JSON.stringify(data) }),
    update: (groupId: number, itemUuid: string, data: { name?: string; data?: object; tags?: string[] }) =>
      request<Item>(`/groups/${groupId}/items/${itemUuid}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (groupId: number, itemUuid: string) =>
      request<void>(`/groups/${groupId}/items/${itemUuid}`, { method: 'DELETE' }),
  },

  images: {
    upload: async (itemUuid: string, file: File) => {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${BASE}/items/${itemUuid}/images`, {
        method: 'POST',
        body: form,
      });
      if (!res.ok) throw new Error('Upload failed');
      return res.json();
    },
    uploadFromUrl: async (itemUuid: string, url: string) => {
      const res = await fetch(`${BASE}/items/${itemUuid}/images/from-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Failed to download image' }));
        throw new Error(err.detail || 'Failed to download image from URL');
      }
      return res.json();
    },
    list: (itemUuid: string) => request<Item['images']>(`/items/${itemUuid}/images`),
    delete: (itemUuid: string, imageId: number) =>
      request<void>(`/items/${itemUuid}/images/${imageId}`, { method: 'DELETE' }),
    setPrimary: (itemUuid: string, imageId: number) =>
      request<unknown>(`/items/${itemUuid}/images/${imageId}/set-primary`, { method: 'POST' }),
    url: (itemUuid: string, imageId: number) => `${BASE}/items/${itemUuid}/images/${imageId}/file`,
    thumbUrl: (itemUuid: string, imageId: number) => `${BASE}/items/${itemUuid}/images/${imageId}/thumbnail`,
  },

  search: (opts: { q?: string; group_id?: number; field?: string; op?: string; value?: string; tag?: string; filters?: string }) => {
    const params = new URLSearchParams();
    if (opts.q) params.set('q', opts.q);
    if (opts.group_id) params.set('group_id', String(opts.group_id));
    if (opts.field) params.set('field', opts.field);
    if (opts.op) params.set('op', opts.op);
    if (opts.value) params.set('value', opts.value);
    if (opts.tag) params.set('tag', opts.tag);
    if (opts.filters) params.set('filters', opts.filters);
    return request<Item[]>(`/search?${params}`);
  },

  facets: (groupId: number, filters?: string, tag?: string) => {
    const params = new URLSearchParams({ group_id: String(groupId) });
    if (filters) params.set('filters', filters);
    if (tag) params.set('tag', tag);
    return request<{ facets: Record<string, { type: string; field: string; options?: { value: string; count: number }[]; min?: number | null; max?: number | null; unit?: string; true_count?: number; false_count?: number }>; tags: { tag: string; count: number }[] }>(`/search/facets?${params}`);
  },

  views: {
    list: (groupId: number) => request<DirectoryView[]>(`/groups/${groupId}/views`),
    create: (groupId: number, data: { name: string; definition?: object }) =>
      request<DirectoryView>(`/groups/${groupId}/views`, { method: 'POST', body: JSON.stringify(data) }),
    resolve: (groupId: number, viewId: number) =>
      request<{ name: string; tree: object }>(`/groups/${groupId}/views/${viewId}/resolve`),
    delete: (groupId: number, viewId: number) =>
      request<void>(`/groups/${groupId}/views/${viewId}`, { method: 'DELETE' }),
  },

  units: {
    categories: () => request<string[]>('/units/categories'),
    byCategory: (cat: string) => request<{ name: string; symbol: string; category: string }[]>(`/units/categories/${cat}`),
    convert: (value: number, from_unit: string, to_unit: string) =>
      request<{ value: number; from_unit: string; to_unit: string; result: number }>(
        '/units/convert', { method: 'POST', body: JSON.stringify({ value, from_unit, to_unit }) }),
  },

  export: {
    jsonUrl: (groupId?: number, includeSchemas?: boolean) => {
      const params = new URLSearchParams();
      if (groupId) params.set('group_id', String(groupId));
      if (includeSchemas) params.set('include_schemas', 'true');
      const qs = params.toString();
      return `${BASE}/export/json${qs ? `?${qs}` : ''}`;
    },
    csvUrl: (groupId: number, schemaId: number) => `${BASE}/export/csv?group_id=${groupId}&schema_id=${schemaId}`,
    importJson: async (groupId: number, schemaId: number, file: File) => {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${BASE}/export/import/json?group_id=${groupId}&schema_id=${schemaId}`, {
        method: 'POST', body: form,
      });
      if (!res.ok) throw new Error('Import failed');
      return res.json() as Promise<ImportResult>;
    },
    importCsv: async (groupId: number, schemaId: number, file: File) => {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${BASE}/export/import/csv?group_id=${groupId}&schema_id=${schemaId}`, {
        method: 'POST', body: form,
      });
      if (!res.ok) throw new Error('Import failed');
      return res.json() as Promise<ImportResult>;
    },
    importBundle: async (groupId: number, file: File) => {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${BASE}/export/import/bundle?group_id=${groupId}`, {
        method: 'POST', body: form,
      });
      if (!res.ok) throw new Error('Import failed');
      return res.json() as Promise<{ schemas_created: number; imported: number; errors: string[] }>;
    },
  },
};
