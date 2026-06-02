# 🔧 Panduan Refactoring untuk Drought-Only Project

## ⚡ Quick Reference: Apa yang Harus Dihapus?

Jika Anda **hanya ingin menggunakan Drought Project**, ikuti checklist di bawah:

---

## 📂 File & Folder yang Harus Dihapus

### **1. Model Files**
```
model/
├─ incremental_pca.pkl           ❌ HAPUS (Organic only)
└─ adaptive_adaboost.pkl         ❌ HAPUS (Organic only)

✅ KEEP:
├─ best_gb_model.joblib          ✓ Drought model
└─ group_cols_map.joblib         ✓ Feature mapping
```

### **2. Utility Files**
```
utils/
├─ soil_processor.py              ❌ HAPUS (Organic data viz only)
├─ extractor.py                   ✅ KEEP (tapi remove OrganicLandPredictor)
├─ maps.py                        ✅ KEEP (tapi remove MapUtilsOrganic)
├─ ee_init.py                     ✅ KEEP
├─ __init__.py                    ✅ KEEP
└─ secreet_keys.json             ✅ KEEP
```

---

## 📝 File yang Harus Dimodifikasi

### **1. `app.py` - Main Changes**

#### **A. Hapus Import (Line ~11):**

**BEFORE:**
```python
from utils.maps import MapUtilsDrought, MapUtilsOrganic
from utils.extractor import DroughtPredictor, OrganicLandPredictor
```

**AFTER:**
```python
from utils.maps import MapUtilsDrought
from utils.extractor import DroughtPredictor
```

#### **B. Simplify Cache (Line ~27-32):**

**BEFORE:**
```python
_predictor_cache = {
    'drought': None,
    'organic': None,
    'drought_error': None,
    'organic_error': None
}
```

**AFTER:**
```python
_predictor_cache = {
    'drought': None,
    'drought_error': None
}
```

#### **C. Hapus Function (Delete Lines: ~82-125)**
```python
❌ DELETE:
def get_organic_predictor(force_reload=False):
    """
    Get or initialize the organic land predictor with lazy loading.
    ...
    """
```

#### **D. Update Preload Models Function (Line ~145)**

**BEFORE:**
```python
def preload_models():
    def _load_models():
        print("\n" + "="*60)
        print("PRELOADING ML MODELS AT STARTUP")
        print("="*60)
        
        try:
            print("\n[1/2] Loading Drought Predictor...")
            get_drought_predictor()
            print("[OK] Drought Predictor ready")
        except Exception as e:
            print(f"[FAIL] Drought Predictor failed: {str(e)}")
        
        try:
            print("\n[2/2] Loading Organic Land Predictor...")  # ← DELETE
            get_organic_predictor()                            # ← DELETE
            print("[OK] Organic Land Predictor ready")         # ← DELETE
        except Exception as e:                                # ← DELETE
            print(f"[FAIL] Organic Land Predictor failed: {str(e)}")  # ← DELETE
```

**AFTER:**
```python
def preload_models():
    def _load_models():
        print("\n" + "="*60)
        print("PRELOADING ML MODELS AT STARTUP")
        print("="*60)
        
        try:
            print("\n[1/1] Loading Drought Predictor...")
            get_drought_predictor()
            print("[OK] Drought Predictor ready")
        except Exception as e:
            print(f"[FAIL] Drought Predictor failed: {str(e)}")
        
        print("\n" + "="*60)
```

#### **E. Update Health Check (Line ~218)**

**BEFORE:**
```python
@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({
        "status": "healthy",
        "models": {
            "drought": {
                "loaded": _predictor_cache['drought'] is not None,
                "error": str(_predictor_cache['drought_error']) if _predictor_cache['drought_error'] else None
            },
            "organic": {                           # ← DELETE
                "loaded": _predictor_cache['organic'] is not None,   # ← DELETE
                "error": str(_predictor_cache['organic_error']) if _predictor_cache['organic_error'] else None  # ← DELETE
            }                                      # ← DELETE
        }
    })
```

**AFTER:**
```python
@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({
        "status": "healthy",
        "models": {
            "drought": {
                "loaded": _predictor_cache['drought'] is not None,
                "error": str(_predictor_cache['drought_error']) if _predictor_cache['drought_error'] else None
            }
        }
    })
```

#### **F. Update `/api/initial-layer` (Line ~231)**

**BEFORE:**
```python
@app.route('/api/initial-layer', methods=['GET'])
def get_initial_layer():
    try:
        mu = MapUtilsDrought()  # ← Good, keep this
        ls_image = mu.get_landsat_dataset()
        viz_params = mu.landsat_viz_params()
        map_id = ls_image.getMapId(viz_params)
        return jsonify({"status": "success", "url": map_id['tile_fetcher'].url_format})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
```

**This endpoint is FINE - no changes needed**

#### **G. Update `/api/get-images` (Line ~241-285)**

**BEFORE:**
```python
@app.route('/api/get-images', methods=['POST'])
def get_images():
    ...
    try:
        project = data.get('project', 'drought')  # ← Remove this
        if project == 'organic':                   # ← DELETE
            mu = MapUtilsOrganic()                 # ← DELETE
        else:                                      # ← DELETE
            mu = MapUtilsDrought()                 # ← DELETE
        
        image_list = mu.get_landsat_image_list(start_date, end_date, cloud_thresh=cloud_thresh)
        ...
```

**AFTER:**
```python
@app.route('/api/get-images', methods=['POST'])
def get_images():
    ...
    try:
        mu = MapUtilsDrought()
        
        image_list = mu.get_landsat_image_list(start_date, end_date, cloud_thresh=cloud_thresh)
        ...
```

#### **H. Update `/api/select-image` (Line ~323-365)**

**BEFORE:**
```python
@app.route('/api/select-image', methods=['POST'])
def select_image():
    ...
    try:
        project = data.get('project', 'drought')  # ← DELETE
        if project == 'organic':                   # ← DELETE
            mu = MapUtilsOrganic()                 # ← DELETE
        else:                                      # ← DELETE
            mu = MapUtilsDrought()                 # ← DELETE
        ...
```

**AFTER:**
```python
@app.route('/api/select-image', methods=['POST'])
def select_image():
    ...
    try:
        mu = MapUtilsDrought()
        ...
```

#### **I. Update `/api/extract` (Line ~374-430)**

**BEFORE:**
```python
@app.route('/api/extract', methods=['POST'])
def handle_extraction():
    ...
    try:
        project = data['project']
        roi_geojson = data['roi']
        ee_roi = ee.Geometry(roi_geojson['geometry'])
        
        if project == 'organic':                                    # ← DELETE (from here)
            mu = MapUtilsOrganic()
            predictor = OrganicLandPredictor(roi=ee_roi)
        else:
            mu = MapUtilsDrought()
            predictor = DroughtPredictor(roi=ee_roi)               # ← DELETE (to here)
        ...
```

**AFTER:**
```python
@app.route('/api/extract', methods=['POST'])
def handle_extraction():
    ...
    try:
        # project parameter masih bisa dikirim dari frontend, tapi diabaikan
        roi_geojson = data['roi']
        ee_roi = ee.Geometry(roi_geojson['geometry'])
        
        mu = MapUtilsDrought()
        predictor = DroughtPredictor(roi=ee_roi)
        ...
```

#### **J. Update `/api/predict` - BIGGEST CHANGE (Line ~444-650)**

**BEFORE:**
```python
@app.route('/api/predict', methods=['POST'])
def handle_prediction():
    ...
    try:
        project = data['project']
        roi_geojson = data['roi']
        ee_roi = ee.Geometry(roi_geojson['geometry'])
        extracted_data = data['extractedData']
        
        df = pd.DataFrame(extracted_data)
        
        if project == 'organic':                           # ← DELETE (from here)
            mu = MapUtilsOrganic()
            predictor = get_organic_predictor()
            predictor.roi = ee_roi
            result_df = predictor.predict(df)
            
            soil_map = {0: 'Non-Organic', 1: 'Organic'}
            result_df['SOIL_TYPE'] = result_df['prediction'].map(soil_map)
            
            legend = {
                "0": {"label": "Non-Organic", "color": "#a9a9a9"},
                "1": {"label": "Organic", "color": "#228b22"}
            }
            
            vis_layers = predictor.visualize_all_columns(result_df)
            visualize_layers = []
            
            for img, vis_params, col_name in vis_layers:
                try:
                    map_id = img.getMapId(vis_params)
                    layer_name = 'Prediction' if col_name == 'prediction' else col_name
                    visualize_layers.append({
                        'name': layer_name,
                        'url': map_id['tile_fetcher'].url_format
                    })
                except Exception as e:
                    print(f"Failed to generate layer for {col_name}: {str(e)}")
            
            value_counts = result_df['prediction'].value_counts()
            prediction_stats = []
            organic_map = {0: 'Non-Organic', 1: 'Organic'}
            
            print(f"\n=== ORGANIC PREDICTION DEBUG ===")
            print(f"Prediction distribution: {dict(value_counts)}")
            print(f"Sample data statistics:")
            for col in ['N', 'P', 'K', 'PH', 'SOM']:
                if col in df.columns:
                    print(f"  {col}: min={df[col].min():.2f}, max={df[col].max():.2f}, mean={df[col].mean():.2f}")
            print(f"Sample predictions (first 10): {result_df['prediction'].head(10).tolist()}")
            print(f"================================\n")
            
            for class_num in [0, 1]:
                count = int(value_counts.get(class_num, 0))
                prediction_stats.append({
                    'class': organic_map[class_num],
                    'count': count
                })
            
            total_time = time.time() - start_time
            print(f"Prediction completed in {total_time:.2f}s for {len(df)} points")
            
            return jsonify({
                "status": "success",
                "visualizeLayers": visualize_layers,
                "predictionStats": prediction_stats,
                "legend": legend,
                "predictionData": result_df.to_dict(orient='records')
            })
        else:                                              # ← DELETE (to here)
            # Drought project
            mu = MapUtilsDrought()
            predictor = get_drought_predictor()
            ... (keep rest of drought logic)
```

**AFTER:**
```python
@app.route('/api/predict', methods=['POST'])
def handle_prediction():
    """
    Perform drought prediction using machine learning on extracted features.
    
    Request Body:
        roi (dict): GeoJSON geometry defining region of interest
        extractedData (list): Previously extracted feature data
    
    Returns:
        JSON: Response with prediction results and visualization layers
    """
    start_time = time.time()
    
    data = request.json
    if not data or 'roi' not in data or 'extractedData' not in data:
        return jsonify({"status": "error", "message": "ROI and extracted data required"}), 400
    
    try:
        roi_geojson = data['roi']
        ee_roi = ee.Geometry(roi_geojson['geometry'])
        extracted_data = data['extractedData']
        
        df = pd.DataFrame(extracted_data)
        
        # Drought prediction only
        mu = MapUtilsDrought()
        predictor = get_drought_predictor()
        predictor.roi = ee_roi
        result_df = predictor.predict(df)
        
        # Map numeric predictions to drought level strings
        drought_map = {0: 'Low Drought', 1: 'Medium Drought', 2: 'High Drought'}
        result_df['DROUGHT'] = result_df['prediction'].map(drought_map)
        
        legend = {
            "0": {"label": "No Drought", "color": "#00b050"},
            "1": {"label": "Moderate Drought", "color": "#ffc000"},
            "2": {"label": "Severe Drought", "color": "#ff0000"}
        }
        
        # Generate visualization layers for all indices + prediction
        vis_layers = predictor.visualize_all_columns(result_df)
        visualize_layers = []
        
        for img, vis_params, col_name in vis_layers:
            try:
                map_id = img.getMapId(vis_params)
                layer_name = 'Prediction' if col_name == 'prediction' else col_name
                visualize_layers.append({
                    'name': layer_name,
                    'url': map_id['tile_fetcher'].url_format
                })
            except Exception as e:
                print(f"Failed to generate layer for {col_name}: {str(e)}")
        
        # Calculate prediction statistics
        value_counts = result_df['prediction'].value_counts()
        prediction_stats = []
        for class_num in [0, 1, 2]:
            count = int(value_counts.get(class_num, 0))
            prediction_stats.append({
                'class': drought_map[class_num],
                'count': count
            })
        
        total_time = time.time() - start_time
        print(f"Prediction completed in {total_time:.2f}s for {len(df)} points")
        
        return jsonify({
            "status": "success",
            "visualizeLayers": visualize_layers,
            "predictionStats": prediction_stats,
            "legend": legend,
            "predictionData": result_df.to_dict(orient='records')
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500
```

#### **K. HAPUS Endpoint `/api/dataviz/collect` (Line ~655-720)**

**❌ DELETE THE ENTIRE ENDPOINT:**
```python
@app.route('/api/dataviz/collect', methods=['POST'])
def collect_dataviz_data():
    """
    Collect and preprocess data from Google Sheets for Data Visualization project.
    ...
    """
    data = request.json
    
    if not data or 'url' not in data:
        return jsonify({
            "status": "error",
            "message": "Spreadsheet URL is required"
        }), 400
    
    sheet_url = data['url']
    
    try:
        from utils.soil_processor import SoilProcessor  # ← This line won't work anyway
        
        processor = SoilProcessor()
        result_df = processor.run(sheet_url)
        
        if result_df is None or result_df.empty:
            return jsonify({
                "status": "error",
                "message": "Failed to process spreadsheet..."
            }), 400
        
        records = result_df.to_dict(orient='records')
        
        for record in records:
            if 'Date' in record and pd.notna(record['Date']):
                record['Date'] = record['Date'].strftime('%Y-%m-%d %H:%M:%S')
        
        return jsonify({
            "status": "success",
            "data": records,
            "count": len(records)
        })
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({
            "status": "error",
            "message": f"Error processing spreadsheet: {str(e)}"
        }), 500
```

---

### **2. `utils/maps.py` - Hapus Class**

#### **Hapus seluruh class `MapUtilsOrganic`:**

**Find and DELETE:**
```python
class MapUtilsOrganic(MapUtilsBase):
    """
    Child class for Organic Land Classification.
    """
    
    def __init__(self, zoom=10, basemap='HYBRID'):
        super().__init__(zoom, basemap)
    
    def _process_image(self, image):
        """Organic-specific processing."""
        img = self.pan_sharpen(image)
        img = self.add_thermal_indices(img)
        # Organic-specific indices
        return img
    
    def landsat_viz_params(self):
        """Custom viz params for organic visualization."""
        return {
            'bands': ['B6P', 'B5P', 'B4P'],
            'min': 0,
            'max': 3000
        }
```

**Keep `MapUtilsDrought` class** - no changes needed

---

### **3. `utils/extractor.py` - Hapus Class & Imports**

#### **A. Hapus Import yang tidak perlu:**

**BEFORE:**
```python
from river import base
from river.preprocessing import AdaptiveStandardScaler
from river import tree, ensemble
```

**AFTER:**
```python
# Hapus river imports - tidak digunakan di Drought model
```

#### **B. Hapus seluruh class `OrganicLandPredictor`:**

**Find and DELETE ~lines 200-400 (approximate):**
```python
❌ DELETE:
class OrganicLandPredictor:
    """
    Organic Land Classification using AdaBoost + PCA.
    ...
    """
    
    def __init__(self, roi=None):
        self.roi = roi
        ...
    
    def load_model(self, pca_path, ada_path):
        ...
    
    def sample_to_df(self, image):
        ...
    
    def predict(self, df):
        ...
    
    def visualize_all_columns(self, df):
        ...
```

**Keep `DroughtPredictor` class** - no changes needed

---

### **4. `requirements.txt` - Update Dependencies**

**BEFORE:**
```
ee==0.2
geemap
flask
flask-cors
pandas
numpy
scikit-learn
joblib
geopandas
river
python-dotenv
requests
```

**AFTER (Remove river):**
```
ee==0.2
geemap
flask
flask-cors
pandas
numpy
scikit-learn
joblib
geopandas
python-dotenv
requests
```

---

### **5. `assets/script.js` - Frontend Changes**

#### **Remove all references to project selection for organic:**

**BEFORE:**
```javascript
function selectProject(project) {
    selectedProject = project;
    
    if (project === 'drought') {
        showDroughtUI();
    } else if (project === 'organic') {
        showOrganicUI();
    }
}
```

**AFTER:**
```javascript
// Always use drought project
selectedProject = 'drought';
showDroughtUI();
```

#### **Remove organic UI elements:**
```javascript
❌ Remove:
- Organic project button/radio
- Soil type related functions
- Data visualization form
- Organic-specific legend
```

#### **Update API calls to remove project parameter (if no longer needed):**

**BEFORE:**
```javascript
fetch('/api/extract', {
    method: 'POST',
    body: JSON.stringify({
        roi: userROI,
        project: selectedProject
    })
})
```

**AFTER:**
```javascript
fetch('/api/extract', {
    method: 'POST',
    body: JSON.stringify({
        roi: userROI
    })
})
```

---

## ✅ Verification Checklist

Setelah melakukan refactoring, pastikan:

```
Backend Code:
☐ Import statements di app.py hanya ada MapUtilsDrought & DroughtPredictor
☐ No references ke MapUtilsOrganic
☐ No references ke OrganicLandPredictor
☐ get_organic_predictor() function dihapus
☐ Cache hanya untuk drought model
☐ No organic branches di endpoints
☐ /api/dataviz/collect endpoint dihapus
☐ No river imports di extractor.py

File System:
☐ incremental_pca.pkl dihapus
☐ adaptive_adaboost.pkl dihapus
☐ soil_processor.py dihapus
☐ class MapUtilsOrganic dihapus dari maps.py
☐ class OrganicLandPredictor dihapus dari extractor.py

Dependencies:
☐ requirements.txt updated (remove river)

Frontend:
☐ All organic project buttons removed
☐ All soil type references removed
☐ No data visualization features

Testing:
☐ app starts without errors
☐ /api/health returns success
☐ /api/initial-layer works
☐ /api/get-images accepts drought project
☐ /api/extract works
☐ /api/predict returns drought predictions (0,1,2)
```

---

## 🚀 Migration Steps (Recommended Order)

1. **Backup your project first!**
   ```bash
   cp -r . ../Remote-Sensing-backup
   ```

2. **Delete files:**
   - incremental_pca.pkl
   - adaptive_adaboost.pkl
   - soil_processor.py

3. **Modify app.py** (follow section 1.A-K above)

4. **Modify utils/maps.py** (remove MapUtilsOrganic)

5. **Modify utils/extractor.py** (remove OrganicLandPredictor, river imports)

6. **Update requirements.txt** (remove river)

7. **Update assets/script.js** (remove organic UI)

8. **Test each step:**
   ```bash
   python app.py
   # Test each endpoint in browser/Postman
   ```

9. **Commit changes** (if using git)
   ```bash
   git add -A
   git commit -m "Refactor: Remove organic components, drought-only project"
   ```

---

**Last Updated:** June 2024
**Status:** Ready for Implementation
