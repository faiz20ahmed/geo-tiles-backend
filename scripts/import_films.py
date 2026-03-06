import os
import psycopg2
from psycopg2 import sql
import rasterio
from rasterio.warp import calculate_default_transform, reproject, Resampling
from pyproj import CRS

# ----------------------------
# إعداد الاتصال بقاعدة البيانات
# ----------------------------
DB_URL = os.getenv("DATABASE_URL_RAILWAY")  # تأكد من وضع متغير البيئة
conn = psycopg2.connect(DB_URL)
cursor = conn.cursor()

# ----------------------------
# إعدادات الإسقاط الموحد
# ----------------------------
TARGET_CRS = CRS.from_epsg(4326)  # نظام إحداثيات موحد: WGS84

# ----------------------------
# دالة لتحويل الفيلم إذا كان الإسقاط مختلف
# ----------------------------
def reproject_to_target(src_path, dst_path):
    with rasterio.open(src_path) as src:
        if CRS(src.crs) == TARGET_CRS:
            return src_path  # لا حاجة للتحويل
        transform, width, height = calculate_default_transform(
            src.crs, TARGET_CRS, src.width, src.height, *src.bounds)
        kwargs = src.meta.copy()
        kwargs.update({
            'crs': TARGET_CRS,
            'transform': transform,
            'width': width,
            'height': height
        })
        with rasterio.open(dst_path, 'w', **kwargs) as dst:
            for i in range(1, src.count + 1):
                reproject(
                    source=rasterio.band(src, i),
                    destination=rasterio.band(dst, i),
                    src_transform=src.transform,
                    src_crs=src.crs,
                    dst_transform=transform,
                    dst_crs=TARGET_CRS,
                    resampling=Resampling.nearest
                )
    return dst_path

# ----------------------------
# دالة لحساب المربعات المغطاة للفيلم
# ----------------------------
def compute_covered_squares(bounds, step=0.001):
    min_lat, max_lat, min_lon, max_lon = bounds
    squares = []
    lat = round(min_lat, 3)
    while lat <= round(max_lat, 3):
        lon = round(min_lon, 3)
        while lon <= round(max_lon, 3):
            squares.append((round(lat,3), round(lon,3)))
            lon = round(lon + step, 3)
        lat = round(lat + step, 3)
    return squares

# ----------------------------
# إدخال ملف أو ملفات
# ----------------------------
def import_files(file_paths):
    for file_path in file_paths:
        film_code = os.path.splitext(os.path.basename(file_path))[0]  # اسم الملف بدون الامتداد
        print(f"\nProcessing film: {film_code}")

        # التحقق من وجود نفس الفيلم مسبقًا
        cursor.execute("SELECT film_code FROM films WHERE film_code = %s", (film_code,))
        existing = cursor.fetchone()

        if existing:
            choice = input(f"Film '{film_code}' already exists. Replace it? [Y/N]: ").strip().upper()
            if choice != 'Y':
                print("Skipping this film.")
                continue
            # حذف الفيلم القديم وعلاقاته
            cursor.execute("DELETE FROM geo_tiles WHERE film_code = %s", (film_code,))
            cursor.execute("DELETE FROM films WHERE film_code = %s", (film_code,))
            conn.commit()
            print(f"Old film '{film_code}' removed.")

        # إعادة الإسقاط إذا لزم الأمر
        temp_path = file_path
        with rasterio.open(file_path) as src:
            if CRS(src.crs) != TARGET_CRS:
                temp_path = f"{file_path}_reprojected.tif"
                print("Reprojecting to target CRS...")
                temp_path = reproject_to_target(file_path, temp_path)
                print("Reprojection done.")

            # الحصول على حدود الفيلم
            bounds = src.bounds  # left, bottom, right, top
            min_lat = bounds.bottom
            max_lat = bounds.top
            min_lon = bounds.left
            max_lon = bounds.right

        # إدخال الفيلم في جدول films
        cursor.execute(
            "INSERT INTO films (film_code, file_path, min_lat, max_lat, min_lon, max_lon, projection) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s)",
            (film_code, temp_path, min_lat, max_lat, min_lon, max_lon, str(TARGET_CRS))
        )
        conn.commit()
        print(f"Film '{film_code}' added to films table.")

        # ربط الفيلم بالمربعات المغطاة
        squares = compute_covered_squares((min_lat, max_lat, min_lon, max_lon))
        for sw_lat, sw_lon in squares:
            cursor.execute(
                "INSERT INTO geo_tiles (sw_lat, sw_lon, film_code, film_date) VALUES (%s, %s, %s, CURRENT_DATE) "
                "ON CONFLICT DO NOTHING",
                (sw_lat, sw_lon, film_code)
            )
        conn.commit()
        print(f"Film '{film_code}' linked to {len(squares)} squares.")

    print("\nAll files processed successfully.")

# ----------------------------
# مثال على التشغيل
# ----------------------------
if __name__ == "__main__":
    # يمكن إدخال ملف واحد أو عدة ملفات:
    files_to_import = [
        "path/to/film1.tif",
        "path/to/film2.tif"
    ]
    import_files(files_to_import)

    cursor.close()
    conn.close()