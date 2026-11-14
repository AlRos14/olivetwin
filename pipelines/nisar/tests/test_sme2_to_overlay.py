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
THIRD = ("NISAR_L3_PR_SME2_034_112_A_022_4005_DHDH_A_20261107T120145_20261107T120219_"
         "P05023_N_F_J_001.h5")


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
    # Manifiesto real vacío propio: el del repo ya contiene datos publicados.
    (pub / "data/real/manifest.json").write_text(json.dumps(
        {"schemaVersion": "1.1.0", "datasetMode": "real", "appTitle": "OliveTwin", "zones": []}))
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
    staged = json.loads((out / "layer.staging.json").read_text())
    assert "_staging" in staged
    layer = staged["layer"]
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


def test_skipped_latest_blocks_publish_without_date(tmp_path, public):
    good = tmp_path / NAMES[0]
    fake_sme2.make(good, seed=0)
    empty = tmp_path / NAMES[1]
    fake_sme2.make(empty, seed=1)
    import h5py
    with h5py.File(empty, "r+") as f:
        f["/science/LSAR/SME2/grids/soilMoisture"][...] = -9999.0
    args = ("--publish", "--approved-by", "R", "--public-dir", str(public))
    assert run([good, empty], tmp_path, *args) == 1
    assert run([good, empty], tmp_path, *args, "--date", "2026-09-17") == 0
    m = json.loads((public / "data/real/manifest.json").read_text())
    assert m["zones"][0]["layers"][0]["provenance"]["acquisitionDate"] == "2026-09-17T00:45:09Z"


def test_same_day_frames_do_not_collide(tmp_path):
    a = tmp_path / "NISAR_L3_PR_SME2_030_156_D_073_4005_DHDH_A_20260917T004509_20260917T004543_P05023_N_F_J_001.h5"
    b = tmp_path / "NISAR_L3_PR_SME2_030_156_D_074_4005_DHDH_A_20260917T004543_20260917T004617_P05023_N_F_J_001.h5"
    fake_sme2.make(a, seed=0)
    fake_sme2.make(b, seed=1)
    assert run([a, b], tmp_path) == 0
    assert len(list((tmp_path / "st/delta-test/png").glob("*.png"))) == 2
    assert len(list((tmp_path / "st/delta-test/geotiff").glob("*.tif"))) == 2


def test_zone_bbox_contains_layer(scenes, tmp_path, public):
    mp = public / "data/real/manifest.json"
    m = json.loads(mp.read_text())
    m["zones"] = [{"id": "delta-test", "name": "x", "bbox": [-90.31, 29.91, -90.25, 29.95], "layers": []}]
    mp.write_text(json.dumps(m))
    assert run(scenes, tmp_path, "--publish", "--approved-by", "R", "--public-dir", str(public)) == 0
    z = json.loads(mp.read_text())["zones"][0]
    lb = z["layers"][0]["bbox"]
    assert z["bbox"][0] <= lb[0] and z["bbox"][1] <= lb[1] and z["bbox"][2] >= lb[2] and z["bbox"][3] >= lb[3]


def test_bad_manifest_leaves_no_orphan_png(scenes, tmp_path, public):
    mp = public / "data/real/manifest.json"
    mp.write_text(json.dumps({"schemaVersion": "1.1.0", "datasetMode": "real", "appTitle": "x"}))
    with pytest.raises(SystemExit):
        run(scenes, tmp_path, "--publish", "--approved-by", "R", "--public-dir", str(public))
    assert not (public / "data/real/zones").exists()


def test_mixed_crid_staging_exit_code(scenes, tmp_path):
    mixed = scenes[1].with_name(scenes[1].name.replace("P05023", "P05036"))
    scenes[1].rename(mixed)
    assert run([scenes[0], mixed], tmp_path) == 2


# --------------------------------------------------------------- serie temporal v1.2
@pytest.fixture
def three_scenes(tmp_path):
    paths = []
    for i, n in enumerate([*NAMES, THIRD]):
        p = tmp_path / n
        fake_sme2.make(p, seed=i)
        paths.append(p)
    return paths


def published_layer(public):
    m = json.loads((public / "data/real/manifest.json").read_text())
    zone = next(z for z in m["zones"] if z["id"] == "delta-test")
    layer = next(l for l in zone["layers"] if l["id"] == "soil-moisture")
    return m, zone, layer


def test_publish_series_time_steps(three_scenes, tmp_path, public):
    assert run(three_scenes, tmp_path, "--publish", "--approved-by", "Revisor",
               "--public-dir", str(public)) == 0
    m, zone, layer = published_layer(public)
    assert m["schemaVersion"] == "1.2.0"
    steps = layer["timeSteps"]
    assert len(steps) == 3
    dates = [s["date"] for s in steps]
    assert dates == sorted(dates) and len(set(dates)) == 3
    # layer.image / bbox = último paso (compatibilidad v1.1)
    assert layer["image"] == steps[-1]["image"]
    assert layer["bbox"] == steps[-1]["bbox"]
    assert layer["image"] == "data/real/zones/delta-test/soil-moisture/20261107T120145.png"
    # Escala y leyenda comunes a toda la serie.
    assert layer["range"] == [0.0, 0.6]
    assert layer["legend"][0]["label"] == "Más seco"
    assert layer["legend"][-1]["label"] == "Más húmedo"
    assert layer["legend"][1]["label"] == "0,12 m³/m³"
    for step in steps:
        prov = step["provenance"]
        assert set(prov) == {"acquisitionDate", "sceneId", "processingVersion", "note", "crid"}
        assert prov["acquisitionDate"] == step["date"]
        assert prov["processingVersion"] == "P05023"
        assert prov["crid"] == "P05023"
        assert (public / step["image"]).is_file()
        # El bbox de la zona contiene TODOS los pasos.
        assert zone["bbox"][0] <= step["bbox"][0] and zone["bbox"][1] <= step["bbox"][1]
        assert zone["bbox"][2] >= step["bbox"][2] and zone["bbox"][3] >= step["bbox"][3]
    assert len(list((public / "data/real/zones/delta-test/soil-moisture").glob("*.png"))) == 3


def test_date_publishes_single_image_without_series(scenes, tmp_path, public):
    assert run(scenes, tmp_path, "--publish", "--approved-by", "R",
               "--date", "2026-09-17", "--public-dir", str(public)) == 0
    m, _, layer = published_layer(public)
    assert "timeSteps" not in layer
    assert layer["image"] == "data/real/zones/delta-test/soil-moisture/20260917T004509.png"
    assert layer["provenance"]["acquisitionDate"] == "2026-09-17T00:45:09Z"
    assert m["schemaVersion"] == "1.1.0"  # sin timeSteps no sube la versión del contrato
    assert (public / layer["image"]).is_file()


def test_auto_scale_uses_pooled_percentiles(scenes, tmp_path):
    assert run(scenes, tmp_path, "--auto-scale") == 0
    out = tmp_path / "st/delta-test"
    report = json.loads((out / "report.json").read_text())
    scale = report["scale"]
    assert scale["mode"] == "auto" and scale["vmin"] < scale["vmax"]
    vmin, vmax = scale["vmin"], scale["vmax"]
    assert abs(round(vmin / 0.05) * 0.05 - vmin) < 1e-9
    assert abs(round(vmax / 0.05) * 0.05 - vmax) < 1e-9
    assert scale["percentiles"]["p2"] >= vmin - 1e-9
    assert scale["percentiles"]["p98"] <= vmax + 1e-9
    assert (scale["percentiles"]["samples"]) > 0
    layer = json.loads((out / "layer.staging.json").read_text())["layer"]
    assert layer["range"] == [vmin, vmax]
    # La leyenda intermedia usa coma decimal española.
    assert all("," in s["label"] or s["label"] in ("Más seco", "Más húmedo")
               for s in layer["legend"])


def test_from_staging_rerenders_same_bbox_with_other_scale(scenes, tmp_path):
    assert run(scenes, tmp_path) == 0
    src = tmp_path / "st/delta-test"
    before = {s["sceneId"]: s["bbox"]
              for s in json.loads((src / "report.json").read_text())["scenes"]}
    rc = conv.main(["--from-staging", str(src), "--zone-id", "delta-test",
                    "--zone-name", "Delta (test)", "--staging", str(tmp_path / "st2"),
                    "--vmin", "0.1", "--vmax", "0.4"])
    assert rc == 0
    out2 = tmp_path / "st2/delta-test"
    report2 = json.loads((out2 / "report.json").read_text())
    assert report2["mode"] == "from-staging"
    assert report2["scale"]["mode"] == "manual"
    assert [report2["scale"]["vmin"], report2["scale"]["vmax"]] == [0.1, 0.4]
    after = {s["sceneId"]: s["bbox"] for s in report2["scenes"]}
    assert after.keys() == before.keys()
    for scene_id, bbox in before.items():
        assert after[scene_id] == bbox  # mismo bbox: no se recalcula la georreferencia
    assert all(s["georefCheck"]["ok"] for s in report2["scenes"])
    assert len(list((out2 / "png").glob("*.png"))) == 2
    # No se reescribe layer.staging.json de la fuente.
    assert json.loads((src / "layer.staging.json").read_text())["layer"]["range"] == [0.0, 0.6]


def test_from_staging_publishes_series(scenes, tmp_path, public):
    assert run(scenes, tmp_path) == 0
    src = tmp_path / "st/delta-test"
    assert conv.main(["--from-staging", str(src), "--zone-id", "delta-test",
                      "--zone-name", "Delta (test)", "--staging", str(tmp_path / "st2"),
                      "--vmin", "0.1", "--vmax", "0.4",
                      "--publish", "--approved-by", "Revisor",
                      "--public-dir", str(public)]) == 0
    m, _, layer = published_layer(public)
    assert m["schemaVersion"] == "1.2.0"
    assert len(layer["timeSteps"]) == 2
    assert layer["provenance"]["sceneId"] == layer["timeSteps"][-1]["provenance"]["sceneId"]
    assert layer["provenance"]["acquisitionDate"] == "2026-10-19T11:19:03Z"
    assert layer["range"] == [0.1, 0.4]
    assert all((public / s["image"]).is_file() for s in layer["timeSteps"])


def test_meta_from_provenance_uses_standard_name_or_fallback():
    prov = {"sceneId": "escena-rara", "acquisitionDate": "2026-05-01T10:00:00Z",
            "crid": "P05036", "maturity": "BETA"}
    meta = conv.meta_from_provenance(prov, "x")
    assert meta["acquisitionStart"] == "2026-05-01T10:00:00Z"
    assert meta["date"] == "2026-05-01" and meta["crid"] == "P05036"
    std = conv.meta_from_provenance({"sceneId": Path(NAMES[0]).stem,
                                     "acquisitionDate": "2000-01-01T00:00:00Z"}, "x")
    assert std["crid"] == "P05023" and std["track"] == 156 and std["date"] == "2026-09-17"


def test_skipped_series_requires_allow_skipped(tmp_path, public):
    import h5py
    good = tmp_path / NAMES[0]
    fake_sme2.make(good, seed=0)
    empty = tmp_path / NAMES[1]
    fake_sme2.make(empty, seed=1)
    with h5py.File(empty, "r+") as f:
        f["/science/LSAR/SME2/grids/soilMoisture"][...] = -9999.0
    args = ("--publish", "--approved-by", "R", "--public-dir", str(public))
    before = (public / "data/real/manifest.json").read_text()
    assert run([good, empty], tmp_path, *args) == 1
    assert (public / "data/real/manifest.json").read_text() == before
    assert run([good, empty], tmp_path, *args, "--allow-skipped") == 0
    m, _, layer = published_layer(public)
    assert m["schemaVersion"] == "1.2.0"
    assert len(layer["timeSteps"]) == 1
    assert layer["timeSteps"][0]["date"] == "2026-09-17T00:45:09Z"
