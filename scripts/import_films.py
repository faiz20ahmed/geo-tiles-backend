import os
import psycopg2
import rasterio
from rasterio.warp import transform_bounds
from dotenv import load_dotenv

# ======================================
# LOAD ENVIRONMENT
# ======================================

load_dotenv()

DB_URL = os.getenv("DATABASE_URL_RAILWAY")

if not DB_URL:
    raise Exception("DATABASE_URL_RAILWAY not found in .env")

# ======================================
# DIRECTORIES
# ======================================

INCOMING_DIR = "incoming_films"
PROCESSED_DIR = "files"

TILE_SIZE = 0.001

# إنشاء المجلدات إن لم تكن موجودة
os.makedirs(INCOMING_DIR, exist_ok=True)
os.makedirs(PROCESSED_DIR, exist_ok=True)

# ======================================
# DATABASE CONNECTION
# ======================================

conn = psycopg2.connect(DB_URL)
cur = conn.cursor()

print("✅ Connected to database")

# ======================================
# READ FILM BOUNDS
# ======================================

def get_film_bounds(path):

    with rasterio.open(path) as src:

        bounds = src.bounds
        crs = src.crs

        if crs and crs.to_string() != "EPSG:4326":

            minx, miny, maxx, maxy = transform_bounds(
                crs,
                "EPSG:4326",
                bounds.left,
                bounds.bottom,
                bounds.right,
                bounds.top
            )

        else:

            minx = bounds.left
            miny = bounds.bottom
            maxx = bounds.right
            maxy = bounds.top

    return miny, maxy, minx, maxx


# ======================================
# CHECK FILM
# ======================================

def film_exists(code):

    cur.execute(
        "SELECT film_code FROM films WHERE film_code=%s",
        (code,)
    )

    return cur.fetchone()


# ======================================
# DELETE OLD FILM
# ======================================

def delete_old_film(code):

    print("⚠️ Deleting old film:", code)

    cur.execute(
        "DELETE FROM geo_tiles WHERE film_code=%s",
        (code,)
    )

    cur.execute(
        "DELETE FROM films WHERE film_code=%s",
        (code,)
    )

    conn.commit()


# ======================================
# REGISTER FILM
# ======================================

def register_film(code, path, min_lat, max_lat, min_lon, max_lon):

    cur.execute("""
        INSERT INTO films
        (film_code,file_path,min_lat,max_lat,min_lon,max_lon)
        VALUES (%s,%s,%s,%s,%s,%s)
    """,
    (code, path, min_lat, max_lat, min_lon, max_lon))

    conn.commit()

    print("✅ Film registered")


# ======================================
# GENERATE TILES
# ======================================

def generate_tiles(code, min_lat, max_lat, min_lon, max_lon):

    print("🧩 Generating tiles...")

    lat = round(min_lat, 3)

    count = 0

    while lat <= max_lat:

        lon = round(min_lon, 3)

        while lon <= max_lon:

            cur.execute("""
                INSERT INTO geo_tiles
                (sw_lat,sw_lon,film_code,film_date)
                VALUES (%s,%s,%s,NOW())
                ON CONFLICT DO NOTHING
            """,
            (lat, lon, code))

            lon += TILE_SIZE
            count += 1

        lat += TILE_SIZE

    conn.commit()

    print("✅ Tiles generated:", count)


# ======================================
# PROCESS FILMS
# ======================================

def process_films():

    files = os.listdir(INCOMING_DIR)

    if not files:
        print("⚠️ No films found in incoming_films")
        return

    for file in files:

        if not file.lower().endswith(".tif"):
            continue

        path = os.path.join(INCOMING_DIR, file)

        code = os.path.splitext(file)[0]

        print("\n🎬 Processing:", code)

        # تحقق من وجود الفيلم

        if film_exists(code):

            answer = input(
                "⚠️ Film exists. Replace? (y/n): "
            )

            if answer.lower() != "y":

                print("⏭ Skipped")

                continue

            delete_old_film(code)

        # قراءة الحدود الجغرافية

        min_lat, max_lat, min_lon, max_lon = get_film_bounds(path)

        print("📍 Bounds:")
        print("Lat:", min_lat, "→", max_lat)
        print("Lon:", min_lon, "→", max_lon)

        # تسجيل الفيلم

        register_film(
            code,
            os.path.join(PROCESSED_DIR, file),
            min_lat,
            max_lat,
            min_lon,
            max_lon
        )

        # توليد Tiles

        generate_tiles(
            code,
            min_lat,
            max_lat,
            min_lon,
            max_lon
        )

        # نقل الفيلم

        new_path = os.path.join(PROCESSED_DIR, file)

        os.rename(path, new_path)

        print("📦 Film moved to:", new_path)

        print("✅ Imported:", code)


# ======================================
# RUN
# ======================================

process_films()

print("\n🚀 Import finished")