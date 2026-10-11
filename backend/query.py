import datetime as dt
import os
import dotenv
import ee
import folium
import matplotlib

dotenv.load_dotenv()
CARTO_API_KEY = os.getenv("CARTO_API_KEY")
if not CARTO_API_KEY:
    raise SystemExit("CARTO_API_KEY missing: check your .env file")

GOOGLE_CLOUD_PROJECT = os.getenv("GOOGLE_CLOUD_PROJECT")
if not GOOGLE_CLOUD_PROJECT:
    raise SystemExit("GOOGLE_CLOUD_PROJECT missing: check your .env file")

try:
    ee.Initialize(project=GOOGLE_CLOUD_PROJECT)
except Exception:
    ee.Authenticate()
    ee.Initialize(project=GOOGLE_CLOUD_PROJECT)


BAND = "Gap_Filled_DNB_BRDF_Corrected_NTL"  # verify with bandNames()
end = dt.date.today() - dt.timedelta(days=7)
start = end - dt.timedelta(days=30)
ic = (ee.ImageCollection("NASA/VIIRS/002/VNP46A2") 
    .filterDate(start.isoformat(), end.isoformat()) 
    .select(BAND) 
    .map(lambda im: im.resample("bicubic")))
if ic.size().getInfo() == 0:
    raise SystemExit("No VIIRS images in range")

cmap = matplotlib.colormaps["inferno"]
PALETTE = [matplotlib.colors.to_hex(cmap(i/15))[1:] for i in range(16)]
latest = ic.median()
vis = {"min": 2, "max": 90, "palette": PALETTE}


def add_ee_layer(self, img, vis, name):
    url = img.getMapId(vis)["tile_fetcher"].url_format
    folium.raster_layers.TileLayer(
        tiles=url, attr="Google Earth Engine / NASA VIIRS",
        name=name, overlay=True, control=True, opacity=1).add_to(self)


folium.Map.add_ee_layer = add_ee_layer

m = folium.Map(location=[28.5383, -81.3792], zoom_start=9, tiles=None)

folium.TileLayer(
    tiles=f"https://basemaps.cartocdn.com/dark_all/{{z}}/{{x}}/{{y}}.png?key={CARTO_API_KEY}",
    attr="© OpenStreetMap contributors, © CARTO",
    name="Dark basemap").add_to(m)

m.add_ee_layer(latest, vis, f"VIIRS median {start} to {end}")
folium.LayerControl().add_to(m)
m.save("lights.html")
