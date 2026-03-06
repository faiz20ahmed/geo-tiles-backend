import os
import psycopg2
import rasterio
from rasterio.warp import transform_bounds
from dotenv import load_dotenv

load_dotenv()

DB_URL = os.getenv("DATABASE_URL_RAILWAY")

INCOMING_DIR = "incoming_films"
PROCESSED_DIR = "processed_films"

TILE_SIZE = 0.001


conn = psycopg2.connect(DB_URL)
cur = conn.cursor()


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


def film_exists(code):

    cur.execute(
        "SELECT film_code FROM films WHERE film_code=%s",
        (code,)
    )

    return cur.fetchone()


def delete_old_film(code):

    cur.execute(
        "DELETE FROM geo_tiles WHERE film_code=%s",
        (code,)
    )

    cur.execute(
        "DELETE FROM films WHERE film_code=%s",
        (code,)
    )

    conn.commit()


def register_film(code, path, min_lat, max_lat, min_lon, max_lon):

    cur.execute("""
        INSERT INTO films
        (film_code,file_path,min_lat,max_lat,min_lon,max_lon)
        VALUES (%s,%s,%s,%s,%s,%s)
    """,
    (code, path, min_lat, max_lat, min_lon, max_lon))

    conn.commit()


def generate_tiles(code, min_lat, max_lat, min_lon, max_lon):

    lat = round(min_lat,3)

    while lat <= max_lat:

        lon = round(min_lon,3)

        while lon <= max_lon:

            cur.execute("""
                INSERT INTO geo_tiles
                (sw_lat,sw_lon,film_code,film_date)
                VALUES (%s,%s,%s,NOW())
                ON CONFLICT DO NOTHING
            """,
            (lat,lon,code))

            lon += TILE_SIZE

        lat += TILE_SIZE

    conn.commit()


def process_films():

    files = os.listdir(INCOMING_DIR)

    for file in files:

        if not file.lower().endswith(".tif"):
            continue

        path = os.path.join(INCOMING_DIR,file)
        code = os.path.splitext(file)[0]

        print("\nProcessing:",code)

        if film_exists(code):

            answer = input(
                "Film exists. Replace? (y/n): "
            )

            if answer.lower() != "y":
                print("Skipped")
                continue

            delete_old_film(code)

        min_lat,max_lat,min_lon,max_lon = get_film_bounds(path)

        register_film(
            code,
            os.path.join(PROCESSED_DIR,file),
            min_lat,
            max_lat,
            min_lon,
            max_lon
        )

        generate_tiles(
            code,
            min_lat,
            max_lat,
            min_lon,
            max_lon
        )

        os.rename(
            path,
            os.path.join(PROCESSED_DIR,file)
        )

        print("Imported:",code)


process_films()