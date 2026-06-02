"""
ASGI wrapper for Flask application.

This module wraps the Flask WSGI application with an ASGI interface
to enable deployment with uvicorn (ASGI server) on Hugging Face Spaces.
"""

from asgiref.wsgi import WsgiToAsgi
from app import app

# Wrap the Flask WSGI app with ASGI interface
asgi_app = WsgiToAsgi(app)
