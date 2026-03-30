import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import type { Group, ItemSchema, Item } from '../types';
import ItemCard from '../components/ItemCard';
import CreateItemModal from '../components/CreateItemModal';

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

  async function handleDeleteItem(itemId: number) {
    if (!confirm('Delete this item?')) return;
    await api.items.delete(gid, itemId);
    setItems(prev => prev.filter(i => i.id !== itemId));
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
        <div>
          <h1 className="text-2xl font-semibold text-stone-800 dark:text-stone-100">{group.name}</h1>
          {group.description && <p className="text-sm text-stone-400 dark:text-stone-500 mt-1">{group.description}</p>}
        </div>
        <div className="flex gap-2">
          <a
            href={api.export.jsonUrl(gid)}
            className="px-3 py-1.5 text-sm border border-stone-300 dark:border-stone-600 rounded-lg text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800"
          >
            Export JSON
          </a>
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
          <form onSubmit={handleCreateSchema} className="flex gap-2 mb-3">
            <input
              value={newSchemaName}
              onChange={e => setNewSchemaName(e.target.value)}
              className="flex-1 px-3 py-1.5 border border-stone-300 dark:border-stone-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-stone-400 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200"
              placeholder="Schema name (e.g. ClothingItem)"
              autoFocus
            />
            <button type="submit" className="px-3 py-1.5 bg-stone-800 dark:bg-stone-200 text-white dark:text-stone-900 rounded-lg text-sm">
              Create
            </button>
          </form>
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
