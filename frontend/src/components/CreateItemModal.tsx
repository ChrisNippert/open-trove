import { useState, useRef, useEffect } from 'react';
import { api } from '../api';
import type { Item, ItemSchema, FieldDef } from '../types';

interface Props {
  groupId: number;
  schemas: ItemSchema[];
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateItemModal({ groupId, schemas, onClose, onCreated }: Props) {
  const [schemaId, setSchemaId] = useState(schemas[0]?.id);
  const [itemName, setItemName] = useState('');
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [tags, setTags] = useState('');
  const [saving, setSaving] = useState(false);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [namedImageFiles, setNamedImageFiles] = useState<Record<string, File>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const schema = schemas.find(s => s.id === schemaId);
  const sections = schema?.definition?.sections || {};

  function setField(name: string, value: unknown) {
    setFormData(prev => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const tagList = tags.split(',').map(t => t.trim()).filter(Boolean);
      const item = await api.items.create(groupId, {
        name: itemName.trim(),
        schema_id: schemaId,
        data: formData,
        tags: tagList,
      });
      // Upload named image fields and collect their IDs
      const namedImageData: Record<string, number> = {};
      for (const [fieldName, file] of Object.entries(namedImageFiles)) {
        const img = await api.images.upload(item.id, file);
        namedImageData[fieldName] = img.id;
      }
      // Update item data with image IDs if any
      if (Object.keys(namedImageData).length > 0) {
        await api.items.update(groupId, item.id, {
          data: { ...formData, ...namedImageData },
        });
      }
      // Upload general images
      for (const file of imageFiles) {
        await api.images.upload(item.id, file);
      }
      onCreated();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create item');
    } finally {
      setSaving(false);
    }
  }

  function handleFiles(files: FileList | null) {
    if (!files) return;
    setImageFiles(prev => [...prev, ...Array.from(files)]);
  }

  return (
    <div className="fixed inset-0 bg-black/30 dark:bg-black/50 z-50 flex items-start justify-center pt-16 px-4 overflow-y-auto">
      <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700 w-full max-w-2xl shadow-xl mb-16">
        <div className="flex items-center justify-between p-5 border-b border-stone-100 dark:border-stone-800">
          <h2 className="text-lg font-semibold text-stone-800 dark:text-stone-100">Add Item</h2>
          <button onClick={onClose} className="text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="p-5">
          {/* Item name */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-stone-600 dark:text-stone-300 mb-1">Name</label>
            <input
              value={itemName}
              onChange={e => setItemName(e.target.value)}
              className="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-lg text-sm bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200"
              placeholder="Item name"
              required
              autoFocus
            />
          </div>

          {/* Schema selector */}
          {schemas.length > 1 && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-stone-600 dark:text-stone-300 mb-1">Schema</label>
              <select
                value={schemaId}
                onChange={e => {
                  setSchemaId(Number(e.target.value));
                  setFormData({});
                }}
                className="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-lg text-sm bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200"
              >
                {schemas.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Fields by section */}
          {Object.entries(sections).map(([sectionName, fields]) => (
            <div key={sectionName} className="mb-6">
              <h3 className="text-sm font-medium text-stone-500 dark:text-stone-400 uppercase tracking-wide mb-3 border-b border-stone-100 dark:border-stone-800 pb-1">
                {sectionName}
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {Object.entries(fields).map(([fieldName, fieldDef]) => (
                  <FieldInput
                    key={fieldName}
                    name={fieldName}
                    def={fieldDef as FieldDef}
                    value={formData[fieldName]}
                    onChange={val => setField(fieldName, val)}
                    namedImageFile={namedImageFiles[fieldName] || null}
                    onImageFile={file => setNamedImageFiles(prev => {
                      const next = { ...prev };
                      if (file) next[fieldName] = file;
                      else delete next[fieldName];
                      return next;
                    })}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* Tags */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-stone-600 dark:text-stone-300 mb-1">Tags (comma-separated)</label>
            <input
              value={tags}
              onChange={e => setTags(e.target.value)}
              className="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-lg text-sm bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200"
              placeholder="#tag1, #tag2"
            />
          </div>

          {/* Images */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-stone-600 dark:text-stone-300 mb-2">Images</label>
            <div className="flex gap-2 flex-wrap">
              {imageFiles.map((f, i) => (
                <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden bg-stone-100 dark:bg-stone-800">
                  <img src={URL.createObjectURL(f)} className="w-full h-full object-cover" alt="" />
                  <button
                    type="button"
                    onClick={() => setImageFiles(prev => prev.filter((_, j) => j !== i))}
                    className="absolute top-0.5 right-0.5 bg-black/50 text-white rounded-full w-4 h-4 text-xs flex items-center justify-center"
                  >
                    &times;
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-20 h-20 rounded-lg border-2 border-dashed border-stone-300 dark:border-stone-600 flex items-center justify-center text-stone-400 dark:text-stone-500 hover:border-stone-400 dark:hover:border-stone-500 hover:text-stone-500 dark:hover:text-stone-400"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                className="w-20 h-20 rounded-lg border-2 border-dashed border-stone-300 dark:border-stone-600 flex items-center justify-center text-stone-400 dark:text-stone-500 hover:border-stone-400 dark:hover:border-stone-500 hover:text-stone-500 dark:hover:text-stone-400"
                title="Take photo"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={e => handleFiles(e.target.files)} />
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => handleFiles(e.target.files)} />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-4 border-t border-stone-100 dark:border-stone-800">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-stone-800 dark:bg-stone-200 text-white dark:text-stone-900 rounded-lg text-sm font-medium hover:bg-stone-700 dark:hover:bg-stone-300 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Create Item'}
            </button>
            <button type="button" onClick={onClose} className="px-4 py-2 text-stone-500 dark:text-stone-400 text-sm">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FieldInput({ name, def, value, onChange, namedImageFile, onImageFile }: {
  name: string;
  def: FieldDef;
  value: unknown;
  onChange: (val: unknown) => void;
  namedImageFile: File | null;
  onImageFile: (file: File | null) => void;
}) {
  const label = name.charAt(0).toUpperCase() + name.slice(1);
  const imgRef = useRef<HTMLInputElement>(null);

  if (def.type === 'computed') {
    return (
      <div>
        <label className="block text-sm text-stone-500 dark:text-stone-400 mb-1">{label} <span className="text-xs text-stone-400 dark:text-stone-500">(computed)</span></label>
        <input
          className="w-full px-3 py-2 border border-stone-200 dark:border-stone-700 rounded-lg text-sm bg-stone-50 dark:bg-stone-800 text-stone-400 dark:text-stone-500"
          value={value != null ? String(typeof value === 'object' && 'value' in (value as Record<string, unknown>) ? (value as {value: number}).value : value) : ''}
          disabled
        />
      </div>
    );
  }

  if (def.type === 'image') {
    return (
      <div className="sm:col-span-2">
        <label className="block text-sm text-stone-500 dark:text-stone-400 mb-1">{label}</label>
        {namedImageFile ? (
          <div className="relative w-32 h-32 rounded-lg overflow-hidden bg-stone-100 dark:bg-stone-800">
            <img src={URL.createObjectURL(namedImageFile)} className="w-full h-full object-cover" alt={label} />
            <button
              type="button"
              onClick={() => onImageFile(null)}
              className="absolute top-1 right-1 bg-black/50 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center hover:bg-red-600"
            >
              &times;
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => imgRef.current?.click()}
            className="w-32 h-32 rounded-lg border-2 border-dashed border-stone-300 dark:border-stone-600 flex flex-col items-center justify-center text-stone-400 dark:text-stone-500 hover:border-stone-400 dark:hover:border-stone-500 hover:text-stone-500 dark:hover:text-stone-400"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span className="text-xs">Add image</span>
          </button>
        )}
        <input ref={imgRef} type="file" accept="image/*" className="hidden" onChange={e => {
          const f = e.target.files?.[0];
          if (f) onImageFile(f);
          e.target.value = '';
        }} />
      </div>
    );
  }

  if (def.type === 'link') {
    return <LinkFieldInput name={name} def={def} value={value} onChange={onChange} />;
  }

  if (def.type === 'dropdown') {
    const options = def.options || def['dropdown-items'] || [];
    return (
      <div>
        <label className="block text-sm text-stone-500 dark:text-stone-400 mb-1">{label}</label>
        <select
          value={String(value || '')}
          onChange={e => onChange(e.target.value)}
          className="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-lg text-sm bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200"
        >
          <option value="">Select...</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
    );
  }

  if (def.type === 'multiselect') {
    const options = def['multiselect-items'] || [];
    const selected = Array.isArray(value) ? value as string[] : [];
    return (
      <div>
        <label className="block text-sm text-stone-500 dark:text-stone-400 mb-1">{label}</label>
        <div className="flex flex-wrap gap-1.5">
          {options.map(o => (
            <button
              key={o}
              type="button"
              onClick={() => {
                onChange(selected.includes(o) ? selected.filter(s => s !== o) : [...selected, o]);
              }}
              className={`px-2.5 py-1 rounded-full text-xs transition-colors ${
                selected.includes(o) ? 'bg-stone-800 dark:bg-stone-200 text-white dark:text-stone-900' : 'bg-stone-100 dark:bg-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-600'
              }`}
            >
              {o}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (def.type === 'boolean') {
    return (
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={!!value}
          onChange={e => onChange(e.target.checked)}
          className="rounded border-stone-300 dark:border-stone-600"
        />
        <label className="text-sm text-stone-600 dark:text-stone-300">{label}</label>
      </div>
    );
  }

  if (def.type === 'int' || def.type === 'float') {
    return (
      <div>
        <label className="block text-sm text-stone-500 dark:text-stone-400 mb-1">{label}</label>
        <input
          type="number"
          step={def.type === 'float' ? 'any' : '1'}
          value={value != null ? String(value) : ''}
          onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}
          className="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-lg text-sm bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200"
        />
      </div>
    );
  }

  if (def.type === 'unit') {
    const unitVal = typeof value === 'object' && value != null ? value as { value: number; unit: string } : { value: 0, unit: def.default_unit || '' };
    return (
      <div>
        <label className="block text-sm text-stone-500 dark:text-stone-400 mb-1">{label}</label>
        <div className="flex gap-2">
          <input
            type="number"
            step="any"
            value={unitVal.value || ''}
            onChange={e => onChange({ ...unitVal, value: e.target.value ? Number(e.target.value) : 0 })}
            className="flex-1 px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-lg text-sm bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200"
          />
          <input
            value={unitVal.unit}
            onChange={e => onChange({ ...unitVal, unit: e.target.value })}
            className="w-20 px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-lg text-sm bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200"
            placeholder="unit"
          />
        </div>
      </div>
    );
  }

  if (def.type === 'datetime') {
    return (
      <div>
        <label className="block text-sm text-stone-500 dark:text-stone-400 mb-1">{label}</label>
        <input
          type="datetime-local"
          value={value ? String(value) : ''}
          onChange={e => onChange(e.target.value)}
          className="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-lg text-sm bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200"
        />
      </div>
    );
  }

  if (def.type === 'textarea') {
    return (
      <div className="sm:col-span-2">
        <label className="block text-sm text-stone-500 dark:text-stone-400 mb-1">{label}</label>
        <textarea
          value={value != null ? String(value) : ''}
          onChange={e => onChange(e.target.value)}
          rows={6}
          className="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-lg text-sm bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200 font-mono"
        />
      </div>
    );
  }

  // Default: string
  return (
    <div>
      <label className="block text-sm text-stone-500 dark:text-stone-400 mb-1">
        {label}
        {def.required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <input
        value={value != null ? String(value) : ''}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-lg text-sm bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200"
        required={def.required}
      />
    </div>
  );
}

function LinkFieldInput({ name, def, value, onChange }: {
  name: string;
  def: FieldDef;
  value: unknown;
  onChange: (val: unknown) => void;
}) {
  const label = name.charAt(0).toUpperCase() + name.slice(1);
  const [items, setItems] = useState<Item[]>([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const linked = value as { id: number; name: string } | null;

  useEffect(() => {
    if (!def.link_group_id) return;
    api.items.list(def.link_group_id, { schema_id: def.link_schema_id, limit: 200 }).then(setItems);
  }, [def.link_group_id, def.link_schema_id]);

  const filtered = items.filter(it =>
    it.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <label className="block text-sm text-stone-500 dark:text-stone-400 mb-1">{label}</label>
      {linked ? (
        <div className="flex items-center gap-2">
          <span className="text-sm text-stone-700 dark:text-stone-200">{linked.name}</span>
          <button type="button" onClick={() => onChange(null)} className="text-xs text-stone-400 hover:text-red-400">&times;</button>
        </div>
      ) : (
        <div className="relative">
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder={def.link_group_id ? 'Search items...' : 'Configure link target in schema first'}
            disabled={!def.link_group_id}
            className="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-lg text-sm bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200"
          />
          {open && filtered.length > 0 && (
            <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {filtered.map(it => (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => { onChange({ id: it.id, name: it.name }); setSearch(''); setOpen(false); }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-stone-100 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200"
                >
                  {it.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
