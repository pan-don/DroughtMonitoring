# Geospatial Drought Monitoring System

## Deskripsi Proyek
Geospatial Drought Monitoring System adalah aplikasi berbasis web yang memanfaatkan teknologi pemantauan satelit (Remote Sensing) dan Machine Learning untuk melakukan deteksi dan klasifikasi tingkat kekeringan di suatu wilayah. Dengan antarmuka peta interaktif, pengguna dapat memilih wilayah pantau (Region of Interest/ROI), memilih data citra satelit Landsat berdasarkan rentang tanggal dan tingkat tutupan awan, mengekstrak fitur indeks vegetasi/air, dan menjalankan model prediksi klasifikasi kekeringan (Rendah, Sedang, Tinggi).

Aplikasi ini menggunakan model Random Forest Classification dan mengandalkan data satelit Google Earth Engine (GEE).

## Fitur Utama
1. **Pemilihan Wilayah (ROI)**: Pengguna dapat menggambar poligon pada peta interaktif.
2. **Eksplorasi Citra Satelit (Landsat 9)**: Menampilkan pilihan citra satelit pada rentang tanggal tertentu dengan filter tutupan awan (Cloud Cover).
3. **Ekstraksi Fitur Geospasial**: Ekstraksi indeks yang berkaitan dengan tingkat kekeringan:
   - **NDVI** (Normalized Difference Vegetation Index)
   - **NDWI** (Normalized Difference Water Index)
   - **NDDI** (Normalized Difference Drought Index)
   - **EVI** (Enhanced Vegetation Index)
   - **LST** (Land Surface Temperature)
4. **Klasifikasi Kekeringan**: Memprediksi tingkat kekeringan (Low, Medium, High Drought) menggunakan algoritma klasifikasi Machine Learning (Random Forest).
5. **Visualisasi Interaktif**: Menampilkan data prediksi pada peta sebagai layer *overlay* dan pada panel grafik distribusi (pie chart). Data bisa diunduh dalam format CSV.

## Persyaratan (Requirements)
Sistem ini menggunakan stack Python dengan pustaka utama berikut (sebagaimana tercantum pada `requirements.txt`):
- `flask`, `flask-cors`, `werkzeug` (Backend API)
- `numpy`, `pandas`, `scikit-learn` (Pemrosesan Data & Machine Learning)
- `earthengine-api`, `geemap`, `folium` (Integrasi Google Earth Engine & Geospatial)

Untuk daftar dependensi lengkap yang dapat di-*deploy* ke kontainer Docker, lihat file `requirements.txt`.

## Panduan Instalasi Lokal

1. **Clone repository ini:**
   ```bash
   git clone <url_repo>
   cd <nama_folder_repo>
   ```

2. **Buat dan aktifkan virtual environment (Opsional namun disarankan):**
   ```bash
   python3 -m venv venv
   # Di Windows
   venv\Scripts\activate
   # Di Linux/Mac
   source venv/bin/activate
   ```

3. **Install dependensi:**
   ```bash
   pip install -r requirements.txt
   ```

## Konfigurasi Kredensial Google Earth Engine (secret-key.json)
Karena project ini berinteraksi langsung dengan Google Earth Engine (GEE), diperlukan kredensial (Service Account) yang sah dari Google Cloud Platform (GCP). File kredensial ini dinamakan `secret-key.json`.
> **PERHATIAN**: File `secret-key.json` bersifat rahasia dan **TIDAK BOLEH DIUNGGAH** ke GitHub demi keamanan akun Google Cloud Anda.

**Cara Mendapatkan dan Menggunakan `secret-key.json`:**
1. Masuk ke [Google Cloud Console](https://console.cloud.google.com/).
2. Buat atau pilih proyek Anda. Pastikan API *Google Earth Engine* sudah diaktifkan pada proyek tersebut.
3. Masuk ke menu **IAM & Admin** > **Service Accounts**.
4. Buat Service Account baru. Beri akses/peran yang relevan untuk Earth Engine.
5. Setelah Service Account terbuat, buka Service Account tersebut, masuk ke tab **Keys**, klik **Add Key**, dan pilih **JSON**.
6. File JSON akan terunduh. Ubah namanya menjadi `secret-key.json` dan letakkan file tersebut di **direktori utama (root directory)** proyek.
7. Anda siap menjalankan proyek.

## Menjalankan Aplikasi
1. Pastikan Anda telah menaruh `secret-key.json` di direktori utama dan dependensi telah terinstal.
2. Jalankan perintah berikut di terminal:
   ```bash
   python app.py
   ```
3. Buka browser dan arahkan ke alamat lokal, biasanya `http://127.0.0.1:5000` atau `http://localhost:5000`.

## Arsitektur Singkat
- **Frontend**: HTML5, CSS3, Vanilla JavaScript, Leaflet.js (untuk map), dan Chart.js.
- **Backend**: Flask (Python) yang menyediakan REST API endpoint untuk frontend.
- **Model ML**: Menggunakan model scikit-learn (`.pkl` file yang ada di folder `model/`) untuk prediksi/klasifikasi data tabular dari ekstraksi citra.
