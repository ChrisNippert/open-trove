import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import type { ItemSchema, SchemaDefinition, FieldDef, Group } from '../types';

const FIELD_TYPES = [
  'string', 'textarea', 'int', 'float', 'boolean', 'date', 'datetime',
  'dropdown', 'multiselect', 'hierarchy', 'unit', 'computed', 'image', 'link', 'url',
];

const UNIT_CATEGORIES = ['mass', 'volume', 'length', 'currency', 'count'];

// Compatible type conversions (no data-loss warning needed)
const SAFE_CONVERSIONS: Record<string, string[]> = {
  string: ['textarea', 'dropdown'],
  textarea: ['string', 'dropdown'],
  int: ['float', 'string', 'textarea'],
  float: ['int', 'string', 'textarea'],
  boolean: ['string', 'textarea'],
  dropdown: ['string', 'textarea', 'multiselect'],
  multiselect: ['dropdown', 'string', 'textarea'],
};

export default function SchemaEditorPage() {
  const { groupId, schemaId } = useParams<{ groupId: string; schemaId: string }>();
  const gid = Number(groupId);
  const sid = Number(schemaId);
  const navigate = useNavigate();

  const [schema, setSchema] = useState<ItemSchema | null>(null);
  const [definition, setDefinition] = useState<SchemaDefinition>({ sections: {} });
  const [name, setName] = useState('');
  const [groupName, setGroupName] = useState('Group');
  const [saving, setSaving] = useState(false);
  const [newSection, setNewSection] = useState('');
  const [newFieldSection, setNewFieldSection] = useState<string | null>(null);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState('string');
  const [showJsonImport, setShowJsonImport] = useState(false);
  const [jsonImportText, setJsonImportText] = useState('');
  const [jsonError, setJsonError] = useState('');
  const [copyFeedback, setCopyFeedback] = useState<'idle' | 'success' | 'error'>('idle');
  const [allGroups, setAllGroups] = useState<Group[]>([]);
  const [dragSectionIdx, setDragSectionIdx] = useState<number | null>(null);
  const [dragOverSectionIdx, setDragOverSectionIdx] = useState<number | null>(null);
  const [dragField, setDragField] = useState<{ section: string; name: string; index: number } | null>(null);
  const [dragOverField, setDragOverField] = useState<{ section: string; index: number } | null>(null);

  useEffect(() => {
    loadSchema();
    api.groups.list().then(setAllGroups);
    api.groups.get(gid).then(g => setGroupName(g.name)).catch(() => undefined);
  }, [gid, sid]);

  async function loadSchema() {
    const s = await api.schemas.get(gid, sid);
    setSchema(s);
    setName(s.name);
    setDefinition(s.definition || { sections: {} });
  }

  async function handleSave() {
    setSaving(true);
    try {
      await api.schemas.update(gid, sid, { name, definition });
      navigate(`/groups/${gid}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this schema and all its items?')) return;
    await api.schemas.delete(gid, sid);
    navigate(`/groups/${gid}`);
  }

  async function handleCopyJson() {
    const jsonText = JSON.stringify(definition, null, 2);

    async function fallbackCopy() {
      const textarea = document.createElement('textarea');
      textarea.value = jsonText;
      textarea.setAttribute('readonly', 'true');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (!copied) throw new Error('Clipboard copy failed');
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(jsonText);
      } else {
        await fallbackCopy();
      }
      setCopyFeedback('success');
    } catch {
      try {
        await fallbackCopy();
        setCopyFeedback('success');
      } catch {
        setCopyFeedback('error');
      }
    }

    window.setTimeout(() => setCopyFeedback('idle'), 1500);
  }

  function addSection() {
    if (!newSection.trim()) return;
    setDefinition(prev => ({
      ...prev,
      sections: { ...prev.sections, [newSection.trim()]: {} },
    }));
    setNewSection('');
  }

  function renameSection(oldName: string, newName: string) {
    if (!newName.trim() || newName === oldName) return;
    setDefinition(prev => {
      const entries = Object.entries(prev.sections);
      const newSections: typeof prev.sections = {};
      for (const [key, val] of entries) {
        newSections[key === oldName ? newName.trim() : key] = val;
      }
      return { ...prev, sections: newSections };
    });
  }

  function removeSection(sectionName: string) {
    setDefinition(prev => {
      const { [sectionName]: _, ...rest } = prev.sections;
      return { ...prev, sections: rest };
    });
  }

  function reorderSection(fromIdx: number, toIdx: number) {
    setDefinition(prev => {
      const entries = Object.entries(prev.sections);
      const [moved] = entries.splice(fromIdx, 1);
      entries.splice(toIdx, 0, moved);
      const reordered: Record<string, Record<string, FieldDef>> = {};
      for (const [k, v] of entries) reordered[k] = v;
      return { ...prev, sections: reordered };
    });
  }

  function moveFieldToIndex(fromSection: string, fieldName: string, toSection: string, toIndex: number) {
    setDefinition(prev => {
      const fieldDef = prev.sections[fromSection][fieldName];
      const fromEntries = Object.entries(prev.sections[fromSection]).filter(([k]) => k !== fieldName);
      let toEntries: [string, FieldDef][];
      if (fromSection === toSection) {
        toEntries = [...fromEntries];
      } else {
        toEntries = Object.entries(prev.sections[toSection]);
      }
      const insertIdx = Math.min(toIndex, toEntries.length);
      toEntries.splice(insertIdx, 0, [fieldName, fieldDef]);
      const rebuild = (entries: [string, FieldDef][]) => {
        const obj: Record<string, FieldDef> = {};
        for (const [k, v] of entries) obj[k] = v;
        return obj;
      };
      if (fromSection === toSection) {
        return { ...prev, sections: { ...prev.sections, [toSection]: rebuild(toEntries) } };
      }
      return { ...prev, sections: { ...prev.sections, [fromSection]: rebuild(fromEntries), [toSection]: rebuild(toEntries) } };
    });
  }

  function addField(sectionName: string) {
    if (!newFieldName.trim()) return;
    const fieldDef: FieldDef = { type: newFieldType };
    if (newFieldType === 'dropdown') fieldDef.options = [];
    if (newFieldType === 'multiselect') fieldDef['multiselect-items'] = [];
    if (newFieldType === 'unit') { fieldDef.unit_category = 'mass'; fieldDef.default_unit = 'g'; }
    if (newFieldType === 'hierarchy') fieldDef.hierarchy_options = {};

    setDefinition(prev => ({
      ...prev,
      sections: {
        ...prev.sections,
        [sectionName]: {
          ...prev.sections[sectionName],
          [newFieldName.trim()]: fieldDef,
        },
      },
    }));
    setNewFieldName('');
    setNewFieldType('string');
    setNewFieldSection(null);
  }

  function renameField(sectionName: string, oldName: string, newName: string) {
    if (!newName.trim() || newName === oldName) return;
    setDefinition(prev => {
      const section = prev.sections[sectionName];
      const entries = Object.entries(section);
      const newSection: typeof section = {};
      for (const [key, val] of entries) {
        newSection[key === oldName ? newName.trim() : key] = val;
      }
      return { ...prev, sections: { ...prev.sections, [sectionName]: newSection } };
    });
  }

  function removeField(sectionName: string, fieldName: string) {
    setDefinition(prev => {
      const section = { ...prev.sections[sectionName] };
      delete section[fieldName];
      return { ...prev, sections: { ...prev.sections, [sectionName]: section } };
    });
  }

  function updateField(sectionName: string, fieldName: string, key: string, value: unknown) {
    setDefinition(prev => ({
      ...prev,
      sections: {
        ...prev.sections,
        [sectionName]: {
          ...prev.sections[sectionName],
          [fieldName]: {
            ...prev.sections[sectionName][fieldName],
            [key]: value,
          },
        },
      },
    }));
  }

  function changeFieldType(sectionName: string, fieldName: string, newType: string) {
    setDefinition(prev => {
      const oldDef = prev.sections[sectionName][fieldName];
      const newDef: FieldDef = { type: newType };
      if (oldDef.required) newDef.required = true;
      if (newType === 'dropdown') newDef.options = oldDef.options || [];
      if (newType === 'multiselect') newDef['multiselect-items'] = oldDef['multiselect-items'] || [];
      if (newType === 'unit') {
        newDef.unit_category = oldDef.unit_category || 'mass';
        newDef.default_unit = oldDef.default_unit || 'g';
      }
      if (newType === 'computed') {
        newDef.formula = oldDef.formula || '';
        newDef.result_type = oldDef.result_type || 'float';
      }
      if (newType === 'hierarchy') {
        newDef.hierarchy_options = oldDef.hierarchy_options || {};
      }
      return {
        ...prev,
        sections: {
          ...prev.sections,
          [sectionName]: {
            ...prev.sections[sectionName],
            [fieldName]: newDef,
          },
        },
      };
    });
  }

  if (!schema) {
    return (
      <div />
    );
  }

  return (
    <div className="animate-content-in">
      <div className="flex items-center gap-2 text-sm text-stone-400 dark:text-stone-500 mb-4">
        <Link to="/groups" className="hover:text-stone-600 dark:hover:text-stone-300">Collections</Link>
        <span>/</span>
        <Link to={`/groups/${gid}`} className="hover:text-stone-600 dark:hover:text-stone-300">{groupName}</Link>
        <span>/</span>
        <span className="text-stone-600 dark:text-stone-300">Schema: {schema.name}</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          className="text-2xl font-semibold text-stone-800 dark:text-stone-100 bg-transparent border-b border-transparent hover:border-stone-300 dark:hover:border-stone-600 focus:border-stone-400 dark:focus:border-stone-500 focus:outline-none"
        />
        <div className="flex gap-2">
          <button
            onClick={() => { void handleCopyJson(); }}
            className="px-3 py-1.5 text-sm border border-stone-300 dark:border-stone-600 rounded-lg text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800"
          >
            {copyFeedback === 'success' ? 'Copied!' : copyFeedback === 'error' ? 'Copy failed' : 'Copy JSON'}
          </button>
          <button
            onClick={() => { setJsonImportText(''); setJsonError(''); setShowJsonImport(true); }}
            className="px-3 py-1.5 text-sm border border-stone-300 dark:border-stone-600 rounded-lg text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800"
          >
            Import JSON
          </button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-stone-800 dark:bg-stone-200 text-white dark:text-stone-900 rounded-lg text-sm font-medium hover:bg-stone-700 dark:hover:bg-stone-300 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Schema'}
          </button>
          <button onClick={handleDelete} className="px-4 py-2 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
            Delete
          </button>
        </div>
      </div>

      {/* JSON Import Modal */}
      {showJsonImport && (
        <div className="fixed inset-0 bg-black/30 dark:bg-black/50 z-50 flex items-center justify-center px-4">
          <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700 w-full max-w-lg shadow-xl p-5">
            <h2 className="text-lg font-semibold text-stone-800 dark:text-stone-100 mb-3">Import Schema JSON</h2>
            <p className="text-sm text-stone-500 dark:text-stone-400 mb-3">Paste a schema definition JSON. This will replace the current definition.</p>
            <textarea
              value={jsonImportText}
              onChange={e => { setJsonImportText(e.target.value); setJsonError(''); }}
              rows={12}
              className="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-lg text-sm font-mono bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200"
              placeholder='{"sections": {"General": {"name": {"type": "string"}, ...}}}'
              autoFocus
            />
            {jsonError && <p className="text-sm text-red-500 mt-2">{jsonError}</p>}
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => {
                  try {
                    const parsed = JSON.parse(jsonImportText);
                    if (parsed.sections && typeof parsed.sections === 'object') {
                      setDefinition(parsed);
                    } else if (typeof parsed === 'object' && !Array.isArray(parsed)) {
                      // Assume it's the sections object directly
                      setDefinition({ sections: parsed });
                    } else {
                      setJsonError('JSON must be an object with a "sections" key, or a sections object directly.');
                      return;
                    }
                    setShowJsonImport(false);
                  } catch {
                    setJsonError('Invalid JSON. Please check your syntax.');
                  }
                }}
                className="px-4 py-2 bg-stone-800 dark:bg-stone-200 text-white dark:text-stone-900 rounded-lg text-sm font-medium hover:bg-stone-700 dark:hover:bg-stone-300"
              >
                Apply
              </button>
              <button onClick={() => setShowJsonImport(false)} className="px-4 py-2 text-stone-500 dark:text-stone-400 text-sm">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sections */}
      <div className="grid gap-4 lg:grid-cols-2">
        {Object.entries(definition.sections).map(([sectionName, fields], sIdx) => (
          <div
            key={sectionName}
            draggable
            onDragStart={e => { e.dataTransfer.setData('text/section', String(sIdx)); setDragSectionIdx(sIdx); }}
            onDragOver={e => {
              if (dragSectionIdx !== null) { e.preventDefault(); setDragOverSectionIdx(sIdx); }
              else if (dragField) { e.preventDefault(); }
            }}
            onDragLeave={() => setDragOverSectionIdx(null)}
            onDrop={() => {
              if (dragSectionIdx !== null && dragSectionIdx !== sIdx) reorderSection(dragSectionIdx, sIdx);
              else if (dragField && dragField.section !== sectionName) {
                const fieldCount = Object.keys(fields).length;
                moveFieldToIndex(dragField.section, dragField.name, sectionName, fieldCount);
              }
              setDragSectionIdx(null); setDragOverSectionIdx(null);
              setDragField(null); setDragOverField(null);
            }}
            onDragEnd={() => { setDragSectionIdx(null); setDragOverSectionIdx(null); setDragField(null); setDragOverField(null); }}
            className={`transition-all ${dragOverSectionIdx === sIdx ? 'ring-2 ring-stone-400 dark:ring-stone-500 rounded-xl' : ''} ${dragSectionIdx === sIdx ? 'opacity-40' : ''}`}
          >
            <SectionEditor
              name={sectionName}
              fields={fields as Record<string, FieldDef>}
              isAddingField={newFieldSection === sectionName}
              newFieldName={newFieldName}
              newFieldType={newFieldType}
              allGroups={allGroups}
              onNewFieldNameChange={setNewFieldName}
              onNewFieldTypeChange={setNewFieldType}
              onStartAddField={() => setNewFieldSection(sectionName)}
              onCancelAddField={() => setNewFieldSection(null)}
              onAddField={() => addField(sectionName)}
              onRenameSection={(n) => renameSection(sectionName, n)}
              onRemoveSection={() => removeSection(sectionName)}
              onRenameField={(old, n) => renameField(sectionName, old, n)}
              onUpdateField={(f, k, v) => updateField(sectionName, f, k, v)}
              onRemoveField={(f) => removeField(sectionName, f)}
              onChangeFieldType={(f, newType) => changeFieldType(sectionName, f, newType)}
              dragField={dragField}
              dragOverField={dragOverField}
              onFieldDragStart={(fieldName, idx) => { setDragField({ section: sectionName, name: fieldName, index: idx }); }}
              onFieldDragOver={(idx) => { setDragOverField({ section: sectionName, index: idx }); }}
              onFieldDrop={(idx) => {
                if (dragField) {
                  moveFieldToIndex(dragField.section, dragField.name, sectionName, idx);
                }
                setDragField(null); setDragOverField(null);
              }}
              onFieldDragEnd={() => { setDragField(null); setDragOverField(null); }}
            />
          </div>
        ))}
      </div>

      {/* Add section */}
      <div className="mt-4 flex gap-2">
        <input
          value={newSection}
          onChange={e => setNewSection(e.target.value)}
          placeholder="New section name"
          className="flex-1 px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-lg text-sm bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200"
          onKeyDown={e => e.key === 'Enter' && addSection()}
        />
        <button onClick={addSection} className="px-4 py-2 border border-stone-300 dark:border-stone-600 rounded-lg text-sm text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700">
          + Add Section
        </button>
      </div>

      {/* JSON preview */}
      <details className="mt-6">
        <summary className="text-sm text-stone-400 dark:text-stone-500 cursor-pointer hover:text-stone-600 dark:hover:text-stone-300">Show raw JSON</summary>
        <pre className="mt-2 p-4 bg-stone-100 dark:bg-stone-800 rounded-lg text-xs overflow-x-auto text-stone-600 dark:text-stone-300">
          {JSON.stringify(definition, null, 2)}
        </pre>
      </details>
    </div>
  );
}

/* ---- Section Editor ---- */

function SectionEditor({ name, fields, isAddingField, newFieldName, newFieldType, allGroups, onNewFieldNameChange, onNewFieldTypeChange, onStartAddField, onCancelAddField, onAddField, onRenameSection, onRemoveSection, onRenameField, onUpdateField, onRemoveField, onChangeFieldType, dragField, dragOverField, onFieldDragStart, onFieldDragOver, onFieldDrop, onFieldDragEnd }: {
  name: string;
  fields: Record<string, FieldDef>;
  isAddingField: boolean;
  newFieldName: string;
  newFieldType: string;
  allGroups: Group[];
  onNewFieldNameChange: (v: string) => void;
  onNewFieldTypeChange: (v: string) => void;
  onStartAddField: () => void;
  onCancelAddField: () => void;
  onAddField: () => void;
  onRenameSection: (newName: string) => void;
  onRemoveSection: () => void;
  onRenameField: (oldName: string, newName: string) => void;
  onUpdateField: (field: string, key: string, value: unknown) => void;
  onRemoveField: (field: string) => void;
  onChangeFieldType: (field: string, newType: string) => void;
  dragField: { section: string; name: string; index: number } | null;
  dragOverField: { section: string; index: number } | null;
  onFieldDragStart: (fieldName: string, index: number) => void;
  onFieldDragOver: (index: number) => void;
  onFieldDrop: (index: number) => void;
  onFieldDragEnd: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(name);

  function commitRename() {
    if (editName.trim() && editName !== name) onRenameSection(editName.trim());
    setEditing(false);
  }

  return (
    <div className="bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="cursor-grab active:cursor-grabbing text-stone-300 dark:text-stone-600 hover:text-stone-500 dark:hover:text-stone-400 select-none" title="Drag to reorder section">⠿</span>
          {editing ? (
          <input
            value={editName}
            onChange={e => setEditName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => e.key === 'Enter' && commitRename()}
            className="text-sm font-medium uppercase tracking-wide bg-transparent border-b border-stone-400 dark:border-stone-500 text-stone-600 dark:text-stone-300 focus:outline-none"
            autoFocus
          />
        ) : (
          <h2
            className="text-sm font-medium text-stone-500 dark:text-stone-400 uppercase tracking-wide cursor-pointer hover:text-stone-700 dark:hover:text-stone-200"
            onClick={() => { setEditName(name); setEditing(true); }}
            title="Click to rename"
          >
            {name}
          </h2>
        )}
        </div>
        <button onClick={onRemoveSection} className="text-stone-300 dark:text-stone-600 hover:text-red-400 text-sm">
          Remove Section
        </button>
      </div>

      <div className="divide-y divide-stone-100 dark:divide-stone-700/50">
        {Object.entries(fields).map(([fieldName, fieldDef], idx) => (
          <div
            key={fieldName}
            draggable
            onDragStart={e => { e.stopPropagation(); onFieldDragStart(fieldName, idx); }}
            onDragOver={e => { if (dragField) { e.preventDefault(); e.stopPropagation(); onFieldDragOver(idx); } }}
            onDragLeave={e => e.stopPropagation()}
            onDrop={e => {
              e.stopPropagation();
              if (dragField) onFieldDrop(idx);
            }}
            onDragEnd={onFieldDragEnd}
            className={`transition-all ${dragOverField?.section === name && dragOverField?.index === idx ? 'border-t-2 border-stone-400 dark:border-stone-500' : ''} ${dragField?.section === name && dragField?.index === idx ? 'opacity-40' : ''}`}
          >
            <FieldDefEditor
              name={fieldName}
              def={fieldDef}
              allGroups={allGroups}
              onRename={(n) => onRenameField(fieldName, n)}
              onUpdate={(key, val) => onUpdateField(fieldName, key, val)}
              onRemove={() => onRemoveField(fieldName)}
              onChangeType={(newType) => onChangeFieldType(fieldName, newType)}
            />
          </div>
        ))}
      </div>

      {isAddingField ? (
        <div className="flex gap-2 mt-3">
          <input
            value={newFieldName}
            onChange={e => onNewFieldNameChange(e.target.value)}
            placeholder="Field name"
            className="flex-1 px-3 py-1.5 border border-stone-300 dark:border-stone-600 rounded-lg text-sm bg-white dark:bg-stone-700 text-stone-800 dark:text-stone-200"
            autoFocus
            onKeyDown={e => e.key === 'Enter' && onAddField()}
          />
          <select value={newFieldType} onChange={e => onNewFieldTypeChange(e.target.value)} className="px-3 py-1.5 border border-stone-300 dark:border-stone-600 rounded-lg text-sm bg-white dark:bg-stone-700 text-stone-800 dark:text-stone-200">
            {FIELD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <button onClick={onAddField} className="px-3 py-1.5 bg-stone-800 dark:bg-stone-200 text-white dark:text-stone-900 rounded-lg text-sm">
            Add
          </button>
          <button onClick={onCancelAddField} className="text-stone-400 dark:text-stone-500 text-sm">
            Cancel
          </button>
        </div>
      ) : (
        <button onClick={onStartAddField} className="mt-3 text-sm text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300">
          + Add Field
        </button>
      )}
    </div>
  );
}

/* ---- Field Editor ---- */

function FieldDefEditor({ name, def, allGroups, onRename, onUpdate, onRemove, onChangeType }: {
  name: string;
  def: FieldDef;
  allGroups: Group[];
  onRename: (newName: string) => void;
  onUpdate: (key: string, value: unknown) => void;
  onRemove: () => void;
  onChangeType: (newType: string) => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [fieldName, setFieldName] = useState(name);
  const [expanded, setExpanded] = useState(false);

  // Does this type have configurable options?
  const hasConfig = ['dropdown', 'multiselect', 'unit', 'computed', 'link', 'hierarchy'].includes(def.type) || def.type === 'string';
  const supportsCardinality = !['computed'].includes(def.type);

  // Auto-expand options panel when switching to a configurable type
  useEffect(() => {
    if (hasConfig) setExpanded(true);
  }, [def.type]);

  function commitRename() {
    if (fieldName.trim() && fieldName !== name) onRename(fieldName.trim());
    setEditingName(false);
  }

  return (
    <div className="py-1.5">
      <div className="flex items-center gap-2">
        {/* Drag handle */}
        <span className="cursor-grab active:cursor-grabbing text-stone-300 dark:text-stone-600 hover:text-stone-500 dark:hover:text-stone-400 select-none flex-shrink-0" title="Drag to reorder">⠿</span>
        {/* Editable field name */}
        <div className="w-40 min-w-0">
          {editingName ? (
            <input
              value={fieldName}
              onChange={e => setFieldName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={e => e.key === 'Enter' && commitRename()}
              className="w-full font-medium text-sm text-stone-700 dark:text-stone-200 bg-transparent border-b border-stone-400 dark:border-stone-500 focus:outline-none"
              autoFocus
            />
          ) : (
            <span
              className="block truncate font-medium text-sm text-stone-700 dark:text-stone-200 cursor-pointer hover:text-stone-900 dark:hover:text-white"
              onClick={() => { setFieldName(name); setEditingName(true); }}
              title={name}
            >
              {name}
            </span>
          )}
        </div>
        <select
          value={def.type}
          onChange={e => {
            const newType = e.target.value;
            if (newType === def.type) return;
            const safe = SAFE_CONVERSIONS[def.type];
            if (!safe || !safe.includes(newType)) {
              if (!confirm(`Changing from "${def.type}" to "${newType}" may cause data loss for existing items. Continue?`)) {
                e.target.value = def.type;
                return;
              }
            }
            onChangeType(newType);
          }}
          className="w-24 flex-shrink-0 text-xs bg-stone-200 dark:bg-stone-700 text-stone-500 dark:text-stone-400 px-1.5 py-0.5 rounded border-none focus:ring-1 focus:ring-stone-400 cursor-pointer"
        >
          {FIELD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        {def.required && <span className="text-xs text-amber-500">*</span>}

        {supportsCardinality && (
          <div className="flex items-center gap-0.5 ml-1">
            <button
              onClick={() => {
                const cur = def.max_count;
                const next = cur != null && cur > 1 ? cur - 1 : cur === 0 ? undefined : undefined;
                onUpdate('max_count', next);
              }}
              className="w-5 h-5 flex items-center justify-center rounded text-stone-400 dark:text-stone-500 hover:bg-stone-200 dark:hover:bg-stone-700 hover:text-stone-600 dark:hover:text-stone-300 text-sm"
              title="Decrease max count"
            >
              −
            </button>
            <input
              type="text"
              inputMode="numeric"
              value={def.max_count == null ? '1' : def.max_count === 0 ? '∞' : String(def.max_count)}
              onChange={e => {
                const raw = e.target.value.trim();
                if (raw === '' || raw === '1') onUpdate('max_count', undefined);
                else if (raw === '∞' || raw === '0' || raw.toLowerCase() === 'inf') onUpdate('max_count', 0);
                else { const n = parseInt(raw, 10); if (!isNaN(n) && n >= 0) onUpdate('max_count', n === 1 ? undefined : n === 0 ? 0 : n); }
              }}
              onFocus={e => e.target.select()}
              className="w-7 text-center text-xs text-stone-500 dark:text-stone-400 bg-transparent border-b border-stone-300 dark:border-stone-600 focus:border-stone-500 dark:focus:border-stone-400 focus:outline-none py-0"
              title={def.max_count === 0 ? 'Unlimited list' : def.max_count != null ? `Max ${def.max_count}` : 'Single value'}
            />
            <button
              onClick={() => {
                const cur = def.max_count;
                if (cur == null) onUpdate('max_count', 2);
                else if (cur === 0) {} // already unlimited
                else onUpdate('max_count', cur + 1);
              }}
              className="w-5 h-5 flex items-center justify-center rounded text-stone-400 dark:text-stone-500 hover:bg-stone-200 dark:hover:bg-stone-700 hover:text-stone-600 dark:hover:text-stone-300 text-sm"
              title="Increase max count"
            >
              +
            </button>
          </div>
        )}

        <div className="ml-auto flex items-center gap-1">
          {hasConfig && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300 text-xs px-1.5 py-0.5"
              title="Configure"
            >
              {expanded ? '▾ options' : '▸ options'}
            </button>
          )}
          <button onClick={onRemove} className="text-stone-300 dark:text-stone-600 hover:text-red-400 text-sm px-1">
            &times;
          </button>
        </div>
      </div>

      {/* Expanded config panel */}
      {expanded && (
        <div className="mt-1.5 pt-1.5 ml-6 border-t border-stone-200 dark:border-stone-700 space-y-2 text-xs">
          {(def.type === 'dropdown') && (
            <OptionsInput
              value={def.options || def['dropdown-items'] || []}
              onChange={v => onUpdate('options', v)}
            />
          )}

          {(def.type === 'multiselect') && (
            <OptionsInput
              value={def['multiselect-items'] || []}
              onChange={v => onUpdate('multiselect-items', v)}
            />
          )}

          {def.type === 'unit' && (
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-stone-500 dark:text-stone-400">Unit category</label>
                <select
                  value={def.unit_category || ''}
                  onChange={e => onUpdate('unit_category', e.target.value)}
                  className="w-full px-2 py-1.5 border border-stone-300 dark:border-stone-600 rounded text-sm mt-1 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200"
                >
                  <option value="">Select...</option>
                  {UNIT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-stone-500 dark:text-stone-400">Default unit</label>
                <input value={def.default_unit || ''} onChange={e => onUpdate('default_unit', e.target.value)} className="w-full px-2 py-1.5 border border-stone-300 dark:border-stone-600 rounded text-sm mt-1 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200 w-20" placeholder="g" />
              </div>
            </div>
          )}

          {def.type === 'computed' && (
            <div className="space-y-2">
              <div>
                <label className="text-stone-500 dark:text-stone-400">Formula</label>
                <input value={def.formula || ''} onChange={e => onUpdate('formula', e.target.value)} className="w-full px-2 py-1.5 border border-stone-300 dark:border-stone-600 rounded text-sm mt-1 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200" placeholder="field_a * field_b" />
              </div>
              <div className="flex gap-3">
                <div>
                  <label className="text-stone-500 dark:text-stone-400">Result type</label>
                  <select value={def.result_type || 'float'} onChange={e => onUpdate('result_type', e.target.value)} className="px-2 py-1.5 border border-stone-300 dark:border-stone-600 rounded text-sm mt-1 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200">
                    <option value="float">float</option>
                    <option value="int">int</option>
                    <option value="unit">unit</option>
                  </select>
                </div>
                {def.result_type === 'unit' && (
                  <div>
                    <label className="text-stone-500 dark:text-stone-400">Unit from field</label>
                    <input value={def.unit_from || ''} onChange={e => onUpdate('unit_from', e.target.value)} className="px-2 py-1.5 border border-stone-300 dark:border-stone-600 rounded text-sm mt-1 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200 w-24" />
                  </div>
                )}
              </div>
            </div>
          )}

          {def.type === 'link' && (
            <LinkFieldConfig def={def} allGroups={allGroups} onUpdate={onUpdate} />
          )}

          {def.type === 'hierarchy' && (
            <HierarchyConfig
              value={def.hierarchy_options || {}}
              onChange={v => onUpdate('hierarchy_options', v)}
            />
          )}

          {def.type === 'string' && (
            <label className="flex items-center gap-2 text-stone-600 dark:text-stone-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={!!def.filterable}
                onChange={e => onUpdate('filterable', e.target.checked || undefined)}
                className="accent-stone-600 dark:accent-stone-400"
              />
              Filterable in search
            </label>
          )}
        </div>
      )}
    </div>
  );
}

/* ---- Link Field Config ---- */

function LinkFieldConfig({ def, allGroups, onUpdate }: {
  def: FieldDef;
  allGroups: Group[];
  onUpdate: (key: string, value: unknown) => void;
}) {
  const [schemas, setSchemas] = useState<ItemSchema[]>([]);

  useEffect(() => {
    if (def.link_group_id) {
      api.schemas.list(def.link_group_id).then(setSchemas);
    } else {
      setSchemas([]);
    }
  }, [def.link_group_id]);

  return (
    <div className="flex gap-3">
      <div className="flex-1">
        <label className="text-stone-500 dark:text-stone-400">Link to collection</label>
        <select
          value={def.link_group_id || ''}
          onChange={e => {
            const gid = e.target.value ? Number(e.target.value) : undefined;
            onUpdate('link_group_id', gid);
            onUpdate('link_schema_id', undefined);
          }}
          className="w-full px-2 py-1.5 border border-stone-300 dark:border-stone-600 rounded text-sm mt-1 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200"
        >
          <option value="">Select a collection</option>
          {allGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </div>
      {def.link_group_id && schemas.length > 0 && (
        <div className="flex-1">
          <label className="text-stone-500 dark:text-stone-400">Limit to schema</label>
          <select
            value={def.link_schema_id || ''}
            onChange={e => onUpdate('link_schema_id', e.target.value ? Number(e.target.value) : undefined)}
            className="w-full px-2 py-1.5 border border-stone-300 dark:border-stone-600 rounded text-sm mt-1 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200"
          >
            <option value="">Any schema</option>
            {schemas.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}

/* ---- Options Input (local buffer, commits on blur) ---- */

function OptionsInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState(value.join(', '));
  const [focused, setFocused] = useState(false);

  // Sync from parent when not focused
  useEffect(() => {
    if (!focused) setText(value.join(', '));
  }, [value, focused]);

  function commit() {
    onChange(text.split(',').map(s => s.trim()).filter(Boolean));
    setFocused(false);
  }

  return (
    <div>
      <label className="text-stone-500 dark:text-stone-400">Options (comma-separated)</label>
      <input
        value={text}
        onChange={e => setText(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }}
        className="w-full px-2 py-1.5 border border-stone-300 dark:border-stone-600 rounded text-sm mt-1 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200"
      />
    </div>
  );
}

/* ---- Hierarchy Config ---- */

function HierarchyConfig({ value, onChange }: { value: Record<string, string[]>; onChange: (v: Record<string, string[]>) => void }) {
  const [newParent, setNewParent] = useState('');
  const [newChildren, setNewChildren] = useState<Record<string, string>>({});

  function addParent() {
    const name = newParent.trim();
    if (!name || name in value) return;
    onChange({ ...value, [name]: [] });
    setNewParent('');
  }

  function removeParent(parent: string) {
    const { [parent]: _, ...rest } = value;
    onChange(rest);
  }

  function renameParent(oldName: string, newName: string) {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName || trimmed in value) return;
    const entries = Object.entries(value);
    const result: Record<string, string[]> = {};
    for (const [k, v] of entries) {
      result[k === oldName ? trimmed : k] = v;
    }
    onChange(result);
  }

  function addChild(parent: string) {
    const name = (newChildren[parent] || '').trim();
    if (!name || value[parent].includes(name)) return;
    onChange({ ...value, [parent]: [...value[parent], name] });
    setNewChildren(prev => ({ ...prev, [parent]: '' }));
  }

  function removeChild(parent: string, child: string) {
    onChange({ ...value, [parent]: value[parent].filter(c => c !== child) });
  }

  return (
    <div className="space-y-2">
      <label className="text-stone-500 dark:text-stone-400">Hierarchy options</label>
      {Object.entries(value).map(([parent, children]) => (
        <div key={parent} className="border border-stone-200 dark:border-stone-700 rounded p-2 space-y-1">
          <div className="flex items-center gap-1">
            <input
              defaultValue={parent}
              onBlur={e => renameParent(parent, e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              className="flex-1 px-1.5 py-0.5 text-sm font-medium bg-transparent border-b border-transparent hover:border-stone-300 dark:hover:border-stone-600 focus:border-stone-400 dark:focus:border-stone-500 focus:outline-none text-stone-700 dark:text-stone-200"
            />
            <button type="button" onClick={() => removeParent(parent)} className="text-stone-300 dark:text-stone-600 hover:text-red-400 text-xs">&times;</button>
          </div>
          <div className="ml-3 space-y-0.5">
            {children.map(child => (
              <div key={child} className="flex items-center gap-1">
                <span className="text-xs text-stone-500 dark:text-stone-400">└</span>
                <span className="text-xs text-stone-600 dark:text-stone-300 flex-1">{child}</span>
                <button type="button" onClick={() => removeChild(parent, child)} className="text-stone-300 dark:text-stone-600 hover:text-red-400 text-[10px]">&times;</button>
              </div>
            ))}
            <div className="flex items-center gap-1 mt-1">
              <input
                value={newChildren[parent] || ''}
                onChange={e => setNewChildren(prev => ({ ...prev, [parent]: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addChild(parent); } }}
                placeholder="Add child..."
                className="flex-1 px-1.5 py-0.5 text-xs border border-stone-200 dark:border-stone-700 rounded bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200"
              />
              <button type="button" onClick={() => addChild(parent)} className="text-xs text-stone-400 hover:text-stone-600 dark:hover:text-stone-300">+</button>
            </div>
          </div>
        </div>
      ))}
      <div className="flex gap-1">
        <input
          value={newParent}
          onChange={e => setNewParent(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addParent(); } }}
          placeholder="New category..."
          className="flex-1 px-2 py-1 text-xs border border-stone-300 dark:border-stone-600 rounded bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200"
        />
        <button type="button" onClick={addParent} className="text-xs text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 px-1">+ Category</button>
      </div>
    </div>
  );
}
