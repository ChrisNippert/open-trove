import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
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
  const navigate = useNavigate();

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
    } finally {
      setLoading(false);
    }
  }

  async function loadItems() {
    const i = await api.items.list(gid, { schema_id: selectedSchema });
    setItems(i);
  }

  useEffect(() => {
    if (!loading) loadItems();
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

  async function handleDeleteItem(itemId: number) {
    if (!confirm('Delete this item?')) return;
    await api.items.delete(gid, itemId);
    setItems(prev => prev.filter(i => i.id !== itemId));
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

  if (loading) {
    return <div className="text-stone-400 dark:text-stone-500 text-center py-12">Loading...</div>;
  }

  if (!group) {
    return <div className="text-stone-400 dark:text-stone-500 text-center py-12">Group not found</div>;
  }

  return (
    <div>
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
                src={api.groups.thumbnailUrl(gid)}
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
                };
                input.click();
              }}
              className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-lg opacity-0 group-hover/thumb:opacity-100 transition-opacity text-white text-xs"
            >
              {group.thumbnail ? '✎' : '+'}
            </button>
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-stone-800 dark:text-stone-100">{group.name}</h1>
            {group.description && <p className="text-sm text-stone-400 dark:text-stone-500 mt-1">{group.description}</p>}
          </div>
        </div>
        <div className="flex gap-2">
          <a
            href={api.export.jsonUrl(gid)}
            className="px-3 py-1.5 text-sm border border-stone-300 dark:border-stone-600 rounded-lg text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800"
          >
            Export JSON
          </a>
          {schemas.length === 1 ? (
            <button
              onClick={handleImportClick}
              className="px-3 py-1.5 text-sm border border-stone-300 dark:border-stone-600 rounded-lg text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800"
            >
              Import
            </button>
          ) : schemas.length > 1 ? (
            <div className="relative">
              <button
                onClick={() => setImportSchemaId(importSchemaId === -1 ? null : -1)}
                className="px-3 py-1.5 text-sm border border-stone-300 dark:border-stone-600 rounded-lg text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800"
              >
                Import ▾
              </button>
              {importSchemaId === -1 && (
                <div className="absolute right-0 top-full mt-1 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg shadow-lg z-10 min-w-[160px]">
                  <div className="px-3 py-2 text-xs text-stone-400 dark:text-stone-500 border-b border-stone-100 dark:border-stone-700">Import into schema:</div>
                  {schemas.map(s => (
                    <button
                      key={s.id}
                      onClick={() => { setImportSchemaId(null); handleImportWithSchema(s.id); }}
                      className="block w-full text-left px-3 py-2 text-sm text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700"
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : null}
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
            All ({items.length})
          </button>
          {schemas.map(s => (
            <div key={s.id} className="flex items-center gap-1">
              <button
                onClick={() => setSelectedSchema(selectedSchema === s.id ? undefined : s.id)}
                className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                  selectedSchema === s.id ? 'bg-stone-800 dark:bg-stone-200 text-white dark:text-stone-900' : 'bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700'
                }`}
              >
                {s.name} ({s.item_count})
              </button>
              <Link
                to={`/groups/${gid}/schemas/${s.id}`}
                className="text-stone-400 dark:text-stone-500 hover:text-stone-700 dark:hover:text-stone-200 text-sm"
                title="Edit schema"
              >
                ✎
              </Link>
            </div>
          ))}
        </div>
      </div>

      {/* View mode toggle */}
      <div className="flex items-center gap-2 mb-4">
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
        <span className="text-sm text-stone-400 dark:text-stone-500 ml-2">{items.length} items</span>
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
      {items.length === 0 ? (
        <div className="text-center py-16 text-stone-400 dark:text-stone-500">
          <p className="text-lg mb-2">No items yet</p>
          <p className="text-sm">
            {schemas.length === 0
              ? 'Create a schema first, then add items'
              : 'Add an item to get started'}
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          {items.map(item => (
            <ItemCard
              key={item.id}
              item={item}
              groupId={gid}
              onDelete={() => handleDeleteItem(item.id)}
            />
          ))}
        </div>
      ) : (
        <ItemTable items={items} groupId={gid} schemas={schemas} onDelete={handleDeleteItem} />
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

function ItemTable({ items, groupId, schemas, onDelete }: {
  items: Item[];
  groupId: number;
  schemas: ItemSchema[];
  onDelete: (id: number) => void;
}) {
  // Collect all unique field names across items
  const allFields = new Set<string>();
  items.forEach(item => {
    Object.keys(item.data).forEach(k => allFields.add(k));
  });
  const fields = Array.from(allFields);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-stone-200 dark:border-stone-700">
            <th className="text-left py-2 px-3 text-stone-500 dark:text-stone-400 font-medium">Name</th>
            {fields.slice(0, 6).filter(f => f !== 'name').map(f => (
              <th key={f} className="text-left py-2 px-3 text-stone-500 dark:text-stone-400 font-medium">{f}</th>
            ))}
            <th className="text-left py-2 px-3 text-stone-500 dark:text-stone-400 font-medium">Tags</th>
            <th className="py-2 px-3"></th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.id} className="border-b border-stone-100 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800/50">
              <td className="py-2 px-3">
                <Link to={`/groups/${groupId}/items/${item.id}`} className="text-stone-800 dark:text-stone-200 hover:underline font-medium">
                  {item.name || `Item #${item.id}`}
                </Link>
              </td>
              {fields.slice(0, 6).filter(f => f !== 'name').map(f => (
                <td key={f} className="py-2 px-3 text-stone-600 dark:text-stone-400">
                  {formatValue(item.data[f])}
                </td>
              ))}
              <td className="py-2 px-3">
                {item.tags.map(t => (
                  <span key={t} className="inline-block bg-stone-100 dark:bg-stone-700 text-stone-500 dark:text-stone-400 text-xs px-2 py-0.5 rounded-full mr-1">
                    {t}
                  </span>
                ))}
              </td>
              <td className="py-2 px-3">
                <button onClick={() => onDelete(item.id)} className="text-stone-300 dark:text-stone-600 hover:text-red-400">
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatValue(val: unknown): string {
  if (val == null) return '';
  if (typeof val === 'object' && 'value' in (val as Record<string, unknown>) && 'unit' in (val as Record<string, unknown>)) {
    const v = val as { value: number; unit: string };
    return `${v.value} ${v.unit}`;
  }
  if (Array.isArray(val)) return val.join(', ');
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  return String(val);
}
