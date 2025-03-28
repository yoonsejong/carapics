from flask_app import app, socketio
import os


if __name__ == "__main__":
    # os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'
    os.environ['OAUTHLIB_RELAX_TOKEN_SCOPE'] = '1'    
    socketio.run(app, debug=True)

