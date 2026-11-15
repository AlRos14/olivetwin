"""Acceso a red: CMR, descargas autenticadas (Earthdata vía ~/.netrc), Harmony y Planetary Computer.

Las credenciales nunca se leen ni se registran aquí: ``requests`` y ``harmony-py``
las toman de ~/.netrc de forma estándar.
"""
from __future__ import annotations

import datetime as dt
import json
import time
from pathlib import Path

import requests

CMR_GRANULES = "https://cmr.earthdata.nasa.gov/search/granules.umm_json"
CMR_COLLECTIONS = "https://cmr.earthdata.nasa.gov/search/collections.umm_json"
PC_STAC = "https://planetarycomputer.microsoft.com/api/stac/v1"
PC_SIGN = "https://planetarycomputer.microsoft.com/api/sas/v1/sign"
PC_SAS_TOKEN = "https://planetarycomputer.microsoft.com/api/sas/v1/token"

USER_AGENT = "olivetwin-analysis/1.0"


def log(msg: str) -> None:
    print(f"[{dt.datetime.now():%H:%M:%S}] {msg}", flush=True)


def session() -> requests.Session:
    s = requests.Session()
    s.headers["User-Agent"] = USER_AGENT
    return s


def retry(fn, tries: int = 4, wait: float = 5.0):
    last = None
    for i in range(tries):
        try:
            return fn()
        except Exception as exc:  # noqa: BLE001
            last = exc
            log(f"  reintento {i + 1}/{tries} tras error: {exc}")
            time.sleep(wait * (i + 1))
    raise last  # type: ignore[misc]


def _get_json(url: str, params: dict) -> dict:
    r = session().get(url, params=params, timeout=120)
    r.raise_for_status()
    return r.json()


def cmr_collection(concept_id: str) -> dict:
    r = retry(lambda: session().get(CMR_COLLECTIONS, params={"concept_id": concept_id}, timeout=60))
    r.raise_for_status()
    items = r.json()["items"]
    if not items:
        raise RuntimeError(f"CMR no devuelve la colección {concept_id}")
    return items[0]


def cmr_granules(collection_id: str, bbox, start: str, end: str, **extra) -> list[dict]:
    """Granulos UMM de una colección que intersecan bbox (W,S,E,N) entre start y end."""
    out: list[dict] = []
    page = 1
    while True:
        params = {
            "collection_concept_id": collection_id,
            "bounding_box": ",".join(f"{v:.7f}" for v in bbox),
            "temporal": f"{start},{end}",
            "page_size": 50, "page_num": page, "sort_key": "start_date",
        }
        params.update(extra)
        items = retry(lambda: _get_json(CMR_GRANULES, params))["items"]
        out.extend(items)
        if len(items) < 50:
            break
        page += 1
    return out


def granule_name(item: dict) -> str:
    return item["umm"]["GranuleUR"]


def granule_data_url(item: dict, suffix: str = ".h5") -> str | None:
    for u in item["umm"].get("RelatedUrls", []):
        url = u.get("URL", "")
        if u.get("Type") == "GET DATA" and url.startswith("https://") and url.endswith(suffix):
            return url
    return None


def download(url: str, dest: Path, sess: requests.Session | None = None) -> Path:
    """Descarga con caché: si ``dest`` existe, no se vuelve a descargar."""
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    part = dest.with_name(dest.name + ".part")
    s = sess or session()

    def _do():
        with s.get(url, stream=True, timeout=300) as r:
            r.raise_for_status()
            with open(part, "wb") as f:
                for chunk in r.iter_content(1 << 20):
                    f.write(chunk)
    retry(_do)
    part.replace(dest)
    return dest


def harmony_subset(collection_id: str, granule_id: str, bbox, variables: list[str], out_dir: Path,
                   wait: bool = True) -> dict:
    """Recorte Harmony a GeoTIFF con caché en ``out_dir/harmony.json``.

    Devuelve {"jobId", "files": [...], "status", "message"}.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    marker = out_dir / "harmony.json"
    state = json.loads(marker.read_text()) if marker.exists() else {}
    if state.get("status") == "done" and all((out_dir / f).exists() for f in state.get("files", [])):
        return state

    from harmony import BBox, Client, Collection, Environment, Request

    client = Client(env=Environment.PROD)
    if not state.get("jobId") or state.get("status") == "failed":
        w, s, e, n = bbox
        req = Request(
            collection=Collection(id=collection_id), granule_id=[granule_id],
            spatial=BBox(w, s, e, n), variables=variables, format="image/tiff",
            skip_preview=True,
        )
        if not req.is_valid():
            raise RuntimeError(f"Petición Harmony inválida: {req.error_messages()}")
        job_id = client.submit(req)
        state = {"jobId": job_id, "granuleId": granule_id, "collectionId": collection_id,
                 "variables": variables, "status": "submitted",
                 "submittedAt": dt.datetime.now(dt.timezone.utc).isoformat()}
        marker.write_text(json.dumps(state, indent=2))
        log(f"  Harmony: trabajo {job_id} enviado para {granule_id}")
    if not wait:
        return state
    job_id = state["jobId"]
    try:
        client.wait_for_processing(job_id, show_progress=False)
    except Exception as exc:  # noqa: BLE001
        status = client.status(job_id)
        state.update(status="failed", message=f"{exc} | {status.get('message')}")
        marker.write_text(json.dumps(state, indent=2))
        raise RuntimeError(f"Harmony job {job_id} falló: {state['message']}") from exc
    files = []
    for fut in client.download_all(job_id, directory=str(out_dir), overwrite=True):
        files.append(Path(fut.result()).name)
    status = client.status(job_id)
    state.update(status="done", files=files, message=status.get("message"))
    marker.write_text(json.dumps(state, indent=2))
    return state


_TOKEN_CACHE: dict[tuple[str, str], tuple[str, float]] = {}
_TOKEN_LOCK = __import__("threading").Lock()


def pc_sign(href: str) -> str:
    """Firma anónima SAS de Planetary Computer.

    Se pide un token por cuenta/contenedor (``/api/sas/v1/token/{cuenta}/{contenedor}``) y se reutiliza
    30 min, para no superar el límite de peticiones de ``/sign``.
    """
    from urllib.parse import urlparse

    u = urlparse(href)
    if not u.netloc.endswith(".blob.core.windows.net"):
        r = retry(lambda: _get_json(PC_SIGN, {"href": href}))
        return r["href"]
    key = (u.netloc.split(".")[0], u.path.lstrip("/").split("/")[0])
    with _TOKEN_LOCK:
        hit = _TOKEN_CACHE.get(key)
        if not hit or time.time() - hit[1] > 1800:
            tok = retry(lambda: _get_json(f"{PC_SAS_TOKEN}/{key[0]}/{key[1]}", {}), tries=6, wait=10)["token"]
            hit = (tok, time.time())
            _TOKEN_CACHE[key] = hit
    return f"{href}?{hit[0]}"


def pc_search(collection: str, bbox, datetime_range: str, limit: int = 200, query: dict | None = None) -> list[dict]:
    feats: list[dict] = []
    body = {"collections": [collection], "bbox": list(bbox), "datetime": datetime_range, "limit": limit}
    if query:
        body["query"] = query
    url = f"{PC_STAC}/search"
    while True:
        r = retry(lambda: session().post(url, json=body, timeout=120))
        r.raise_for_status()
        j = r.json()
        feats.extend(j.get("features", []))
        nxt = next((lk for lk in j.get("links", []) if lk.get("rel") == "next"), None)
        if not nxt:
            break
        url = nxt["href"]
        body = nxt.get("body", body)
    return feats


def pc_collection(collection: str) -> dict:
    r = retry(lambda: session().get(f"{PC_STAC}/collections/{collection}", timeout=60))
    r.raise_for_status()
    return r.json()
