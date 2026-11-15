"""Rejilla común de análisis de una zona (EPSG:3857, celdas cuadradas).

La rejilla parte de la esquina NO del bbox de la zona y se extiende hacia el
este y el sur con un número entero de celdas, de modo que su extensión exacta
es ``width * cell`` × ``height * cell`` metros Web Mercator. ``bbox`` es el
WGS84 de esa extensión exacta (no el de la zona), para que la conversión
lat/lon → celda en el cliente sea exacta.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

from pyproj import Transformer

_TO_3857 = Transformer.from_crs("EPSG:4326", "EPSG:3857", always_xy=True)
_TO_4326 = Transformer.from_crs("EPSG:3857", "EPSG:4326", always_xy=True)


@dataclass(frozen=True)
class Grid:
    x0: float  # oeste (m, EPSG:3857)
    y0: float  # norte (m, EPSG:3857)
    cell: float
    width: int
    height: int

    @classmethod
    def from_bbox(cls, bbox_wgs84: list[float] | tuple[float, ...], cell: float = 250.0) -> "Grid":
        west, south, east, north = bbox_wgs84
        x0, y0 = _TO_3857.transform(west, north)
        x1, y1 = _TO_3857.transform(east, south)
        width = math.ceil((x1 - x0) / cell - 1e-9)
        height = math.ceil((y0 - y1) / cell - 1e-9)
        if width < 1 or height < 1:
            raise ValueError(f"bbox degenerado: {bbox_wgs84}")
        return cls(x0=x0, y0=y0, cell=float(cell), width=width, height=height)

    @property
    def x1(self) -> float:
        return self.x0 + self.width * self.cell

    @property
    def y1(self) -> float:
        return self.y0 - self.height * self.cell

    @property
    def bounds_3857(self) -> tuple[float, float, float, float]:
        """(minx, miny, maxx, maxy) en EPSG:3857."""
        return (self.x0, self.y1, self.x1, self.y0)

    @property
    def shape(self) -> tuple[int, int]:
        return (self.height, self.width)

    @property
    def transform(self):
        from affine import Affine

        return Affine(self.cell, 0.0, self.x0, 0.0, -self.cell, self.y0)

    @property
    def bbox_wgs84(self) -> list[float]:
        west, north = _TO_4326.transform(self.x0, self.y0)
        east, south = _TO_4326.transform(self.x1, self.y1)
        return [round(west, 7), round(south, 7), round(east, 7), round(north, 7)]

    def padded_bbox_wgs84(self, pad_deg: float = 0.01) -> list[float]:
        w, s, e, n = self.bbox_wgs84
        return [w - pad_deg, s - pad_deg, e + pad_deg, n + pad_deg]

    @property
    def centroid_wgs84(self) -> tuple[float, float]:
        lon, lat = _TO_4326.transform((self.x0 + self.x1) / 2, (self.y0 + self.y1) / 2)
        return lon, lat

    def lonlat_to_cell(self, lon: float, lat: float) -> tuple[int, int] | None:
        """Devuelve (fila, columna) de la celda que contiene (lon, lat) o None."""
        x, y = _TO_3857.transform(lon, lat)
        col = math.floor((x - self.x0) / self.cell)
        row = math.floor((self.y0 - y) / self.cell)
        if 0 <= row < self.height and 0 <= col < self.width:
            return row, col
        return None

    def to_contract(self) -> dict:
        return {
            "crs": "EPSG:3857",
            "bbox": self.bbox_wgs84,
            "width": self.width,
            "height": self.height,
            "cellSizeM": self.cell,
            "encoding": "png-uint8-linear",
            "nodata": 255,
        }
