import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { Group } from '../types';

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');

  useEffect(() => {
    loadGroups();
  }, []);

  async function loadGroups() {
    try {
      const data = await api.groups.list();
      setGroups(data);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    await api.groups.create({ name: newName.trim(), description: newDesc.trim() });
    setNewName('');
    setNewDesc('');
    setShowCreate(false);
    loadGroups();
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this group and all its items?')) return;
    await api.groups.delete(id);
    loadGroups();
  }

  if (loading) {
    return (
      <div />
    );
  }

  return (
    <div className="animate-content-in">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-stone-800 dark:text-stone-100">Collections</h1>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="px-4 py-2 bg-stone-800 dark:bg-stone-200 text-white dark:text-stone-900 rounded-lg text-sm font-medium hover:bg-stone-700 dark:hover:bg-stone-300 transition-colors"
        >
          + New Collection
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700 p-5 mb-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-stone-600 dark:text-stone-300 mb-1">Name</label>
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                className="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-stone-400 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200"
                placeholder="e.g. Clothing, Pantry, DND Dice"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-600 dark:text-stone-300 mb-1">Description</label>
              <input
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                className="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-stone-400 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200"
                placeholder="Optional description"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button type="submit" className="px-4 py-2 bg-stone-800 dark:bg-stone-200 text-white dark:text-stone-900 rounded-lg text-sm font-medium hover:bg-stone-700 dark:hover:bg-stone-300">
              Create
            </button>
            <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-stone-500 dark:text-stone-400 text-sm hover:text-stone-700 dark:hover:text-stone-200">
              Cancel
            </button>
          </div>
        </form>
      )}

      {groups.length === 0 ? (
        <div className="text-center py-16 text-stone-400 dark:text-stone-500">
          <p className="text-lg mb-2">No collections yet</p>
          <p className="text-sm">Create one to start organizing your items</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map(group => (
            <Link
              key={group.id}
              to={`/groups/${group.id}`}
              className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700 hover:border-stone-300 dark:hover:border-stone-600 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 group overflow-hidden"
            >
              {group.thumbnail && (
                <div className="h-32 bg-stone-100 dark:bg-stone-800">
                  <img
                    src={`${api.groups.thumbnailUrl(group.id)}?v=${group.updated_at}`}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="font-semibold text-stone-800 dark:text-stone-100 group-hover:text-stone-900 dark:group-hover:text-white">{group.name}</h2>
                    {group.description && (
                      <p className="text-sm text-stone-400 dark:text-stone-500 mt-1">{group.description}</p>
                    )}
                  </div>
                  <button
                    onClick={e => {
                      e.preventDefault();
                      handleDelete(group.id);
                    }}
                    className="text-stone-300 dark:text-stone-600 hover:text-red-400 transition-colors p-1 opacity-0 group-hover:opacity-100"
                    title="Delete"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
                <div className="flex gap-4 mt-4 text-xs text-stone-400 dark:text-stone-500">
                  <span>{group.schema_count} schema{group.schema_count !== 1 ? 's' : ''}</span>
                  <span>{group.item_count} item{group.item_count !== 1 ? 's' : ''}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
