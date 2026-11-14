import json
import shutil
import sys
from pathlib import Path

import numpy as np
import pytest
from PIL import Image
from pyproj import Transformer

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE), str(HERE.parent)]
import fake_sme2  # noqa: E402
import sme2_to_overlay as conv  # noqa: E402

REPO = HERE.parents[2]
AOI = ["-90.32", "29.90", "-90.24", "29.96"]
NAMES = [
    "NISAR_L3_PR_SME2_030_156_D_073_4005_DHDH_A_20260917T004509_20260917T004543_P05023_N_F_J_001.h5",
    "NISAR_L3_PR_SME2_033_105_A_017_4005_DHDH_A_20261019T111903_20261019T111937_P05023_N_F_J_001.h5",
]


@pytest.fixture
def scenes(tmp_path):
    paths = []
    for i, n in enumerate(NAMES):
        p = tmp_path / n
        fake_sme2.make(p, seed=i)
        paths.append(p)
    return paths


@pytest.fixture
def public(tmp_path):
    pub = tmp_path / "public"
    (pub / "data/real").mkdir(parents=True)
    shutil.copy(REPO / "frontend/public/data/real/manifest.json", pub / "data/real/manifest.json")
    return pub


def run(scenes, tmp_path, *extra):
    return conv.main([*map(str, scenes), "--aoi", *AOI, "--zone-id", "delta-test",
                      "--zone-name", "Delta (test)", "--staging", str(tmp_path / "st"), *extra])


def test_staging_outputs_and_georef(scenes, tmp_path):
    assert run(scenes, tmp_path) == 0
    out = tmp_path / "st/delta-test"
    report = json.loads((out / "report.json").read_text())
    assert report["problems"] == []
    assert len(report["scenes"]) == 2
    for s in report["scenes"]:
        assert s["georefCheck"]["ok"] and s["georefCheck"]["checked"] == 25
        w, so, e, n = s["bbox"]
        # El bbox de la imagen cubre el AOI con a lo sumo ~1 píxel (200 m) de margen.
        assert w <= -90.32 and e >= -90.24 and so <= 29.90 and n >= 29.96
        assert -90.32 - w < 0.003 and e + 90.24 < 0.003
    layer = json.loads((out / "layer.json").read_text())
    assert layer["provenance"]["acquisitionDate"] == "2026-10-19T11:19:03Z"  # la más reciente
    assert layer["provenance"]["processingVersion"] == "P05023"
    assert layer["status"] == "processed_real" and layer["imageCrs"] == "EPSG:3857"
    png = sorted((out / "png").glob("*.png"))[0]
    a = np.array(Image.open(png))
    assert a.shape[2] == 4 and set(np.unique(a[..., 3])) == {0, 255}


def test_pixel_lands_at_true_location(scenes, tmp_path):
    """Comprobación independiente: valor de un píxel EASE en lon/lat conocida vs PNG colocado como Leaflet."""
    sm, x, y = fake_sme2.make(tmp_path / "ref.h5", seed=0)
    assert run(scenes[:1], tmp_path) == 0
    out = tmp_path / "st/delta-test"
    bbox = json.loads((out / "report.json").read_text())["scenes"][0]["bbox"]
    a = np.array(Image.open(next((out / "png").glob("*.png"))))
    to_ll = Transformer.from_crs(6933, 4326, always_xy=True)
    to_m = Transformer.from_crs(4326, 3857, always_xy=True)
    (mx0, my0), (mx1, my1) = to_m.transform(bbox[0], bbox[1]), to_m.transform(bbox[2], bbox[3])
    H, W = a.shape[:2]
    hits = 0
    for lon, lat in [(-90.30, 29.92), (-90.26, 29.95), (-90.28, 29.93)]:
        cx, cy = Transformer.from_crs(4326, 6933, always_xy=True).transform(lon, lat)
        c, r = int(np.abs(x - cx).argmin()), int(np.abs(y - cy).argmin())
        lo, la = to_ll.transform(x[c], y[r])
        mx, my = to_m.transform(lo, la)
        px = a[int((my1 - my) / (my1 - my0) * H), int((mx - mx0) / (mx1 - mx0) * W)]
        v = sm[r, c]
        if v == -9999.0:
            assert px[3] == 0
        else:
            assert px[3] == 255
            assert np.abs(px.astype(int) - conv.colorize(np.array([v]), 0.0, 0.6)[0].astype(int)).max() <= 1
            hits += 1
    assert hits >= 1


def test_publish_requires_approval(scenes, tmp_path, public):
    with pytest.raises(SystemExit):
        run(scenes, tmp_path, "--publish", "--public-dir", str(public))


def test_publish_writes_manifest_idempotently(scenes, tmp_path, public):
    for _ in range(2):
        assert run(scenes, tmp_path, "--publish", "--approved-by", "Revisor", "--public-dir", str(public)) == 0
    m = json.loads((public / "data/real/manifest.json").read_text())
    assert m["datasetMode"] == "real" and len(m["zones"]) == 1
    layers = m["zones"][0]["layers"]
    assert len(layers) == 1 and layers[0]["provenance"]["approvedBy"] == "Revisor"
    assert (public / layers[0]["image"]).is_file()


def test_mixed_crid_blocks_publish(scenes, tmp_path, public):
    mixed = scenes[1].with_name(scenes[1].name.replace("P05023", "P05036"))
    scenes[1].rename(mixed)
    before = (public / "data/real/manifest.json").read_text()
    assert run([scenes[0], mixed], tmp_path, "--publish", "--approved-by", "R", "--public-dir", str(public)) == 1
    assert (public / "data/real/manifest.json").read_text() == before


def test_aoi_outside_scene_fails(scenes, tmp_path):
    rc = conv.main([*map(str, scenes), "--aoi", "-3.86", "37.69", "-3.61", "37.90", "--zone-id", "jaen",
                    "--zone-name", "J", "--staging", str(tmp_path / "st")])
    assert rc == 1


def test_rejects_bad_name(tmp_path):
    with pytest.raises(ValueError):
        conv.parse_name(Path("cualquier_cosa.h5"))
