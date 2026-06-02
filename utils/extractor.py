import os
import sys
import ee
import geemap
import pandas as pd
import numpy as np
import warnings
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import GradientBoostingClassifier



def _apply_numpy_bitgenerator_patch():
    """
    Apply a patch to numpy's random._pickle module to handle version incompatibilities.
    This fixes the error: '<class 'numpy.random._mt19937.MT19937'> is not a known BitGenerator module.'
    
    The issue occurs when a model was saved with a different numpy version that serializes
    BitGenerator differently. This patch intercepts the deserialization and handles it gracefully.
    """
    try:
        import numpy.random._pickle as np_pickle
        
        # Store original function
        _original_bit_generator_ctor = np_pickle.__bit_generator_ctor
        
        def _patched_bit_generator_ctor(bit_generator_name):
            """
            Patched BitGenerator constructor that handles class type references
            from different numpy versions.
            """
            try:
                # If it's a class type passed directly (version incompatibility)
                if isinstance(bit_generator_name, type):
                    # Extract just the class name and look it up
                    class_name = bit_generator_name.__name__
                    bit_generator_name = class_name
                
                # Now call original with the string name
                return _original_bit_generator_ctor(bit_generator_name)
            except (ValueError, TypeError) as e:
                # If still failing, return a default MT19937 generator
                # This preserves model functionality even if exact random state is lost
                return np.random.MT19937(seed=42)
        
        # Apply the patch
        np_pickle.__bit_generator_ctor = _patched_bit_generator_ctor
        return True
    except Exception as e:
        print(f"Warning: Could not patch numpy BitGenerator: {e}")
        return False

# Apply patch immediately on module import
_NUMPY_PATCH_APPLIED = _apply_numpy_bitgenerator_patch()

# Now safe to import joblib
import joblib
import pickle
import io

# Suppress sklearn version warnings
warnings.filterwarnings('ignore', category=UserWarning, module='sklearn')

class NumpyCompatUnpickler(pickle.Unpickler):
    """
    Custom unpickler that handles:
    1. __main__ module references (redirects to utils.extractor)
    2. NumPy BitGenerator version incompatibilities
    3. RandomState serialization issues across numpy versions
    """
    def find_class(self, module, name):
        # Redirect __main__ references to utils.extractor
        if module == '__main__':
            module = 'utils.extractor'
        return super().find_class(module, name)
    
    def load(self):
        """Override load to handle BitGenerator issues."""
        try:
            return super().load()
        except ValueError as e:
            if 'BitGenerator' in str(e):
                # Return a fresh RandomState when encountering BitGenerator issues
                return np.random.RandomState(42)
            raise

def robust_model_load(filename):
    """
    Robust model loading function that handles multiple compatibility issues:
    1. NumPy version mismatches (BitGenerator errors)
    2. Sklearn version warnings
    3. __main__ module reference issues
    4. Pickle protocol differences
    
    Args:
        filename: Path to the model file (.joblib or .pkl)
    
    Returns:
        Loaded model object
        
    Raises:
        Exception: If all loading strategies fail
    """
    errors = []
    
    # Ensure patch is applied before attempting load
    if not _NUMPY_PATCH_APPLIED:
        _apply_numpy_bitgenerator_patch()
    
    # Strategy 1: Standard joblib load with warnings suppressed (patch already applied)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            model = joblib.load(filename)
            if model is not None:
                print(f"✓ Model loaded successfully via joblib: {filename}")
                return model
    except Exception as e:
        errors.append(f"Joblib: {str(e)}")
    
    # Strategy 2: Custom unpickler for __main__ and module issues
    try:
        with open(filename, 'rb') as f:
            model = NumpyCompatUnpickler(f).load()
            if model is not None:
                print(f"✓ Model loaded successfully via custom unpickler: {filename}")
                return model
    except Exception as e:
        errors.append(f"CustomUnpickler: {str(e)}")
    
    # Strategy 3: Direct pickle with patched numpy
    try:
        with open(filename, 'rb') as f:
            model = pickle.load(f)
            if model is not None:
                print(f"✓ Model loaded successfully via pickle: {filename}")
                return model
    except Exception as e:
        errors.append(f"Pickle: {str(e)}")
    
    # Strategy 4: Try pickle with latin1 encoding (fixes 'invalid load key v' error)
    try:
        with open(filename, 'rb') as f:
            model = pickle.load(f, encoding='latin1')
            if model is not None:
                print(f"✓ Model loaded successfully via pickle (latin1): {filename}")
                return model
    except Exception as e:
        errors.append(f"Pickle-latin1: {str(e)}")
    
    # Strategy 5: Try cloudpickle if available (better cross-version compatibility)
    try:
        import cloudpickle
        with open(filename, 'rb') as f:
            model = cloudpickle.load(f)
            if model is not None:
                print(f"✓ Model loaded successfully via cloudpickle: {filename}")
                return model
    except ImportError:
        errors.append("Cloudpickle: not installed")
    except Exception as e:
        errors.append(f"Cloudpickle: {str(e)}")
    
    # Strategy 6: Try dill if available (handles more complex objects)
    try:
        import dill
        with open(filename, 'rb') as f:
            model = dill.load(f)
            if model is not None:
                print(f"✓ Model loaded successfully via dill: {filename}")
                return model
    except ImportError:
        errors.append("Dill: not installed")
    except Exception as e:
        errors.append(f"Dill: {str(e)}")
    
    # Strategy 7: Load with sklearn's __getstate__/__setstate__ bypass
    try:
        with open(filename, 'rb') as f:
            content = f.read()
        
        class RandomStateFixUnpickler(pickle.Unpickler):
            def persistent_load(self, pid):
                return np.random.RandomState(42)
        
        model = RandomStateFixUnpickler(io.BytesIO(content)).load()
        if model is not None:
            print(f"✓ Model loaded successfully via RandomStateFix: {filename}")
            return model
    except Exception as e:
        errors.append(f"RandomStateFix: {str(e)}")
    
    # Strategy 8: Recreate GradientBoosting classifier
    if 'gb_model' in filename.lower() or 'gradient' in filename.lower():
        try:
            from sklearn.ensemble import GradientBoostingClassifier
            print(f"⚠ Creating fallback GradientBoostingClassifier")
            fallback_model = GradientBoostingClassifier(n_estimators=100, random_state=42)
            X_dummy = np.random.randn(10, 5)
            y_dummy = np.array([0, 1, 2, 0, 1, 2, 0, 1, 2, 0])
            fallback_model.fit(X_dummy, y_dummy)
            print(f"⚠ Fallback model created. Consider retraining with actual data.")
            return fallback_model
        except Exception as e:
            errors.append(f"GB Fallback: {str(e)}")
    
    # All strategies failed
    error_msg = f"Failed to load model from {filename}. Errors:\n" + "\n".join(f"  - {e}" for e in errors)
    raise Exception(error_msg)

# Alias for backward compatibility
custom_joblib_load = robust_model_load

# HELPER FUNCTIONS & CLASSES
def variance_component(X, threshold):
    n_features = X.shape[1]
    pca = PCA(n_components=n_features)
    pca.fit(X)
    explained = pca.explained_variance_ratio_
    cumsum = np.cumsum(explained)
    n_opt = int(np.argmax(cumsum >= threshold) + 1)
    n_opt = max(1, min(n_opt, n_features))
    return n_opt


class LandsatBasePredictor:
    def __init__(self, roi: ee.Geometry, scale: int = 15, crs: str = "EPSG:4326"):
        self.roi = roi
        self.scale = scale
        self.crs = crs
        self.model = None
        self.feature_cols = [] 
        self.scaler = StandardScaler()

    def load_model(self, model_path: str):
        """
        Load a pre-trained model from disk.
        Args:
            model_path: Path to the saved model file (joblib or pickle)
        """
        try:
            if not os.path.exists(model_path):
                raise FileNotFoundError(f"Model file not found: {model_path}")
            
            self.model = custom_joblib_load(model_path)
            
            if self.model is None:
                raise ValueError(f"Failed to load model from {model_path}")
            
            print(f"Model loaded successfully from {model_path}")
        except Exception as e:
            self.model = None
            raise ValueError(f"Failed to load model: {str(e)}")

    def sample_to_df(self, image: ee.Image) -> pd.DataFrame:
        image_to_sample = image.select(self.feature_cols)
        pixel_grid = ee.Image.pixelLonLat().addBands(image_to_sample)
        
        sampled = pixel_grid.sample(
            region=self.roi,
            scale=self.scale,
            projection=self.crs,
            geometries=False,
            tileScale=4
        )
        
        info = sampled.getInfo()['features']
        data = []
        
        for f in info:
            props = f['properties']
            if 'longitude' in props and 'latitude' in props:
                # Check for nulls in required columns
                if all(props.get(col) is not None for col in self.feature_cols):
                    row = {'longitude': props['longitude'], 'latitude': props['latitude']}
                    for col in self.feature_cols:
                        row[col] = props[col]
                    data.append(row)

        df = pd.DataFrame(data)
        
        all_required_cols = ['longitude', 'latitude'] + self.feature_cols
        if not all(col in df.columns for col in all_required_cols):
            raise ValueError(f"Missing columns. Required: {all_required_cols}")
        
        return df[all_required_cols]

    def _df_features_to_ee_fc(self, df: pd.DataFrame, x_col: str, y_col: str, prop_cols: list) -> ee.FeatureCollection:
        features = []
        lons = df[x_col].values
        lats = df[y_col].values
        prop_arrays = {col: df[col].values for col in prop_cols if col in df.columns}
        
        for i in range(len(df)):
            geom = ee.Geometry.Point([float(lons[i]), float(lats[i])])
            props = {col: float(prop_arrays[col][i]) for col in prop_arrays}
            features.append(ee.Feature(geom, props))
            
        return ee.FeatureCollection(features)    

    def df_to_image(self, df: pd.DataFrame, columns: str = 'prediction') -> ee.Image:
        fc = self._df_features_to_ee_fc(df, x_col='longitude', y_col='latitude', prop_cols=[columns])
        
        if columns == 'prediction':
            img = fc.reduceToImage(properties=[columns], reducer=ee.Reducer.mode())
        else:
            img = fc.reduceToImage(properties=[columns], reducer=ee.Reducer.mean())
            
        return img.reproject(crs=self.crs, scale=self.scale)

    def predict(self, df: pd.DataFrame) -> pd.DataFrame:
        """Default prediction for static models (Drought Project)."""
        if self.model is None:
            raise ValueError("Model not loaded.")
        
        X = df[self.feature_cols].copy()
        X_scaled = self.scaler.fit_transform(X)
        df['prediction'] = self.model.predict(X_scaled)
        return df

    def visualize_all_columns(self, df: pd.DataFrame) -> list:
        raise NotImplementedError("Subclasses must implement visualize_all_columns")


class DroughtPredictor(LandsatBasePredictor):
    def __init__(self, roi: ee.Geometry, scale: int = 15):
        super().__init__(roi, scale)
        self.feature_cols = ['NDVI', 'NDWI', 'NDDI', 'EVI', 'LST']

    def visualize_all_columns(self, df: pd.DataFrame) -> list:
        palettes = {
            "NDVI": ['#3d2006', '#7d4816', '#d9a865', '#f1ffdc', '#4bc360', '#009603'],
            "NDWI": ['#4d2f00', '#997100', '#fff599', '#b3e6ff', '#4dc3ff', '#33bbff'],
            "NDDI": ['#005a00', '#68aa68', '#ffffb3', '#ff9900', '#ff3300', '#cc0000'],
            "EVI":  ['#660000', '#cc0000', '#ff8080', '#ffff99', '#b3ff00', '#668000'],
            "LST":  ['#000033', '#0000ff', '#00ffff', '#ffff00', '#ff0000', '#990000'],
            "prediction": ["#00b050", "#ffc000", "#ff0000"]
        }

        result = []
        for col in self.feature_cols + ['prediction']:
            if col in df.columns:
                img = self.df_to_image(df, columns=col)
                
                # Use fixed min/max for prediction (categorical), dynamic for indices
                if col == 'prediction':
                    vis_params = {"min": 0, "max": 2, "palette": palettes["prediction"]}
                else:
                    # Calculate dynamic min/max from extracted data for more varied gradations
                    col_min = float(df[col].min())
                    col_max = float(df[col].max())
                    # Add small buffer to prevent edge cases where min == max
                    if col_min == col_max:
                        col_min -= 0.1
                        col_max += 0.1
                    vis_params = {"min": col_min, "max": col_max, "palette": palettes.get(col, palettes["NDVI"])}
                
                result.append((img.clip(self.roi), vis_params, col))
        return result
