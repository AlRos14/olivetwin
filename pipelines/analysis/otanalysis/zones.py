"""Zonas de estudio. Los bbox se copian literalmente de frontend/public/data/real/manifest.json."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Zone:
    id: str
    name: str
    bbox: tuple[float, float, float, float]
    nisar_track: int
    nisar_direction: str  # "A" o "D"
    nisar_frame: int

    @property
    def nisar_key(self) -> str:
        """Fragmento del nombre de granulo NISAR: _<track>_<dir>_<frame>_."""
        return f"_{self.nisar_track:03d}_{self.nisar_direction}_{self.nisar_frame:03d}_"

    @property
    def direction_label(self) -> str:
        return "ascendente" if self.nisar_direction == "A" else "descendente"


ZONES: dict[str, Zone] = {
    "jaen": Zone("jaen", "Jaén", (-3.9771788, 37.6280039, -3.5855359, 37.8918894), 87, "A", 21),
    "toledo": Zone("toledo", "Toledo", (-4.3547721, 39.5528176, -3.67637, 39.9870152), 95, "D", 68),
}
