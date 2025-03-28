from flask_app import app
from flask import Blueprint, request, redirect, url_for, session
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
import requests

auth_bp = Blueprint('auth', __name__)

CLIENT_SECRETS_FILE = "client_secret.json"
SCOPES = [
    "https://www.googleapis.com/auth/drive.metadata",
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/forms.body",
    "https://www.googleapis.com/auth/spreadsheets"
]

@auth_bp.route('/login')
def login():
    # Store the next URL
    next_url = request.args.get('next')
    session['next_url'] = next_url
    app.logger.debug(f"Storing next URL in session: {next_url}")
    
    flow = Flow.from_client_secrets_file(
        CLIENT_SECRETS_FILE, scopes=SCOPES)
    flow.redirect_uri = url_for('auth.oauth2callback', _external=True, _scheme='https')

    authorization_url, state = flow.authorization_url(
        access_type='offline',
        include_granted_scopes='true',
        prompt='select_account'
    )

    session['state'] = state
    return redirect(authorization_url)

@auth_bp.route('/oauth2callback')
def oauth2callback():
    state = session['state']
    flow = Flow.from_client_secrets_file(
        CLIENT_SECRETS_FILE, scopes=SCOPES, state=state)
    flow.redirect_uri = url_for('auth.oauth2callback', _external=True, _scheme='https')

    authorization_response = request.url.replace('http://', 'https://')
    flow.fetch_token(authorization_response=authorization_response)


    credentials = flow.credentials
    session['credentials'] = credentials_to_dict(credentials)

    # Retrieve the next URL to redirect back to
    next_url = session.get('next_url') or url_for('routes.home')
    app.logger.debug(f"Redirecting to next URL: {next_url}")
    return redirect(next_url)

@auth_bp.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('routes.home'))


def credentials_to_dict(credentials):
    return {
        'token': credentials.token,
        'refresh_token': credentials.refresh_token,
        'token_uri': credentials.token_uri,
        'client_id': credentials.client_id,
        'client_secret': credentials.client_secret,
        'scopes': credentials.scopes
    }
