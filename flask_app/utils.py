from flask_app import app
from flask import url_for
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaIoBaseUpload
import io, requests, logging
from flask_socketio import SocketIO

# initialize socketio
socketio = SocketIO(app)

# sheet name for master spreadsheet
SHEET = 'Sheet1'

def emit_progress(index, total_files, socketid):
    socketio.emit('progress_update', {'uploaded': index + 1, 'total': total_files}, to=socketid)

def fetch_master_folder_data():
    # print(url_for('routes.get_master_folder_json', verify=False))
    response = requests.get(url_for('routes.get_master_folder_json', _external=True)) #, verify=False)
    if response.status_code == 200:
        return response.json()
    else:
        return None

# def fetch_master_folder_data():
#     # response = requests.get(url_for('routes.get_master_folder_json', verify=False))
#     directory = os.path.dirname(__file__)
#     for filename in os.listdir(directory):
#         if filename.startswith('master_folder') and filename.endswith('.json'):
#             filepath = os.path.join(directory, filename)
#             with open(filepath, 'r') as f:
#                 data = json.load(f)
#     if response.status_code == 200:
#         # return response.json()
#         return data.json()
#     else:
#         return None
    
def check_folder_access(credentials, folder_id):
    drive_service = build('drive', 'v3', credentials=credentials)

    try:
        drive_service.files().get(fileId=folder_id, fields='id, name').execute()
        return True
    except HttpError as error:
        if error.resp.status in [403, 404]:
            app.logger.error(f'Access denied or folder not found: {error}')
            return False
        else:
            app.logger.error(f'An error occurred: {error}')
            return False

def get_crab_data(credentials, folder_name):
    master_folder_data = fetch_master_folder_data()
    master_folder_id = master_folder_data.get('masterFolderId')
    master_folder_name = master_folder_data.get('masterFolderName')

    drive_service = build('drive', 'v3', credentials=credentials)

    spreadsheet_name = master_folder_name
    spreadsheet_id = find_spreadsheet(drive_service, master_folder_id, spreadsheet_name)
    if not spreadsheet_id:
        app.logger.error('Spreadsheet not found!')
        return {}

    service = build('sheets', 'v4', credentials=credentials)
    range_name = f'{SHEET}!A1:Z'  # Adjust the range to include the entire first row for headers and subsequent rows for data

    try:
        sheet = service.spreadsheets()
        result = sheet.values().get(spreadsheetId=spreadsheet_id, range=range_name).execute()
        values = result.get('values', [])

        if not values:
            app.logger.error('No data found in the spreadsheet.')
            return {}

        headers = values[0]  # First row is the headers
        data = {}

        # Log headers for debugging
        app.logger.debug(f'Spreadsheet headers: {headers}')
        
        for row in values[1:]:
            # Log each row for debugging
            app.logger.debug(f'Processing row: {row}')
            
            path_parts = row[0].split('/')  # Split the directory path
            app.logger.debug(f"path parts: {path_parts}")
            if len(path_parts) > 1:
                directory_entry = path_parts[-2]  # Get the second-to-last part of the directory entry
            else:
                directory_entry = master_folder_name

            app.logger.debug(f"dictionary entry: {directory_entry}")
            app.logger.debug(f"folder name: {folder_name}")
                
            if directory_entry == folder_name:
                entry_data = {}
                image_path = row[0]
                image_id = row[2]  # Assuming the image ID is in the 3rd column
                for i in range(3, len(row)):  # Start from the 4th column to skip the first three columns
                    header = headers[i]
                    value = row[i]
                    entry_data[header] = value
                data[image_id] = {
                    'entryData': entry_data,
                    'path': image_path
                }
                
                # Log each entry added for debugging
                app.logger.debug(f'Added data for image ID {image_id}: {entry_data}')

        return data
    except HttpError as error:
        app.logger.error(f'An error occurred: {error}')
        return {}
    
def find_spreadsheet(service, folder_id, title):
    query = f"'{folder_id}' in parents and explicitlyTrashed=false and mimeType='application/vnd.google-apps.spreadsheet' and name='{title}'"
    response = service.files().list(q=query, spaces='drive', fields='files(id, name)').execute()
    files = response.get('files', [])
    if files:
        return files[0]['id']
    return None

def create_spreadsheet(service, folder_id, title):
    spreadsheet = {
        'properties': {
            'title': title
        }
    }
    spreadsheet = service.spreadsheets().create(body=spreadsheet, fields='spreadsheetId').execute()
    spreadsheet_id = spreadsheet.get('spreadsheetId')

    drive_service = build('drive', 'v3', credentials=service._http.credentials)
    file = drive_service.files().get(fileId=spreadsheet_id, fields='parents').execute()
    previous_parents = ",".join(file.get('parents'))
    drive_service.files().update(fileId=spreadsheet_id,
                                 addParents=folder_id,
                                 removeParents=previous_parents,
                                 fields='id, parents').execute()

    return spreadsheet_id

def append_to_spreadsheet(service, spreadsheet_id, data):
    range_ = f'{SHEET}'
    value_input_option = 'USER_ENTERED'
    insert_data_option = 'INSERT_ROWS'
    value_range_body = {
        'range': range_,
        'majorDimension': 'ROWS',
        'values': data
    }
    request = service.spreadsheets().values().append(spreadsheetId=spreadsheet_id, range=range_,
                                                     valueInputOption=value_input_option,
                                                     insertDataOption=insert_data_option,
                                                     body=value_range_body)
    response = request.execute()
    return response

def get_existing_headers(service, spreadsheet_id):
    range_ = f'{SHEET}!A1:Z1'
    result = service.spreadsheets().values().get(spreadsheetId=spreadsheet_id, range=range_).execute()
    values = result.get('values', [])
    existing_headers = values[0] if values else []
    return existing_headers

def determine_new_headers(existing_headers, default_headers, data_points_names):
    all_headers = default_headers + data_points_names
    new_headers = [header for header in all_headers if header not in existing_headers]
    return new_headers

def add_new_headers_if_needed(service, spreadsheet_id, existing_headers, new_headers):
    if new_headers:
        range_ = f'{SHEET}!A1:Z1'

        headers_to_update = existing_headers + new_headers

        value_range_body = {
            'range': range_,
            'majorDimension': 'ROWS',
            'values': [headers_to_update]
        }

        service.spreadsheets().values().update(
            spreadsheetId=spreadsheet_id,
            range=range_,
            valueInputOption='RAW',
            body=value_range_body
        ).execute()

def map_data_to_columns(headers, data_points_names, data_points_values, real_image_id):
    row = []
    for header in headers:
        if header in ['Image Path', 'Image Link', 'Image ID']:
            continue
        if real_image_id in data_points_values and header in data_points_names:
            index = data_points_names.index(header)
            value = data_points_values[real_image_id]
            if isinstance(value, dict):
                row.append(value.get(str(index), ''))
            else:
                app.logger.error(f"Expected a dictionary for real_image_id {real_image_id}, but got {type(value).__name__}")
                row.append('')
        else:
            row.append('')
    return row

def get_file_path(service, file_id, master_id):
    file_path = []
    while True:
        file = service.files().get(fileId=file_id, fields='id, name, parents').execute()
        file_path.insert(0, file['name'])
        parents = file.get('parents')
        if not parents or parents[0] == master_id:
            break
        file_id = parents[0]
    return '/'.join(file_path)

def folder_exists(service, folder_id):
    try:
        folder = service.files().get(fileId=folder_id, fields="id, name, explicitlyTrashed").execute()
        if folder and not folder['explicitlyTrashed']:
            return True
        else:
            print("Folder does not exist.")
            return False
    except HttpError as error:
        if error.resp.status == 404:
            print("Folder does not exist.")
            return False
        else:
            raise

def uploadFile(drive_service, file, image_id, folder_id, master_folder_id, all_headers, data_points_names, data_points_values, retries=3):
    file_stream = io.BytesIO(file.read())
    file_metadata = {'name': file.filename, 'parents': [folder_id]}
    media = MediaIoBaseUpload(file_stream, mimetype=file.mimetype, resumable=True)

    file_drive_id = None

    try:
        file_drive = drive_service.files().create(body=file_metadata, media_body=media, fields='id').execute()
        file_drive_id = file_drive.get('id')
        file_link = f"https://drive.usercontent.google.com/download?id={file_drive_id}&authuser=0"
        file_path = get_file_path(drive_service, file_drive_id, master_folder_id)

        permission = {'type': 'anyone', 'role': 'reader'}
        drive_service.permissions().create(fileId=file_drive_id, body=permission).execute()

        real_image_id = image_id.split('[')[1].split(']')[0]
        row = map_data_to_columns(all_headers, data_points_names, data_points_values, real_image_id)
        row = [file_path, file_link, file_drive_id] + row

        return row

    except Exception as e:
        # add check for corrupt files and then delete them
        results = drive_service.files().list(
        q=f"'{folder_id}' in parents",
        pageSize=100,
        fields="nextPageToken, files(id, name)").execute()
        items = results.get('files', [])

        app.logger.debug(f"items in folder: {items}")

        if retries > 0:
            app.logger.warning(f'Error uploading file {file.filename}: {e}. Retrying... ({3 - retries + 1}/3)')
            return uploadFile(drive_service, file, image_id, folder_id, master_folder_id, all_headers, data_points_names, data_points_values, retries - 1)
        else:
            app.logger.error(f'Error occurred while uploading file {file.filename}. No more retries left.')
            return None
        
def retrieveFileTree(service, master_folder_id):
    def retrieve_folders(parent_folder_id):
        # Retrieve subfolders
        folder_results = service.files().list(
            q=f"'{parent_folder_id}' in parents and explicitlyTrashed=false and mimeType='application/vnd.google-apps.folder'",
            pageSize=100, fields="nextPageToken, files(id, name, parents)").execute()
        folders = folder_results.get('files', [])

        items = []
        for folder in folders:
            item_data = {
                'id': folder['id'],
                'name': folder['name'],
                'parent': folder.get('parents', [None])[0],
                'contents': retrieve_folders(folder['id'])
            }
            items.append(item_data)

        return items

    # Retrieve items from the master folder
    all_items = retrieve_folders(master_folder_id)
    app.logger.debug(f"All items in {master_folder_id}: {all_items}")
    return all_items
