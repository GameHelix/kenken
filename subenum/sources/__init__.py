"""Source registry. Every module in this package is imported automatically and
every `Source` subclass with a non-empty `name` becomes available on the CLI."""
from __future__ import annotations

import importlib
import pkgutil

from ..core import Source, eprint


def load_sources() -> dict[str, type[Source]]:
    found: dict[str, type[Source]] = {}
    for mod in pkgutil.iter_modules(__path__):
        if mod.name.startswith("_"):
            continue
        try:
            module = importlib.import_module(f"{__name__}.{mod.name}")
        except Exception as e:  # a broken plugin must not take the tool down
            eprint(f"[!] failed to load source module {mod.name}: {e}")
            continue
        for obj in vars(module).values():
            if (
                isinstance(obj, type)
                and issubclass(obj, Source)
                and obj is not Source
                and obj.name
                and obj.__module__ == module.__name__
            ):
                found[obj.name] = obj
    return dict(sorted(found.items()))
