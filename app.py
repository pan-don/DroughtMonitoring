import os
import ee
import json
import time
import pandas as pd
import warnings
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from utils.maps import MapUtilsDrought
from utils.extractor import DroughtPredictor
from utils.ee_init import init_earth_engine

# Suppress sklearn version warnings
warnings.filterwarnings('ignore', category=UserWarning, module='sklearn')

init_earth_engine()
app = Flask(__name__, static_folder='assets', template_folder='assets')
CORS(app)

MODEL_DIR = os.path.join(os.path.dirname(__file__), 'model')

# Global predictor cache with thread-safe initialization tracking
_predictor_cache = {
    'drought': None,
    'drought_error': None,
}

def get_drought_predictor(force_reload=False):
    """
    Get or initialize the drought predictor with lazy loading.
    
    Args:
        force_reload: If True, reload the model even if already cached
        
    Returns:
        DroughtPredictor instance with loaded model
        
    Raises:
        Exception: If model loading fails after all retry strategies
    """
    global _predictor_cache
    
    # Return cached predictor if available and not forcing reload
    if _predictor_cache['drought'] is not None and not force_reload:
        return _predictor_cache['drought']
    
    # If we had a previous error and not forcing reload, raise it again
    if _predictor_cache['drought_error'] is not None and not force_reload:
        raise _predictor_cache['drought_error']
    
    try:
        roi = ee.Geometry.Rectangle([105.0, -8.8, 115.0, -5.5])
        predictor = DroughtPredictor(roi=roi)
        
        model_path = os.path.join(MODEL_DIR, 'best_gb_model.joblib')
        if not os.path.exists(model_path):
            raise FileNotFoundError(f"Drought model not found: {model_path}")
        
        predictor.load_model(model_path)
        print(f"✓ Drought predictor model loaded successfully from {MODEL_DIR}")
        
        # Cache successful predictor
        _predictor_cache['drought'] = predictor
        _predictor_cache['drought_error'] = None
        
        return predictor
        
    except Exception as e:
        error_msg = f"Failed to load drought predictor: {str(e)}"
        print(f"✗ {error_msg}")
        _predictor_cache['drought_error'] = Exception(error_msg)
        raise

drought_predictor = None

# ============================================================================
# STARTUP MODEL PRELOADING
# ============================================================================
def preload_models():
    """
    Preload ML models at application startup for faster first predictions.
    This runs in a background thread to avoid blocking app startup.
    """
    import threading
    
    def _load_models():
        print("\n" + "="*60)
        print("PRELOADING ML MODELS AT STARTUP")
        print("="*60)
        
        # Load drought predictor
        try:
            print("\n[1/2] Loading Drought Predictor...")
            get_drought_predictor()
            print("[OK] Drought Predictor ready")
        except Exception as e:
            print(f"[FAIL] Drought Predictor failed: {str(e)}")
        
        print("\n" + "="*60)
        print("MODEL PRELOADING COMPLETE")
        print("="*60 + "\n")
    
    # Run in background thread to not block app startup
    thread = threading.Thread(target=_load_models, daemon=True)
    thread.start()
    return thread

# Start model preloading immediately after app initialization
_preload_thread = preload_models()

@app.route('/')
def index():
    return send_from_directory('assets', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('assets', path)

@app.route('/api/health', methods=['GET'])
def health_check():
    """
    Health check endpoint that also reports model loading status.
    Useful for monitoring and debugging.
    """
    return jsonify({
        "status": "healthy",
        "models": {
            "drought": {
                "loaded": _predictor_cache['drought'] is not None,
                "error": str(_predictor_cache['drought_error']) if _predictor_cache['drought_error'] else None
            }
        }
    })

@app.route('/api/initial-layer', methods=['GET'])
def get_initial_layer():
    try:
        mu = MapUtilsDrought()
        ls_image = mu.get_landsat_dataset()
        viz_params = mu.landsat_viz_params()
        map_id = ls_image.getMapId(viz_params)
        return jsonify({"status": "success", "url": map_id['tile_fetcher'].url_format})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/get-images', methods=['POST'])
def get_images():
    """
    Get list of available Landsat images for the specified date range.
    
    Request Body:
        start_date (str): Start date in YYYY-MM-DD format
        end_date (str): End date in YYYY-MM-DD format
        cloud_thresh (int, optional): Maximum cloud cover percentage (default: 20)
    
    Returns:
        JSON: Response with image list or error
            - status (str): 'success' or 'error'
            - count (int): Number of available images
            - images (list): List of image metadata dictionaries
            - cloud_thresh (int): Applied cloud cover threshold
    """
    data = request.json
    
    if not data or 'start_date' not in data or 'end_date' not in data:
        return jsonify({
            "status": "error", 
            "message": "Start date and end date are required."
        }), 400
    
    start_date = data['start_date']
    end_date = data['end_date']
    cloud_thresh = data.get('cloud_thresh', 20)
    
    # Validate date format and range
    try:
        start_obj = datetime.strptime(start_date, '%Y-%m-%d')
        end_obj = datetime.strptime(end_date, '%Y-%m-%d')
        
        if start_obj >= end_obj:
            return jsonify({
                "status": "error",
                "message": "Start date must be before end date."
            }), 400
            
    except ValueError:
        return jsonify({
            "status": "error",
            "message": "Invalid date format. Use YYYY-MM-DD."
        }), 400
    
    try:
        mu = MapUtilsDrought()
        image_list = mu.get_landsat_image_list(start_date, end_date, cloud_thresh=cloud_thresh)
        
        if len(image_list) == 0:
            return jsonify({
                "status": "error",
                "message": f"No images found for {start_date} to {end_date} with cloud cover ≤ {cloud_thresh}%. "
                          f"Try increasing cloud threshold or adjusting date range."
            }), 404
        
        return jsonify({
            "status": "success",
            "count": len(image_list),
            "images": image_list,
            "cloud_thresh": cloud_thresh
        })
        
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/select-image', methods=['POST'])
def select_image():
    """
    Load a specific Landsat image based on image ID.
    
    Request Body:
        image_id (str): Landsat image identifier (e.g., 'LANDSAT/LC09/C02/T1_TOA/...')
        date (str, optional): Image acquisition date for display
        cloud_cover (float, optional): Cloud cover percentage for display
    
    Returns:
        JSON: Response with image tile URL and bounds
            - status (str): 'success' or 'error'
            - url (str): Tile URL for map rendering
            - metadata (dict): Image metadata (date, cloud cover, ID)
            - bounds (dict): Image geometry and center coordinates
    """
    data = request.json
    
    if not data or 'image_id' not in data:
        return jsonify({
            "status": "error",
            "message": "Image ID is required."
        }), 400
    
    image_id = data['image_id']
    image_date = data.get('date', 'Unknown')
    cloud_cover = data.get('cloud_cover', 0)
    
    try:
        project = data.get('project', 'drought')
        mu = MapUtilsDrought()
        selected_image = mu.get_single_landsat_image_by_id(image_id)
        
        # Calculate image center for map positioning
        image_bounds = selected_image.geometry().bounds().getInfo()
        coords = image_bounds['coordinates'][0]
        lons = [coord[0] for coord in coords]
        lats = [coord[1] for coord in coords]
        center_lon = sum(lons) / len(lons)
        center_lat = sum(lats) / len(lats)
        
        # Generate map tile URL
        viz_params = mu.landsat_viz_params()
        map_id = selected_image.getMapId(viz_params)
        
        return jsonify({
            "status": "success",
            "url": map_id['tile_fetcher'].url_format,
            "metadata": {
                "date": image_date,
                "cloud_cover": cloud_cover,
                "id": image_id
            },
            "bounds": {
                "center": [center_lat + 0.295, center_lon + 0.21],
                "geometry": image_bounds
            }
        })
        
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/extract', methods=['POST'])
def handle_extraction():
    """
    Extract spectral indices from Landsat image for the specified ROI.
    
    Request Body:
        roi (dict): GeoJSON geometry defining region of interest
        start_date (str, optional): Start date for image filtering
        end_date (str, optional): End date for image filtering
        image_index (int, optional): Index of selected image from filtered list
        cloud_thresh (int, optional): Cloud cover threshold (default: 20)
    
    Returns:
        JSON: Response with extracted feature data
            - status (str): 'success' or 'error'
            - data (list): List of feature dictionaries with coordinates and indices
    """
    data = request.json
    if not data or 'roi' not in data or 'project' not in data:
        return jsonify({"status": "error", "message": "ROI and project required"}), 400
    
    try:
        roi_geojson = data['roi']
        ee_roi = ee.Geometry(roi_geojson['geometry'])
        
        mu = MapUtilsDrought()
        predictor = DroughtPredictor(roi=ee_roi)
        mu.roi = ee_roi
        image = mu.get_landsat_dataset()
        df = predictor.sample_to_df(image)
        
        if len(df) > 5000:
            df = df.sample(5000, random_state=42)
        
        return jsonify({
            "status": "success",
            "data": df.to_dict(orient='records'),
            "count": len(df)
        })
        
    except Exception as e:
        return jsonify({"status": "error", "message": f"Extraction failed: {str(e)}"}), 500


@app.route('/api/predict', methods=['POST'])
def handle_prediction():
    """
    Perform drought prediction using machine learning on extracted features.
    
    Request Body:
        roi (dict): GeoJSON geometry defining region of interest
        extractedData (list): Previously extracted feature data
    
    Returns:
        JSON: Response with prediction results and visualization layers
            - status (str): 'success' or 'error'
            - predictionStats (list): Drought class distribution statistics
            - visualizeLayers (list): Map layer URLs for all indices + prediction
            - predictionData (list): Complete dataset with prediction labels
    """
    start_time = time.time()
    
    data = request.json
    if not data or 'roi' not in data or 'project' not in data or 'extractedData' not in data:
        return jsonify({"status": "error", "message": "ROI, project, and extracted data required"}), 400
    
    try:
        roi_geojson = data['roi']
        ee_roi = ee.Geometry(roi_geojson['geometry'])
        extracted_data = data['extractedData']
        
        df = pd.DataFrame(extracted_data)
        
        mu = MapUtilsDrought()
        predictor = get_drought_predictor()
        predictor.roi = ee_roi
        result_df = predictor.predict(df)
        
        # Map numeric predictions to drought level strings for frontend
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
        
        # Calculate prediction statistics for pie chart
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





if __name__ == "__main__":
    app.run(host='0.0.0.0', port=7860, debug=True)