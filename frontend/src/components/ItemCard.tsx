import { Link } from 'react-router-dom';
import type { Item } from '../types';
import { api } from '../api';

interface Props {
  item: Item;
  groupId: number;
  onDelete: () => void;
}

export default function ItemCard({ item, groupId, onDelete }: Props) {
  const name = item.name || `Item #${item.id}`;
  const hasImage = item.images.length > 0;
  const category = item.data.category;
  const hasCategory = typeof category === 'string' || typeof category === 'number';
  const thumbUrl = hasImage
    ? api.images.thumbUrl(item.id, item.images[0].id)
    : null;

  return (
    <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700 overflow-hidden hover:border-stone-300 dark:hover:border-stone-600 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 group">
      <Link to={`/groups/${groupId}/items/${item.id}`}>
        {/* Image area */}
        <div className="aspect-square bg-stone-100 dark:bg-stone-800 relative overflow-hidden">
          {thumbUrl ? (
            <img src={thumbUrl} alt={name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-stone-300 dark:text-stone-600">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="p-3">
          <h3 className="font-medium text-stone-800 dark:text-stone-100 text-sm truncate">{name}</h3>
          {hasCategory && (
            <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">{String(category)}</p>
          )}
          {item.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {item.tags.slice(0, 3).map(t => (
                <span key={t} className="bg-stone-100 dark:bg-stone-700 text-stone-500 dark:text-stone-400 text-[10px] px-1.5 py-0.5 rounded max-w-[100px] truncate inline-block" title={t}>
                  {t}
                </span>
              ))}
              {item.tags.length > 3 && (
                <span className="text-stone-400 dark:text-stone-500 text-[10px]">+{item.tags.length - 3}</span>
              )}
            </div>
          )}
        </div>
      </Link>

      {/* Delete button */}
      <button
        onClick={e => {
          e.stopPropagation();
          onDelete();
        }}
        className="absolute top-2 right-2 bg-white/80 dark:bg-stone-800/80 rounded-full p-1 text-stone-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>
    </div>
  );
}
