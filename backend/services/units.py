"""Unit registry with conversion support.

Stores unit categories (mass, volume, currency, etc.) and conversion factors.
Enables cross-unit comparisons and searching by unit type.
"""

from dataclasses import dataclass


@dataclass
class UnitDef:
    name: str
    symbol: str
    category: str
    to_base: float  # multiply by this to convert to base unit


# Base units: gram (mass), milliliter (volume), USD (currency), meter (length), each (count)
UNITS: dict[str, UnitDef] = {
    # Mass
    "mg": UnitDef("milligram", "mg", "mass", 0.001),
    "g": UnitDef("gram", "g", "mass", 1.0),
    "kg": UnitDef("kilogram", "kg", "mass", 1000.0),
    "oz": UnitDef("ounce", "oz", "mass", 28.3495),
    "lb": UnitDef("pound", "lb", "mass", 453.592),
    "lbs": UnitDef("pound", "lbs", "mass", 453.592),

    # Volume
    "ml": UnitDef("milliliter", "ml", "volume", 1.0),
    "l": UnitDef("liter", "l", "volume", 1000.0),
    "L": UnitDef("liter", "L", "volume", 1000.0),
    "fl oz": UnitDef("fluid ounce", "fl oz", "volume", 29.5735),
    "cup": UnitDef("cup", "cup", "volume", 236.588),
    "pt": UnitDef("pint", "pt", "volume", 473.176),
    "qt": UnitDef("quart", "qt", "volume", 946.353),
    "gal": UnitDef("gallon", "gal", "volume", 3785.41),

    # Length
    "mm": UnitDef("millimeter", "mm", "length", 0.001),
    "cm": UnitDef("centimeter", "cm", "length", 0.01),
    "m": UnitDef("meter", "m", "length", 1.0),
    "in": UnitDef("inch", "in", "length", 0.0254),
    "ft": UnitDef("foot", "ft", "length", 0.3048),
    "yd": UnitDef("yard", "yd", "length", 0.9144),

    # Currency (base = USD, rates are illustrative)
    "USD": UnitDef("US Dollar", "$", "currency", 1.0),
    "EUR": UnitDef("Euro", "\u20ac", "currency", 1.08),
    "GBP": UnitDef("British Pound", "\u00a3", "currency", 1.27),
    "CAD": UnitDef("Canadian Dollar", "CA$", "currency", 0.74),

    # Count
    "each": UnitDef("each", "ea", "count", 1.0),
    "dozen": UnitDef("dozen", "dz", "count", 12.0),
    "pair": UnitDef("pair", "pr", "count", 2.0),
}


def get_unit(unit_str: str) -> UnitDef | None:
    return UNITS.get(unit_str)


def get_units_by_category(category: str) -> list[UnitDef]:
    seen = set()
    result = []
    for u in UNITS.values():
        if u.category == category and u.name not in seen:
            seen.add(u.name)
            result.append(u)
    return result


def get_categories() -> list[str]:
    return sorted(set(u.category for u in UNITS.values()))


def convert(value: float, from_unit: str, to_unit: str) -> float | None:
    """Convert a value between two units of the same category."""
    u_from = get_unit(from_unit)
    u_to = get_unit(to_unit)
    if not u_from or not u_to:
        return None
    if u_from.category != u_to.category:
        return None
    base_value = value * u_from.to_base
    return base_value / u_to.to_base


def are_comparable(unit_a: str, unit_b: str) -> bool:
    """Check if two units belong to the same category."""
    a = get_unit(unit_a)
    b = get_unit(unit_b)
    if not a or not b:
        return False
    return a.category == b.category
