"""Cloud-masked Sentinel-2 NDVI and Landsat land surface temperature composites.

Cloud masks: Sentinel-2 via Cloud Score+ (cs_cdf >= 0.6); Landsat via QA_PIXEL cloud/shadow/dilated bits.
Composites are per-pixel medians over every clear observation in the period.
"""
from datetime import date, timedelta

from backend.config import CACHE_DIR, CANOPY_NDVI_THRESHOLD, ELMINA_BBOX

CS_CLEAR = 0.6
# Landsat Collection 2 Level-2 surface temperature: kelvin = DN * 0.00341802 + 149.0
ST_SCALE, ST_OFFSET, KELVIN = 0.00341802, 149.0, 273.15
ST_QA_SCALE, ST_QA_MAX_K = 0.01, 4.0
LST_FILL_RADIUS_M = 100
AOI_FILE = CACHE_DIR / "osm" / "aoi.geojson"


def end_exclusive(end: str) -> str:
    """Earth Engine filterDate excludes the end day, so a period ending 2022-12-31 needs 2023-01-01."""
    return (date.fromisoformat(end) + timedelta(days=1)).isoformat()


def st_dn_to_celsius(dn: float) -> float:
    """Same maths as the Earth Engine expression, kept in Python so it can be unit tested."""
    return dn * ST_SCALE + ST_OFFSET - KELVIN


def get_aoi(ee):
    """The OSM Elmina polygon if Batch 2 saved it, else the bounding rectangle."""
    if AOI_FILE.exists():
        import json
        gj = json.loads(AOI_FILE.read_text(encoding="utf-8"))
        return ee.Geometry(gj["features"][0]["geometry"])
    return ee.Geometry.Rectangle(list(ELMINA_BBOX))


def sentinel2_clear(ee, aoi, start: str, end_excl: str):
    s2 = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED").filterBounds(aoi).filterDate(start, end_excl)
    cs = ee.ImageCollection("GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED").filterBounds(aoi).filterDate(start, end_excl)
    return s2.linkCollection(cs, ["cs_cdf"]).map(lambda im: im.updateMask(im.select("cs_cdf").gte(CS_CLEAR)))


def landsat_clear(ee, aoi, start: str, end_excl: str):
    def conf_ok(qa, shift):  # 2-bit confidence field: 0 none, 1 low, 2 medium, 3 high -> keep only none/low
        return qa.rightShift(shift).bitwiseAnd(3).lte(1)

    def mask(im):
        qa = im.select("QA_PIXEL")
        flags = qa.bitwiseAnd(0b11111).eq(0)  # fill, dilated cloud, cirrus, cloud, shadow
        clear = flags.And(conf_ok(qa, 8)).And(conf_ok(qa, 10)).And(conf_ok(qa, 14))
        # ST_QA is the per-pixel temperature uncertainty (K, scale 0.01): drop pixels worse than +/-4 K
        reliable = im.select("ST_QA").multiply(ST_QA_SCALE).lte(ST_QA_MAX_K)
        return im.updateMask(clear.And(reliable))
    colls = [ee.ImageCollection(c).filterBounds(aoi).filterDate(start, end_excl)
             for c in ("LANDSAT/LC08/C02/T1_L2", "LANDSAT/LC09/C02/T1_L2")]
    return colls[0].merge(colls[1]).map(mask)


def ndvi_composite(ee, aoi, start: str, end: str):
    """Median of per-scene NDVI over the period (10 m)."""
    coll = sentinel2_clear(ee, aoi, start, end_exclusive(end))
    return coll.map(lambda im: im.normalizedDifference(["B8", "B4"]).rename("NDVI")).median().clip(aoi)


def lst_composite(ee, aoi, start: str, end: str, fill_gaps: bool = False):
    """Median land surface temperature in deg C (30 m resampled from ~100 m thermal: ranking use only).

    fill_gaps=True fills pixels with no reliable observation from the mean of neighbours within 100 m
    (the native thermal resolution). Used for site rasters only; reported averages stay unfilled.
    """
    coll = landsat_clear(ee, aoi, start, end_exclusive(end))
    to_c = lambda im: im.select("ST_B10").multiply(ST_SCALE).add(ST_OFFSET).subtract(KELVIN).rename("LST_C")
    lst = coll.map(to_c).median()
    if fill_gaps:
        lst = lst.unmask(lst.focalMean(radius=LST_FILL_RADIUS_M, kernelType="circle", units="meters"))
    return lst.clip(aoi)


def lst_valid_mask(ee, aoi, start: str, end: str):
    """1 where the UNFILLED temperature composite has a reliable pixel, 0 where it needed gap filling."""
    return lst_composite(ee, aoi, start, end).mask().rename("LST_VALID").clip(aoi)


def canopy_mask(ndvi, threshold: float = CANOPY_NDVI_THRESHOLD):
    """1 where NDVI >= threshold (a vegetation proxy for canopy, not a tree census); masked where no data."""
    return ndvi.gte(threshold).rename("CANOPY").updateMask(ndvi.mask())
