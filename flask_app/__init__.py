from flask import Flask
from flask_socketio import SocketIO
from datetime import timedelta
import logging

app = Flask(__name__)
app.secret_key = 'mysecretkey'
# app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(hours=24)
# app.config['PREFERRED_URL_SCHEME'] = 'https'
# app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100 MB
socketio = SocketIO(app)

# Import blueprints
from flask_app.auth import auth_bp
from flask_app.routes import routes_bp

# Register blueprints
app.register_blueprint(auth_bp)
app.register_blueprint(routes_bp)

# Reroute logs
gunicorn_logger = logging.getLogger('gunicorn.error')
app.logger.handlers = gunicorn_logger.handlers
app.logger.setLevel(gunicorn_logger.level)

