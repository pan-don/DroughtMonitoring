import os
import ee
import json
import geemap
import datetime

# Note: Earth Engine initialization is handled by utils.ee_init.init_earth_engine()
# which is called in app.py before any MapUtils classes are instantiated



class MapUtilsBase:
    """
    Parent class for Landsat 9 processing. 
    Handles core operations: Pan-sharpening, Thermal/GLCM indices, and Image Retrieval.
    """
    
    def __init__(self, zoom=10, basemap='HYBRID'):
        self.roi = ee.Geometry.Rectangle([105.0, -8.8, 115.0, -5.5])
        self.zoom = zoom
        self.basemap_type = basemap

    def create_map(self):
        basemap = geemap.Map(center=self.roi.centroid().coordinates().getInfo()[::-1],
                       zoom=self.zoom,
                       basemap=self.basemap_type)
        return basemap

    @staticmethod
    def pan_sharpen(image):
        rgb = image.select(['B6', 'B5', 'B4'])
        rgb1 = image.select(['B4', 'B3', 'B2'])
        rgb2 = image.select(['B7', 'B6', 'B5'])
        
        pan = image.select('B8')
        
        landsat_hsv = rgb.rgbToHsv().select(['hue', 'saturation'])
        landsat_hsv1 = rgb1.rgbToHsv().select(['hue', 'saturation'])
        landsat_hsv2 = rgb2.rgbToHsv().select(['hue', 'saturation'])
        
        up_resolution = ee.Image.cat(landsat_hsv, pan).hsvToRgb().select(['red', 'green', 'blue'], ['B6P', 'B5P', 'B4P'])
        up_resolution1 = ee.Image.cat(landsat_hsv1, pan).hsvToRgb().select(['red', 'green', 'blue'], ['B4P_2', 'B3P', 'B2P'])
        up_resolution2 = ee.Image.cat(landsat_hsv2, pan).hsvToRgb().select(['red'], ['B7P'])
        
        sharpened = up_resolution.addBands(up_resolution1.select(['B3P', 'B2P'])).addBands(up_resolution2)
        return image.addBands(sharpened)

    @staticmethod
    def add_thermal_indices(image):
        bt_k = image.select('B10').rename('BT_Kelvin')
        bt_c = bt_k.subtract(273.15).rename('BT_Celsius')
        
        ndvi = image.normalizedDifference(['B5P', 'B4P'])
        pv = ndvi.subtract(0.2).divide(0.3).clamp(0, 1).pow(2).rename('Pv')
        emissivity = pv.multiply(0.004).add(0.986).rename('Emissivity')
        
        lambda_eff = ee.Number(10.895)
        rho = ee.Number(14388)
        lst = bt_k.expression(
            '(BT / (1 + (lambda * BT / rho) * log(EPS))) - 273.15',
            {
                'BT': bt_k,
                'EPS': emissivity,
                'lambda': lambda_eff,
                'rho': rho
            }).rename('LST')
            
        return image.addBands([bt_k, bt_c, pv, emissivity, lst])

    @staticmethod
    def add_glcm_features(image, band_to_process='NDVI', size=3, region=None):
        if region is None:
            region = image.geometry()
            
        stats = image.select(band_to_process).reduceRegion(
            reducer=ee.Reducer.percentile([2, 98]),
            geometry=region, scale=30, bestEffort=True
        )
        
        min_val = ee.Number(ee.Algorithms.If(stats.get(f'{band_to_process}_p2'), stats.get(f'{band_to_process}_p2'), 0))
        max_val = ee.Number(ee.Algorithms.If(stats.get(f'{band_to_process}_p98'), stats.get(f'{band_to_process}_p98'), 1))

        scaled = image.select(band_to_process).unitScale(min_val, max_val).multiply(255).toInt()
        glcm = scaled.glcmTexture(size=size)
        
        all_names = glcm.bandNames()
        selected = all_names.filter(ee.Filter.stringContains('item', f'{band_to_process}_'))
        
        def rename_func(name):
            return ee.String(name).replace(f'{band_to_process}_', '').cat('_').cat(band_to_process)
            
        return image.addBands(glcm.select(selected, selected.map(rename_func)))

    def _process_image(self, image):
        """Base processing: Sharpening + Thermal. Overridden by children."""
        img = self.pan_sharpen(image)
        img = self.add_thermal_indices(img)
        return img

    def get_landsat_dataset(self, start_date=None, end_date=None, cloud_thresh=20):
        if start_date is None: start_date = "2025-07-01"
        if end_date is None: end_date = "2025-10-11"
            
        ls9 = (
            ee.ImageCollection('LANDSAT/LC09/C02/T1_TOA')
            .filterBounds(self.roi)
            .filterDate(start_date, end_date)
            .filter(ee.Filter.lte('CLOUD_COVER', cloud_thresh))
            .filter(ee.Filter.inList('WRS_PATH', [120, 121]))
            .filter(ee.Filter.eq('WRS_ROW', 65))
            .map(self._process_image)
            .sort('system:time_start')
        )
        return ls9.median()
    
    def get_landsat_image_list(self, start_date, end_date, cloud_thresh=20):
        ls9 = (
            ee.ImageCollection('LANDSAT/LC09/C02/T1_TOA')
            .filterBounds(self.roi)
            .filterDate(start_date, end_date)
            .filter(ee.Filter.lte('CLOUD_COVER', cloud_thresh))
            .filter(ee.Filter.inList('WRS_PATH', [120, 121]))
            .filter(ee.Filter.eq('WRS_ROW', 65))
            .sort('system:time_start')
        )
        
        features = ls9.getInfo().get('features', [])
        image_list = []
        
        for idx, feature in enumerate(features):
            props = feature.get('properties', {})
            image_id = feature.get('id', '')
            time_start = props.get('system:time_start', 0)
            date_str = datetime.datetime.fromtimestamp(time_start / 1000.0).strftime('%Y-%m-%d')
            
            image_list.append({
                'index': idx,
                'date': date_str,
                'cloud_cover': round(props.get('CLOUD_COVER', 0), 2),
                'id': image_id,
                'path': props.get('WRS_PATH', 0),
                'row': props.get('WRS_ROW', 0)
            })
        return image_list
    
    def get_single_landsat_image_by_id(self, image_id):
        selected_image = ee.Image(image_id)
        return self._process_image(selected_image)
    
    def get_single_landsat_image(self, start_date, end_date, image_index, cloud_thresh=20):
        ls9 = (
            ee.ImageCollection('LANDSAT/LC09/C02/T1_TOA')
            .filterBounds(self.roi)
            .filterDate(start_date, end_date)
            .filter(ee.Filter.lte('CLOUD_COVER', cloud_thresh))
            .sort('system:time_start')
        )
        
        collection_size = ls9.size().getInfo()
        if image_index >= collection_size:
            raise ValueError(f"Index {image_index} out of range. Size: {collection_size}")
            
        selected_image = ee.Image(ls9.toList(collection_size).get(image_index))
        return self._process_image(selected_image)

    def landsat_viz_params(self): 
        return {
            'min': 0, 'max': 0.18, 
            'bands': ['B6P', 'B5P', 'B4P'], 
            'gamma': [1.05, 1.08, 0.8]
        }

    def render_classification_map(self, df):
        import pandas as pd
        
        if not isinstance(df, pd.DataFrame):
            raise TypeError("df must be a pandas DataFrame")
        
        if 'prediction' not in df.columns:
            raise ValueError("DataFrame must have 'prediction' column")
        
        if 'longitude' not in df.columns or 'latitude' not in df.columns:
            raise ValueError("DataFrame must have 'longitude' and 'latitude' columns")
        
        features = []
        for idx, row in df.iterrows():
            geom = ee.Geometry.Point([float(row['longitude']), float(row['latitude'])])
            props = {'prediction': int(row['prediction'])}
            features.append(ee.Feature(geom, props))
        
        fc = ee.FeatureCollection(features)
        img = fc.reduceToImage(properties=['prediction'], reducer=ee.Reducer.first())
        img = img.reproject(crs='EPSG:4326', scale=15)
        
        palette = self._get_prediction_palette()
        min_val, max_val = self._get_prediction_range()
        
        vis_params = {
            'min': min_val,
            'max': max_val,
            'palette': palette
        }
        
        map_id = img.getMapId(vis_params)
        return map_id['tile_fetcher'].url_format

    def _get_prediction_palette(self):
        return ['#ff0000', '#00ff00']
    
    def _get_prediction_range(self):
        return (0, 1)


class MapUtilsDrought(MapUtilsBase):
    """
    Subclass for Drought Classification Project.
    Adds NDVI, NDWI, NDDI, EVI.
    """
    
    @staticmethod
    def add_drought_indices(image):
        ndvi = image.normalizedDifference(['B5P', 'B4P']).rename('NDVI')
        ndwi = image.normalizedDifference(['B3P', 'B6P']).rename('NDWI')
        nddi = image.addBands([ndvi, ndwi]).normalizedDifference(['NDVI', 'NDWI']).rename('NDDI')
        
        evi = image.expression(
            '2.5 * ((NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 1))',
            {
                'NIR': image.select('B5P'),
                'RED': image.select('B4P'),
                'BLUE': image.select('B2P')
            }).rename('EVI')
            
        return image.addBands([ndvi, ndwi, nddi, evi])

    def _process_image(self, image):
        img = super()._process_image(image)
        img = self.add_drought_indices(img)
        return img

    def _get_prediction_palette(self):
        return ['#00b050', '#ffc000', '#ff0000']
    
    def _get_prediction_range(self):
        return (0, 2)