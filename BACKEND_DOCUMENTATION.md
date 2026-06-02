# 📚 Dokumentasi Backend - Remote Sensing Application

## 📋 Daftar Isi
1. [Gambaran Umum](#gambaran-umum)
2. [Arsitektur Sistem](#arsitektur-sistem)
3. [Komponen Utama](#komponen-utama)
4. [API Endpoints](#api-endpoints)
5. [Alur Kerja](#alur-kerja)
6. [Model Machine Learning](#model-machine-learning)
7. [Integrasi Earth Engine](#integrasi-earth-engine)
8. [Penghapusan Komponen Organic](#penghapusan-komponen-organic)

---

## 🎯 Gambaran Umum

**Remote Sensing Application** adalah aplikasi web berbasis Python Flask yang menggunakan citra satelit Landsat 9 dan machine learning untuk:
- **Drought Project**: Memprediksi tingkat kekeringan (drought) di suatu wilayah
- **Organic Project**: Mengklasifikasi lahan organik

Backend dibangun dengan:
- **Framework**: Flask dengan CORS support
- **Remote Sensing**: Google Earth Engine API
- **ML Models**: Scikit-learn (Gradient Boosting untuk Drought, AdaBoost untuk Organic)
- **Data Processing**: Pandas, NumPy
- **Visualization**: Geemap untuk mapping

---

## 🏗️ Arsitektur Sistem

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React/Vue)                      │
│                (index.html, script.js, style.css)           │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP API Calls
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   Flask API Server                           │
│                   (app.py - Port 7860)                      │
└───────────┬──────────────────────────────┬──────────────────┘
            │                              │
            ▼                              ▼
    ┌───────────────┐           ┌─────────────────────┐
    │  Map Utils    │           │  ML Predictors      │
    │ (maps.py)     │           │ (extractor.py)      │
    │               │           │                     │
    │ - Landsat9    │           │ - DroughtPredictor  │
    │ - Pan-Shapen  │           │ - OrganicPredictor  │
    │ - Thermal     │           │                     │
    │ - GLCM        │           │ - Preprocessing     │
    └───────────────┘           │ - Model Loading     │
            │                   │ - Prediction        │
            └───────────────────┴──────────────────────┘
                        │
                        ▼
            ┌────────────────────────┐
            │  Google Earth Engine   │
            │      (EE API)          │
            │                        │
            │ - Landsat Collection   │
            │ - Image Processing     │
            │ - Satellite Imagery    │
            └────────────────────────┘
```

---

## 📦 Komponen Utama

### 1. **app.py** - Main Application Entry Point
Fungsi utama:
- Inisialisasi Flask app dengan CORS support
- Cache management untuk model ML
- Routing untuk semua API endpoints
- Model preloading saat startup

**Key Functions:**
```python
get_drought_predictor()      # Lazy-load drought model
get_organic_predictor()      # Lazy-load organic model
preload_models()             # Background model loading
```

### 2. **utils/maps.py** - Map Processing & Image Handling
Berisi 2 class utama:

#### **MapUtilsBase** (Parent Class)
- Pan-sharpening untuk meningkatkan resolusi citra
- Thermal indices computation (LST, Emissivity, BT)
- GLCM (Gray Level Co-occurrence Matrix) texture features
- Landsat dataset retrieval

**Methods:**
```python
pan_sharpen(image)              # High-res RGB combination
add_thermal_indices(image)      # LST, Emissivity, BT
add_glcm_features(image)        # Texture features
get_landsat_dataset()           # Retrieve satellite imagery
get_landsat_image_list()        # Get image list for date range
get_single_landsat_image_by_id()# Load specific image
```

#### **MapUtilsDrought** (Child Class)
- Khusus untuk drought analysis
- Custom spectral indices untuk deteksi kekeringan
- Indices: NDVI, NDMI, NDBI, NDII (Normalized Drought Index)

#### **MapUtilsOrganic** (Child Class)
- Khusus untuk organic land classification
- Indices untuk deteksi lahan organik

### 3. **utils/extractor.py** - ML Model Classes & Prediction

#### **DroughtPredictor**
```python
load_model(model_path)          # Load Gradient Boosting model
sample_to_df(image)             # Extract features dari image
predict(df)                     # Prediksi tingkat kekeringan (0,1,2)
visualize_all_columns(df)       # Generate visualization layers
```

**Prediction Output:**
- 0 = Low Drought (Hijau)
- 1 = Medium Drought (Kuning)
- 2 = High Drought (Merah)

#### **OrganicLandPredictor**
```python
load_model(pca_path, ada_path)  # Load PCA + AdaBoost models
sample_to_df(image)             # Extract features
predict(df)                     # Prediksi organic/non-organic (0,1)
visualize_all_columns(df)       # Generate visualization
```

**Prediction Output:**
- 0 = Non-Organic (Abu-abu)
- 1 = Organic (Hijau)

### 4. **utils/ee_init.py** - Earth Engine Initialization
Setup koneksi ke Google Earth Engine API

```python
init_earth_engine()             # Initialize EE authentication
```

### 5. **utils/soil_processor.py** - Data Visualization Module
Processing Google Sheets untuk data visualization project

```python
SoilProcessor.run(sheet_url)    # Process public Google Sheets
```

### 6. **model/** - Pre-trained Models
```
best_gb_model.joblib           # Gradient Boosting untuk Drought
group_cols_map.joblib          # Feature mapping
incremental_pca.pkl            # PCA untuk Organic
adaptive_adaboost.pkl          # AdaBoost untuk Organic
```

### 7. **assets/** - Frontend Resources
```
index.html                      # Main web interface
script.js                       # Frontend logic & API calls
style.css                       # Styling
help-content.json              # Help documentation
```

---

## 🔌 API Endpoints

### 1. **Health Check**
```
GET /api/health
```
**Response:**
```json
{
  "status": "healthy",
  "models": {
    "drought": {"loaded": true, "error": null},
    "organic": {"loaded": true, "error": null}
  }
}
```

### 2. **Get Initial Layer**
```
GET /api/initial-layer
```
Menampilkan citra Landsat 9 awal untuk Region of Interest (ROI)

**Response:**
```json
{
  "status": "success",
  "url": "https://maps.googleapis.com/maps/api/..."
}
```

### 3. **Get Available Images**
```
POST /api/get-images
```
Mengambil list citra Landsat untuk date range tertentu

**Request Body:**
```json
{
  "start_date": "2024-01-01",
  "end_date": "2024-03-01",
  "cloud_thresh": 20,
  "project": "drought"
}
```

**Response:**
```json
{
  "status": "success",
  "count": 5,
  "images": [
    {
      "id": "LANDSAT/LC09/C02/T1_TOA/LC09_129063_20240115",
      "date": "2024-01-15",
      "cloud_cover": 15.2
    }
  ],
  "cloud_thresh": 20
}
```

### 4. **Select Specific Image**
```
POST /api/select-image
```
Load citra spesifik berdasarkan image ID

**Request Body:**
```json
{
  "image_id": "LANDSAT/LC09/C02/T1_TOA/LC09_129063_20240115",
  "date": "2024-01-15",
  "cloud_cover": 15.2,
  "project": "drought"
}
```

**Response:**
```json
{
  "status": "success",
  "url": "https://tile.googleapis.com/...",
  "metadata": {"date": "2024-01-15", "cloud_cover": 15.2},
  "bounds": {"center": [-7, 110], "geometry": {...}}
}
```

### 5. **Extract Features**
```
POST /api/extract
```
Ekstrak spectral indices dari ROI yang dipilih

**Request Body:**
```json
{
  "roi": {
    "geometry": {
      "type": "Polygon",
      "coordinates": [[[105, -8.8], [115, -8.8], [115, -5.5], [105, -5.5], [105, -8.8]]]
    }
  },
  "project": "drought"
}
```

**Response:**
```json
{
  "status": "success",
  "data": [
    {
      ".geo": {"type": "Point", "coordinates": [...]},
      "NDVI": 0.45,
      "NDMI": 0.32,
      "LST": 28.5,
      ...
    }
  ],
  "count": 5000
}
```

### 6. **Predict (Main Prediction)**
```
POST /api/predict
```
Melakukan prediksi kekeringan/organic pada extracted data

**Request Body:**
```json
{
  "roi": {...},
  "project": "drought",
  "extractedData": [...]
}
```

**Response:**
```json
{
  "status": "success",
  "visualizeLayers": [
    {"name": "NDVI", "url": "https://tile.googleapis.com/..."},
    {"name": "Prediction", "url": "https://tile.googleapis.com/..."}
  ],
  "predictionStats": [
    {"class": "Low Drought", "count": 2000},
    {"class": "Medium Drought", "count": 1500},
    {"class": "High Drought", "count": 1500}
  ],
  "legend": {...},
  "predictionData": [...]
}
```

### 7. **Data Visualization Collect** ⚠️ (Untuk Organic Only)
```
POST /api/dataviz/collect
```
Collect data dari Google Sheets untuk visualization

**Request Body:**
```json
{
  "url": "https://docs.google.com/spreadsheets/d/..."
}
```

---

## 🔄 Alur Kerja (Workflow)

### **Alur Umum Drought Detection:**

```
1. User membuka aplikasi
   ↓
2. Frontend loads initial Landsat layer
   ├─ GET /api/initial-layer
   └─ Models preloading starts in background
   ↓
3. User memilih date range dan melihat available images
   ├─ POST /api/get-images
   ├─ Server query Earth Engine untuk Landsat collection
   └─ Filter by cloud cover & date
   ↓
4. User memilih specific image
   ├─ POST /api/select-image
   └─ Load tile URL untuk visualization
   ↓
5. User menggambar ROI (Region of Interest) di map
   ↓
6. Frontend mengirim ROI untuk feature extraction
   ├─ POST /api/extract
   ├─ Server process: Pan-sharpen → Thermal → GLCM → Sampling
   ├─ Extract NDVI, NDMI, NDBI, NDII, LST, dll
   └─ Return 5000 sampled points dengan features
   ↓
7. Frontend mengirim extracted data untuk prediction
   ├─ POST /api/predict
   ├─ Server: Preprocessing → Load Model → Predict
   ├─ Map prediction (0,1,2) ke label (Low/Medium/High)
   └─ Generate visualization layers
   ↓
8. Frontend displays:
   - Pie chart dengan prediction distribution
   - Multiple map layers (NDVI, LST, Prediction, dll)
   - Colorized map dengan legend
```

### **Detailed Feature Extraction Process:**

```
Landsat 9 Image (11 bands)
    ↓
├─→ Pan-sharpening (using B8 panchromatic band)
│   └─→ Enhance RGB resolution to 15m
│
├─→ Thermal Processing (using B10, B11)
│   ├─→ Brightness Temperature (BT)
│   ├─→ NDVI calculation (B5-B4)/(B5+B4)
│   ├─→ Proportion of Vegetation (Pv)
│   ├─→ Emissivity
│   └─→ Land Surface Temperature (LST)
│
├─→ GLCM Texture Features
│   └─→ Entropy, correlation, contrast dari NDVI
│
└─→ Spectral Indices (Drought specific)
    ├─→ NDVI: Vegetation health
    ├─→ NDMI: Moisture index
    ├─→ NDBI: Built-up areas
    └─→ NDII: Drought index

Result: 5000 points × 20+ features
    ↓
Standard Scaling
    ↓
Input to Gradient Boosting Model
    ↓
Prediction: 0/1/2 (Low/Medium/High Drought)
```

---

## 🤖 Model Machine Learning

### **Drought Prediction Model**

**Model Type:** Gradient Boosting Classifier
**File:** `model/best_gb_model.joblib`

**Input Features:**
- NDVI (Normalized Difference Vegetation Index)
- NDMI (Normalized Difference Moisture Index)
- NDBI (Normalized Difference Built-up Index)
- NDII (Normalized Difference Irrigation Index)
- LST (Land Surface Temperature)
- Emissivity, BT, Pv
- GLCM texture features (Entropy, Correlation, Contrast)

**Output:**
- 0: Low Drought (Hijau/Green)
- 1: Medium Drought (Kuning/Yellow)
- 2: High Drought (Merah/Red)

**Performance:**
- Trained pada dataset historis drought di Indonesia (ROI: lat -8.8 to -5.5, lon 105 to 115)
- Accuracy: ~85-90% pada validation set

### **Organic Land Classification Model** (Tidak untuk Drought Project)

**Model Type:** AdaBoost Classifier + PCA
**Files:**
- `model/incremental_pca.pkl`
- `model/adaptive_adaboost.pkl`

**Output:**
- 0: Non-Organic (Abu-abu)
- 1: Organic (Hijau)

---

## 🛰️ Integrasi Earth Engine

### **ROI (Region of Interest) Default:**
```python
roi = ee.Geometry.Rectangle([105.0, -8.8, 115.0, -5.5])
# Latitude: -8.8 to -5.5 (South)
# Longitude: 105.0 to 115.0 (East)
# Covers: Java, Indonesia
```

### **Landsat 9 Collection:**
```
LANDSAT/LC09/C02/T1_TOA
- 11 bands (Coastal, Blue, Green, Red, NIR, SWIR1, SWIR2, Panchromatic, Cirrus, TIRS1, TIRS2)
- 30m resolution (15m panchromatic)
- Revisit: 16 days
- Available: 2022 onwards
```

### **Image Filtering:**
1. **Cloud Cover Filter**: Exclude images > 20% clouds (adjustable)
2. **Date Filter**: Specified by user
3. **Geometry Filter**: Intersect with ROI

### **Processing Pipeline:**
```
ee.ImageCollection → Filter → Map(processing) → Sample
```

---

## ⚠️ Penghapusan Komponen Organic

Jika Anda hanya ingin menggunakan **Drought Project**, berikut komponen yang harus dihapus:

### **1. File & Folder yang Dihapus:**
```
❌ model/incremental_pca.pkl
❌ model/adaptive_adaboost.pkl
❌ utils/soil_processor.py
```

### **2. Modifikasi `app.py`:**

**Hapus Import:**
```python
from utils.maps import MapUtilsDrought, MapUtilsOrganic  # ← Remove MapUtilsOrganic
from utils.extractor import DroughtPredictor, OrganicLandPredictor  # ← Remove OrganicLandPredictor
```

Menjadi:
```python
from utils.maps import MapUtilsDrought
from utils.extractor import DroughtPredictor
```

**Hapus Functions:**
```python
❌ get_organic_predictor()
❌ Organic branch dalam preload_models()
```

**Simplify Cache:**
```python
# FROM:
_predictor_cache = {
    'drought': None,
    'organic': None,
    'drought_error': None,
    'organic_error': None
}

# TO:
_predictor_cache = {
    'drought': None,
    'drought_error': None
}
```

**Modifikasi `/api/get-images` endpoint:**
```python
# Remove:
if project == 'organic':
    mu = MapUtilsOrganic()
else:
    mu = MapUtilsDrought()

# Replace dengan:
mu = MapUtilsDrought()
```

**Modifikasi `/api/select-image` endpoint:**
```python
# Remove organic branch

# Replace:
project = data.get('project', 'drought')
if project == 'organic':
    mu = MapUtilsOrganic()
else:
    mu = MapUtilsDrought()

# With:
mu = MapUtilsDrought()
```

**Modifikasi `/api/extract` endpoint:**
```python
# Replace:
if project == 'organic':
    mu = MapUtilsOrganic()
    predictor = OrganicLandPredictor(roi=ee_roi)
else:
    mu = MapUtilsDrought()
    predictor = DroughtPredictor(roi=ee_roi)

# With:
mu = MapUtilsDrought()
predictor = DroughtPredictor(roi=ee_roi)
```

**Modifikasi `/api/predict` endpoint:**
```python
# Remove entire 'organic' branch (lines ~500-580)
# Keep only 'drought' branch

# Simplify:
if project == 'organic':
    # ← DELETE ALL
else:
    mu = MapUtilsDrought()
    predictor = get_drought_predictor()
    # ... rest of drought logic
```

**Hapus `/api/dataviz/collect` endpoint:**
```python
❌ @app.route('/api/dataviz/collect', methods=['POST'])
❌ def collect_dataviz_data():
```

### **3. Modifikasi `utils/maps.py`:**

**Hapus Class:**
```python
❌ class MapUtilsOrganic(MapUtilsBase):
```

**Hapus method di `MapUtilsDrought` yang tidak perlu untuk drought**

### **4. Modifikasi `utils/extractor.py`:**

**Hapus Class:**
```python
❌ class OrganicLandPredictor:
```

**Hapus organic-related imports:**
```python
❌ from river import base, tree, ensemble, preprocessing
```

### **5. Update `requirements.txt`:**

**Hapus:**
```
❌ river (jika hanya untuk organic)
```

**Keep:**
```
✓ flask
✓ flask-cors
✓ pandas
✓ numpy
✓ scikit-learn
✓ ee
✓ geemap
✓ joblib
```

### **6. Modifikasi Frontend (`assets/script.js`)**

**Remove references:**
```javascript
❌ project: 'organic'
❌ Organic-related UI elements
❌ Soil type visualization
```

### **Summary Checklist untuk Drought Only:**

```
✓ Delete model files (pca, adaboost)
✓ Delete soil_processor.py
✓ Remove MapUtilsOrganic class
✓ Remove OrganicLandPredictor class
✓ Remove get_organic_predictor()
✓ Remove organic branches dari semua endpoints
✓ Remove /api/dataviz/collect endpoint
✓ Simplify predictor cache
✓ Remove river & unnecessary imports
✓ Update frontend untuk drought only
✓ Test setiap endpoint
```

---

## 🚀 Deployment & Configuration

### **Environment Variables** (dalam `utils/secreet_keys.json`):
```json
{
  "GOOGLE_APPLICATION_CREDENTIALS": "path/to/credentials.json"
}
```

### **Docker Deployment:**
```dockerfile
# Dockerfile sudah included
docker build -t remote-sensing .
docker run -p 7860:7860 remote-sensing
```

### **Port Configuration:**
- Default: `7860`
- Configurable di `if __name__ == "__main__"`

---

## 📊 Performance Optimization

### **Model Caching:**
- Models di-load lazy saat first request
- Cached globally untuk reuse
- Background preloading saat startup

### **Data Sampling:**
- Feature extraction menghasilkan 5000+ points
- Automatically sampled ke 5000 untuk memory efficiency

### **Earth Engine Optimization:**
- Filter cloud cover sebelum download
- Use `getInfo()` hanya saat necessary
- Batch requests when possible

---

## 🐛 Troubleshooting

### **Common Issues:**

| Masalah | Solusi |
|--------|--------|
| Model not found | Pastikan file di `model/` directory |
| Earth Engine auth error | Set `GOOGLE_APPLICATION_CREDENTIALS` |
| No images found | Increase cloud threshold atau expand date range |
| Memory error | Data sudah di-sample, check ROI size |
| Map tiles not loading | Check Earth Engine API quota |

---

**Dokumentasi dibuat: Juni 2024**
**Version: 1.0**
