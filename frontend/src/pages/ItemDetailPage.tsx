import { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import type { Item, ItemSchema, FieldDef } from '../types';

export default function ItemDetailPage() {
  const { groupId, itemId } = useParams<{ groupId: string; itemId: string }>();
  const gid = Number(groupId);
  const iid = Number(itemId);
  const navigate = useNavigate();

  const [item, setItem] = useState<Item | null>(null);
  const [schema, setSchema] = useState<ItemSchema | null>(null);
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [formTags, setFormTags] = useState('');
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadItem();
  }, [gid, iid]);

  async function loadItem() {
    const it = await api.items.get(gid, iid);
    setItem(it);
    setFormData(it.data);
    setFormTags(it.tags.join(', '));
    const s = await api.schemas.get(gid, it.schema_id);
    setSchema(s);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const tags = formTags.split(',').map(t => t.trim()).filter(Boolean);
      await api.items.update(gid, iid, { data: formData, tags });
      await loadItem();
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this item?')) return;
    await api.items.delete(gid, iid);
    navigate(`/groups/${gid}`);
  }

  async function handleImageUpload(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files)) {
      await api.images.upload(iid, file);
    }
    loadItem();
  }

  async function handleImageDelete(imageId: number) {
    await api.images.delete(iid, imageId);
    loadItem();
  }

  async function handleSetPrimary(imageId: number) {
    await api.images.setPrimary(iid, imageId);
    loadItem();
  }

  if (!item || !schema) {
    return <div className="text-stone-400 dark:text-stone-500 text-center py-12">Loading...</div>;
  }

  const sections = schema.definition?.sections || {};
  const name = item.name || `Item #${item.id}`;

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-stone-400 dark:text-stone-500 mb-4">
        <Link to="/groups" className="hover:text-stone-600 dark:hover:text-stone-300">Collections</Link>
        <span>/</span>
        <Link to={`/groups/${gid}`} className="hover:text-stone-600 dark:hover:text-stone-300">Group</Link>
        <span>/</span>
        <span className="text-stone-600 dark:text-stone-300">{name}</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-stone-800 dark:text-stone-100">{name}</h1>
        <div className="flex gap-2">
          {editing ? (
            <>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-stone-800 dark:bg-stone-200 text-white dark:text-stone-900 rounded-lg text-sm font-medium hover:bg-stone-700 dark:hover:bg-stone-300 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button onClick={() => { setEditing(false); setFormData(item.data); }} className="px-4 py-2 text-stone-500 dark:text-stone-400 text-sm">
                Cancel
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)} className="px-4 py-2 border border-stone-300 dark:border-stone-600 rounded-lg text-sm text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800">
                Edit
              </button>
              <button onClick={handleDelete} className="px-4 py-2 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
                Delete
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Images */}
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700 p-4">
            <h2 className="text-sm font-medium text-stone-500 dark:text-stone-400 mb-3">Images</h2>
            <div className="grid grid-cols-2 gap-2">
              {item.images.map((img, idx) => (
                <div key={img.id} className={`relative aspect-square rounded-lg overflow-hidden bg-stone-100 dark:bg-stone-800 group ${idx === 0 ? 'ring-2 ring-stone-400 dark:ring-stone-500' : ''}`}>
                  <img
                    src={api.images.url(iid, img.id)}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                  {idx === 0 && (
                    <span className="absolute top-1 left-1 z-10 bg-black/60 text-yellow-400 rounded-full w-5 h-5 text-xs flex items-center justify-center" title="Thumbnail">
                      ★
                    </span>
                  )}
                  <div className="absolute inset-0 z-10 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="absolute top-1 right-1 flex gap-1 pointer-events-auto">
                    {idx !== 0 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleSetPrimary(img.id); }}
                        className="bg-black/50 text-white rounded-full w-6 h-6 text-xs flex items-center justify-center hover:bg-black/70 cursor-pointer"
                        title="Set as thumbnail"
                      >
                        ★
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleImageDelete(img.id); }}
                      className="bg-black/50 text-white rounded-full w-6 h-6 text-xs flex items-center justify-center hover:bg-red-600 cursor-pointer"
                    >
                      &times;
                    </button>
                    </div>
                  </div>
                </div>
              ))}
              <button
                onClick={() => fileRef.current?.click()}
                className="aspect-square rounded-lg border-2 border-dashed border-stone-300 dark:border-stone-600 flex items-center justify-center text-stone-400 dark:text-stone-500 hover:border-stone-400 dark:hover:border-stone-500"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                </svg>
              </button>
              <button
                onClick={() => cameraRef.current?.click()}
                className="aspect-square rounded-lg border-2 border-dashed border-stone-300 dark:border-stone-600 flex items-center justify-center text-stone-400 dark:text-stone-500 hover:border-stone-400 dark:hover:border-stone-500"
                title="Take photo"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={e => handleImageUpload(e.target.files)} />
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => handleImageUpload(e.target.files)} />
          </div>

          {/* Tags */}
          <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700 p-4 mt-4">
            <h2 className="text-sm font-medium text-stone-500 dark:text-stone-400 mb-3">Tags</h2>
            {editing ? (
              <input
                value={formTags}
                onChange={e => setFormTags(e.target.value)}
                className="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-lg text-sm bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200"
                placeholder="#tag1, #tag2"
              />
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {item.tags.length === 0 && <span className="text-sm text-stone-400 dark:text-stone-500">No tags</span>}
                {item.tags.map(t => (
                  <span key={t} className="bg-stone-100 dark:bg-stone-700 text-stone-600 dark:text-stone-300 text-sm px-2.5 py-0.5 rounded-full">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Fields */}
        <div className="lg:col-span-2 space-y-4">
          {Object.entries(sections).map(([sectionName, fields]) => (
            <div key={sectionName} className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700 p-5">
              <h2 className="text-sm font-medium text-stone-500 dark:text-stone-400 uppercase tracking-wide mb-4">{sectionName}</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {Object.entries(fields).map(([fieldName, fieldDef]) => {
                  const fd = fieldDef as FieldDef;
                  if (fd.type === 'image') return null;
                  const val = editing ? formData[fieldName] : item.data[fieldName];
                  const isWide = fd.type === 'textarea';
                  return (
                    <div key={fieldName} className={isWide ? 'sm:col-span-2' : ''}>
                      <label className="block text-xs text-stone-400 dark:text-stone-500 mb-1">{fieldName}</label>
                      {editing && fd.type !== 'computed' ? (
                        <EditableField
                          name={fieldName}
                          def={fd}
                          value={formData[fieldName]}
                          onChange={v => setFormData(prev => ({ ...prev, [fieldName]: v }))}
                        />
                      ) : (
                        <div className={`text-sm text-stone-800 dark:text-stone-200 ${fd.type === 'textarea' ? 'whitespace-pre-wrap' : ''}`}>
                          {formatDisplay(val)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 text-xs text-stone-400 dark:text-stone-500">
        Created: {new Date(item.created_at).toLocaleString()} &middot; Updated: {new Date(item.updated_at).toLocaleString()}
      </div>
    </div>
  );
}

function EditableField({ name, def, value, onChange }: {
  name: string;
  def: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (def.type === 'dropdown') {
    const options = def.options || def['dropdown-items'] || [];
    return (
      <select value={String(value || '')} onChange={e => onChange(e.target.value)} className="w-full px-2 py-1.5 border border-stone-300 dark:border-stone-600 rounded-lg text-sm bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200">
        <option value="">Select...</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (def.type === 'multiselect') {
    const options = def['multiselect-items'] || [];
    const selected = Array.isArray(value) ? value as string[] : [];
    return (
      <div className="flex flex-wrap gap-1">
        {options.map(o => (
          <button key={o} type="button" onClick={() => onChange(selected.includes(o) ? selected.filter(s => s !== o) : [...selected, o])}
            className={`px-2 py-0.5 rounded-full text-xs ${selected.includes(o) ? 'bg-stone-800 dark:bg-stone-200 text-white dark:text-stone-900' : 'bg-stone-100 dark:bg-stone-700 text-stone-600 dark:text-stone-300'}`}>
            {o}
          </button>
        ))}
      </div>
    );
  }
  if (def.type === 'boolean') {
    return <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} />;
  }
  if (def.type === 'int' || def.type === 'float') {
    return <input type="number" step={def.type === 'float' ? 'any' : '1'} value={value != null ? String(value) : ''} onChange={e => onChange(e.target.value ? Number(e.target.value) : null)} className="w-full px-2 py-1.5 border border-stone-300 dark:border-stone-600 rounded-lg text-sm bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200" />;
  }
  if (def.type === 'unit') {
    const uv = typeof value === 'object' && value != null ? value as { value: number; unit: string } : { value: 0, unit: def.default_unit || '' };
    return (
      <div className="flex gap-1">
        <input type="number" step="any" value={uv.value || ''} onChange={e => onChange({ ...uv, value: Number(e.target.value) })} className="flex-1 px-2 py-1.5 border border-stone-300 dark:border-stone-600 rounded-lg text-sm bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200" />
        <input value={uv.unit} onChange={e => onChange({ ...uv, unit: e.target.value })} className="w-16 px-2 py-1.5 border border-stone-300 dark:border-stone-600 rounded-lg text-sm bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200" />
      </div>
    );
  }
  if (def.type === 'datetime') {
    return <input type="datetime-local" value={value ? String(value) : ''} onChange={e => onChange(e.target.value)} className="w-full px-2 py-1.5 border border-stone-300 dark:border-stone-600 rounded-lg text-sm bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200" />;
  }
  if (def.type === 'textarea') {
    return <textarea value={value != null ? String(value) : ''} onChange={e => onChange(e.target.value)} rows={6} className="w-full px-2 py-1.5 border border-stone-300 dark:border-stone-600 rounded-lg text-sm bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200 font-mono sm:col-span-2" />;
  }
  return <input value={value != null ? String(value) : ''} onChange={e => onChange(e.target.value)} className="w-full px-2 py-1.5 border border-stone-300 dark:border-stone-600 rounded-lg text-sm bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200" />;
}

function formatDisplay(val: unknown): string {
  if (val == null) return '—';
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  if (Array.isArray(val)) return val.join(', ') || '—';
  if (typeof val === 'object' && 'value' in (val as Record<string, unknown>)) {
    const v = val as { value: number; unit: string };
    return `${v.value} ${v.unit}`;
  }
  return String(val);
}
