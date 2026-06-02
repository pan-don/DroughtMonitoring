# Dokumentasi Teknis dan Integrasi (Embed Guide)
**Geospatial Drought Monitoring System**

Dokumen ini ditujukan untuk developer (pengembang) yang ingin memahami alur kerja sistem (pipeline) atau berencana mengintegrasikan fitur backend dari proyek ini ke dalam sistem, website, atau dashboard eksternal.

---

## 1. Alur Kerja Sistem (Pipeline)

Sistem ini dirancang untuk mengambil dan memproses data citra satelit (Landsat) berdasarkan area tertentu, melakukan ekstraksi indeks (NDVI, NDWI, dll), dan akhirnya melakukan prediksi menggunakan *Machine Learning* untuk mendeteksi tingkat kekeringan.

1. **Pemilihan Area & Waktu (Frontend)**: User mendefinisikan *Region of Interest* (ROI) dalam format GeoJSON melalui UI Peta (Leaflet.js) dan memasukkan rentang waktu serta batas tutupan awan (cloud cover). Data ini dikirim ke backend.
2. **Permintaan Gambar Landsat (Backend - GEE)**: Backend (`app.py`) meneruskan permintaan ke Google Earth Engine (GEE). GEE akan mencari citra yang cocok dan mengembalikan daftar gambar yang tersedia (dengan URL Tile).
3. **Ekstraksi Fitur (Backend - Data Processing)**: Setelah gambar dipilih, backend mengekstrak *pixel values* dari *band* satelit dan mengonversinya menjadi data tabular (CSV/JSON), lalu menghitung indeks kekeringan/vegetasi yang diperlukan.
4. **Prediksi Model ML (Backend - ML Engine)**: Data tabular hasil ekstraksi disalurkan ke model yang sudah dilatih (dalam format `.pkl` di folder `model/`). Model memberikan label kelas prediksi (Drought Low, Medium, High).
5. **Visualisasi (Frontend)**: Hasil prediksi dikirim kembali ke frontend untuk divisualisasikan dalam bentuk layer warna di atas peta, ditabulasikan, atau ditampilkan sebagai grafik *pie chart*.

---

## 2. File dan Fungsi Penting

### A. Backend (`app.py` & Folder `utils/`)
- **`app.py`**: Merupakan *entry point* utama server Flask. Mendefinisikan seluruh _endpoints_ REST API.
  - `@app.route('/api/search-images', methods=['POST'])`: API Endpoint untuk mencari gambar citra Landsat di Google Earth Engine (GEE) berdasarkan GeoJSON area (ROI), tanggal, dan % awan.
  - `@app.route('/api/extract-features', methods=['POST'])`: Endpoint untuk menghitung berbagai indeks (NDVI, EVI, NDWI, NDDI, LST) dari citra yang dipilih.
  - `@app.route('/api/predict', methods=['POST'])`: Menerima JSON *features* (hasil ekstraksi), me-*load* model ML dari `/model`, memproses data prediksi, lalu mengembalikan nilai balikan (Drought class) per pixel.
  - *Catatan: Untuk dapat terhubung ke GEE, backend harus terotentikasi lewat `secret-key.json` saat awal proses berjalan.*

- **`model/`**: Folder yang menyimpan model *Machine Learning* (contoh: `drought_rf_model.pkl`, dll).
- **`utils/ee_init.py`**: Skrip *helper* yang bertugas menyiapkan kredensial GEE dengan membaca file `secret-key.json` yang terletak di direktori utama (root directory) proyek (atau menggunakan *environment variable* `GEE_KEY`).

### B. Frontend (`assets/` & Template)
- **`assets/index.html`**: Antarmuka halaman utama (UI) yang memuat elemen Leaflet map, form kendali untuk tanggal & filter awan, dan elemen grafik.
- **`assets/script.js`**: Logika yang menghubungkan *user intercation* (seperti menggambar poligon) ke *backend API calls*.
  - `handleSearchImagesClick()`: Fungsi yang mengumpulkan poligon GeoJSON + Input Waktu dan *hit API* `/api/search-images`.
  - `handleExtractClick()`: Fungsi untuk *hit API* ekstraksi index berdasarkan gambar pilihan.
  - `handlePredictClick()`: Mengirim data hasil ekstraksi ke model (via `/api/predict`) dan merender visualisasi (contoh `updateDroughtLayer()`).

---

## 3. Panduan Integrasi ke Sistem Lain (Embedding)

Karena aplikasi ini dibangun dengan arsitektur **Client-Server (REST API)**, maka memisahkan atau menggunakan ulang backend-nya (*Headless Backend*) ke *platform* / sistem eksternal lain sangat mungkin dilakukan.

### A. Menggunakan Endpoint via HTTP Requests
Jika sistem eksternal Anda (misal dashboard berbasis React/Vue, Mobile App, atau layanan server lainnya) ingin menampilkan fitur prediksi kekeringan:

1. **Pastikan Backend Berjalan dan Dapat Diakses**: Deployment Flask `app.py` di server yang dapat dijangkau oleh jaringan Anda (misal: menggunakan Nginx/Gunicorn/Docker atau Cloud Run).
2. **Kirim POST Request ke API Endpoints**:
   Anda hanya perlu mengirim Payload JSON (GeoJSON) ke endpoint yang tersedia.
   Contoh alur menggunakan JS/Python (Pseudo-Code):
   ```javascript
   // 1. Dapatkan daftar citra yang tersedia di wilayah tersebut
   const responseImages = await fetch('https://your-backend.com/api/search-images', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
           roi: geoJsonData,
           start_date: '2023-01-01',
           end_date: '2023-12-31',
           cloud_cover: 20
       })
   });

   // 2. Ekstrak data (pilih satu gambar)
   const extractData = await fetch('https://your-backend.com/api/extract-features', { /* ... */});

   // 3. Minta hasil ML
   const predictData = await fetch('https://your-backend.com/api/predict', {
        method: 'POST', body: JSON.stringify({ data: extractData.features })
   });
   // predictData berisi klasifikasi per nilai pixel untuk digambar ulang di frontend eksternal
   ```

### B. Embedding Tampilan Frontend Secara Langsung (Iframe)
Jika Anda hanya ingin menampilkan antarmuka bawaan secara utuh di halaman website eksternal, Anda bisa menggunakan `<iframe>`.
```html
<iframe
    src="https://your-drought-monitoring-url.com"
    width="100%"
    height="800px"
    frameborder="0"
    allowfullscreen>
</iframe>
```

### Tips & Peringatan untuk Produksi / Embed:
- **CORS (Cross-Origin Resource Sharing)**: Pastikan Anda menyesuaikan kebijakan CORS di `app.py` jika backend dan sistem/frontend eksternal Anda berbeda domain. Secara default, pustaka `flask-cors` memungkinkan konfigurasi domain spesifik yang diizinkan untuk mengirim *request*.
- **Timeout GEE**: Permintaan luas area (ROI) yang terlalu masif bisa menimbulkan proses yang cukup berat dari Google Earth Engine, dan rawan terkena HTTP *timeout error* jika sistem Anda tidak menanganinya secara *asynchronous* dengan baik. Batasi area maksimal (luas poligon) di sisi UI klien baru.
- **Kredensial**: Jaga API Anda dengan keamanan yang tepat (seperti API Keys / Token JWT) di *production* untuk mencegah permintaan berlebihan dari pihak tidak sah yang dapat menghabiskan kuota GCP Anda.
