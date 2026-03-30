# Open Trove

A self-hosted inventory and collection manager with user-defined schemas. Build your own structure for anything — wardrobe, kitchen, board games, tools, whatever — then search, filter, and browse it all from one place.

## What it does

Open Trove lets you create **collections** (called Groups), define **schemas** that describe the shape of items in that collection, then add items with structured data, tags, and images. Think of it like a personal database with a UI that adapts to whatever you're tracking.

A clothing collection might have fields for brand, size, season, and price. A recipe collection might have text areas for ingredients and instructions. A board game shelf might track player count and play time. You define the structure — the app builds the forms and filters to match.

### Core concepts

- **Groups** — Top-level collections (e.g. "Wardrobe", "Kitchen", "Board Games")
- **Schemas** — Templates that define what fields an item has, organized into sections
- **Items** — Individual entries within a group, created from a schema
- **Tags** — Freeform labels on any item for cross-cutting organization
- **Images** — Multiple images per item with thumbnail generation and reordering

## Features

- **Schema editor** — Visual editor for building item structures. Add sections, name fields, pick types, configure options. Rename anything inline. Change field types after creation with smart data conversion warnings.
- **11 field types** — `string`, `textarea`, `int`, `float`, `boolean`, `datetime`, `dropdown`, `multiselect`, `unit`, `computed`, `image`
- **Unit fields** — Built-in unit categories (mass, volume, length, currency, count) with conversion support
- **Computed fields** — Formula-based fields that reference other fields
- **Full-text search** — SQLite FTS5 indexes item names, field data, and tags. Searches across everything or scoped to a collection.
- **Faceted filtering** — Sidebar filters that adapt to your schema: dropdowns for single-select fields, checkboxes for multi-select, min/max range inputs for numeric fields, all with item counts
- **Image management** — Upload multiple images per item, auto-generated thumbnails, drag to set primary/thumbnail image
- **Dark mode** — System-aware with manual toggle, persisted to localStorage
- **Import/Export** — JSON and CSV export per collection or schema, with import support
- **Directory Views** — Custom hierarchical views of items within a group
- **Seed data** — Ships with example collections (Wardrobe, Kitchen, Board Games) to try things out

## Schema reference

Schemas are JSON documents with a `sections` object. Each section contains named fields, and each field has a `type` plus optional configuration.

### Field types

| Type | Description | Config |
|------|-------------|--------|
| `string` | Single-line text | — |
| `textarea` | Multi-line text (preserves whitespace) | — |
| `int` | Integer number | — |
| `float` | Decimal number | — |
| `boolean` | True/false toggle | — |
| `datetime` | Date and time picker | — |
| `dropdown` | Single-select from a list | `options`: array of strings |
| `multiselect` | Multi-select from a list | `multiselect-items`: array of strings |
| `unit` | Numeric value with a unit | `unit_category`, `default_unit` |
| `computed` | Calculated from other fields | `formula`, `result_type`, `unit_from` |
| `image` | Image upload (handled separately) | — |

### Unit categories

`mass`, `volume`, `length`, `currency`, `count`

### Example schema

```json
{
  "sections": {
    "Basics": {
      "category": {
        "type": "dropdown",
        "options": ["Top", "Bottom", "Outerwear", "Shoes", "Accessory"]
      },
      "brand": {
        "type": "string"
      },
      "size": {
        "type": "dropdown",
        "options": ["XS", "S", "M", "L", "XL"]
      }
    },
    "Details": {
      "season": {
        "type": "multiselect",
        "multiselect-items": ["Spring", "Summer", "Fall", "Winter"]
      },
      "condition": {
        "type": "dropdown",
        "options": ["New", "Like New", "Good", "Fair", "Worn"]
      }
    },
    "Pricing": {
      "purchase_price": {
        "type": "unit",
        "unit_category": "currency",
        "default_unit": "USD"
      },
      "date_acquired": {
        "type": "datetime"
      }
    }
  }
}
```

### Changing field types

You can change a field's type after creation through the schema editor. Compatible conversions (like `string` → `textarea`, or `int` → `float`) preserve existing data silently. Incompatible changes show a warning since existing item data may not match the new type.

Safe conversions include:
- `string` ↔ `textarea` ↔ `dropdown`
- `int` ↔ `float` → `string`
- `boolean` → `string`
- `dropdown` ↔ `multiselect`

## Setup

### Requirements

- Python 3.12+ 
- Node.js 18+

### Backend

```sh
cd organizer
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload
```

The API runs at `http://localhost:8000`. SQLite database is created automatically in `data/organizer.db`.

### Frontend

```sh
cd frontend
npm install
npm run dev # add ` -- --host 0.0.0.0` to run on all interfaces
```

Dev server runs at `http://localhost:5173` and proxies API calls to the backend.

### Seed data (optional)

With the backend running:

```sh
pip install httpx  # if not already installed
python seed_data.py
```

This creates three example collections with sample items — a Wardrobe with clothing and outfits, a Kitchen with recipes, and a Board Games collection.

## Stack

| Layer | Tech |
|-------|------|
| Backend | Python, FastAPI, SQLAlchemy 2.0 (async), aiosqlite |
| Database | SQLite with FTS5 full-text search |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4 |
| Images | Pillow for thumbnail generation |

## Project structure

```
backend/
  main.py              # App init, lifespan, router registration
  models.py            # SQLAlchemy models (Group, ItemSchema, Item, etc.)
  database.py          # Async engine + session factory
  routers/
    groups.py          # CRUD for collections
    schemas.py         # CRUD for item schemas
    items.py           # CRUD for items
    images.py          # Upload, serve, thumbnail, reorder
    search.py          # FTS5 search + faceted filtering
    units.py           # Unit conversion API
    views.py           # Directory view management
    export.py          # JSON/CSV import and export
  services/
    search.py          # FTS5 table management, triggers, filtering
frontend/
  src/
    pages/
      GroupsPage.tsx        # Collection list (home)
      GroupDetailPage.tsx   # Items + schemas in a collection
      ItemDetailPage.tsx    # Single item view + edit
      SchemaEditorPage.tsx  # Visual schema builder
      SearchPage.tsx        # Search + faceted filter sidebar
    api.ts                  # API client
    types.ts                # TypeScript interfaces
```

## License

Personal project. Do whatever you want with it.
