import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import type { Group, ItemSchema, Item } from '../types';
import ItemCard from '../components/ItemCard';
import CreateItemModal from '../components/CreateItemModal';

const SCHEMA_TEMPLATES: { name: string; description: string; definition: object }[] = [
  {
    name: 'Book Collection',
    description: 'Track books with author, genre, rating, and notes',
    definition: {
      sections: {
        Details: {
          title: { type: 'string' },
          author: { type: 'string' },
          genre: { type: 'dropdown', options: ['Fiction', 'Non-Fiction', 'Sci-Fi', 'Fantasy', 'Mystery', 'Biography', 'Self-Help', 'History'] },
          isbn: { type: 'string' },
        },
        Status: {
          rating: { type: 'dropdown', options: ['1', '2', '3', '4', '5'] },
          read_status: { type: 'dropdown', options: ['Want to Read', 'Reading', 'Finished', 'Abandoned'] },
          date_read: { type: 'datetime' },
          notes: { type: 'textarea' },
        },
      },
    },
  },
  {
    name: 'Recipe',
    description: 'Store recipes with ingredients, time, and instructions',
    definition: {
      sections: {
        Overview: {
          cuisine: { type: 'dropdown', options: ['Italian', 'Mexican', 'Chinese', 'Japanese', 'Indian', 'Thai', 'American', 'French', 'Other'] },
          category: { type: 'dropdown', options: ['Breakfast', 'Lunch', 'Dinner', 'Dessert', 'Snack', 'Drink'] },
          servings: { type: 'int' },
          prep_time_mins: { type: 'int' },
          cook_time_mins: { type: 'int' },
          difficulty: { type: 'dropdown', options: ['Easy', 'Medium', 'Hard'] },
        },
        Content: {
          ingredients: { type: 'textarea' },
          instructions: { type: 'textarea' },
          notes: { type: 'textarea' },
        },
      },
    },
  },
  {
    name: 'Inventory',
    description: 'General inventory tracking with quantity, price, and location',
    definition: {
      sections: {
        Info: {
          category: { type: 'dropdown', options: [] },
          description: { type: 'textarea' },
        },
        Stock: {
          quantity: { type: 'int' },
          price: { type: 'unit', unit_category: 'currency', default_unit: 'USD' },
          location: { type: 'string' },
          condition: { type: 'dropdown', options: ['New', 'Like New', 'Good', 'Fair', 'Poor'] },
        },
      },
    },
  },
  {
    name: 'Clothing',
    description: 'Wardrobe tracker with size, color, season, and brand',
    definition: {
      sections: {
        Details: {
          type: { type: 'dropdown', options: ['Top', 'Bottom', 'Outerwear', 'Dress', 'Shoes', 'Accessory', 'Underwear', 'Activewear'] },
          brand: { type: 'string' },
          color: { type: 'string' },
          size: { type: 'string' },
          material: { type: 'string' },
        },
        Meta: {
          season: { type: 'multiselect', 'multiselect-items': ['Spring', 'Summer', 'Fall', 'Winter'] },
          occasion: { type: 'multiselect', 'multiselect-items': ['Casual', 'Work', 'Formal', 'Sport', 'Lounge'] },
          purchased: { type: 'datetime' },
          notes: { type: 'textarea' },
        },
      },
    },
  },
  {
    name: 'Board Games',
    description: 'Board game collection with player count, playtime, and ratings',
    definition: {
      sections: {
        Info: {
          min_players: { type: 'int' },
          max_players: { type: 'int' },
          playtime_mins: { type: 'int' },
          complexity: { type: 'dropdown', options: ['Light', 'Medium-Light', 'Medium', 'Medium-Heavy', 'Heavy'] },
          category: { type: 'multiselect', 'multiselect-items': ['Strategy', 'Party', 'Cooperative', 'Deck-Building', 'Worker Placement', 'Dice', 'Trivia', 'Family'] },
        },
        Personal: {
          rating: { type: 'dropdown', options: ['1', '2', '3', '4', '5'] },
          times_played: { type: 'int' },
          notes: { type: 'textarea' },
        },
      },
    },
  },
];

export default function GroupDetailPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const gid = Number(groupId);

  const [group, setGroup] = useState<Group | null>(null);
  const [schemas, setSchemas] = useState<ItemSchema[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [selectedSchema, setSelectedSchema] = useState<number | undefined>();
  const [showCreateItem, setShowCreateItem] = useState(false);
  const [showCreateSchema, setShowCreateSchema] = useState(false);
  const [newSchemaName, setNewSchemaName] = useState('');
  const [importSchemaId, setImportSchemaId] = useState<number | null>(null);
  const [importResult, setImportResult] = useState<{ imported: number; errors: string[] } | null>(null);
  const [schemaJsonImport, setSchemaJsonImport] = useState(false);
  const [schemaJsonText, setSchemaJsonText] = useState('');
  const [schemaJsonError, setSchemaJsonError] = useState('');
  const [editingGroup, setEditingGroup] = useState(false);
  const [editGroupName, setEditGroupName] = useState('');
  const [editGroupDesc, setEditGroupDesc] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const [sortField, setSortFieldRaw] = useState<string>(searchParams.get('sort') || '');
  const [sortDir, setSortDirRaw] = useState<'asc' | 'desc'>((searchParams.get('dir') as 'asc' | 'desc') || 'desc');
  const setSortField = (v: string) => {
    setSortFieldRaw(v);
    setSearchParams(prev => { const p = new URLSearchParams(prev); if (v) p.set('sort', v); else p.delete('sort'); return p; }, { replace: true });
  };
  const setSortDir = (v: 'asc' | 'desc') => {
    setSortDirRaw(v);
    setSearchParams(prev => { const p = new URLSearchParams(prev); p.set('dir', v); return p; }, { replace: true });
  };
  const [thumbVersion, setThumbVersion] = useState(0);
  const [gridCols, setGridCols] = useState(4);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (importSchemaId !== -2) return;
    function handleClick(e: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setImportSchemaId(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [importSchemaId]);

  useEffect(() => {
    loadData();
  }, [gid]);

  async function loadData() {
    try {
      const [g, s, i] = await Promise.all([
        api.groups.get(gid),
        api.schemas.list(gid),
        api.items.list(gid, { schema_id: selectedSchema }),
      ]);
      setGroup(g);
      setSchemas(s);
      setItems(i);
      // Apply default sort from schema if viewing a specific schema and no user sort set
      if (!searchParams.get('sort') && selectedSchema && s.length > 0) {
        const def = s.find(sc => sc.id === selectedSchema)?.definition;
        if (def?.default_sort) {
          setSortFieldRaw(def.default_sort);
          setSortDirRaw(def.default_sort_dir || 'asc');
        }
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadItems() {
    const [i, s] = await Promise.all([
      api.items.list(gid, { schema_id: selectedSchema }),
      api.schemas.list(gid),
    ]);
    setItems(i);
    setSchemas(s);
  }

  useEffect(() => {
    if (!loading) loadItems();
    // Apply selected schema's default sort when switching schemas (unless user explicitly set sort via URL)
    if (!searchParams.get('sort') && selectedSchema) {
      const schema = schemas.find(s => s.id === selectedSchema);
      if (schema?.definition?.default_sort) {
        setSortFieldRaw(schema.definition.default_sort);
        setSortDirRaw(schema.definition.default_sort_dir || 'asc');
      } else {
        setSortFieldRaw('');
        setSortDirRaw('desc');
      }
    } else if (!selectedSchema) {
      // Viewing all schemas: always reset to empty (per-schema grouping), clearing URL params too
      setSortField('');
      setSortDirRaw('desc');
    }
  }, [selectedSchema]);

  async function handleCreateSchema(e: React.FormEvent) {
    e.preventDefault();
    if (!newSchemaName.trim()) return;
    const s = await api.schemas.create(gid, {
      name: newSchemaName.trim(),
      definition: { sections: {} },
    });
    setNewSchemaName('');
    setShowCreateSchema(false);
    setSchemas(prev => [...prev, s]);
  }

  async function handleCreateFromTemplate(tmpl: typeof SCHEMA_TEMPLATES[number]) {
    const s = await api.schemas.create(gid, {
      name: tmpl.name,
      definition: tmpl.definition,
    });
    setShowCreateSchema(false);
    setSchemas(prev => [...prev, s]);
  }

  async function handleCreateFromJson() {
    setSchemaJsonError('');
    try {
      const parsed = JSON.parse(schemaJsonText);
      let def: object;
      let schemaName = newSchemaName.trim() || 'Imported Schema';
      if (parsed.sections && typeof parsed.sections === 'object') {
        def = parsed;
      } else if (typeof parsed === 'object' && !Array.isArray(parsed)) {
        def = { sections: parsed };
      } else {
        setSchemaJsonError('JSON must be an object with a "sections" key, or a sections object directly.');
        return;
      }
      const s = await api.schemas.create(gid, { name: schemaName, definition: def });
      setSchemas(prev => [...prev, s]);
      setSchemaJsonImport(false);
      setSchemaJsonText('');
      setShowCreateSchema(false);
    } catch {
      setSchemaJsonError('Invalid JSON');
    }
  }

  async function handleDeleteItem(itemUuid: string) {
    if (!confirm('Delete this item?')) return;
    await api.items.delete(gid, itemUuid);
    setItems(prev => prev.filter(i => i.uuid !== itemUuid));
  }

  async function handleDuplicateItem(item: Item) {
    try {
      await api.items.create(gid, {
        name: `${item.name} (copy)`,
        schema_id: item.schema_id,
        data: { ...item.data },
        tags: [...item.tags],
      });
      loadItems();
    } catch {
      alert('Failed to duplicate item');
    }
  }

  async function handleSaveGroupEdit() {
    if (!editGroupName.trim()) return;
    const updated = await api.groups.update(gid, {
      name: editGroupName.trim(),
      description: editGroupDesc,
    });
    setGroup(prev => prev ? { ...prev, name: updated.name, description: updated.description } : prev);
    setEditingGroup(false);
  }

  function handleImportClick() {
    if (schemas.length === 0) return;
    if (schemas.length === 1) {
      setImportSchemaId(schemas[0].id);
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.csv';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const sid = schemas.length === 1 ? schemas[0].id : importSchemaId;
      if (!sid) {
        // Show schema picker - need to pick a schema first
        setImportSchemaId(-1); // signal to show picker
        input.remove();
        return;
      }
      try {
        const result = file.name.endsWith('.csv')
          ? await api.export.importCsv(gid, sid, file)
          : await api.export.importJson(gid, sid, file);
        setImportResult(result);
        loadItems();
      } catch {
        setImportResult({ imported: 0, errors: ['Import failed'] });
      }
      input.remove();
    };
    input.click();
  }

  async function handleImportWithSchema(schemaId: number) {
    setImportSchemaId(null);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.csv';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const result = file.name.endsWith('.csv')
          ? await api.export.importCsv(gid, schemaId, file)
          : await api.export.importJson(gid, schemaId, file);
        setImportResult(result);
        loadItems();
      } catch {
        setImportResult({ imported: 0, errors: ['Import failed'] });
      }
      input.remove();
    };
    input.click();
  }

  async function handleBundleImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const result = await api.export.importBundle(gid, file);
        setImportResult(result);
        loadData();
      } catch {
        setImportResult({ imported: 0, errors: ['Bundle import failed'] });
      }
      input.remove();
    };
    input.click();
  }

  // Collect sortable field names from all schemas
  const sortableFields = useMemo(() => {
    const fields = new Set<string>();
    schemas.forEach(s => {
      const def = s.definition as { sections?: Record<string, Record<string, { type: string }>> };
      if (def.sections) {
        Object.values(def.sections).forEach(section => {
          Object.entries(section).forEach(([name, fd]) => {
            if (['string', 'int', 'float', 'date', 'datetime', 'dropdown', 'unit'].includes(fd.type)) {
              fields.add(name);
            }
          });
        });
      }
    });
    return Array.from(fields).sort();
  }, [schemas]);

  // Sort items
  const sortedItems = useMemo(() => {
    const arr = [...items];
    if (!sortField) {
      // When no explicit sort: group by schema, apply each schema's default sort within group
      const schemaMap = new Map(schemas.map(s => [s.id, s]));
      const hasDefaults = schemas.some(s => s.definition?.default_sort);
      if (hasDefaults) {
        arr.sort((a, b) => {
          // Group by schema first
          if (a.schema_id !== b.schema_id) return a.schema_id - b.schema_id;
          // Within same schema, apply that schema's default sort
          const schema = schemaMap.get(a.schema_id);
          const defSort = schema?.definition?.default_sort;
          const defDir = schema?.definition?.default_sort_dir || 'asc';
          if (!defSort) return sortDir === 'asc' ? a.id - b.id : b.id - a.id;
          if (defSort === 'name') {
            const av = (a.name || '').toLowerCase();
            const bv = (b.name || '').toLowerCase();
            return defDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
          }
          let av: unknown = a.data[defSort];
          let bv: unknown = b.data[defSort];
          if (av && typeof av === 'object' && 'value' in (av as Record<string,unknown>)) av = (av as { value: number }).value;
          if (bv && typeof bv === 'object' && 'value' in (bv as Record<string,unknown>)) bv = (bv as { value: number }).value;
          if (av == null && bv == null) return 0;
          if (av == null) return 1;
          if (bv == null) return -1;
          if (typeof av === 'number' && typeof bv === 'number') return defDir === 'asc' ? av - bv : bv - av;
          const as = String(av).toLowerCase();
          const bs = String(bv).toLowerCase();
          return defDir === 'asc' ? as.localeCompare(bs) : bs.localeCompare(as);
        });
        return arr;
      }
      // No defaults: sort by id (date added)
      arr.sort((a, b) => sortDir === 'asc' ? a.id - b.id : b.id - a.id);
      return arr;
    }
    if (sortField === 'name') {
      arr.sort((a, b) => {
        const av = (a.name || '').toLowerCase();
        const bv = (b.name || '').toLowerCase();
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      });
      return arr;
    }
    arr.sort((a, b) => {
      let av = a.data[sortField];
      let bv = b.data[sortField];
      // Handle unit values
      if (av && typeof av === 'object' && 'value' in av) av = (av as { value: number }).value;
      if (bv && typeof bv === 'object' && 'value' in bv) bv = (bv as { value: number }).value;
      // Nulls last
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      // Numeric comparison
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      // Date comparison
      if (typeof av === 'string' && typeof bv === 'string') {
        const da = new Date(av).getTime();
        const db = new Date(bv).getTime();
        if (!isNaN(da) && !isNaN(db)) {
          return sortDir === 'asc' ? da - db : db - da;
        }
      }
      // String comparison
      const as = String(av).toLowerCase();
      const bs = String(bv).toLowerCase();
      return sortDir === 'asc' ? as.localeCompare(bs) : bs.localeCompare(as);
    });
    return arr;
  }, [items, sortField, sortDir, schemas]);

  if (loading) {
    return (
      <div />
    );
  }

  if (!group) {
    return <div className="text-stone-400 dark:text-stone-500 text-center py-12">Group not found</div>;
  }

  return (
    <div className="animate-content-in">
      {/* Header */}
      <div className="flex items-center gap-2 text-sm text-stone-400 dark:text-stone-500 mb-4">
        <Link to="/groups" className="hover:text-stone-600 dark:hover:text-stone-300">Collections</Link>
        <span>/</span>
        <span className="text-stone-600 dark:text-stone-300">{group.name}</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="relative group/thumb">
            {group.thumbnail ? (
              <img
                src={`${api.groups.thumbnailUrl(gid)}?v=${thumbVersion}`}
                alt=""
                className="w-14 h-14 rounded-lg object-cover border border-stone-200 dark:border-stone-700"
              />
            ) : (
              <div className="w-14 h-14 rounded-lg bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 flex items-center justify-center text-stone-300 dark:text-stone-600">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            )}
            <button
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/*';
                input.onchange = async () => {
                  const file = input.files?.[0];
                  if (!file) return;
                  const updated = await api.groups.uploadThumbnail(gid, file);
                  setGroup(prev => prev ? { ...prev, thumbnail: updated.thumbnail } : prev);
                  setThumbVersion(v => v + 1);
                };
                input.click();
              }}
              className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-lg opacity-0 group-hover/thumb:opacity-100 transition-opacity text-white text-xs"
            >
              {group.thumbnail ? '✎' : '+'}
            </button>
          </div>
          <div>
            {editingGroup ? (
              <div className="space-y-2">
                <input
                  value={editGroupName}
                  onChange={e => setEditGroupName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveGroupEdit(); }}
                  className="text-2xl font-semibold text-stone-800 dark:text-stone-100 bg-transparent border-b border-stone-300 dark:border-stone-600 focus:border-stone-500 focus:outline-none w-full"
                  autoFocus
                />
                <input
                  value={editGroupDesc}
                  onChange={e => setEditGroupDesc(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveGroupEdit(); }}
                  className="text-sm text-stone-400 dark:text-stone-500 bg-transparent border-b border-stone-300 dark:border-stone-600 focus:border-stone-500 focus:outline-none w-full"
                  placeholder="Description (optional)"
                />
                <div className="flex gap-2">
                  <button onClick={handleSaveGroupEdit} className="px-3 py-1 bg-stone-800 dark:bg-stone-200 text-white dark:text-stone-900 rounded text-xs font-medium">Save</button>
                  <button onClick={() => setEditingGroup(false)} className="px-3 py-1 text-stone-400 text-xs">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="group/name">
                <h1
                  className="text-2xl font-semibold text-stone-800 dark:text-stone-100 cursor-pointer hover:text-stone-600 dark:hover:text-stone-300"
                  onClick={() => { setEditGroupName(group.name); setEditGroupDesc(group.description || ''); setEditingGroup(true); }}
                  title="Click to edit"
                >
                  {group.name}
                  <span className="text-sm font-normal text-stone-300 dark:text-stone-600 ml-2 opacity-0 group-hover/name:opacity-100">✎</span>
                </h1>
                {group.description && <p className="text-sm text-stone-400 dark:text-stone-500 mt-1">{group.description}</p>}
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <div className="relative" ref={exportMenuRef}>
            <button
              onClick={() => setImportSchemaId(importSchemaId === -2 ? null : -2)}
              className="px-3 py-1.5 text-sm border border-stone-300 dark:border-stone-600 rounded-lg text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800"
            >
              Import / Export ▾
            </button>
            {importSchemaId === -2 && (
              <div className="absolute right-0 top-full mt-1 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg shadow-lg z-10 min-w-[180px] py-1">
                <div className="px-3 py-1.5 text-xs text-stone-400 dark:text-stone-500 uppercase tracking-wide">Export</div>
                <a
                  href={api.export.jsonUrl(gid)}
                  className="block w-full text-left px-3 py-2 text-sm text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700"
                  onClick={() => setImportSchemaId(null)}
                >
                  Export Data
                </a>
                <a
                  href={api.export.jsonUrl(gid, true)}
                  className="block w-full text-left px-3 py-2 text-sm text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700"
                  onClick={() => setImportSchemaId(null)}
                >
                  Export Bundle
                </a>
                <div className="border-t border-stone-100 dark:border-stone-700 my-1" />
                <div className="px-3 py-1.5 text-xs text-stone-400 dark:text-stone-500 uppercase tracking-wide">Import</div>
                {schemas.length >= 1 && (
                  schemas.length === 1 ? (
                    <button
                      onClick={() => { setImportSchemaId(null); handleImportClick(); }}
                      className="block w-full text-left px-3 py-2 text-sm text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700"
                    >
                      Import Data
                    </button>
                  ) : (
                    <>
                      <div className="px-3 py-1 text-xs text-stone-400 dark:text-stone-500">Into schema:</div>
                      {schemas.map(s => (
                        <button
                          key={s.id}
                          onClick={() => { setImportSchemaId(null); handleImportWithSchema(s.id); }}
                          className="block w-full text-left px-3 py-2 text-sm text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700 pl-5"
                        >
                          {s.name}
                        </button>
                      ))}
                    </>
                  )
                )}
                <button
                  onClick={() => { setImportSchemaId(null); handleBundleImport(); }}
                  className="block w-full text-left px-3 py-2 text-sm text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700"
                >
                  Import Bundle
                </button>
              </div>
            )}
          </div>
          <button
            onClick={() => setShowCreateItem(true)}
            className="px-4 py-2 bg-stone-800 dark:bg-stone-200 text-white dark:text-stone-900 rounded-lg text-sm font-medium hover:bg-stone-700 dark:hover:bg-stone-300"
            disabled={schemas.length === 0}
          >
            + Add Item
          </button>
        </div>
      </div>

      {/* Schemas */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-stone-500 dark:text-stone-400 uppercase tracking-wide">Schemas</h2>
          <button
            onClick={() => setShowCreateSchema(!showCreateSchema)}
            className="text-sm text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
          >
            + Add Schema
          </button>
        </div>

        {showCreateSchema && (
          <div className="mb-4 space-y-3">
            {/* Create blank */}
            <form onSubmit={handleCreateSchema} className="flex gap-2">
              <input
                value={newSchemaName}
                onChange={e => setNewSchemaName(e.target.value)}
                className="flex-1 px-3 py-1.5 border border-stone-300 dark:border-stone-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-stone-400 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200"
                placeholder="Schema name (e.g. ClothingItem)"
                autoFocus
              />
              <button type="submit" className="px-3 py-1.5 bg-stone-800 dark:bg-stone-200 text-white dark:text-stone-900 rounded-lg text-sm">
                Create Blank
              </button>
              <button
                type="button"
                onClick={() => { setSchemaJsonImport(!schemaJsonImport); setSchemaJsonError(''); }}
                className="px-3 py-1.5 border border-stone-300 dark:border-stone-600 rounded-lg text-sm text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800"
              >
                Paste JSON
              </button>
            </form>

            {/* JSON import */}
            {schemaJsonImport && (
              <div className="bg-white dark:bg-stone-900 rounded-lg border border-stone-200 dark:border-stone-700 p-3">
                <textarea
                  value={schemaJsonText}
                  onChange={e => { setSchemaJsonText(e.target.value); setSchemaJsonError(''); }}
                  rows={6}
                  className="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-lg text-xs font-mono bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200 mb-2"
                  placeholder='Paste schema JSON here...'
                />
                {schemaJsonError && <p className="text-xs text-red-500 mb-2">{schemaJsonError}</p>}
                <button onClick={handleCreateFromJson} className="px-3 py-1.5 bg-stone-800 dark:bg-stone-200 text-white dark:text-stone-900 rounded-lg text-sm">
                  Create from JSON
                </button>
              </div>
            )}

            {/* Templates */}
            <div>
              <p className="text-xs text-stone-400 dark:text-stone-500 mb-2">Or start from a template:</p>
              <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
                {SCHEMA_TEMPLATES.map(tmpl => (
                  <button
                    key={tmpl.name}
                    onClick={() => handleCreateFromTemplate(tmpl)}
                    className="text-left p-3 bg-white dark:bg-stone-900 rounded-lg border border-stone-200 dark:border-stone-700 hover:border-stone-400 dark:hover:border-stone-500 transition-colors"
                  >
                    <div className="text-sm font-medium text-stone-700 dark:text-stone-200">{tmpl.name}</div>
                    <div className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">{tmpl.description}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedSchema(undefined)}
            className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
              !selectedSchema ? 'bg-stone-800 dark:bg-stone-200 text-white dark:text-stone-900' : 'bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700'
            }`}
          >
            All ({schemas.reduce((sum, s) => sum + (s.item_count ?? 0), 0)})
          </button>
          {schemas.map(s => (
            <div key={s.id} className="flex items-stretch group/schema">
              <button
                onClick={() => setSelectedSchema(selectedSchema === s.id ? undefined : s.id)}
                className={`px-3 py-1.5 rounded-l-full text-sm transition-colors ${
                  selectedSchema === s.id ? 'bg-stone-800 dark:bg-stone-200 text-white dark:text-stone-900' : 'bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 border-r-0 text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700'
                }`}
              >
                {s.name} ({s.item_count})
              </button>
              <Link
                to={`/groups/${gid}/schemas/${s.id}`}
                className={`px-2.5 py-1.5 rounded-r-full text-sm transition-colors flex items-center border-l ${
                  selectedSchema === s.id ? 'bg-stone-800 dark:bg-stone-200 border-stone-600 dark:border-stone-400 text-white/60 dark:text-stone-900/60 hover:text-white dark:hover:text-stone-900' : 'bg-white dark:bg-stone-800 border-stone-200 dark:border-stone-700 border border-l-stone-300 dark:border-l-stone-600 text-stone-400 dark:text-stone-500 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-700'
                }`}
                title="Edit schema"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </Link>
            </div>
          ))}
        </div>
      </div>

      {/* View mode toggle + sort */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <button
          onClick={() => setViewMode('grid')}
          className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-stone-200 dark:bg-stone-700' : 'hover:bg-stone-100 dark:hover:bg-stone-800'}`}
          title="Grid view"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-stone-600 dark:text-stone-300" viewBox="0 0 20 20" fill="currentColor">
            <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
          </svg>
        </button>
        <button
          onClick={() => setViewMode('table')}
          className={`p-1.5 rounded ${viewMode === 'table' ? 'bg-stone-200 dark:bg-stone-700' : 'hover:bg-stone-100 dark:hover:bg-stone-800'}`}
          title="Table view"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-stone-600 dark:text-stone-300" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5 4a3 3 0 00-3 3v6a3 3 0 003 3h10a3 3 0 003-3V7a3 3 0 00-3-3H5zm-1 9v-1h5v2H5a1 1 0 01-1-1zm7 1h4a1 1 0 001-1v-1h-5v2zm0-4h5V8h-5v2zM9 8H4v2h5V8z" clipRule="evenodd" />
          </svg>
        </button>
        <span className="text-sm text-stone-400 dark:text-stone-500 ml-2">{sortedItems.length} items</span>
        {viewMode === 'grid' && (
          <div className="flex items-center gap-1 ml-2 border border-stone-200 dark:border-stone-700 rounded-lg overflow-hidden">
              <button
                onClick={() => setGridCols(c => Math.max(1, c - 1))}
                className="px-2 py-1 text-xs text-stone-400 dark:text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
                title="Fewer columns"
              >−</button>
              <span className="px-2 py-1 text-xs text-stone-600 dark:text-stone-300 tabular-nums">{gridCols}</span>
              <button
                onClick={() => setGridCols(c => c + 1)}
                className="px-2 py-1 text-xs text-stone-400 dark:text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
                title="More columns"
              >+</button>
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          <label className="text-xs text-stone-400 dark:text-stone-500">Sort by:</label>
          <select
            value={sortField}
            onChange={e => setSortField(e.target.value)}
            className="px-2 py-1 border border-stone-300 dark:border-stone-600 rounded text-xs bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200"
          >
            <option value="">Date Added</option>
            <option value="name">Name</option>
            {sortableFields.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <button
            onClick={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')}
            className="text-xs text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300 px-1"
            title={sortDir === 'asc' ? 'Ascending' : 'Descending'}
          >
            {sortDir === 'asc' ? '↑' : '↓'}
          </button>
        </div>
      </div>

      {/* Import result banner */}
      {importResult && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm flex items-center justify-between ${importResult.errors.length > 0 ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300' : 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300'}`}>
          <div>
            Imported {importResult.imported} item{importResult.imported !== 1 ? 's' : ''}.
            {importResult.errors.length > 0 && ` ${importResult.errors.length} error${importResult.errors.length !== 1 ? 's' : ''}: ${importResult.errors.slice(0, 3).join('; ')}`}
          </div>
          <button onClick={() => setImportResult(null)} className="ml-2 opacity-60 hover:opacity-100">&times;</button>
        </div>
      )}

      {/* Items */}
      {sortedItems.length === 0 ? (
        <div className="text-center py-16 text-stone-400 dark:text-stone-500">
          <p className="text-lg mb-2">No items yet</p>
          <p className="text-sm">
            {schemas.length === 0
              ? 'Create a schema first, then add items'
              : 'Add an item to get started'}
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}>
          {sortedItems.map(item => (
            <div key={item.id} className="relative group/card">
              <ItemCard
                item={item}
                groupId={gid}
                onDelete={() => handleDeleteItem(item.uuid)}
              />
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDuplicateItem(item); }}
                className="absolute top-2 left-2 opacity-0 group-hover/card:opacity-100 transition-opacity bg-white/80 dark:bg-stone-800/80 backdrop-blur rounded p-1 text-stone-400 hover:text-stone-600 dark:text-stone-500 dark:hover:text-stone-300"
                title="Duplicate item"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      ) : (
        <ItemTable items={sortedItems} groupId={gid} schemas={schemas} selectedSchema={selectedSchema} onDelete={handleDeleteItem} onDuplicate={handleDuplicateItem} onBulkDeleted={loadItems} sortField={sortField} sortDir={sortDir} onSort={(field) => {
          if (sortField === field) { setSortDir(sortDir === 'asc' ? 'desc' : 'asc'); }
          else { setSortField(field); setSortDir('asc'); }
        }} />
      )}

      {/* Create Item Modal */}
      {showCreateItem && schemas.length > 0 && (
        <CreateItemModal
          groupId={gid}
          schemas={schemas}
          onClose={() => setShowCreateItem(false)}
          onCreated={() => {
            setShowCreateItem(false);
            loadItems();
          }}
        />
      )}
    </div>
  );
}

function ItemTable({ items, groupId, schemas, selectedSchema, onDelete, onDuplicate, onBulkDeleted, sortField, sortDir, onSort }: {
  items: Item[];
  groupId: number;
  schemas: ItemSchema[];
  selectedSchema?: number;
  onDelete: (uuid: string) => void;
  onDuplicate: (item: Item) => void;
  onBulkDeleted: () => void;
  sortField: string;
  sortDir: 'asc' | 'desc';
  onSort: (field: string) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [groupEditOpen, setGroupEditOpen] = useState(false);
  const [groupEditData, setGroupEditData] = useState<Record<string, unknown>>({});
  const [groupEditDirty, setGroupEditDirty] = useState<Set<string>>(new Set());
  const [groupEditSaving, setGroupEditSaving] = useState(false);
  const schemaMap = new Map(schemas.map(schema => [schema.id, schema]));

  function getImageFieldNames(item: Item): Set<string> {
    const schema = schemaMap.get(item.schema_id);
    const fields = new Set<string>();
    if (!schema?.definition?.sections) return fields;

    for (const section of Object.values(schema.definition.sections)) {
      for (const [fieldName, fieldDef] of Object.entries(section)) {
        if (fieldDef.type === 'image') {
          fields.add(fieldName);
        }
      }
    }

    return fields;
  }

  function renderCellValue(item: Item, field: string) {
    const imageFieldNames = getImageFieldNames(item);
    const value = item.data[field];

    if (imageFieldNames.has(field) && typeof value === 'number') {
      const match = item.images.find(image => image.id === value);
      if (!match) return '';

      return (
        <img
          src={api.images.thumbUrl(item.uuid, match.id)}
          alt=""
          className="h-10 w-10 rounded object-cover"
        />
      );
    }

    return formatValue(value);
  }

  // Collect field names in schema-definition order (stable regardless of sort)
  const fields = useMemo(() => {
    const schemaFields: string[] = [];
    const schemaFieldSet = new Set<string>();
    const relevantSchemas = selectedSchema
      ? schemas.filter(s => s.id === selectedSchema)
      : schemas;
    for (const s of relevantSchemas) {
      const sections = (s.definition as { sections?: Record<string, Record<string, unknown>> })?.sections;
      if (sections) {
        for (const sectionFields of Object.values(sections)) {
          for (const fn of Object.keys(sectionFields)) {
            if (!schemaFieldSet.has(fn)) {
              schemaFieldSet.add(fn);
              schemaFields.push(fn);
            }
          }
        }
      }
    }
    // Also include any data keys from items not in schemas (backwards compat), sorted alphabetically for stability
    const extraKeys = new Set<string>();
    items.forEach(item => {
      Object.keys(item.data).forEach(k => {
        if (!schemaFieldSet.has(k)) extraKeys.add(k);
      });
    });
    return [...schemaFields, ...Array.from(extraKeys).sort()];
  }, [schemas, selectedSchema, items]);

  function toggleItem(uuid: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(uuid)) next.delete(uuid); else next.add(uuid);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === items.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(items.map(i => i.uuid)));
    }
  }

  async function handleBulkDelete() {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} item${selected.size > 1 ? 's' : ''}? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      for (const uuid of selected) {
        await api.items.delete(groupId, uuid);
      }
      // Reload items after bulk delete
      setSelected(new Set());
      onBulkDeleted();
    } finally {
      setDeleting(false);
    }
  }

  // Group Edit: check if all selected items share the same schema
  const selectedItems = items.filter(i => selected.has(i.uuid));
  const selectedSchemaIds = new Set(selectedItems.map(i => i.schema_id));
  const canGroupEdit = selected.size > 0 && selectedSchemaIds.size === 1;
  const groupEditSchema = canGroupEdit ? schemaMap.get([...selectedSchemaIds][0]) : null;

  function openGroupEdit() {
    if (!groupEditSchema) return;
    setGroupEditData({});
    setGroupEditDirty(new Set());
    setGroupEditOpen(true);
  }

  function updateGroupEditField(field: string, value: unknown) {
    setGroupEditData(prev => ({ ...prev, [field]: value }));
    setGroupEditDirty(prev => new Set(prev).add(field));
  }

  async function handleGroupEditSave() {
    if (groupEditDirty.size === 0) return;
    setGroupEditSaving(true);
    try {
      const patch: Record<string, unknown> = {};
      for (const f of groupEditDirty) {
        patch[f] = groupEditData[f];
      }
      for (const item of selectedItems) {
        const merged = { ...item.data, ...patch };
        await api.items.update(groupId, item.uuid, { data: merged });
      }
      setGroupEditOpen(false);
      setSelected(new Set());
      onBulkDeleted(); // reload items
    } finally {
      setGroupEditSaving(false);
    }
  }

  return (
    <div className="overflow-x-auto">
      {selected.size > 0 && (
        <div className="flex items-center gap-3 mb-2 px-3 py-2 bg-stone-100 dark:bg-stone-800 rounded-lg">
          <span className="text-sm text-stone-600 dark:text-stone-300">{selected.size} selected</span>
          <button
            onClick={openGroupEdit}
            disabled={!canGroupEdit}
            className={`px-3 py-1 text-sm rounded transition-colors ${canGroupEdit ? 'bg-stone-700 dark:bg-stone-300 text-white dark:text-stone-900 hover:bg-stone-600 dark:hover:bg-stone-400' : 'bg-stone-300 dark:bg-stone-600 text-stone-500 dark:text-stone-400 cursor-not-allowed'}`}
            title={canGroupEdit ? `Edit ${selected.size} items` : 'Select items of the same schema type'}
          >
            Group Edit
          </button>
          <button
            onClick={handleBulkDelete}
            disabled={deleting}
            className="px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
          >
            {deleting ? 'Deleting...' : 'Delete Selected'}
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="px-3 py-1 text-sm text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
          >
            Clear
          </button>
        </div>
      )}
      <div className="overflow-x-auto">
      <table className="w-full text-sm" style={{ minWidth: 'max-content' }}>
        <thead>
          <tr className="border-b border-stone-200 dark:border-stone-700">
            <th className="py-2 px-2 w-8 sticky left-0 z-20 bg-white dark:bg-stone-900">
              <input
                type="checkbox"
                checked={selected.size === items.length && items.length > 0}
                onChange={toggleAll}
                className="rounded border-stone-300 dark:border-stone-600"
              />
            </th>
            <th className="text-left py-2 px-3 text-stone-500 dark:text-stone-400 font-medium sticky left-8 z-20 bg-white dark:bg-stone-900 min-w-[3.5rem]">Image</th>
            <th className="text-left py-2 px-3 text-stone-500 dark:text-stone-400 font-medium sticky left-[6rem] z-20 bg-white dark:bg-stone-900 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)] cursor-pointer hover:text-stone-700 dark:hover:text-stone-200 select-none min-w-[8rem]" onClick={() => onSort('name')}>
              Name {sortField === 'name' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
            </th>
            {fields.filter(f => f !== 'name').map(f => (
              <th key={f} className="text-left py-2 px-3 text-stone-500 dark:text-stone-400 font-medium whitespace-nowrap cursor-pointer hover:text-stone-700 dark:hover:text-stone-200 select-none" onClick={() => onSort(f)}>
                {f} {sortField === f ? (sortDir === 'asc' ? '↑' : '↓') : ''}
              </th>
            ))}
            <th className="text-left py-2 px-3 text-stone-500 dark:text-stone-400 font-medium">Tags</th>
            <th className="py-2 px-3"></th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.uuid} className={`group/row border-b border-stone-100 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800/50 ${selected.has(item.uuid) ? 'bg-stone-50 dark:bg-stone-800/30' : ''}`}>
              <td className="py-2 px-2 w-8 sticky left-0 z-20 bg-white dark:bg-stone-900 group-hover/row:bg-stone-50 dark:group-hover/row:bg-stone-800/50">
                <input
                  type="checkbox"
                  checked={selected.has(item.uuid)}
                  onChange={() => toggleItem(item.uuid)}
                  className="rounded border-stone-300 dark:border-stone-600"
                />
              </td>
              <td className="py-2 px-3 sticky left-8 z-20 bg-white dark:bg-stone-900 group-hover/row:bg-stone-50 dark:group-hover/row:bg-stone-800/50 min-w-[3.5rem]">
                {item.images[0] ? (
                  <img
                    src={api.images.thumbUrl(item.uuid, item.images[0].id)}
                    alt=""
                    className="h-10 w-10 rounded object-cover"
                  />
                ) : null}
              </td>
              <td className="py-2 px-3 sticky left-[6rem] z-20 bg-white dark:bg-stone-900 group-hover/row:bg-stone-50 dark:group-hover/row:bg-stone-800/50 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)] min-w-[8rem]">
                <Link to={`/groups/${groupId}/items/${item.uuid}`} className="text-stone-800 dark:text-stone-200 hover:underline font-medium whitespace-nowrap">
                  {item.name || `Item #${item.id}`}
                </Link>
              </td>
              {fields.filter(f => f !== 'name').map(f => (
                <td key={f} className="py-2 px-3 text-stone-600 dark:text-stone-400 max-w-[200px] truncate">
                  {renderCellValue(item, f)}
                </td>
              ))}
              <td className="py-2 px-3">
                <div className="flex flex-wrap gap-1">
                {item.tags.map(t => (
                  <span key={t} className="inline-block bg-stone-100 dark:bg-stone-700 text-stone-500 dark:text-stone-400 text-xs px-2 py-0.5 rounded max-w-[120px] truncate" title={t}>
                    {t}
                  </span>
                ))}
                </div>
              </td>
              <td className="py-2 px-3 flex gap-1">
                <button onClick={() => onDuplicate(item)} className="text-stone-300 dark:text-stone-600 hover:text-stone-500 dark:hover:text-stone-400" title="Duplicate">
                  ⧉
                </button>
                <button onClick={() => onDelete(item.uuid)} className="text-stone-300 dark:text-stone-600 hover:text-red-400">
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      {/* Group Edit Modal */}
      {groupEditOpen && groupEditSchema && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 animate-fade-in" onClick={() => setGroupEditOpen(false)}>
          <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700 shadow-xl w-full max-w-lg max-h-[80vh] overflow-y-auto m-4 animate-scale-in" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white dark:bg-stone-900 border-b border-stone-200 dark:border-stone-700 px-5 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-stone-800 dark:text-stone-100">Group Edit</h3>
                <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">
                  Editing {selectedItems.length} items &middot; {groupEditSchema.name} &middot; Only changed fields are applied
                </p>
              </div>
              <button onClick={() => setGroupEditOpen(false)} className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-300">&times;</button>
            </div>
            <div className="px-5 py-4 space-y-4">
              {Object.entries(groupEditSchema.definition.sections).map(([sectionName, fields]) => (
                <div key={sectionName}>
                  <h4 className="text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wide mb-2">{sectionName}</h4>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {Object.entries(fields).map(([fieldName, fieldDef]) => {
                      if (fieldDef.type === 'image' || fieldDef.type === 'computed') return null;
                      const isDirty = groupEditDirty.has(fieldName);
                      const val = groupEditData[fieldName];
                      return (
                        <div key={fieldName} className={`${fieldDef.type === 'textarea' ? 'sm:col-span-2' : ''}`}>
                          <label className="flex items-center gap-2 text-sm font-medium text-stone-600 dark:text-stone-300 mb-1">
                            <input
                              type="checkbox"
                              checked={isDirty}
                              onChange={e => {
                                if (!e.target.checked) {
                                  setGroupEditDirty(prev => { const n = new Set(prev); n.delete(fieldName); return n; });
                                } else {
                                  updateGroupEditField(fieldName, val ?? '');
                                }
                              }}
                              className="rounded border-stone-300 dark:border-stone-600"
                            />
                            {fieldName}
                          </label>
                          {isDirty && (
                            <GroupEditFieldInput fieldDef={fieldDef} value={val} onChange={v => updateGroupEditField(fieldName, v)} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-stone-900 border-t border-stone-200 dark:border-stone-700 px-5 py-3 flex justify-end gap-2">
              <button onClick={() => setGroupEditOpen(false)} className="px-4 py-2 text-sm text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200">Cancel</button>
              <button
                onClick={handleGroupEditSave}
                disabled={groupEditDirty.size === 0 || groupEditSaving}
                className="px-4 py-2 text-sm bg-stone-800 dark:bg-stone-200 text-white dark:text-stone-900 rounded-lg font-medium hover:bg-stone-700 dark:hover:bg-stone-300 disabled:opacity-50"
              >
                {groupEditSaving ? 'Saving...' : `Apply to ${selectedItems.length} items`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GroupEditFieldInput({ fieldDef, value, onChange }: { fieldDef: { type: string; options?: string[]; 'dropdown-items'?: string[]; 'multiselect-items'?: string[] }; value: unknown; onChange: (v: unknown) => void }) {
  const cls = "w-full px-3 py-1.5 border border-stone-300 dark:border-stone-600 rounded-lg text-sm bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200 focus:outline-none focus:ring-2 focus:ring-stone-400";
  switch (fieldDef.type) {
    case 'textarea':
      return <textarea value={String(value ?? '')} onChange={e => onChange(e.target.value)} rows={3} className={cls} />;
    case 'boolean':
      return (
        <label className="flex items-center gap-2 text-sm text-stone-600 dark:text-stone-300">
          <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} className="rounded border-stone-300 dark:border-stone-600" />
          {value ? 'Yes' : 'No'}
        </label>
      );
    case 'dropdown': {
      const opts = fieldDef.options || fieldDef['dropdown-items'] || [];
      return (
        <select value={String(value ?? '')} onChange={e => onChange(e.target.value)} className={cls}>
          <option value="">-- Select --</option>
          {opts.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    case 'multiselect': {
      const opts = fieldDef['multiselect-items'] || fieldDef.options || [];
      const selected = Array.isArray(value) ? value as string[] : [];
      return (
        <div className="flex flex-wrap gap-1">
          {opts.map(o => (
            <button key={o} type="button" onClick={() => {
              const next = selected.includes(o) ? selected.filter(v => v !== o) : [...selected, o];
              onChange(next);
            }} className={`px-2 py-0.5 rounded text-xs ${selected.includes(o) ? 'bg-stone-800 dark:bg-stone-200 text-white dark:text-stone-900' : 'bg-stone-100 dark:bg-stone-700 text-stone-600 dark:text-stone-300'}`}>
              {o}
            </button>
          ))}
        </div>
      );
    }
    case 'int':
      return <input type="number" step="1" value={value != null ? String(value) : ''} onChange={e => onChange(e.target.value ? parseInt(e.target.value) : null)} className={cls} />;
    case 'float':
      return <input type="number" step="any" value={value != null ? String(value) : ''} onChange={e => onChange(e.target.value ? parseFloat(e.target.value) : null)} className={cls} />;
    case 'date':
      return <input type="date" value={String(value ?? '')} onChange={e => onChange(e.target.value)} className={cls} />;
    case 'datetime':
      return <input type="datetime-local" value={String(value ?? '')} onChange={e => onChange(e.target.value)} className={cls} />;
    default:
      return <input type="text" value={String(value ?? '')} onChange={e => onChange(e.target.value)} className={cls} />;
  }
}

function formatValue(val: unknown): string {
  if (val == null) return '';
  if (typeof val === 'object' && 'name' in (val as Record<string, unknown>)) {
    return (val as { name: string }).name;
  }
  if (typeof val === 'object' && 'min' in (val as Record<string, unknown>) && 'max' in (val as Record<string, unknown>)) {
    const r = val as { min: number; max: number };
    return `${r.min} – ${r.max}`;
  }
  if (typeof val === 'object' && 'value' in (val as Record<string, unknown>) && 'unit' in (val as Record<string, unknown>)) {
    const v = val as { value: number; unit: string };
    return `${v.value} ${v.unit}`;
  }
  if (Array.isArray(val)) return val.map(item => {
    if (item && typeof item === 'object' && 'name' in item) return item.name;
    if (item && typeof item === 'object' && 'key' in item && 'value' in item) return `${(item as {key:string}).key}: ${(item as {value:string}).value}`;
    if (item && typeof item === 'object' && 'text' in item) return `${(item as {checked:boolean}).checked ? '☑' : '☐'} ${(item as {text:string}).text}`;
    if (item && typeof item === 'object' && 'value' in item && 'unit' in item) return `${(item as {value:number; unit:string}).value} ${(item as {value:number; unit:string}).unit}`;
    return String(item);
  }).join(', ');
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  if (typeof val === 'object' && val != null) {
    try { const s = JSON.stringify(val); return s.length > 60 ? s.slice(0, 60) + '…' : s; } catch { return ''; }
  }
  return String(val);
}
