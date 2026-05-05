import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import type { Group, Item, ItemSchema } from '../types';

interface FacetOption {
  value: string;
  count: number;
}

interface Facet {
  type: string;
  field: string;
  options?: FacetOption[];
  min?: number | null;
  max?: number | null;
  unit?: string;
  units?: string[];
  true_count?: number;
  false_count?: number;
}

interface TagFacet {
  tag: string;
  count: number;
}

function parseTagSelection(rawTags: string | null): Set<string> {
  if (!rawTags) return new Set();
  return new Set(rawTags.split(',').map(tag => tag.trim()).filter(Boolean));
}

function parseFilterState(rawFilters: string | null) {
  const checkboxFilters: Record<string, Set<string>> = {};
  const dropdownFilters: Record<string, string> = {};
  const rangeFilters: Record<string, { min: string; max: string }> = {};

  if (!rawFilters) {
    return { checkboxFilters, dropdownFilters, rangeFilters };
  }

  try {
    const parsed = JSON.parse(rawFilters) as Array<{ field: string; op: string; value: unknown }>;
    for (const filter of parsed) {
      const baseField = filter.field.endsWith('.value') ? filter.field.slice(0, -6) : filter.field;

      if (filter.op === 'in' && Array.isArray(filter.value)) {
        checkboxFilters[baseField] = new Set(filter.value.map(value => String(value)));
        continue;
      }

      if (filter.op === '=') {
        dropdownFilters[baseField] = String(filter.value);
        continue;
      }

      if (filter.op === '>=' || filter.op === '<=') {
        rangeFilters[baseField] = rangeFilters[baseField] || { min: '', max: '' };
        if (filter.op === '>=') rangeFilters[baseField].min = String(filter.value ?? '');
        if (filter.op === '<=') rangeFilters[baseField].max = String(filter.value ?? '');
      }
    }
  } catch {
    return { checkboxFilters: {}, dropdownFilters: {}, rangeFilters: {} };
  }

  return { checkboxFilters, dropdownFilters, rangeFilters };
}

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const restoredFilterState = parseFilterState(searchParams.get('filters'));
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [groups, setGroups] = useState<Group[]>([]);
  const [schemas, setSchemas] = useState<ItemSchema[]>([]);
  const [groupFilter, setGroupFilter] = useState<number | ''>(searchParams.get('group_id') ? Number(searchParams.get('group_id')) : '');
  const [schemaFilter, setSchemaFilter] = useState<number | ''>(searchParams.get('schema_id') ? Number(searchParams.get('schema_id')) : '');
  const [results, setResults] = useState<Item[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);

  // Facets
  const [facets, setFacets] = useState<Record<string, Facet>>({});
  const [tags, setTags] = useState<TagFacet[]>([]);

  // Filter state
  const [selectedTags, setSelectedTags] = useState<Set<string>>(() => parseTagSelection(searchParams.get('tag')));
  const [checkboxFilters, setCheckboxFilters] = useState<Record<string, Set<string>>>(() => restoredFilterState.checkboxFilters);
  const [dropdownFilters, setDropdownFilters] = useState<Record<string, string>>(() => restoredFilterState.dropdownFilters);
  const [rangeFilters, setRangeFilters] = useState<Record<string, { min: string; max: string }>>(() => restoredFilterState.rangeFilters);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [facetsLoading, setFacetsLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [gridCols, setGridCols] = useState(4);

  // Range version counter to trigger search after debounce
  const [rangeVersion, setRangeVersion] = useState(0);

  // Debounce ref for range inputs
  const rangeTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const initializedGroupRef = useRef(false);
  const previousGroupFilterRef = useRef<number | ''>(groupFilter);
  const previousSchemaFilterRef = useRef<number | ''>(schemaFilter);

  useEffect(() => { api.groups.list().then(setGroups); }, []);

  // Load schemas when group changes
  useEffect(() => {
    if (groupFilter) {
      api.schemas.list(groupFilter).then(setSchemas);
    } else {
      setSchemas([]);
      setSchemaFilter('');
    }
  }, [groupFilter]);

  // Load facets when group or filters change (dynamic counts)
  useEffect(() => {
    const isInitialLoad = !initializedGroupRef.current;
    const previousGroup = previousGroupFilterRef.current;
    const previousSchema = previousSchemaFilterRef.current;
    initializedGroupRef.current = true;
    previousGroupFilterRef.current = groupFilter;
    previousSchemaFilterRef.current = schemaFilter;

    if (groupFilter) {
      setFacetsLoading(true);
      const filterArray = buildFilterArray();
      const tagParam = Array.from(selectedTags).join(',');
      api.facets(
        groupFilter,
        filterArray.length ? JSON.stringify(filterArray) : undefined,
        tagParam || undefined,
        schemaFilter || undefined,
      ).then(data => {
        setFacets(data.facets);
        setTags(data.tags);
      }).finally(() => setFacetsLoading(false));
    } else {
      setFacets({});
      setTags([]);
    }

    if (!isInitialLoad && (previousGroup !== groupFilter || previousSchema !== schemaFilter)) {
      setSelectedTags(new Set());
      setCheckboxFilters({});
      setDropdownFilters({});
      setRangeFilters({});
    }
  }, [groupFilter, schemaFilter, checkboxFilters, dropdownFilters, rangeVersion, selectedTags]);

  const buildFilterArray = useCallback(() => {
    const filters: { field: string; op: string; value: unknown }[] = [];
    // Checkbox filters → IN operator (multiselect)
    for (const [field, values] of Object.entries(checkboxFilters)) {
      const arr = Array.from(values);
      if (arr.length > 0) {
        filters.push({ field, op: 'in', value: arr });
      }
    }
    // Dropdown filters → exact match (single-select), hierarchy parent uses LIKE
    for (const [field, value] of Object.entries(dropdownFilters)) {
      if (value) {
        const facet = facets[field];
        // For hierarchy fields with a parent-only selection, match children too
        if (facet?.type === 'hierarchy' && !value.includes(' > ')) {
          filters.push({ field, op: 'in', value: [value, ...((facet.options || []).filter(o => o.value.startsWith(value + ' > ')).map(o => o.value))] });
        } else {
          filters.push({ field, op: '=', value });
        }
      }
    }
    // Range filters → >= and <=
    for (const [field, range] of Object.entries(rangeFilters)) {
      const facet = facets[field];
      if (facet?.type === 'unit') {
        if (range.min) filters.push({ field: field + '.value', op: '>=', value: parseFloat(range.min) });
        if (range.max) filters.push({ field: field + '.value', op: '<=', value: parseFloat(range.max) });
      } else if (facet?.type === 'range') {
        if (range.min) filters.push({ field: field + '.min', op: '>=', value: parseFloat(range.min) });
        if (range.max) filters.push({ field: field + '.max', op: '<=', value: parseFloat(range.max) });
      } else {
        if (range.min) filters.push({ field, op: '>=', value: parseFloat(range.min) });
        if (range.max) filters.push({ field, op: '<=', value: parseFloat(range.max) });
      }
    }
    return filters;
  }, [checkboxFilters, dropdownFilters, rangeFilters, facets]);

  async function doSearch() {
    setLoading(true);
    try {
      const filterArray = buildFilterArray();
      const tagParam = Array.from(selectedTags).join(',');
      const res = await api.search({
        q: query.trim(),
        group_id: groupFilter || undefined,
        tag: tagParam || undefined,
        filters: filterArray.length ? JSON.stringify(filterArray) : undefined,
      });
      // Filter by schema on the client side if selected
      const filtered = schemaFilter
        ? res.filter(item => item.schema_id === schemaFilter)
        : res;
      setResults(filtered);
      setSearched(true);

      // Update URL params
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      if (groupFilter) params.set('group_id', String(groupFilter));
      if (schemaFilter) params.set('schema_id', String(schemaFilter));
      if (tagParam) params.set('tag', tagParam);
      if (filterArray.length) params.set('filters', JSON.stringify(filterArray));
      setSearchParams(params, { replace: true });
    } finally {
      setLoading(false);
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    doSearch();
  }

  // Toggle a tag checkbox
  function toggleTag(tag: string) {
    setSelectedTags(prev => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag); else next.add(tag);
      return next;
    });
  }

  // Toggle a checkbox within a field facet
  function toggleCheckbox(field: string, value: string) {
    setCheckboxFilters(prev => {
      const existing = prev[field] || new Set();
      const next = new Set(existing);
      if (next.has(value)) next.delete(value); else next.add(value);
      return { ...prev, [field]: next };
    });
  }

  // Update a range filter (with debounced search)
  function updateRange(field: string, which: 'min' | 'max', val: string) {
    setRangeFilters(prev => ({
      ...prev,
      [field]: { ...prev[field] || { min: '', max: '' }, [which]: val },
    }));
    // Debounce search for range inputs
    if (rangeTimerRef.current) clearTimeout(rangeTimerRef.current);
    rangeTimerRef.current = setTimeout(() => {
      // Trigger search via effect
      setRangeVersion(v => v + 1);
    }, 600);
  }

  // Run search on mount if URL has search params
  const initialSearchDone = useRef(false);
  useEffect(() => {
    if (!initialSearchDone.current && (searchParams.get('q') || searchParams.get('group_id') || searchParams.get('schema_id') || searchParams.get('tag') || searchParams.get('filters'))) {
      initialSearchDone.current = true;
      // Let facets load first, then search
      setTimeout(() => doSearch(), 300);
    }
  }, []);

  // Toggle section collapse
  function toggleSection(name: string) {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  // Clear all filters
  function clearAll() {
    setSelectedTags(new Set());
    setCheckboxFilters({});
    setDropdownFilters({});
    setRangeFilters({});
  }

  // Auto-search when filters change
  useEffect(() => {
    const hasTags = selectedTags.size > 0;
    const hasCheckboxes = Object.values(checkboxFilters).some(s => s.size > 0);
    const hasDropdowns = Object.values(dropdownFilters).some(v => v);
    const hasRanges = Object.values(rangeFilters).some(r => r.min || r.max);
    if (hasTags || hasCheckboxes || hasDropdowns || hasRanges || searched) {
      doSearch();
    }
  }, [selectedTags, checkboxFilters, dropdownFilters, rangeVersion, schemaFilter]);

  function fieldDisplay(data: Record<string, unknown>) {
    const entries = Object.entries(data).slice(0, 4);
    return entries.map(([k, v]) => {
      let display = '';
      if (v && typeof v === 'object' && 'name' in (v as Record<string, unknown>)) {
        display = (v as { name: string }).name;
      } else if (v && typeof v === 'object' && 'min' in (v as Record<string, unknown>) && 'max' in (v as Record<string, unknown>)) {
        const r = v as { min: number; max: number };
        display = `${r.min} – ${r.max}`;
      } else if (v && typeof v === 'object' && 'value' in (v as Record<string, unknown>)) {
        const u = v as { value: number; unit: string };
        display = `${u.value} ${u.unit}`;
      } else if (Array.isArray(v)) {
        display = v.map(item => {
          if (item && typeof item === 'object' && 'name' in item) return item.name;
          if (item && typeof item === 'object' && 'key' in item && 'value' in item) return `${(item as {key:string}).key}: ${(item as {value:string}).value}`;
          if (item && typeof item === 'object' && 'text' in item) return `${(item as {checked:boolean}).checked ? '☑' : '☐'} ${(item as {text:string}).text}`;
          if (item && typeof item === 'object' && 'value' in item && 'unit' in item) return `${(item as {value:number; unit:string}).value} ${(item as {value:number; unit:string}).unit}`;
          return String(item);
        }).join(', ');
      } else if (typeof v === 'boolean') {
        display = v ? 'Yes' : 'No';
      } else if (v && typeof v === 'object') {
        // Fallback for unrecognized objects - try JSON or key summary
        try { display = JSON.stringify(v); if (display.length > 60) display = display.slice(0, 60) + '…'; } catch { display = ''; }
      } else {
        const s = String(v ?? '');
        display = s.length > 60 ? s.slice(0, 60) + '…' : s;
      }
      return (
        <span key={k} className="text-xs text-stone-500 dark:text-stone-400">
          <span className="text-stone-400 dark:text-stone-500">{k}:</span> {display}
        </span>
      );
    });
  }

  const hasAnyFilter = selectedTags.size > 0
    || Object.values(checkboxFilters).some(s => s.size > 0)
    || Object.values(dropdownFilters).some(v => v)
    || Object.values(rangeFilters).some(r => r.min || r.max);
  const hasSidebar = Object.keys(facets).length > 0 || tags.length > 0 || hasAnyFilter;
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const activeFilterCount = (selectedTags.size)
    + Object.values(checkboxFilters).reduce((n, s) => n + s.size, 0)
    + Object.values(dropdownFilters).filter(v => v).length
    + Object.values(rangeFilters).filter(r => r.min || r.max).length;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-stone-800 dark:text-stone-100 mb-6">Search</h1>

      <form onSubmit={handleSearch} className="flex flex-wrap gap-2 mb-6">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search items, tags, fields..."
          className="flex-1 px-4 py-2.5 border border-stone-300 dark:border-stone-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-400 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200"
          autoFocus
        />
        <select
          value={groupFilter}
          onChange={e => setGroupFilter(e.target.value ? Number(e.target.value) : '')}
          className="px-3 py-2.5 border border-stone-300 dark:border-stone-600 rounded-lg text-sm bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200"
        >
          <option value="">All Collections</option>
          {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        {schemas.length > 0 && (
          <select
            value={schemaFilter}
            onChange={e => setSchemaFilter(e.target.value ? Number(e.target.value) : '')}
            className="px-3 py-2.5 border border-stone-300 dark:border-stone-600 rounded-lg text-sm bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200"
          >
            <option value="">Any Schema</option>
            {schemas.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        <button
          type="submit"
          className="px-5 py-2.5 bg-stone-800 dark:bg-stone-200 text-white dark:text-stone-900 rounded-lg text-sm font-medium hover:bg-stone-700 dark:hover:bg-stone-300"
        >
          Search
        </button>
      </form>

      {/* Mobile filter toggle */}
      {hasSidebar && (
        <button
          onClick={() => setSidebarOpen(true)}
          className="md:hidden flex items-center gap-2 mb-4 px-4 py-2 bg-stone-100 dark:bg-stone-800 rounded-lg text-sm font-medium text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-700"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
          Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
        </button>
      )}

      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <div className="flex gap-6">
        {/* Sidebar filters */}
        {hasSidebar && (
          <aside className={`
            fixed inset-y-0 left-0 z-50 w-72 bg-white dark:bg-stone-900 shadow-xl p-5 overflow-y-auto transition-transform duration-200 ease-in-out
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
            md:static md:translate-x-0 md:w-60 md:shadow-none md:p-0 md:z-auto md:bg-transparent md:dark:bg-transparent
            shrink-0 space-y-1
          `}>
            {/* Mobile close button */}
            <div className="flex items-center justify-between mb-3 md:hidden">
              <span className="text-sm font-semibold text-stone-700 dark:text-stone-200">Filters</span>
              <button onClick={() => setSidebarOpen(false)} className="p-1 rounded hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-500">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            {facetsLoading && (
              <div className="flex items-center gap-2 text-xs text-stone-400 dark:text-stone-500 py-1">
                <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" className="opacity-25" stroke="currentColor" strokeWidth="3" />
                  <path d="M22 12a10 10 0 00-10-10" className="opacity-75" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
                Updating filters...
              </div>
            )}
            {/* Tags */}
            {tags.length > 0 && (
              <FilterSection title="Tags" collapsed={collapsedSections.has('_tags')} onToggle={() => toggleSection('_tags')}>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {tags.map(t => (
                    <label key={t.tag} className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-stone-50 dark:hover:bg-stone-800 cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={selectedTags.has(t.tag)}
                        onChange={() => toggleTag(t.tag)}
                        className="rounded border-stone-300 dark:border-stone-600 text-stone-700 dark:text-stone-300 focus:ring-stone-400 w-3.5 h-3.5"
                      />
                      <span className="text-stone-600 dark:text-stone-300 flex-1 truncate">{t.tag}</span>
                      <span className="text-stone-400 dark:text-stone-500 tabular-nums">{t.count}</span>
                    </label>
                  ))}
                </div>
              </FilterSection>
            )}

            {/* Field facets */}
            {Object.entries(facets).map(([fieldName, facet]) => {
              const sectionKey = `facet_${fieldName}`;
              const collapsed = collapsedSections.has(sectionKey);

              if (facet.type === 'dropdown') {
                const opts = facet.options || [];
                if (opts.length === 0) return null;
                const selectedVal = dropdownFilters[fieldName] || '';
                return (
                  <FilterSection key={fieldName} title={fieldName} collapsed={collapsed} onToggle={() => toggleSection(sectionKey)}>
                    <select
                      value={selectedVal}
                      onChange={e => setDropdownFilters(prev => ({ ...prev, [fieldName]: e.target.value }))}
                      className="w-full px-2 py-1.5 border border-stone-300 dark:border-stone-600 rounded text-xs bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200 focus:outline-none focus:ring-1 focus:ring-stone-400"
                    >
                      <option value="">Any</option>
                      {opts.map(opt => (
                        <option key={opt.value} value={opt.value}>
                          {opt.value} ({opt.count})
                        </option>
                      ))}
                    </select>
                  </FilterSection>
                );
              }

              if (facet.type === 'hierarchy') {
                const opts = facet.options || [];
                if (opts.length === 0) return null;
                const selectedVal = dropdownFilters[fieldName] || '';
                // Group options by parent
                const parents: string[] = [];
                const childrenMap: Record<string, { value: string; count: number }[]> = {};
                for (const opt of opts) {
                  if (opt.value.includes(' > ')) {
                    const parent = opt.value.split(' > ')[0];
                    if (!childrenMap[parent]) childrenMap[parent] = [];
                    childrenMap[parent].push(opt);
                  } else {
                    parents.push(opt.value);
                  }
                }
                const selectedParent = selectedVal.includes(' > ') ? selectedVal.split(' > ')[0] : selectedVal;
                const selectedChild = selectedVal.includes(' > ') ? selectedVal : '';
                const childOpts = selectedParent ? (childrenMap[selectedParent] || []) : [];
                return (
                  <FilterSection key={fieldName} title={fieldName} collapsed={collapsed} onToggle={() => toggleSection(sectionKey)}>
                    <div className="space-y-2">
                      <div>
                        <label className="block text-[10px] uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-1 font-medium">Category</label>
                        <select
                          value={selectedParent}
                          onChange={e => setDropdownFilters(prev => ({ ...prev, [fieldName]: e.target.value }))}
                          className="w-full px-2 py-1.5 border border-stone-300 dark:border-stone-600 rounded text-xs bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200 focus:outline-none focus:ring-1 focus:ring-stone-400"
                        >
                          <option value="">Any</option>
                          {parents.map(p => {
                            const pOpt = opts.find(o => o.value === p);
                            const childrenCount = (childrenMap[p] || []).reduce((sum, c) => sum + c.count, 0);
                            const totalCount = (pOpt?.count ?? 0) + childrenCount;
                            return <option key={p} value={p}>{p} ({totalCount})</option>;
                          })}
                        </select>
                      </div>
                      {selectedParent && childOpts.length > 0 && (
                        <div className="pl-3 border-l-2 border-stone-200 dark:border-stone-700">
                          <label className="block text-[10px] uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-1 font-medium">Subcategory</label>
                          <select
                            value={selectedChild}
                            onChange={e => setDropdownFilters(prev => ({ ...prev, [fieldName]: e.target.value || selectedParent }))}
                            className="w-full px-2 py-1.5 border border-stone-300 dark:border-stone-600 rounded text-xs bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200 focus:outline-none focus:ring-1 focus:ring-stone-400"
                          >
                            <option value="">All</option>
                            {childOpts.map(c => (
                              <option key={c.value} value={c.value}>{c.value.split(' > ')[1]} ({c.count})</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  </FilterSection>
                );
              }

              if (facet.type === 'multiselect') {
                const opts = facet.options || [];
                if (opts.length === 0) return null;
                const selected = checkboxFilters[fieldName] || new Set();
                return (
                  <FilterSection key={fieldName} title={fieldName} collapsed={collapsed} onToggle={() => toggleSection(sectionKey)}>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {opts.map(opt => (
                        <label key={opt.value} className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-stone-50 dark:hover:bg-stone-800 cursor-pointer text-xs">
                          <input
                            type="checkbox"
                            checked={selected.has(opt.value)}
                            onChange={() => toggleCheckbox(fieldName, opt.value)}
                            className="rounded border-stone-300 dark:border-stone-600 text-stone-700 dark:text-stone-300 focus:ring-stone-400 w-3.5 h-3.5"
                          />
                          <span className="text-stone-600 dark:text-stone-300 flex-1 truncate">{opt.value}</span>
                          <span className="text-stone-400 dark:text-stone-500 tabular-nums">{opt.count}</span>
                        </label>
                      ))}
                    </div>
                  </FilterSection>
                );
              }

              if (facet.type === 'string') {
                const opts = facet.options || [];
                if (opts.length === 0) return null;
                const selected = checkboxFilters[fieldName] || new Set();
                return (
                  <FilterSection key={fieldName} title={fieldName} collapsed={collapsed} onToggle={() => toggleSection(sectionKey)}>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {opts.map(opt => (
                        <label key={opt.value} className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-stone-50 dark:hover:bg-stone-800 cursor-pointer text-xs">
                          <input
                            type="checkbox"
                            checked={selected.has(opt.value)}
                            onChange={() => toggleCheckbox(fieldName, opt.value)}
                            className="rounded border-stone-300 dark:border-stone-600 text-stone-700 dark:text-stone-300 focus:ring-stone-400 w-3.5 h-3.5"
                          />
                          <span className="text-stone-600 dark:text-stone-300 flex-1 truncate">{opt.value}</span>
                          <span className="text-stone-400 dark:text-stone-500 tabular-nums">{opt.count}</span>
                        </label>
                      ))}
                    </div>
                  </FilterSection>
                );
              }

              if (facet.type === 'boolean') {
                const selected = checkboxFilters[fieldName] || new Set();
                return (
                  <FilterSection key={fieldName} title={fieldName} collapsed={collapsed} onToggle={() => toggleSection(sectionKey)}>
                    <div className="space-y-1">
                      <label className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-stone-50 dark:hover:bg-stone-800 cursor-pointer text-xs">
                        <input
                          type="checkbox"
                          checked={selected.has('true')}
                          onChange={() => toggleCheckbox(fieldName, 'true')}
                          className="rounded border-stone-300 dark:border-stone-600 text-stone-700 dark:text-stone-300 focus:ring-stone-400 w-3.5 h-3.5"
                        />
                        <span className="text-stone-600 dark:text-stone-300 flex-1">Yes</span>
                        <span className="text-stone-400 dark:text-stone-500 tabular-nums">{facet.true_count ?? 0}</span>
                      </label>
                      <label className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-stone-50 dark:hover:bg-stone-800 cursor-pointer text-xs">
                        <input
                          type="checkbox"
                          checked={selected.has('false')}
                          onChange={() => toggleCheckbox(fieldName, 'false')}
                          className="rounded border-stone-300 dark:border-stone-600 text-stone-700 dark:text-stone-300 focus:ring-stone-400 w-3.5 h-3.5"
                        />
                        <span className="text-stone-600 dark:text-stone-300 flex-1">No</span>
                        <span className="text-stone-400 dark:text-stone-500 tabular-nums">{facet.false_count ?? 0}</span>
                      </label>
                    </div>
                  </FilterSection>
                );
              }

              if (facet.type === 'int' || facet.type === 'float' || facet.type === 'unit' || facet.type === 'range') {
                // Hide range filter if min equals max (single value)
                if (facet.min != null && facet.max != null && facet.min === facet.max) return null;
                const range = rangeFilters[fieldName] || { min: '', max: '' };
                const unitLabel = facet.units?.length ? ` (${facet.units.join(', ')})` : facet.unit ? ` (${facet.unit})` : '';
                return (
                  <FilterSection key={fieldName} title={fieldName + unitLabel} collapsed={collapsed} onToggle={() => toggleSection(sectionKey)}>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={range.min}
                        onChange={e => updateRange(fieldName, 'min', e.target.value)}
                        placeholder={facet.min != null ? String(facet.min) : 'Min'}
                        className="w-full px-2 py-1.5 border border-stone-300 dark:border-stone-600 rounded text-xs bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200 focus:outline-none focus:ring-1 focus:ring-stone-400"
                      />
                      <span className="text-stone-400 text-xs">—</span>
                      <input
                        type="number"
                        value={range.max}
                        onChange={e => updateRange(fieldName, 'max', e.target.value)}
                        placeholder={facet.max != null ? String(facet.max) : 'Max'}
                        className="w-full px-2 py-1.5 border border-stone-300 dark:border-stone-600 rounded text-xs bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200 focus:outline-none focus:ring-1 focus:ring-stone-400"
                      />
                    </div>
                    {facet.min != null && facet.max != null && (
                      <p className="text-[10px] text-stone-400 dark:text-stone-500 mt-1">
                        Range: {facet.min} – {facet.max}
                      </p>
                    )}
                  </FilterSection>
                );
              }

              return null;
            })}

            {/* Clear filters */}
            {hasAnyFilter && (
              <button
                onClick={clearAll}
                className="text-xs text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300 underline mt-2"
              >
                Clear all filters
              </button>
            )}
          </aside>
        )}

        {/* Results */}
        <div className="flex-1">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <svg className="h-8 w-8 animate-spin text-stone-400 dark:text-stone-500" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="10" className="opacity-25" stroke="currentColor" strokeWidth="3" />
                <path d="M22 12a10 10 0 00-10-10" className="opacity-90" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            </div>
          )}

          {!loading && searched && results.length === 0 && (
            <p className="text-stone-400 dark:text-stone-500 text-center py-12">No results found.</p>
          )}

          {!loading && results.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-3">
                <p className="text-sm text-stone-400 dark:text-stone-500">{results.length} result{results.length === 1 ? '' : 's'}</p>
                <div className="ml-auto flex items-center gap-1">
                  <button
                    onClick={() => setViewMode('list')}
                    className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-stone-200 dark:bg-stone-700' : 'hover:bg-stone-100 dark:hover:bg-stone-800'}`}
                    title="List view"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-stone-600 dark:text-stone-300" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-stone-200 dark:bg-stone-700' : 'hover:bg-stone-100 dark:hover:bg-stone-800'}`}
                    title="Grid view"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-stone-600 dark:text-stone-300" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                    </svg>
                  </button>
                </div>
                {viewMode === 'grid' && (
                  <div className="flex items-center gap-1 border border-stone-200 dark:border-stone-700 rounded-lg overflow-hidden">
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
              </div>
              {viewMode === 'grid' ? (
                <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}>
                  {results.map(item => {
                    const primaryImage = item.images?.[0];
                    const thumbUrl = primaryImage ? api.images.url(item.uuid, primaryImage.id) : null;
                    return (
                      <Link
                        key={item.id}
                        to={`/groups/${item.group_id}/items/${item.uuid}`}
                        className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700 overflow-hidden hover:border-stone-300 dark:hover:border-stone-600 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
                      >
                        <div className="aspect-square bg-stone-100 dark:bg-stone-800 relative overflow-hidden">
                          {thumbUrl ? (
                            <img src={thumbUrl} alt="" className="w-full h-full object-contain" loading="lazy" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-stone-300 dark:text-stone-600">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            </div>
                          )}
                        </div>
                        <div className="p-3">
                          <h3 className="font-medium text-stone-800 dark:text-stone-100 text-sm truncate">{item.name || `Item #${item.id}`}</h3>
                          {item.tags && item.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {item.tags.slice(0, 3).map(t => (
                                <span key={t} className="text-[10px] bg-stone-100 dark:bg-stone-700 text-stone-500 dark:text-stone-400 px-1.5 py-0.5 rounded">{t}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              ) : (
              <div className="space-y-2">
              {results.map(item => {
                const primaryImage = item.images?.[0];
                return (
                <Link
                  key={item.id}
                  to={`/groups/${item.group_id}/items/${item.uuid}`}
                  className="flex bg-white dark:bg-stone-900 rounded-lg border border-stone-200 dark:border-stone-700 hover:border-stone-300 dark:hover:border-stone-600 transition-colors overflow-hidden"
                >
                  {primaryImage && (
                    <div className="w-20 sm:w-24 shrink-0 bg-stone-100 dark:bg-stone-800 self-stretch">
                      <img
                        src={api.images.thumbUrl(item.uuid, primaryImage.id)}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>
                  )}
                  <div className="flex-1 py-3 px-4 min-w-0">
                    <span className="font-medium text-stone-700 dark:text-stone-200">{item.name}</span>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                      {fieldDisplay(item.data)}
                    </div>
                    {item.tags && item.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {item.tags.map(t => (
                          <span key={t} className="text-xs bg-stone-100 dark:bg-stone-700 text-stone-500 dark:text-stone-400 px-1.5 py-0.5 rounded">{t}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </Link>
                );
              })}
              </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---- Collapsible filter section ---- */
function FilterSection({ title, collapsed, onToggle, children }: {
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-stone-200 dark:border-stone-700 pb-3 pt-2">
      <button
        onClick={onToggle}
        className="flex items-center justify-between w-full text-left mb-2"
      >
        <h3 className="text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wide">
          {title.replace(/_/g, ' ')}
        </h3>
        <span className="text-stone-400 dark:text-stone-500 text-[10px]">{collapsed ? '▸' : '▾'}</span>
      </button>
      {!collapsed && children}
    </div>
  );
}
