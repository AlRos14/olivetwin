"""Utilidades comunes de las fuentes NISAR (nombres de granulo, licencias)."""
from __future__ import annotations

import datetime as dt
import re

NISAR_PROVIDER = "NASA/JPL–ISRO NISAR, distribuido por ASF DAAC"
NASA_DATA_POLICY_URL = "https://www.earthdata.nasa.gov/engage/open-data-services-software-policies/data-use-guidance"


def nisar_license(collection_title: str, doi: str, cmr_use_constraints: str) -> str:
    return (
        f"Datos abiertos de NASA ESDIS ({cmr_use_constraints}); uso sin restricciones según «NASA ESDIS "
        f"Data Use and Citation Guidance» ({NASA_DATA_POLICY_URL}): reconocer a NASA como fuente y citar el "
        f"conjunto de datos. Cita: NASA/JPL–ISRO NISAR, {collection_title}, ASF DAAC, doi:{doi}."
    )


_NAME_RE = re.compile(
    r"NISAR_L(?P<level>\d)_(?P<proc>[A-Z]{2})_(?P<ptype>[A-Z0-9]+)_(?P<cycle>\d{3})_(?P<track>\d{3})_"
    r"(?P<dir>[AD])_(?P<frame>\d{3})_(?P<mode>\d{4})_(?P<pol>[A-Z]{4})_(?P<obsmode>[A-Z])_"
    r"(?P<start>\d{8}T\d{6})_(?P<end>\d{8}T\d{6})_(?P<crid>[A-Z]\d{5})_(?P<flag1>[A-Z])_(?P<flag2>[A-Z])_"
    r"(?P<flag3>[A-Z])_(?P<counter>\d{3})$"
)


def parse_l2l3_name(name: str) -> dict:
    """Interpreta un nombre GCOV/SME2 (estructura del nombre, sin asumir significados no documentados)."""
    m = _NAME_RE.match(name.removesuffix(".h5"))
    if not m:
        raise ValueError(f"nombre NISAR no reconocido: {name}")
    d = m.groupdict()
    start = dt.datetime.strptime(d["start"], "%Y%m%dT%H%M%S").replace(tzinfo=dt.timezone.utc)
    d["start_iso"] = start.strftime("%Y-%m-%dT%H:%M:%SZ")
    d["production_flags"] = f"{d['flag1']}_{d['flag2']}_{d['flag3']}_{d['counter']}"
    return d


def pick_latest_versions(names: list[str]) -> list[str]:
    """Si un mismo producto existe con varios contadores (_001, _002…), se queda el mayor."""
    best: dict[tuple, tuple[str, str]] = {}
    for n in names:
        d = parse_l2l3_name(n)
        key = (d["ptype"], d["track"], d["dir"], d["frame"], d["start"])
        rank = d["counter"]
        if key not in best or rank > best[key][0]:
            best[key] = (rank, n)
    return sorted((v[1] for v in best.values()), key=lambda n: parse_l2l3_name(n)["start"])


def production_flag_note(flags: str, reference: str = "N_F_J") -> str | None:
    if flags.startswith(reference):
        return None
    return (
        f"Escena con marca de producción distinta (…_{flags} frente a …_{reference}_00x del resto de la serie): "
        "las diferencias respecto a otras fechas pueden deberse en parte al procesado."
    )
