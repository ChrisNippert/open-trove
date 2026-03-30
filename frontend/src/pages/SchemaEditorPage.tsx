import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import type { ItemSchema, SchemaDefinition, FieldDef } from '../types';

const FIELD_TYPES = [
  'string', 'textarea', 'int', 'float', 'boolean', 'datetime',
  'dropdown', 'multiselect', 'unit', 'computed', 'image',
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
  const [saving, setSaving] = useState(false);
  const [newSection, setNewSection] = useState('');
  const [newFieldSection, setNewFieldSection] = useState<string | null>(null);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState('string');

  useEffect(() => {
    loadSchema();
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

  function addField(sectionName: string) {
    if (!newFieldName.trim()) return;
    const fieldDef: FieldDef = { type: newFieldType };
    if (newFieldType === 'dropdown') fieldDef.options = [];
    if (newFieldType === 'multiselect') fieldDef['multiselect-items'] = [];
    if (newFieldType === 'unit') { fieldDef.unit_category = 'mass'; fieldDef.default_unit = 'g'; }

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
    return <div className="text-stone-400 dark:text-stone-500 text-center py-12">Loading...</div>;
  }

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-stone-400 dark:text-stone-500 mb-4">
        <Link to="/groups" className="hover:text-stone-600 dark:hover:text-stone-300">Collections</Link>
        <span>/</span>
        <Link to={`/groups/${gid}`} className="hover:text-stone-600 dark:hover:text-stone-300">Group</Link>
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
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-stone-800 dark:bg-stone-200 text-white dark:text-stone-900 rounded-lg text-sm font-medium hover:bg-stone-700 dark:hover:bg-stone-300 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Schema'}
          </button>
          <button onClick={handleDelete} className="px-4 py-2 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
            Delete
          </button>
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-4">
        {Object.entries(definition.sections).map(([sectionName, fields]) => (
          <SectionEditor
            key={sectionName}
            name={sectionName}
            fields={fields as Record<string, FieldDef>}
            isAddingField={newFieldSection === sectionName}
            newFieldName={newFieldName}
            newFieldType={newFieldType}
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
          />
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

function SectionEditor({ name, fields, isAddingField, newFieldName, newFieldType, onNewFieldNameChange, onNewFieldTypeChange, onStartAddField, onCancelAddField, onAddField, onRenameSection, onRemoveSection, onRenameField, onUpdateField, onRemoveField, onChangeFieldType }: {
  name: string;
  fields: Record<string, FieldDef>;
  isAddingField: boolean;
  newFieldName: string;
  newFieldType: string;
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
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(name);

  function commitRename() {
    if (editName.trim() && editName !== name) onRenameSection(editName.trim());
    setEditing(false);
  }

  return (
    <div className="bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 p-5">
      <div className="flex items-center justify-between mb-4">
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
        <button onClick={onRemoveSection} className="text-stone-300 dark:text-stone-600 hover:text-red-400 text-sm">
          Remove Section
        </button>
      </div>

      <div className="space-y-2">
        {Object.entries(fields).map(([fieldName, fieldDef]) => (
          <FieldDefEditor
            key={fieldName}
            name={fieldName}
            def={fieldDef}
            onRename={(n) => onRenameField(fieldName, n)}
            onUpdate={(key, val) => onUpdateField(fieldName, key, val)}
            onRemove={() => onRemoveField(fieldName)}
            onChangeType={(newType) => onChangeFieldType(fieldName, newType)}
          />
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

function FieldDefEditor({ name, def, onRename, onUpdate, onRemove, onChangeType }: {
  name: string;
  def: FieldDef;
  onRename: (newName: string) => void;
  onUpdate: (key: string, value: unknown) => void;
  onRemove: () => void;
  onChangeType: (newType: string) => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [fieldName, setFieldName] = useState(name);
  const [expanded, setExpanded] = useState(false);

  // Does this type have configurable options?
  const hasConfig = ['dropdown', 'multiselect', 'unit', 'computed'].includes(def.type);

  // Auto-expand options panel when switching to a configurable type
  useEffect(() => {
    if (hasConfig) setExpanded(true);
  }, [def.type]);

  function commitRename() {
    if (fieldName.trim() && fieldName !== name) onRename(fieldName.trim());
    setEditingName(false);
  }

  return (
    <div className="p-3 bg-stone-50 dark:bg-stone-750 dark:bg-stone-900/40 rounded-lg">
      <div className="flex items-center gap-2">
        {/* Editable field name */}
        {editingName ? (
          <input
            value={fieldName}
            onChange={e => setFieldName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => e.key === 'Enter' && commitRename()}
            className="font-medium text-sm text-stone-700 dark:text-stone-200 bg-transparent border-b border-stone-400 dark:border-stone-500 focus:outline-none"
            autoFocus
          />
        ) : (
          <span
            className="font-medium text-sm text-stone-700 dark:text-stone-200 cursor-pointer hover:text-stone-900 dark:hover:text-white"
            onClick={() => { setFieldName(name); setEditingName(true); }}
            title="Click to rename"
          >
            {name}
          </span>
        )}
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
          className="text-xs bg-stone-200 dark:bg-stone-700 text-stone-500 dark:text-stone-400 px-1.5 py-0.5 rounded border-none focus:ring-1 focus:ring-stone-400 cursor-pointer"
        >
          {FIELD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        {def.required && <span className="text-xs text-amber-500">*</span>}

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
        <div className="mt-2 pt-2 border-t border-stone-200 dark:border-stone-700 space-y-2 text-xs">
          {(def.type === 'dropdown') && (
            <div>
              <label className="text-stone-500 dark:text-stone-400">Options (comma-separated)</label>
              <input
                value={(def.options || def['dropdown-items'] || []).join(', ')}
                onChange={e => onUpdate('options', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                className="w-full px-2 py-1.5 border border-stone-300 dark:border-stone-600 rounded text-sm mt-1 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200"
              />
            </div>
          )}

          {(def.type === 'multiselect') && (
            <div>
              <label className="text-stone-500 dark:text-stone-400">Options (comma-separated)</label>
              <input
                value={(def['multiselect-items'] || []).join(', ')}
                onChange={e => onUpdate('multiselect-items', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                className="w-full px-2 py-1.5 border border-stone-300 dark:border-stone-600 rounded text-sm mt-1 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200"
              />
            </div>
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
        </div>
      )}
    </div>
  );
}
