# 🎨 Arsitektur Sistem - Visual Summary

## 📊 System Architecture Diagram

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                     WEB BROWSER (Frontend)                  ┃
┃   ┌──────────────────────────────────────────────────────┐ ┃
┃   │  HTML/CSS/JS (assets/)                               │ ┃
┃   │  - Map display (Leaflet/Google Maps)                 │ ┃
┃   │  - ROI drawing tools                                 │ ┃
┃   │  - Date picker & image selector                      │ ┃
┃   │  - Results visualization (pie chart, layers)         │ ┃
┃   └──────────────────────────────────────────────────────┘ ┃
┗━━━━━━━━━━━━━━━━━━━━━┳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
                       │ HTTP/JSON API
                       │ (Port 7860)
┏━━━━━━━━━━━━━━━━━━━━━┻━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                    FLASK SERVER                           ┃
┃                   (app.py - Python)                       ┃
┃                                                           ┃
┃  ┌─────────────────────────────────────────────────────┐ ┃
┃  │ API Endpoints:                                      │ ┃
┃  │  ✓ /api/health                                     │ ┃
┃  │  ✓ /api/initial-layer                              │ ┃
┃  │  ✓ /api/get-images                                 │ ┃
┃  │  ✓ /api/select-image                               │ ┃
┃  │  ✓ /api/extract                                    │ ┃
┃  │  ✓ /api/predict                                    │ ┃
┃  └─────────────────────────────────────────────────────┘ ┃
┃                       │                                    ┃
┃        ┌──────────────┼──────────────┐                    ┃
┃        │              │              │                    ┃
┃        ▼              ▼              ▼                    ┃
┃  ┌────────────┐ ┌───────────────┐ ┌──────────────┐      ┃
┃  │ maps.py    │ │ extractor.py  │ │ ee_init.py   │      ┃
┃  │            │ │               │ │              │      ┃
┃  │ MapUtils   │ │ Predictor     │ │ EE Setup     │      ┃
┃  │ Drought    │ │ Classes       │ │              │      ┃
┃  └────────────┘ └───────────────┘ └──────────────┘      ┃
┗━━━━━━━━━━━┳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
            │
            │ REST API Calls
            │
┏━━━━━━━━━━━┻━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃         GOOGLE EARTH ENGINE API (Cloud)                 ┃
┃                                                         ┃
┃  ┌────────────────────────────────────────────────────┐┃
┃  │ Landsat 9 Collection (LC09)                        ││
┃  │ ┌──────────────────────────────────────────────┐  ││
┃  │ │ 11 Spectral Bands:                           │  ││
┃  │ │ B1 (Coastal), B2 (Blue), B3 (Green)         │  ││
┃  │ │ B4 (Red), B5 (NIR), B6 (SWIR1), B7 (SWIR2)  │  ││
┃  │ │ B8 (Panchromatic - 15m), B9 (Cirrus)        │  ││
┃  │ │ B10, B11 (TIRS - Thermal)                   │  ││
┃  │ └──────────────────────────────────────────────┘  ││
┃  │ Resolution: 30m (15m panchromatic)                ││
┃  │ Revisit: 16 days                                  ││
┃  │ Available: 2022 onwards                           ││
┃  └────────────────────────────────────────────────────┘┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

---

## 📈 Data Flow - Step by Step

### **Workflow 1: Initial Page Load**

```
User Opens Page
    │
    ▼
Browser Requests GET /api/initial-layer
    │
    ▼
Flask Server:
├─ Create MapUtilsDrought instance
├─ Get latest Landsat image for ROI
├─ Generate map tile URL
└─ Return to frontend
    │
    ▼
Backend (in background):
├─ Thread 1: preload_models()
│  ├─ get_drought_predictor()
│  │  ├─ Load: model/best_gb_model.joblib
│  │  ├─ Load: model/group_cols_map.joblib
│  │  └─ Cache in _predictor_cache['drought']
│  └─ Status: Ready for predictions
    │
    ▼
Frontend:
├─ Display map with Landsat 9 tile
├─ Show date picker & cloud threshold slider
└─ Ready for user interaction
```

### **Workflow 2: Get Available Images**

```
User Input:
├─ Start Date: 2024-01-01
├─ End Date: 2024-03-01
└─ Cloud Threshold: 20%
    │
    ▼
Browser Sends POST /api/get-images
    │
    ▼
Flask Server:
├─ Parse request JSON
├─ Validate dates
├─ Call MapUtilsDrought.get_landsat_image_list()
    │
    ├─ EE Backend:
    │  ├─ Query: LANDSAT/LC09/C02/T1_TOA
    │  ├─ Filter: dateRange(start, end)
    │  ├─ Filter: geometry.intersects(ROI)
    │  ├─ Filter: cloudCover < 20
    │  ├─ Sort: by date DESC
    │  └─ Get properties: id, date, cloud_cover
    │
    ├─ Receive: List of image metadata
    ├─ Convert to JSON
    └─ Return to frontend
    │
    ▼
Frontend:
├─ Parse JSON response
├─ Display table of available images
└─ User selects one image
```

### **Workflow 3: Feature Extraction**

```
User Actions:
├─ 1. Select image from list
├─ 2. Draw ROI (polygon) on map
├─ 3. Click "Extract Features"
    │
    ▼
Browser Sends POST /api/extract
Body: {
    roi: {geometry: {...}},
    project: "drought"
}
    │
    ▼
Flask Server:
├─ Convert GeoJSON to EE geometry
├─ Create MapUtilsDrought instance
├─ Create DroughtPredictor instance
├─ Load latest Landsat image
├─ Preprocess image:
│  │
│  ├─ Pan-sharpening:
│  │  ├─ Use B8 (panchromatic, 15m)
│  │  ├─ Enhance B4, B5, B6 to 15m
│  │  └─ Result: B4P, B5P, B6P (high res RGB)
│  │
│  ├─ Thermal Indices:
│  │  ├─ BT_Kelvin = B10 (raw thermal)
│  │  ├─ BT_Celsius = BT_K - 273.15
│  │  ├─ NDVI = (B5P - B4P) / (B5P + B4P)
│  │  ├─ Pv = ((NDVI - 0.2) / (0.3)) ^ 2
│  │  ├─ Emissivity = 0.004 × Pv + 0.986
│  │  └─ LST = BT / (1 + λ×BT/ρ × ln(emis))
│  │
│  └─ GLCM Texture:
│     ├─ Normalize NDVI to 0-255
│     ├─ Compute: Entropy, Contrast, Correlation
│     └─ Result: 3 texture features per band
│
├─ Sample random 5000 points from ROI
├─ Extract features for each point:
│  ├─ Spectral: B1-B11
│  ├─ Indices: NDVI, NDMI, NDBI, NDII
│  ├─ Thermal: BT, LST, Emissivity
│  ├─ Texture: Entropy, Contrast, Correlation
│  └─ Position: .geo (latitude, longitude)
│
├─ Convert to DataFrame
├─ Return to frontend
    │
    ▼
Frontend:
├─ Receive: 5000 data points × 20+ features
├─ Display: Extraction status & count
└─ Ready for prediction
```

### **Workflow 4: ML Prediction**

```
Frontend Sends POST /api/predict
Body: {
    roi: {...},
    project: "drought",
    extractedData: [...5000 points...]
}
    │
    ▼
Flask Server:
├─ Convert extracted data to DataFrame
├─ Get drought predictor (cached):
│  │
│  └─ predictor = _predictor_cache['drought']
│     (Model already loaded in background)
│
├─ Data Preprocessing:
│  ├─ StandardScaler.fit_transform(features)
│  └─ Result: Normalized features
│
├─ Model Prediction:
│  │
│  └─ Gradient Boosting Model:
│     ├─ Input: Normalized feature vectors
│     ├─ Internal: Tree ensemble (100+ trees)
│     ├─ Output: Prediction probabilities for 3 classes
│     └─ Final: argmax → 0, 1, or 2
│
├─ Post-Processing:
│  ├─ Map predictions:
│  │  ├─ 0 → "Low Drought" (Hijau)
│  │  ├─ 1 → "Medium Drought" (Kuning)
│  │  └─ 2 → "High Drought" (Merah)
│  │
│  ├─ Calculate statistics:
│  │  ├─ Count per class
│  │  ├─ Percentage per class
│  │  └─ Build pie chart data
│  │
│  └─ Generate visualization layers:
│     ├─ For each feature column:
│     │  ├─ Create EE image from values
│     │  ├─ Apply color palette
│     │  └─ Get map tile URL
│     │
│     └─ Result: URL list for each layer
│
├─ Compile response JSON:
│  ├─ visualizeLayers: [...]
│  ├─ predictionStats: [...]
│  ├─ legend: {...}
│  └─ predictionData: [...with DROUGHT column...]
│
└─ Return to frontend
    │
    ▼
Frontend:
├─ Update map: Add prediction layer on top
├─ Display pie chart: Drought distribution
├─ Show available layers: NDVI, LST, Prediction, etc
└─ Allow user to toggle layers & adjust view
```

---

## 🗂️ Data Structures

### **Request Body: /api/get-images**
```json
{
  "start_date": "2024-01-01",           // ISO format
  "end_date": "2024-03-01",             // ISO format
  "cloud_thresh": 20,                   // 0-100
  "project": "drought"                  // For compatibility (drought only)
}
```

### **Response: /api/get-images**
```json
{
  "status": "success",
  "count": 5,
  "cloud_thresh": 20,
  "images": [
    {
      "id": "LANDSAT/LC09/C02/T1_TOA/LC09_129063_20240115",
      "date": "2024-01-15",
      "cloud_cover": 15.2
    }
  ]
}
```

### **Request Body: /api/extract**
```json
{
  "roi": {
    "geometry": {
      "type": "Polygon",
      "coordinates": [[[lon1, lat1], [lon2, lat2], ...]]
    }
  },
  "project": "drought"
}
```

### **Response: /api/extract**
```json
{
  "status": "success",
  "count": 5000,
  "data": [
    {
      ".geo": {
        "type": "Point",
        "coordinates": [110.5, -7.2]
      },
      "B1": 234,
      "B2": 456,
      "NDVI": 0.45,
      "NDMI": 0.32,
      "NDBI": -0.12,
      "NDII": 0.28,
      "LST": 28.5,
      "BT_Kelvin": 301.5,
      "BT_Celsius": 28.5,
      "Emissivity": 0.985,
      "Entropy_NDVI": 1.23,
      ... (more features)
    }
  ]
}
```

### **Request Body: /api/predict**
```json
{
  "roi": {...},
  "project": "drought",
  "extractedData": [
    { /* same as /api/extract response */ }
  ]
}
```

### **Response: /api/predict**
```json
{
  "status": "success",
  "visualizeLayers": [
    {"name": "NDVI", "url": "https://tile.googleapis.com/..."},
    {"name": "LST", "url": "https://tile.googleapis.com/..."},
    {"name": "Prediction", "url": "https://tile.googleapis.com/..."}
  ],
  "predictionStats": [
    {"class": "Low Drought", "count": 2000},
    {"class": "Medium Drought", "count": 1500},
    {"class": "High Drought", "count": 1500}
  ],
  "legend": {
    "0": {"label": "No Drought", "color": "#00b050"},
    "1": {"label": "Moderate Drought", "color": "#ffc000"},
    "2": {"label": "Severe Drought", "color": "#ff0000"}
  },
  "predictionData": [
    {
      ".geo": {...},
      "NDVI": 0.45,
      ... (all extracted features),
      "prediction": 0,
      "DROUGHT": "Low Drought"
    }
  ]
}
```

---

## 🎯 Model Details - Drought Predictor

### **Gradient Boosting Classifier**

```
Input Features (20+):
┌─────────────────────────────────────┐
│ Spectral Bands:                     │
│ ├─ B2-B7 (6 bands)                  │
│ └─ B10-B11 (Thermal)                │
│                                     │
│ Derived Indices:                    │
│ ├─ NDVI (vegetation)                │
│ ├─ NDMI (moisture)                  │
│ ├─ NDBI (built-up)                  │
│ ├─ NDII (irrigation/drought)        │
│ └─ LST (land surface temp)          │
│                                     │
│ Thermal Features:                   │
│ ├─ BT_Kelvin / BT_Celsius          │
│ ├─ Emissivity                       │
│ └─ Pv (vegetation proportion)       │
│                                     │
│ Texture Features:                   │
│ ├─ Entropy_NDVI                     │
│ ├─ Contrast_NDVI                    │
│ └─ Correlation_NDVI                 │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ StandardScaler                      │
│ (Normalize to mean=0, std=1)        │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ Gradient Boosting Ensemble          │
│ ├─ n_estimators: 100+ trees         │
│ ├─ max_depth: 5-7                   │
│ ├─ learning_rate: 0.1               │
│ └─ loss: multinomial                │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ Output Probabilities:               │
│ ├─ P(Low Drought)    [0,0.33]       │
│ ├─ P(Med Drought)    [0.33,0.66]    │
│ └─ P(High Drought)   [0.66,1.0]     │
│                                     │
│ Final Prediction: argmax(prob)      │
│ ├─ 0: Low Drought    (Green)        │
│ ├─ 1: Med Drought    (Yellow)       │
│ └─ 2: High Drought   (Red)          │
└─────────────────────────────────────┘
```

---

## 📁 Directory Structure (Drought-Only)

```
Remote-Sensing/
├── app.py                          ← Main Flask app
├── asgi.py                         ← ASGI config
├── Dockerfile                      ← Docker config
├── pyproject.toml                  ← Python package config
├── requirements.txt                ← Dependencies
├── BACKEND_DOCUMENTATION.md        ← Documentation (NEW)
├── REFACTORING_GUIDE.md            ← Refactoring steps (NEW)
│
├── assets/                         ← Frontend
│   ├── index.html
│   ├── script.js
│   ├── style.css
│   └── help-content.json
│
├── model/                          ← ML Models
│   ├── best_gb_model.joblib        ✓ KEEP
│   └── group_cols_map.joblib       ✓ KEEP
│
└── utils/                          ← Python utilities
    ├── __init__.py
    ├── ee_init.py                  ✓ KEEP
    ├── extractor.py                ✓ KEEP (remove OrganicLandPredictor)
    ├── maps.py                     ✓ KEEP (remove MapUtilsOrganic)
    ├── secreet_keys.json           ✓ KEEP
    └── soil_processor.py           ❌ DELETE
```

---

## 🔄 Caching Strategy

### **Model Caching (thread-safe)**

```
First Request:
├─ Check: _predictor_cache['drought'] is None?
├─ YES: Load model from disk
│  ├─ Load: best_gb_model.joblib
│  ├─ Load: group_cols_map.joblib
│  ├─ Cache result
│  └─ Return predictor
└─ Ready for prediction

Subsequent Requests:
├─ Check: _predictor_cache['drought'] is None?
├─ NO: Return cached predictor
└─ Much faster! (skip disk I/O)

Error Handling:
├─ If load fails: Store error in cache
├─ On future requests: Re-raise same error
├─ force_reload=True: Ignore cache, reload anyway
```

### **Performance Impact**

```
First prediction after startup:
├─ Model load: ~2-5 seconds
├─ Feature processing: ~1-3 seconds
├─ Prediction: ~0.5-1 second
└─ Total: ~3-9 seconds

Subsequent predictions (cached):
├─ Model load: 0 (cached)
├─ Feature processing: ~1-3 seconds
├─ Prediction: ~0.5-1 second
└─ Total: ~1.5-4 seconds

Benefit: 50% faster after first request!
```

---

## 🌍 Geographic Coverage

### **Default ROI (Indonesia)**

```
           ┌─────────┐
           │Thailand │
           │   Laos  │
    ┌──────┼────┬────┤
    │Malaya│    │    │ 
    │  sia │    │    │
    └──────┼────┼────┤
    Sumatra│    │    │
           │    │    │
    ┌──────┴────┴────┐
    │       Java      │ ← Default ROI
    │ (This region)   │ ← (105°E-115°E, 8.8°S-5.5°S)
    └─────────────────┘

LON: 105.0 to 115.0 (East)
LAT: -8.8 to -5.5 (South)
Size: ~1000 km × 375 km
```

---

**Document created:** June 2024
**Version:** 1.0
