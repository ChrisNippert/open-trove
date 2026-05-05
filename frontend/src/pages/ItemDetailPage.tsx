import React, { useEffect, useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import ImageSourceModal, { type ImageSourceOption } from '../components/ImageSourceModal';
import type { Item, ItemSchema, FieldDef } from '../types';

export default function ItemDetailPage() {
  const { groupId, itemId } = useParams<{ groupId: string; itemId: string }>();
  const gid = Number(groupId);
  const itemUuid = itemId!;
  const navigate = useNavigate();

  const [item, setItem] = useState<Item | null>(null);
  const [schema, setSchema] = useState<ItemSchema | null>(null);
  const [groupName, setGroupName] = useState('Group');
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [formName, setFormName] = useState('');
  const [formTags, setFormTags] = useState('');
  const [saving, setSaving] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<{ itemUuid: string; imageId: number } | null>(null);
  const [showImageSourceModal, setShowImageSourceModal] = useState(false);
  const [imageVersion, setImageVersion] = useState(0);
  const [notFound, setNotFound] = useState(false);
  const pendingNamedUploadIdsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    loadItem();
  }, [gid, itemUuid]);

  useEffect(() => {
    api.groups.get(gid).then(group => setGroupName(group.name)).catch(() => undefined);
  }, [gid]);

  useEffect(() => {
    if (!editing) return;

    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (!saving) {
          void handleSave();
        }
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editing, saving, formData, formName, formTags]);

  async function loadItem() {
    try {
      const it = await api.items.get(gid, itemUuid);
      setItem(it);
      setFormData(it.data);
      setFormName(it.name || '');
      setFormTags(it.tags.join(', '));
      const s = await api.schemas.get(gid, it.schema_id);
      setSchema(s);
    } catch {
      setNotFound(true);
    }
  }

  // Reload only images without resetting form state
  async function reloadImages() {
    try {
      const it = await api.items.get(gid, itemUuid);
      setItem(prev => prev ? { ...prev, images: it.images } : it);
      setImageVersion(prev => prev + 1);
    } catch { /* ignore */ }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const tags = formTags.split(',').map(t => t.trim()).filter(Boolean);
      await api.items.update(gid, itemUuid, { name: formName.trim(), data: formData, tags });
      pendingNamedUploadIdsRef.current.clear();
      await loadItem();
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveField(fieldName: string, value: unknown) {
    if (!item) return;
    const updatedData = { ...item.data, [fieldName]: value };
    // Optimistic update for immediate UI feedback
    setItem(prev => prev ? { ...prev, data: updatedData } : prev);
    try {
      await api.items.update(gid, itemUuid, { data: updatedData });
      await loadItem();
    } catch { /* ignore */ }
  }

  async function discardPendingNamedUploads() {
    const pendingIds = Array.from(pendingNamedUploadIdsRef.current);
    pendingNamedUploadIdsRef.current.clear();
    if (pendingIds.length === 0) return;
    await Promise.all(pendingIds.map(imageId => api.images.delete(itemUuid, imageId).catch(() => undefined)));
    await reloadImages();
  }

  async function handleCancelEdit() {
    if (!item) return;
    await discardPendingNamedUploads();
    setFormData(item.data);
    setFormName(item.name || '');
    setFormTags(item.tags.join(', '));
    setEditing(false);
  }

  async function handleDelete() {
    if (!confirm('Delete this item?')) return;
    await api.items.delete(gid, itemUuid);
    navigate(`/groups/${gid}`);
  }

  async function handleImageUpload(files: File[]) {
    for (const file of files) {
      await api.images.upload(itemUuid, file);
    }
    await reloadImages();
  }

  async function handleImageUrlUpload(url: string) {
    await api.images.uploadFromUrl(itemUuid, url);
    await reloadImages();
  }

  async function handleImageDelete(imageId: number) {
    await api.images.delete(itemUuid, imageId);
    pendingNamedUploadIdsRef.current.delete(imageId);
    await reloadImages();
  }

  async function handleSetPrimary(imageId: number) {
    await api.images.setPrimary(itemUuid, imageId);
    await reloadImages();
  }

  async function replacePendingNamedImage(previousImageId: number | null, nextImageId: number | null) {
    if (!previousImageId || previousImageId === nextImageId) return false;
    if (!pendingNamedUploadIdsRef.current.has(previousImageId)) return false;
    pendingNamedUploadIdsRef.current.delete(previousImageId);
    await api.images.delete(itemUuid, previousImageId).catch(() => undefined);
    return true;
  }

  async function handleNamedImageAssign(fieldName: string, imageId: number, uploaded = false) {
    const previousImageId = typeof formData[fieldName] === 'number' ? Number(formData[fieldName]) : null;
    if (uploaded) {
      pendingNamedUploadIdsRef.current.add(imageId);
    }
    const deletedPendingImage = await replacePendingNamedImage(previousImageId, imageId);
    setFormData(prev => ({ ...prev, [fieldName]: imageId }));
    if (uploaded || deletedPendingImage) {
      await reloadImages();
    }
  }

  async function handleNamedImageRemove(fieldName: string) {
    const currentImageId = typeof formData[fieldName] === 'number' ? Number(formData[fieldName]) : null;
    const deletedPendingImage = await replacePendingNamedImage(currentImageId, null);
    setFormData(prev => ({ ...prev, [fieldName]: null }));
    if (deletedPendingImage) {
      await reloadImages();
    }
  }

  if (notFound) {
    return (
      <div className="text-center py-16">
        <div className="text-6xl mb-4">🔍</div>
        <h1 className="text-2xl font-semibold text-stone-800 dark:text-stone-100 mb-2">Item Not Found</h1>
        <p className="text-stone-400 dark:text-stone-500 mb-6">This item doesn't exist or has been deleted.</p>
        <Link to="/groups" className="px-4 py-2 bg-stone-800 dark:bg-stone-200 text-white dark:text-stone-900 rounded-lg text-sm font-medium hover:bg-stone-700 dark:hover:bg-stone-300">
          Back to Collections
        </Link>
      </div>
    );
  }

  if (!item || !schema) {
    return (
      <div />
    );
  }

  const sections = schema.definition?.sections || {};
  const name = item.name || `Item #${item.id}`;
  const itemImageOptions: ImageSourceOption[] = item.images.map((image, index) => ({
    id: String(image.id),
    label: image.original_filename || `Image ${index + 1}`,
    previewUrl: `${api.images.thumbUrl(itemUuid, image.id)}?v=${imageVersion}`,
  }));

  return (
    <div className="animate-content-in">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-stone-400 dark:text-stone-500 mb-4">
        <Link to="/groups" className="hover:text-stone-600 dark:hover:text-stone-300">Collections</Link>
        <span>/</span>
        <Link to={`/groups/${gid}`} className="hover:text-stone-600 dark:hover:text-stone-300">{groupName}</Link>
        <span>/</span>
        <span className="text-stone-600 dark:text-stone-300">{name}</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => navigate(-1)}
          className="p-1.5 mr-2 rounded-md text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors self-center"
          title="Go back"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        {editing ? (
          <input
            value={formName}
            onChange={e => setFormName(e.target.value)}
            className="text-2xl font-semibold text-stone-800 dark:text-stone-100 bg-transparent border-b border-stone-300 dark:border-stone-600 focus:border-stone-500 dark:focus:border-stone-400 focus:outline-none flex-1 mr-4"
            placeholder="Item name"
          />
        ) : (
          <h1 className="text-2xl font-semibold text-stone-800 dark:text-stone-100">{name}</h1>
        )}
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
              <button onClick={() => { void handleCancelEdit(); }} className="px-4 py-2 text-stone-500 dark:text-stone-400 text-sm">
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
                <div key={img.id} className={`relative aspect-square rounded-lg overflow-hidden bg-stone-100 dark:bg-stone-800 group cursor-pointer ${idx === 0 ? 'ring-2 ring-stone-400 dark:ring-stone-500' : ''}`}
                  onClick={() => setLightboxImage({ itemUuid, imageId: img.id })}
                >
                  <img
                    src={`${api.images.thumbUrl(itemUuid, img.id)}?v=${imageVersion}`}
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
                onClick={() => setShowImageSourceModal(true)}
                className="aspect-square rounded-lg border-2 border-dashed border-stone-300 dark:border-stone-600 flex items-center justify-center text-stone-400 dark:text-stone-500 hover:border-stone-400 dark:hover:border-stone-500"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
          </div>

          <ImageSourceModal
            open={showImageSourceModal}
            title="Add item images"
            allowMultipleUpload
            onClose={() => setShowImageSourceModal(false)}
            onSelectFiles={handleImageUpload}
            onSelectUrl={handleImageUrlUpload}
          />

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
                  if (fd.type === 'image') {
                    const imageId = (editing ? formData[fieldName] : item.data[fieldName]) as number | undefined;
                    return (
                      <div key={fieldName} className="sm:col-span-2">
                        <label className="block text-xs text-stone-400 dark:text-stone-500 mb-1">{fieldName}</label>
                        <NamedImageField
                          itemUuid={itemUuid}
                          imageId={imageId || null}
                          editing={editing}
                          itemImages={itemImageOptions}
                          imageVersion={imageVersion}
                          onSelected={async (imgId) => {
                            await handleNamedImageAssign(fieldName, imgId, false);
                          }}
                          onUploaded={async (imgId) => {
                            await handleNamedImageAssign(fieldName, imgId, true);
                          }}
                          onUploadedFromUrl={async (url) => {
                            const uploaded = await api.images.uploadFromUrl(itemUuid, url);
                            await handleNamedImageAssign(fieldName, uploaded.id, true);
                          }}
                          onRemoved={async () => {
                            await handleNamedImageRemove(fieldName);
                          }}
                        />
                      </div>
                    );
                  }
                  const val = editing ? formData[fieldName] : item.data[fieldName];
                  const isMulti = (fd.max_count === 0 || (fd.max_count != null && fd.max_count > 1))
                    && !['multiselect', 'checklist', 'kvp', 'computed', 'image'].includes(fd.type);
                  const isWide = fd.type === 'textarea' || fd.type === 'hierarchy' || isMulti;

                  if (isMulti) {
                    const values = Array.isArray(val) ? val as unknown[] : (val != null ? [val] : []);
                    const atMax = fd.max_count! > 0 && values.length >= fd.max_count!;
                    return (
                      <div key={fieldName} className="sm:col-span-2">
                        <label className="block text-xs text-stone-400 dark:text-stone-500 mb-1">{fieldName}</label>
                        {editing && fd.type !== 'computed' ? (
                          <div className="space-y-2">
                            {values.map((v, i) => (
                              <div key={i} className="flex gap-2 items-start">
                                <div className="flex-1">
                                  <EditableField def={{...fd, max_count: undefined}} value={v} onChange={newV => {
                                    const updated = [...values];
                                    updated[i] = newV;
                                    setFormData(prev => ({ ...prev, [fieldName]: updated }));
                                  }} />
                                </div>
                                <button type="button" onClick={() => {
                                  setFormData(prev => ({ ...prev, [fieldName]: values.filter((_, j) => j !== i) }));
                                }} className="text-stone-400 hover:text-red-400 text-sm px-1 mt-1">&times;</button>
                              </div>
                            ))}
                            {!atMax && (
                              <button type="button" onClick={() => {
                                setFormData(prev => ({ ...prev, [fieldName]: [...values, getDefaultForType(fd)] }));
                              }} className="text-xs text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300">
                                + Add entry
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-1">
                            {values.length === 0 && <span className="text-sm text-stone-400 dark:text-stone-500">&mdash;</span>}
                            {values.map((v, i) => (
                              fd.type === 'link' && v && typeof v === 'object' && ('uuid' in (v as Record<string, unknown>) || 'id' in (v as Record<string, unknown>)) ? (
                                <div key={i}><LinkedItemValue value={v as { uuid?: string; id?: number; name: string }} groupId={fd.link_group_id || gid} /></div>
                              ) : fd.type === 'url' && v ? (
                                <div key={i}><a href={String(v)} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 dark:text-blue-400 underline hover:text-blue-800 dark:hover:text-blue-300 break-all">{String(v)}</a></div>
                              ) : fd.type === 'rating' && v != null ? (
                                <div key={i} className="flex items-center gap-1">
                                  {(fd as FieldDef).rating_style === 'number' ? (
                                    <span className="text-sm text-stone-800 dark:text-stone-200">{String(v)} / {(fd as FieldDef).rating_max ?? 5}</span>
                                  ) : (
                                    <>
                                      {Array.from({ length: Math.floor((fd as FieldDef).rating_max ?? 5) }, (_, si) => (
                                        <span key={si} className={`text-lg ${si < Math.floor(Number(v)) ? 'text-yellow-400' : si < Number(v) ? 'text-yellow-400 opacity-50' : 'text-stone-300 dark:text-stone-600'}`}>★</span>
                                      ))}
                                      <span className="text-xs text-stone-400 dark:text-stone-500 ml-1">{String(v)}</span>
                                    </>
                                  )}
                                </div>
                              ) : (
                                <div key={i} className="text-sm text-stone-800 dark:text-stone-200 break-words">{formatDisplay(v, fd.type)}</div>
                              )
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div key={fieldName} className={isWide ? 'sm:col-span-2' : ''}>
                      <label className="block text-xs text-stone-400 dark:text-stone-500 mb-1">{fieldName}</label>
                      {editing && fd.type !== 'computed' ? (
                        <EditableField
                          def={fd}
                          value={formData[fieldName]}
                          onChange={v => setFormData(prev => ({ ...prev, [fieldName]: v }))}
                        />
                      ) : fd.type === 'link' && val && typeof val === 'object' && ('uuid' in (val as Record<string, unknown>) || 'id' in (val as Record<string, unknown>)) ? (
                        <LinkedItemValue
                          value={val as { uuid?: string; id?: number; name: string }}
                          groupId={(fd as FieldDef).link_group_id || gid}
                        />
                      ) : fd.type === 'url' && val ? (
                        <a
                          href={String(val)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-600 dark:text-blue-400 underline hover:text-blue-800 dark:hover:text-blue-300 break-all"
                        >
                          {String(val)}
                        </a>
                      ) : fd.type === 'checklist' && Array.isArray(val) ? (
                        <div className="space-y-1">
                          {(val as { text: string; checked: boolean }[]).map((ci, i) => (
                            <label key={i} className="flex items-center gap-2 text-sm text-stone-800 dark:text-stone-200 cursor-pointer">
                              <input type="checkbox" checked={ci.checked} onChange={() => {
                                const updated = [...(val as { text: string; checked: boolean }[])];
                                updated[i] = { ...ci, checked: !ci.checked };
                                handleSaveField(fieldName, updated);
                              }} className="accent-stone-600" />
                              <span className={ci.checked ? 'line-through text-stone-400 dark:text-stone-500' : ''}>{ci.text}</span>
                            </label>
                          ))}
                          {(val as unknown[]).length === 0 && <span className="text-sm text-stone-400">&mdash;</span>}
                        </div>
                      ) : fd.type === 'rating' && val != null ? (
                        <div className="flex items-center gap-1">
                          {(fd as FieldDef).rating_style === 'number' ? (
                            <span className="text-sm text-stone-800 dark:text-stone-200">{String(val)} / {(fd as FieldDef).rating_max ?? 5}</span>
                          ) : (
                            <>
                              {Array.from({ length: Math.floor((fd as FieldDef).rating_max ?? 5) }, (_, i) => (
                                <span key={i} className={`text-lg ${i < Math.floor(Number(val)) ? 'text-yellow-400' : i < Number(val) ? 'text-yellow-400 opacity-50' : 'text-stone-300 dark:text-stone-600'}`}>★</span>
                              ))}
                              <span className="text-xs text-stone-400 dark:text-stone-500 ml-1">{String(val)}</span>
                            </>
                          )}
                        </div>
                      ) : fd.type === 'kvp' && Array.isArray(val) ? (
                        <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
                          {(val as { key: string; value: string }[]).map((pair, i) => (
                            <React.Fragment key={i}>
                              <span className="text-sm font-medium text-stone-600 dark:text-stone-300 text-right">{pair.key}:</span>
                              <span className="text-sm text-stone-800 dark:text-stone-200">{pair.value}</span>
                            </React.Fragment>
                          ))}
                          {(val as unknown[]).length === 0 && <span className="text-sm text-stone-400 col-span-2">&mdash;</span>}
                        </div>
                      ) : fd.type === 'range' && val && typeof val === 'object' ? (
                        <span className="text-sm text-stone-800 dark:text-stone-200">{(val as { min: number }).min} – {(val as { max: number }).max}</span>
                      ) : (
                        <div className={`text-sm text-stone-800 dark:text-stone-200 break-words ${fd.type === 'textarea' ? 'whitespace-pre-wrap' : ''}`}>
                          {formatDisplay(val, fd.type)}
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

      {/* JSON view */}
      <details className="mt-4">
        <summary className="text-sm text-stone-400 dark:text-stone-500 cursor-pointer hover:text-stone-600 dark:hover:text-stone-300">Show raw JSON</summary>
        <pre className="mt-2 p-4 bg-stone-100 dark:bg-stone-800 rounded-lg text-xs overflow-x-auto text-stone-600 dark:text-stone-300">
          {JSON.stringify({ id: item.id, uuid: item.uuid, name: item.name, schema_id: item.schema_id, data: item.data, tags: item.tags }, null, 2)}
        </pre>
      </details>

      {/* Lightbox */}
      {lightboxImage && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-8 cursor-pointer"
          onClick={() => setLightboxImage(null)}
        >
          <button
            onClick={() => setLightboxImage(null)}
            className="absolute top-4 right-4 text-white/70 hover:text-white text-3xl z-10"
          >
            &times;
          </button>
          <img
            src={`${api.images.url(lightboxImage.itemUuid, lightboxImage.imageId)}?v=${imageVersion}`}
            alt=""
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

function LinkedItemValue({ value, groupId }: {
  value: { uuid?: string; id?: number; name: string };
  groupId: number;
}) {
  const [resolved, setResolved] = useState<{ uuid: string; groupId: number } | null>(null);
  const [exists, setExists] = useState<boolean | null>(null);
  const [thumb, setThumb] = useState<{ itemUuid: string; imageId: number } | null>(null);

  useEffect(() => {
    let mounted = true;

    async function resolve() {
      try {
        let item: Item | null = null;
        if (value.uuid) {
          item = await api.items.get(groupId, value.uuid);
        }
        if (!mounted || !item) { if (mounted) setExists(false); return; }
        setExists(true);
        setResolved({ uuid: item.uuid, groupId: item.group_id });
        if (item.images?.length) {
          setThumb({ itemUuid: item.uuid, imageId: item.images[0].id });
        }
      } catch {
        if (mounted) setExists(false);
      }
    }

    resolve();
    return () => { mounted = false; };
  }, [groupId, value.uuid]);

  if (exists === false) {
    return <span className="text-sm text-red-500">{value.name || `Missing item`}</span>;
  }

  const targetGroup = resolved?.groupId ?? groupId;
  const targetUuid = resolved?.uuid ?? value.uuid;

  return (
    <Link
      to={`/groups/${targetGroup}/items/${targetUuid}`}
      className="inline-flex items-center gap-2 text-sm text-stone-600 dark:text-stone-300 underline hover:text-stone-900 dark:hover:text-white"
    >
      {thumb && (
        <img
          src={api.images.thumbUrl(thumb.itemUuid, thumb.imageId)}
          alt=""
          className="h-10 w-10 rounded object-cover"
        />
      )}
      <span>{value.name}</span>
    </Link>
  );
}

function NamedImageField({ itemUuid, imageId, editing, itemImages, imageVersion, onSelected, onUploaded, onUploadedFromUrl, onRemoved }: {
  itemUuid: string;
  imageId: number | null;
  editing: boolean;
  itemImages: ImageSourceOption[];
  imageVersion: number;
  onSelected: (imageId: number) => Promise<void> | void;
  onUploaded: (imageId: number) => Promise<void> | void;
  onUploadedFromUrl: (url: string) => Promise<void> | void;
  onRemoved: () => Promise<void> | void;
}) {
  const [showPicker, setShowPicker] = useState(false);

  async function handleUpload(file: File) {
    const img = await api.images.upload(itemUuid, file);
    onUploaded(img.id);
  }

  if (imageId) {
    return (
      <>
        <div className="relative w-40 h-40 rounded-lg overflow-hidden bg-stone-100 dark:bg-stone-800 group">
          <img src={`${api.images.url(itemUuid, imageId)}?v=${imageVersion}`} className="w-full h-full object-cover" alt="" />
          {editing && (
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="absolute top-1 right-1 flex gap-1">
                <button
                  onClick={() => setShowPicker(true)}
                  className="bg-black/50 text-white rounded-full w-6 h-6 text-xs flex items-center justify-center hover:bg-black/70"
                  title="Replace"
                >
                  ↻
                </button>
                <button
                  onClick={() => { void onRemoved(); }}
                  className="bg-black/50 text-white rounded-full w-6 h-6 text-xs flex items-center justify-center hover:bg-red-600"
                  title="Remove"
                >
                  &times;
                </button>
              </div>
            </div>
          )}
        </div>
        <ImageSourceModal
          open={showPicker}
          title="Choose named image"
          onClose={() => setShowPicker(false)}
          onSelectFiles={async files => {
            const file = files[0];
            if (!file) return;
            await handleUpload(file);
          }}
          onSelectUrl={onUploadedFromUrl}
          existingImages={itemImages}
          selectedExistingImageId={String(imageId)}
          onSelectExisting={async selectedImageId => {
            await onSelected(Number(selectedImageId));
          }}
        />
      </>
    );
  }

  if (!editing) {
    return <span className="text-sm text-stone-400 dark:text-stone-500">—</span>;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowPicker(true)}
        className="w-40 h-40 rounded-lg border-2 border-dashed border-stone-300 dark:border-stone-600 flex flex-col items-center justify-center text-stone-400 dark:text-stone-500 hover:border-stone-400 dark:hover:border-stone-500 hover:text-stone-500 dark:hover:text-stone-400"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        <span className="text-xs">Add image</span>
      </button>
      <ImageSourceModal
        open={showPicker}
        title="Choose named image"
        onClose={() => setShowPicker(false)}
        onSelectFiles={async files => {
          const file = files[0];
          if (!file) return;
          await handleUpload(file);
        }}
        onSelectUrl={onUploadedFromUrl}
        existingImages={itemImages}
        selectedExistingImageId={imageId ? String(imageId) : null}
        onSelectExisting={async selectedImageId => {
          await onSelected(Number(selectedImageId));
        }}
      />
    </>
  );
}

function EditableField({ def, value, onChange }: {
  def: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (def.type === 'dropdown') {
    const options = def.options || def['dropdown-items'] || [];
    if (def.allow_custom) {
      return (
        <div className="relative">
          <input
            list={`dd-${def.type}-${options.join(',')}`}
            value={String(value || '')}
            onChange={e => onChange(e.target.value)}
            placeholder="Select or type..."
            className="w-full px-2 py-1.5 border border-stone-300 dark:border-stone-600 rounded-lg text-sm bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200"
          />
          <datalist id={`dd-${def.type}-${options.join(',')}`}>
            {options.map(o => <option key={o} value={o} />)}
          </datalist>
        </div>
      );
    }
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
    const blocked = def.type === 'int' ? ['e','E','+','.'] : ['e','E','+'];
    return <input type="number" step={def.type === 'float' ? 'any' : '1'} value={value != null ? String(value) : ''} onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))} onKeyDown={e => { if (blocked.includes(e.key)) e.preventDefault(); }} onFocus={e => e.target.select()} className="w-full px-2 py-1.5 border border-stone-300 dark:border-stone-600 rounded-lg text-sm bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200" placeholder="0" />;
  }
  if (def.type === 'unit') {
    const uv = typeof value === 'object' && value != null ? value as { value: number; unit: string } : { value: 0, unit: def.default_unit || '' };
    return (
      <div className="flex gap-1">
        <input type="number" step="any" value={uv.value != null ? uv.value : ''} onChange={e => onChange({ ...uv, value: Number(e.target.value) })} onKeyDown={e => { if (['e','E','+'].includes(e.key)) e.preventDefault(); }} className="flex-1 px-2 py-1.5 border border-stone-300 dark:border-stone-600 rounded-lg text-sm bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200" />
        <input value={uv.unit} onChange={e => onChange({ ...uv, unit: e.target.value })} className="w-16 px-2 py-1.5 border border-stone-300 dark:border-stone-600 rounded-lg text-sm bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200" />
      </div>
    );
  }
  if (def.type === 'datetime') {
    return <input type="datetime-local" value={value ? String(value) : ''} onChange={e => onChange(e.target.value)} className="w-full px-2 py-1.5 border border-stone-300 dark:border-stone-600 rounded-lg text-sm bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200" />;
  }
  if (def.type === 'date') {
    return <input type="date" value={value ? String(value) : ''} onChange={e => onChange(e.target.value)} className="w-full px-2 py-1.5 border border-stone-300 dark:border-stone-600 rounded-lg text-sm bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200" />;
  }
  if (def.type === 'textarea') {
    return <textarea value={value != null ? String(value) : ''} onChange={e => onChange(e.target.value)} rows={6} className="w-full px-2 py-1.5 border border-stone-300 dark:border-stone-600 rounded-lg text-sm bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200 font-mono sm:col-span-2" />;
  }
  if (def.type === 'link') {
    return <LinkFieldEdit def={def} value={value} onChange={onChange} />;
  }
  if (def.type === 'hierarchy') {
    return <HierarchyFieldEdit def={def} value={value} onChange={onChange} />;
  }
  if (def.type === 'url') {
    return <input type="url" value={value != null ? String(value) : ''} onChange={e => onChange(e.target.value)} placeholder="https://..." className="w-full px-2 py-1.5 border border-stone-300 dark:border-stone-600 rounded-lg text-sm bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200" />;
  }
  if (def.type === 'checklist') {
    const items = Array.isArray(value) ? value as { text: string; checked: boolean }[] : [];
    return (
      <div className="space-y-1">
        {items.map((ci, i) => (
          <div key={i} className="flex items-center gap-2">
            <input type="checkbox" checked={ci.checked} onChange={e => { const updated = [...items]; updated[i] = { ...ci, checked: e.target.checked }; onChange(updated); }} className="accent-stone-600" />
            <input value={ci.text} onChange={e => { const updated = [...items]; updated[i] = { ...ci, text: e.target.value }; onChange(updated); }} className="flex-1 px-2 py-1 border border-stone-300 dark:border-stone-600 rounded text-sm bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200" />
            <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} className="text-stone-300 hover:text-red-400 text-sm">&times;</button>
          </div>
        ))}
        <button type="button" onClick={() => onChange([...items, { text: '', checked: false }])} className="text-xs text-stone-400 hover:text-stone-600 dark:hover:text-stone-300">+ Add item</button>
      </div>
    );
  }
  if (def.type === 'range') {
    const r = (typeof value === 'object' && value != null) ? value as { min: number; max: number } : { min: 0, max: 0 };
    return (
      <div className="flex items-center gap-2 max-w-xs">
        <input type="number" step="any" value={r.min} onChange={e => onChange({ ...r, min: Number(e.target.value) })} onFocus={e => e.target.select()} className="flex-1 min-w-0 w-24 px-2 py-1.5 border border-stone-300 dark:border-stone-600 rounded-lg text-sm bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200" placeholder="Min" />
        <span className="text-stone-400 shrink-0">–</span>
        <input type="number" step="any" value={r.max} onChange={e => onChange({ ...r, max: Number(e.target.value) })} onFocus={e => e.target.select()} className="flex-1 min-w-0 w-24 px-2 py-1.5 border border-stone-300 dark:border-stone-600 rounded-lg text-sm bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200" placeholder="Max" />
      </div>
    );
  }
  if (def.type === 'kvp') {
    const pairs = Array.isArray(value) ? value as { key: string; value: string }[] : [];
    return (
      <div className="space-y-1 max-w-lg">
        {pairs.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <input value={p.key} onChange={e => { const updated = [...pairs]; updated[i] = { ...p, key: e.target.value }; onChange(updated); }} placeholder="Key" className="w-1/3 min-w-0 px-2 py-1 border border-stone-300 dark:border-stone-600 rounded text-sm bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200" />
            <input value={p.value} onChange={e => { const updated = [...pairs]; updated[i] = { ...p, value: e.target.value }; onChange(updated); }} placeholder="Value" className="flex-1 min-w-0 px-2 py-1 border border-stone-300 dark:border-stone-600 rounded text-sm bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200" />
            <button type="button" onClick={() => onChange(pairs.filter((_, j) => j !== i))} className="text-stone-300 hover:text-red-400 text-sm">&times;</button>
          </div>
        ))}
        <button type="button" onClick={() => onChange([...pairs, { key: '', value: '' }])} className="text-xs text-stone-400 hover:text-stone-600 dark:hover:text-stone-300">+ Add pair</button>
      </div>
    );
  }
  if (def.type === 'rating') {
    const min = def.rating_min ?? 0;
    const max = def.rating_max ?? 5;
    const current = typeof value === 'number' ? value : min;
    if (def.rating_style === 'number') {
      return (
        <div className="flex items-center gap-2">
          <input type="number" min={min} max={max} step={0.5} value={value != null ? String(value) : ''} onChange={e => onChange(e.target.value === '' ? min : Number(e.target.value))} onFocus={e => e.target.select()} className="w-20 px-2 py-1.5 border border-stone-300 dark:border-stone-600 rounded-lg text-sm bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200" placeholder={String(min)} />
          <span className="text-xs text-stone-400">/ {max}</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1">
        <div className="flex items-center gap-0.5">
          {Array.from({ length: max }, (_, i) => {
            const starVal = i + 1;
            return (
              <button key={i} type="button" onClick={() => onChange(starVal <= current ? Math.max(starVal - 1, min) : starVal)}
                className={`text-xl leading-none ${starVal <= current ? 'text-yellow-400' : starVal - 0.5 <= current ? 'text-yellow-400 opacity-50' : 'text-stone-300 dark:text-stone-600'} hover:scale-110 transition-transform`}
              >★</button>
            );
          })}
        </div>
        <input type="number" min={min} max={max} step={0.5} value={value != null ? String(value) : ''} onChange={e => onChange(e.target.value === '' ? min : Number(e.target.value))} onFocus={e => e.target.select()} className="w-14 px-1 py-0.5 border border-stone-300 dark:border-stone-600 rounded text-xs text-center bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200" placeholder={String(min)} />
      </div>
    );
  }
  return <input value={value != null ? String(value) : ''} onChange={e => onChange(e.target.value)} className="w-full px-2 py-1.5 border border-stone-300 dark:border-stone-600 rounded-lg text-sm bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200" />;
}

function LinkFieldEdit({ def, value, onChange }: {
  def: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const linked = value as { uuid: string; name: string } | { id: number; name: string } | null;

  useEffect(() => {
    if (!def.link_group_id) return;
    api.items.list(def.link_group_id, { schema_id: def.link_schema_id, limit: 200 }).then(setItems);
  }, [def.link_group_id, def.link_schema_id]);

  const filtered = items.filter(it =>
    it.name.toLowerCase().includes(search.toLowerCase())
  );

  if (linked) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-stone-700 dark:text-stone-200">{linked.name}</span>
        <button type="button" onClick={() => onChange(null)} className="text-xs text-stone-400 hover:text-red-400">&times;</button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        value={search}
        onChange={e => { setSearch(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        onKeyDown={e => { if (e.key === 'Escape') { setOpen(false); e.currentTarget.blur(); } }}
        placeholder={def.link_group_id ? 'Search items...' : 'Configure link target in schema'}
        disabled={!def.link_group_id}
        className="w-full px-2 py-1.5 border border-stone-300 dark:border-stone-600 rounded-lg text-sm bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {filtered.map(it => (
            <button
              key={it.id}
              type="button"
              onClick={() => { onChange({ uuid: it.uuid, name: it.name }); setSearch(''); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-stone-100 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200 flex items-center gap-2"
            >
              {it.images?.[0] ? (
                <img src={api.images.thumbUrl(it.uuid, it.images[0].id)} alt="" className="h-8 w-8 rounded object-cover shrink-0" />
              ) : (
                <div className="h-8 w-8 rounded bg-stone-100 dark:bg-stone-700 shrink-0" />
              )}
              <span>{it.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function HierarchyFieldEdit({ def, value, onChange }: {
  def: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const hierarchy = def.hierarchy_options || {};
  const parents = Object.keys(hierarchy);
  const strVal = typeof value === 'string' ? value : '';
  const parts = strVal.split(' > ');
  const selectedParent = parts[0] || '';
  const selectedChild = parts.length > 1 ? parts.slice(1).join(' > ') : '';
  const children = selectedParent && hierarchy[selectedParent] ? hierarchy[selectedParent] : [];

  function setParent(p: string) {
    onChange(p || '');
  }

  function setChild(c: string) {
    if (c) onChange(`${selectedParent} > ${c}`);
    else onChange(selectedParent);
  }

  return (
    <div className="flex gap-2">
      <select value={selectedParent} onChange={e => setParent(e.target.value)} className="flex-1 px-2 py-1.5 border border-stone-300 dark:border-stone-600 rounded-lg text-sm bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200">
        <option value="">Select category...</option>
        {parents.map(p => <option key={p} value={p}>{p}</option>)}
      </select>
      {children.length > 0 && (
        <select value={selectedChild} onChange={e => setChild(e.target.value)} className="flex-1 px-2 py-1.5 border border-stone-300 dark:border-stone-600 rounded-lg text-sm bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200">
          <option value="">Any...</option>
          {children.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      )}
    </div>
  );
}

function getDefaultForType(fd: FieldDef): unknown {
  switch (fd.type) {
    case 'int': case 'float': return null;
    case 'unit': return { value: 0, unit: fd.default_unit || '' };
    case 'link': return null;
    case 'checklist': return [];
    case 'range': return { min: 0, max: 0 };
    case 'kvp': return [];
    case 'rating': return 0;
    default: return '';
  }
}

function formatDisplay(val: unknown, fieldType?: string): string {
  if (fieldType === 'boolean') return val === true ? 'Yes' : 'No';
  if (val == null || val === '') return '—';
  if (fieldType === 'checklist' && Array.isArray(val)) {
    const items = val as { text: string; checked: boolean }[];
    return items.map(i => `${i.checked ? '☑' : '☐'} ${i.text}`).join(', ') || '—';
  }
  if (fieldType === 'range') {
    const r = val as { min: number; max: number };
    if (typeof r === 'object' && r != null && 'min' in r) return `${r.min} – ${r.max}`;
  }
  if (fieldType === 'kvp' && Array.isArray(val)) {
    return val.map((p: unknown) => { const kv = p as { key: string; value: string }; return `${kv.key}: ${kv.value}`; }).join(', ') || '—';
  }
  if (fieldType === 'rating') {
    return `${val}`;
  }
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  if (Array.isArray(val)) return val.map(item => {
    if (item && typeof item === 'object' && 'name' in item) return item.name;
    return String(item);
  }).join(', ') || '—';
  if (typeof val === 'object' && 'name' in (val as Record<string, unknown>)) {
    return (val as { name: string }).name;
  }
  if (typeof val === 'object' && 'value' in (val as Record<string, unknown>)) {
    const v = val as { value: number; unit: string };
    return `${v.value} ${v.unit}`;
  }
  if (fieldType === 'date' && typeof val === 'string') {
    try { return new Date(val + 'T00:00:00').toLocaleDateString(); } catch { return String(val); }
  }
  if (fieldType === 'datetime' && typeof val === 'string') {
    try { return new Date(val).toLocaleString(); } catch { return String(val); }
  }
  return String(val);
}
