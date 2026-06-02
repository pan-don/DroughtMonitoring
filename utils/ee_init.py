import os
import json
import tempfile
import ee

def init_earth_engine():
    key_json = os.getenv("GEE_KEY")
    
    if key_json:
        data = json.loads(key_json)
        with tempfile.NamedTemporaryFile(delete=False, suffix=".json") as fp:
            fp.write(key_json.encode())
            key_path = fp.name
        credentials = ee.ServiceAccountCredentials(data["client_email"], key_path)
        ee.Initialize(credentials)
    else:
        local_key_path = os.path.join(os.path.dirname(__file__), 'secreet_keys.json')
        if os.path.exists(local_key_path):
            with open(local_key_path, 'r') as f:
                data = json.load(f)
            credentials = ee.ServiceAccountCredentials(data["client_email"], local_key_path)
            ee.Initialize(credentials)
        else:
            raise ValueError("GEE_KEY environment variable not found and secreet_keys.json not found in utils/ directory.")
