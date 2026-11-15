"""Contexto común que reciben las fuentes."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from .grid import Grid
from .zones import Zone

PERIOD_START = "2026-06-01"
PERIOD_END = "2026-10-31"


@dataclass
class Ctx:
    zone: Zone
    grid: Grid
    cache: Path

    def cache_dir(self, *parts: str) -> Path:
        p = self.cache.joinpath(*parts)
        p.mkdir(parents=True, exist_ok=True)
        return p
