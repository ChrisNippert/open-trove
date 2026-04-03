export interface Group {
  id: number;
  name: string;
  description: string;
  thumbnail: string | null;
  created_at: string;
  updated_at: string;
  schema_count: number;
  item_count: number;
}

export interface FieldDef {
  type: string;
  required?: boolean;
  options?: string[]; // for dropdown
  "dropdown-items"?: string[];
  "multiselect-items"?: string[];
  unit_category?: string;
  default_unit?: string;
  formula?: string;
  result_type?: string;
  unit_from?: string;
  link_group_id?: number;
  link_schema_id?: number;
}

export interface SchemaSections {
  [sectionName: string]: {
    [fieldName: string]: FieldDef;
  };
}

export interface SchemaDefinition {
  sections: SchemaSections;
}

export interface ItemSchema {
  id: number;
  group_id: number;
  name: string;
  definition: SchemaDefinition;
  created_at: string;
  updated_at: string;
  item_count: number;
}

export interface ItemImage {
  id: number;
  filename: string;
  original_filename: string;
  thumbnail_filename: string | null;
  size_bytes: number;
  mime_type: string;
  sort_order: number;
}

export interface Item {
  id: number;
  group_id: number;
  schema_id: number;
  name: string;
  data: Record<string, unknown>;
  tags: string[];
  images: ItemImage[];
  created_at: string;
  updated_at: string;
}

export interface DirectoryView {
  id: number;
  group_id: number;
  name: string;
  definition: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface UnitValue {
  value: number;
  unit: string;
}

export interface ImportResult {
  imported: number;
  errors: string[];
}
