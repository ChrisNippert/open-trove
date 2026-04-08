import { useEffect, useState } from 'react';
import { api } from '../api';
import ImageSourceModal, { type ImageSourceOption } from './ImageSourceModal';
import type { Item, ItemSchema, FieldDef } from '../types';

interface PendingImageFile {
  id: string;
  file: File;
  previewUrl: string;
}

type NamedImageSelection = {
  kind: 'file' | 'queued';
  previewUrl: string;
  file?: File;
  queuedId?: string;
};

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
  const [imageFiles, setImageFiles] = useState<PendingImageFile[]>([]);
  const [namedImageSelections, setNamedImageSelections] = useState<Record<string, NamedImageSelection>>({});
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [showImagesModal, setShowImagesModal] = useState(false);

  const schema = schemas.find(s => s.id === schemaId);
  const sections = schema?.definition?.sections || {};

  function buildDefaults(s: ItemSchema | undefined): Record<string, unknown> {
    const defaults: Record<string, unknown> = {};
    if (!s?.definition?.sections) return defaults;
    for (const fields of Object.values(s.definition.sections)) {
      for (const [fieldName, fieldDef] of Object.entries(fields)) {
        const fd = fieldDef as FieldDef;
        if (fd.type === 'boolean') defaults[fieldName] = false;
        // Initialize multi-value fields as empty arrays
        if ((fd.max_count === 0 || (fd.max_count != null && fd.max_count > 1))
            && !['multiselect', 'boolean', 'textarea', 'computed', 'image'].includes(fd.type)) {
          defaults[fieldName] = [];
        }
      }
    }
    return defaults;
  }

  useEffect(() => {
    setFormData(buildDefaults(schema));
  }, [schemaId]);

  function setField(name: string, value: unknown) {
    setFormData(prev => ({ ...prev, [name]: value }));
  }

  function createPendingImage(file: File): PendingImageFile {
    const imageId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    return {
      id: imageId,
      file,
      previewUrl: URL.createObjectURL(file),
    };
  }

  function addPendingImages(files: File[]) {
    setImageFiles(prev => [...prev, ...files.map(createPendingImage)]);
  }

  function removePendingImage(imageId: string) {
    setImageFiles(prev => prev.filter(image => image.id !== imageId));
    setNamedImageSelections(prev => {
      const next: Record<string, NamedImageSelection> = {};
      for (const [fieldName, selection] of Object.entries(prev)) {
        if (selection.kind === 'queued' && selection.queuedId === imageId) continue;
        next[fieldName] = selection;
      }
      return next;
    });
  }

  function setNamedImageSelection(fieldName: string, selection: NamedImageSelection | null) {
    setNamedImageSelections(prev => {
      const next = { ...prev };
      if (selection) next[fieldName] = selection;
      else delete next[fieldName];
      return next;
    });
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

      const uploadedQueuedImages = new Map<string, number>();
      for (const image of imageFiles) {
        const uploaded = await api.images.upload(item.id, image.file);
        uploadedQueuedImages.set(image.id, uploaded.id);
      }

      const namedImageData: Record<string, number> = {};
      for (const [fieldName, selection] of Object.entries(namedImageSelections)) {
        if (selection.kind === 'queued' && selection.queuedId) {
          const uploadedId = uploadedQueuedImages.get(selection.queuedId);
          if (uploadedId) namedImageData[fieldName] = uploadedId;
          continue;
        }

        if (selection.file) {
          const img = await api.images.upload(item.id, selection.file);
          namedImageData[fieldName] = img.id;
        }
      }

      if (Object.keys(namedImageData).length > 0) {
        await api.items.update(groupId, item.id, {
          data: { ...formData, ...namedImageData },
        });
      }

      onCreated();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create item');
    } finally {
      setSaving(false);
    }
  }

  const queuedImageOptions: ImageSourceOption[] = imageFiles.map((image, index) => ({
    id: image.id,
    label: image.file.name || `Image ${index + 1}`,
    previewUrl: image.previewUrl,
  }));

  return (
    <div className="fixed inset-0 bg-black/30 dark:bg-black/50 z-50 flex items-start justify-center pt-16 px-4 overflow-y-auto animate-fade-in">
      <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700 w-full max-w-2xl shadow-xl mb-16 animate-scale-in">
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
                  const newSid = Number(e.target.value);
                  setSchemaId(newSid);
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
              <button
                type="button"
                onClick={() => setCollapsedSections(prev => ({ ...prev, [sectionName]: !prev[sectionName] }))}
                className="w-full flex items-center justify-between text-sm font-medium text-stone-500 dark:text-stone-400 uppercase tracking-wide mb-3 border-b border-stone-100 dark:border-stone-800 pb-1 hover:text-stone-700 dark:hover:text-stone-300"
              >
                {sectionName}
                <span className="text-xs">{collapsedSections[sectionName] ? '▸' : '▾'}</span>
              </button>
              {!collapsedSections[sectionName] && (
                <div className="grid gap-3 sm:grid-cols-2">
                {Object.entries(fields).map(([fieldName, fieldDef]) => {
                  const fd = fieldDef as FieldDef;
                  const isMulti = (fd.max_count === 0 || (fd.max_count != null && fd.max_count > 1))
                    && !['multiselect', 'boolean', 'textarea', 'computed', 'image'].includes(fd.type);

                  if (isMulti) {
                    const values = Array.isArray(formData[fieldName]) ? formData[fieldName] as unknown[] : [];
                    const atMax = fd.max_count! > 0 && values.length >= fd.max_count!;
                    const label = fieldName.charAt(0).toUpperCase() + fieldName.slice(1);
                    return (
                      <div key={fieldName} className="sm:col-span-2">
                        <label className="block text-sm text-stone-500 dark:text-stone-400 mb-1">{label}</label>
                        <div className="space-y-2">
                          {values.map((v, i) => (
                            <div key={i} className="flex gap-2 items-start">
                              <div className="flex-1">
                                <FieldInput
                                  name=""
                                  def={{...fd, max_count: undefined}}
                                  value={v}
                                  onChange={newV => {
                                    const updated = [...values];
                                    updated[i] = newV;
                                    setField(fieldName, updated);
                                  }}
                                  namedImageSelection={null}
                                  availableImageOptions={queuedImageOptions}
                                  onImageSelection={() => {}}
                                />
                              </div>
                              <button type="button" onClick={() => setField(fieldName, values.filter((_, j) => j !== i))}
                                className="text-stone-400 hover:text-red-400 text-sm px-1 mt-2">&times;</button>
                            </div>
                          ))}
                          {!atMax && (
                            <button type="button" onClick={() => setField(fieldName, [...values, getDefaultForType(fd)])}
                              className="text-xs text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300">
                              + Add entry
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <FieldInput
                      key={fieldName}
                      name={fieldName}
                      def={fd}
                      value={formData[fieldName]}
                      onChange={val => setField(fieldName, val)}
                      namedImageSelection={namedImageSelections[fieldName] || null}
                      availableImageOptions={queuedImageOptions}
                      onImageSelection={selection => setNamedImageSelection(fieldName, selection)}
                    />
                  );
                })}
              </div>
              )}
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
              {imageFiles.map(image => (
                <div key={image.id} className="relative w-20 h-20 rounded-lg overflow-hidden bg-stone-100 dark:bg-stone-800">
                  <img src={image.previewUrl} className="w-full h-full object-cover" alt="" />
                  <button
                    type="button"
                    onClick={() => removePendingImage(image.id)}
                    className="absolute top-0.5 right-0.5 bg-black/50 text-white rounded-full w-4 h-4 text-xs flex items-center justify-center"
                  >
                    &times;
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setShowImagesModal(true)}
                className="w-20 h-20 rounded-lg border-2 border-dashed border-stone-300 dark:border-stone-600 flex items-center justify-center text-stone-400 dark:text-stone-500 hover:border-stone-400 dark:hover:border-stone-500 hover:text-stone-500 dark:hover:text-stone-400"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
          </div>

          <ImageSourceModal
            open={showImagesModal}
            title="Add item images"
            allowMultipleUpload
            onClose={() => setShowImagesModal(false)}
            onSelectFiles={async files => {
              addPendingImages(files);
            }}
          />

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

function FieldInput({ name, def, value, onChange, namedImageSelection, availableImageOptions, onImageSelection }: {
  name: string;
  def: FieldDef;
  value: unknown;
  onChange: (val: unknown) => void;
  namedImageSelection: NamedImageSelection | null;
  availableImageOptions: ImageSourceOption[];
  onImageSelection: (selection: NamedImageSelection | null) => void;
}) {
  const label = name.charAt(0).toUpperCase() + name.slice(1);
  const [showPicker, setShowPicker] = useState(false);

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
        {namedImageSelection ? (
          <div className="relative w-32 h-32 rounded-lg overflow-hidden bg-stone-100 dark:bg-stone-800">
            <img src={namedImageSelection.previewUrl} className="w-full h-full object-cover" alt={label} />
            <button
              type="button"
              onClick={() => onImageSelection(null)}
              className="absolute top-1 right-1 bg-black/50 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center hover:bg-red-600"
            >
              &times;
            </button>
            <button
              type="button"
              onClick={() => setShowPicker(true)}
              className="absolute bottom-1 right-1 bg-black/50 px-2 py-1 text-[11px] text-white rounded-md hover:bg-black/70"
            >
              Change
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowPicker(true)}
            className="w-32 h-32 rounded-lg border-2 border-dashed border-stone-300 dark:border-stone-600 flex flex-col items-center justify-center text-stone-400 dark:text-stone-500 hover:border-stone-400 dark:hover:border-stone-500 hover:text-stone-500 dark:hover:text-stone-400"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span className="text-xs">Add image</span>
          </button>
        )}
        <ImageSourceModal
          open={showPicker}
          title={`Add ${label} image`}
          onClose={() => setShowPicker(false)}
          onSelectFiles={async files => {
            const file = files[0];
            if (!file) return;
            onImageSelection({ kind: 'file', file, previewUrl: URL.createObjectURL(file) });
          }}
          existingImages={availableImageOptions}
          selectedExistingImageId={namedImageSelection?.kind === 'queued' ? namedImageSelection.queuedId || null : null}
          onSelectExisting={async imageId => {
            const selectedImage = availableImageOptions.find(option => option.id === imageId);
            if (!selectedImage) return;
            onImageSelection({ kind: 'queued', queuedId: imageId, previewUrl: selectedImage.previewUrl });
          }}
        />
      </div>
    );
  }

  if (def.type === 'link') {
    return <LinkFieldInput name={name} def={def} value={value} onChange={onChange} />;
  }

  if (def.type === 'hierarchy') {
    const hierarchy = def.hierarchy_options || {};
    const parents = Object.keys(hierarchy);
    const strVal = typeof value === 'string' ? value : '';
    const parts = strVal.split(' > ');
    const selectedParent = parts[0] || '';
    const selectedChild = parts.length > 1 ? parts.slice(1).join(' > ') : '';
    const children = selectedParent && hierarchy[selectedParent] ? hierarchy[selectedParent] : [];

    return (
      <div className="sm:col-span-2">
        {label && <label className="block text-sm text-stone-500 dark:text-stone-400 mb-1">{label}</label>}
        <div className="flex gap-2">
          <select value={selectedParent} onChange={e => onChange(e.target.value || '')} className="flex-1 px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-lg text-sm bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200">
            <option value="">Select category...</option>
            {parents.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          {children.length > 0 && (
            <select value={selectedChild} onChange={e => onChange(e.target.value ? `${selectedParent} > ${e.target.value}` : selectedParent)} className="flex-1 px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-lg text-sm bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200">
              <option value="">Any...</option>
              {children.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
        </div>
      </div>
    );
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

  if (def.type === 'date') {
    return (
      <div>
        <label className="block text-sm text-stone-500 dark:text-stone-400 mb-1">{label}</label>
        <input
          type="date"
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
  const isUrl = def.type === 'url';
  return (
    <div>
      <label className="block text-sm text-stone-500 dark:text-stone-400 mb-1">
        {label}
        {def.required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <input
        type={isUrl ? 'url' : 'text'}
        value={value != null ? String(value) : ''}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-lg text-sm bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200"
        placeholder={isUrl ? 'https://...' : undefined}
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
            onBlur={() => setTimeout(() => setOpen(false), 200)}
            onKeyDown={e => { if (e.key === 'Escape') { setOpen(false); e.currentTarget.blur(); } }}
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

function getDefaultForType(fd: FieldDef): unknown {
  switch (fd.type) {
    case 'int': case 'float': return null;
    case 'unit': return { value: 0, unit: fd.default_unit || '' };
    case 'link': return null;
    default: return '';
  }
}
