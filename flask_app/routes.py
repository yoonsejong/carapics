from flask_app import app, socketio
from flask_app.utils import emit_progress, get_crab_data, retrieveFileTree, create_spreadsheet, folder_exists, determine_new_headers, get_existing_headers, add_new_headers_if_needed, append_to_spreadsheet, fetch_master_folder_data, check_folder_access, find_spreadsheet, uploadFile
from flask import Blueprint, render_template, request, redirect, url_for, session, jsonify, flash
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
import json, os, random
import google_auth_httplib2
import httplib2
import logging

routes_bp = Blueprint('routes', __name__)

@routes_bp.route('/')
def home():
    # app.logger.debug('this is a DEBUG message')
    # app.logger.info('this is an INFO message')
    # app.logger.warning('this is a WARNING message')
    # app.logger.error('this is an ERROR message')
    # app.logger.critical('this is a CRITICAL message')

    return render_template('home.html')

upload_cancel_status = {}

@socketio.on('cancel_upload')
def handle_cancel_upload(data):
    app.logger.debug("Handling cancel upload...")
    socket_id = data.get('socketId')
    app.logger.debug(f"Received socket ID for cancellation: {socket_id}")
    if socket_id:
        upload_cancel_status[socket_id] = True
        socketio.emit('cancel_upload', {'status': 'success'}, to=socket_id)
    else:
        socketio.emit('cancel_upload', {'status': 'error', 'message': 'No socket ID provided'})

@routes_bp.route('/upload_images', methods=['GET', 'POST'])
def upload_images():
    if 'credentials' not in session:
        return redirect(url_for('auth.login', next=request.url))

    credentials = Credentials(**session['credentials'])
    http = httplib2.Http(timeout=5)
    authed_http = google_auth_httplib2.AuthorizedHttp(credentials, http=http)

    drive_service = build('drive', 'v3', http=authed_http)
    sheets_service = build('sheets', 'v4', http=authed_http)

    master_folder_data = fetch_master_folder_data()
    if not master_folder_data:
        flash('Please select a master folder before proceeding.', 'warning')
        return redirect(url_for('routes.home'))

    master_folder_id = master_folder_data.get('masterFolderId')
    master_folder_name = master_folder_data.get('masterFolderName')

    if not check_folder_access(credentials, master_folder_id):
        flash('You do not have access to the master folder.', 'danger')
        return redirect(url_for('routes.home'))

    if request.method == 'POST':
        for key in request.form.keys():
            app.logger.debug(f"Form key: {key}, value: {request.form.get(key)}")

        for key in request.files.keys():
            app.logger.debug(f"File key: {key}, filename: {request.files.get(key).filename}")

        socketid = request.form.get('socketId')
        app.logger.debug(f"socket id for this upload: {socketid}")
        upload_cancel_status[socketid] = False  # Reset the cancel status
        app.logger.debug(f"upload cancel status for this socketid: {upload_cancel_status[socketid]}")

        folder_id = request.form.get('folderId')
        if not folder_exists(drive_service, folder_id):
            flash('The selected folder no longer exists!', 'danger')
            return jsonify({'status': 'error'})
            #return redirect(url_for('upload_images'), code="307")

        if not check_folder_access(credentials, folder_id):
            flash('You do not have access to the selected folder.', 'danger')
            return jsonify({'status': 'error'})
            #return redirect(url_for('upload_images'), code="307")

        files = request.files.to_dict()

        data_points_names = []
        for key in request.form.keys():
            if key.startswith('sharedDataPointsNames['):
                index = int(key.split('[')[1].split(']')[0])
                if index >= len(data_points_names):
                    data_points_names.extend([None] * (index + 1 - len(data_points_names)))
                data_points_names[index] = request.form[key]

        data_points_values = {}
        for key in request.form.keys():
            if key.startswith('sharedDataPointsValues['):
                parts = key.split('[')
                image_id = parts[1].split(']')[0]
                index = parts[2].split(']')[0]
                if image_id not in data_points_values:
                    data_points_values[image_id] = {}
                data_points_values[image_id][index] = request.form[key]

        spreadsheet_id = find_spreadsheet(drive_service, master_folder_id, master_folder_name)
        if not spreadsheet_id:
            spreadsheet_id = create_spreadsheet(sheets_service, master_folder_id, master_folder_name)

        existing_headers = get_existing_headers(sheets_service, spreadsheet_id)
        default_headers = ['Image Path', 'Image Link', 'Image ID']
        new_headers = determine_new_headers(existing_headers, default_headers, data_points_names)
        all_headers = existing_headers + new_headers

        add_new_headers_if_needed(sheets_service, spreadsheet_id, existing_headers, new_headers)

        data = []
        upload_success = []
        upload_error = []

        total_files = len(files)
        for index, (image_id, file) in enumerate(files.items()):
            # Check if user cancels upload
            if upload_cancel_status.get(socketid) is True:
                app.logger.debug("Upload is canceled.")
                break

            row = uploadFile(drive_service, file, image_id, folder_id, master_folder_id, all_headers, data_points_names, data_points_values)
            if row:
                data.append(row)
                upload_success.append(file.filename)
                app.logger.info(f"Upload for {file.filename} was a success!")
                app.logger.info(f"Row value for {file.filename}: {row}")
                # Emit progress update
                emit_progress(index, total_files, socketid)
            else:
                upload_error.append(file.filename)

        if data:
            app.logger.debug(f"data: {data}")
            append_to_spreadsheet(sheets_service, spreadsheet_id, data)

        return jsonify({'status': 'success'})

    return render_template('upload_images.html')

@routes_bp.route('/create_form', methods=['GET', 'POST'])
def create_form():
    if 'credentials' not in session:
        return redirect(url_for('auth.login', next=request.url))

    credentials = Credentials(**session['credentials'])

    master_folder_data = fetch_master_folder_data()
    if not master_folder_data:
        flash('Please select a master folder before proceeding.', 'warning')
        return redirect(url_for('routes.home'))

    master_folder_id = master_folder_data.get('masterFolderId')
    if not master_folder_id:
        flash('Master folder data is missing in the JSON file.', 'warning')
        return redirect(url_for('routes.home'))

    master_folder_name = master_folder_data.get('masterFolderName')
    if not master_folder_name:
        flash('Master folder name is missing in the JSON file.', 'warning')
        return redirect(url_for('routes.home'))

    if not check_folder_access(credentials, master_folder_id):
        flash('You do not have access to the master folder.', 'danger')
        return redirect(url_for('routes.home'))

    form_service = build('forms', 'v1', credentials=credentials)
    drive_service = build('drive', 'v3', credentials=credentials)

    if request.method == 'POST':
        survey_data = json.loads(request.form.get('surveyData'))
        image_data = json.loads(request.form.get('imageData'))
        images_with_data = json.loads(request.form.get('selectedImages'))

        app.logger.debug(f"Survey data: {survey_data}")
        app.logger.debug(f"Image data: {image_data}")

        title = survey_data.get('title', 'New Survey')
        description = survey_data.get('description', '')
        randomize_questions = survey_data.get('randomizeQuestions', False)
        images = survey_data.get('images', [])
        question = survey_data.get('question', {})


        form_data = {
            "info": {
                "title": title
            }
        }

        try:
            form = form_service.forms().create(body=form_data).execute()
            form_id = form['formId']
            app.logger.debug(f'Form created with ID: {form_id}')

            requests = [
                {
                    "updateFormInfo": {
                        "info": {
                            "title": title,
                            "description": description
                        },
                        "updateMask": "description"
                    }
                }
            ]

            question_items = []
            for image in images:
                image_link = f"https://drive.usercontent.google.com/download?id=" + image["id"] + "&authuser=0"
                question_items.append({
                    "createItem": {
                        "item": {
                            "title": f"{question['question']}",
                            "questionItem": {
                                "question": {
                                    "required": True,
                                    "choiceQuestion": {
                                        "type": "RADIO",
                                        "options": [{"value": option} for option in question['options']]
                                    }
                                },
                                "image": {
                                    "sourceUri": image_link,
                                    "altText": image["name"],
                                    "properties": {
                                        "alignment": "LEFT",
                                        "width": 600
                                    }
                                }
                            }
                        },
                        "location": {
                            "index": 0
                        }
                    },
                })

            if randomize_questions:
                random.shuffle(question_items)

            requests.extend(question_items)

            batch_update_request = {
                "requests": requests
            }

            form_service.forms().batchUpdate(formId=form_id, body=batch_update_request).execute()
            app.logger.debug(f'Form updated with items and settings')

            copied_form = drive_service.files().copy(fileId=form_id, body={
                'name': title,
                'parents': [master_folder_id]
            }).execute()
            app.logger.debug(f'Copied form metadata: {copied_form}')

            drive_service.files().delete(fileId=form_id).execute()
            app.logger.debug(f'Original form with ID {form_id} deleted')

            try:
                # Attempt to get form details using the Forms API
                copied_form_id = copied_form.get('id')
                form_details = form_service.forms().get(formId=copied_form_id).execute()
                app.logger.debug(f'Form details retrieved: {form_details}')
                new_form_id = form_details.get("formId")

                # Retrieve question IDs
                form_questions = form_details.get("items", [])
                question_id_map = {index: item["questionItem"]["question"]["questionId"] for index, item in enumerate(form_questions) if "questionItem" in item}
                
            except Exception as e:
                app.logger.error(f'Failed to retrieve form details with ID {copied_form_id}: {str(e)}')

            # Start of sheet creation ************
            all_image_data = []

            # Extracting the order of images based on question items
            question_order = {}
            for index, item in enumerate(question_items):
                sourceUri = item['createItem']["item"]["questionItem"]["image"]["sourceUri"]
                imageDebug = item['createItem']["item"]["questionItem"]["image"]
                app.logger.debug(f"Source URI {sourceUri} for image {imageDebug}")
                image_link = item["createItem"]["item"]["questionItem"]["image"]["sourceUri"]
                # Splitting the URL to get the image ID
                image_id = image_link.split('id=')[1].split('&')[0]
                question_order[index] = image_id

            # Assuming images_with_data is a list of dictionaries
            # Creating a default header list
            default_headers = ['Question ID', 'Image Path', 'Image Link', 'Image ID']
            if images_with_data:
                entry_keys = list(images_with_data[0].get('entryData', {}).keys())
                headers = default_headers + entry_keys

            # Creating a mapping of image_id to image data for easy access
            image_data_map = {image['id']: image for image in images_with_data}

            # Ordering all_image_data based on question_order
            for index in sorted(question_order.keys()):
                image_id = question_order[index]
                image = image_data_map.get(image_id)

                if image:
                    image_data = {
                        'Question ID': question_id_map.get(index, 'N/A'),  # Adding Question ID from Google Form
                        'Image Path': image.get('path'),
                        'Image Link': f"https://drive.usercontent.google.com/download?id={image_id}&authuser=0",
                        'Image ID': image_id
                    }

                    app.logger.debug(f"image path: {image.get('path')}")

                    # Adding additional data from entryData
                    for key, value in image.get('entryData', {}).items():
                        image_data[key] = value

                    all_image_data.append(image_data)

            # Reverse the order of all_image_data to get correct survey order
            all_image_data.reverse()

            # Unreverse the first column
            first_column = [image_data['Question ID'] for image_data in all_image_data]
            first_column.reverse()

            # Reinsert the unreversed first column into all_image_data
            for i, image_data in enumerate(all_image_data):
                image_data['Question ID'] = first_column[i]

            # Adding data to the new sheet in the master spreadsheet
            sheets_service = build('sheets', 'v4', credentials=credentials)

            # set sheet name
            sheet_name = f"{title} ({new_form_id})" # sheet_name = new_form_id

            # Create a new sheet with the title as the survey title
            spreadsheet_id = find_spreadsheet(drive_service, master_folder_id, master_folder_name)
            new_sheet = {
                "requests": [
                    {
                        "addSheet": {
                            "properties": {
                                "title": sheet_name
                            }
                        }
                    }
                ]
            }

            sheets_service.spreadsheets().batchUpdate(spreadsheetId=spreadsheet_id, body=new_sheet).execute()

            # Define the new sheet range for headers
            new_sheet_range = f"{sheet_name}!A1"

            # Append headers
            headers_body = {
                'range': new_sheet_range,
                'majorDimension': 'ROWS',
                'values': [headers]
            }

            sheets_service.spreadsheets().values().update(
                spreadsheetId=spreadsheet_id,
                range=new_sheet_range,
                valueInputOption='RAW',
                body=headers_body
            ).execute()

            # Define the new sheet range for data
            data_range = f"{sheet_name}!A2"

            # Append all_image_data
            data_body = {
                'range': data_range,
                'majorDimension': 'ROWS',
                'values': [list(image_data.values()) for image_data in all_image_data]
            }

            sheets_service.spreadsheets().values().update(
                spreadsheetId=spreadsheet_id,
                range=data_range,
                valueInputOption='RAW',
                body=data_body
            ).execute()

            # End of sheet creation ************

            # Start of form tracking sheet creation ************

            # find sheet in master spreadsheet for survey tracking, if not create new one
            # - this sheet tracks the question and answers for each survey, with each row providing details for one survey

            return jsonify({'success': True, 'formId': copied_form['id']})
        except Exception as error:
            app.logger.error(f'An error occurred: {error}')
            return jsonify({'error': str(error)}), 500

    return render_template('create_form.html')

@routes_bp.route('/load_images_from_drive')
def load_images_from_drive():
    if 'credentials' not in session:
        return redirect(url_for('auth.login', next=request.url))

    credentials = Credentials(**session['credentials'])
    drive_service = build('drive', 'v3', credentials=credentials)

    folder_id = request.args.get('folderId')
    folder_name = request.args.get('folderName')

    try:
        results = drive_service.files().list(
            q=f"'{folder_id}' in parents and explicitlyTrashed=false and mimeType contains 'image/'",
            pageSize=100, fields="nextPageToken, files(id, name, thumbnailLink, webContentLink)").execute()
        items = results.get('files', [])

        crab_data = get_crab_data(credentials, folder_name)

        images_with_data = []
        for item in items:
            image_data = {
                'parents': folder_id,
                'id': item['id'],
                'name': item['name'],
                'thumbnailLink': item.get('thumbnailLink'),
                'webContentLink': item.get('webContentLink')
            }

            for image_id, data in crab_data.items():
                if image_data['id'] == image_id:
                    image_data.update(data)
                    break

            images_with_data.append(image_data)

        for image in images_with_data:
            app.logger.debug(f"Image: {image}")
        return jsonify({'images': images_with_data})
    except Exception as error:
        app.logger.error(f"Error loading images: {error}")
        return jsonify({'error': str(error)}), 500

@routes_bp.route('/form_data')
def form_data():
    if 'credentials' not in session:
        return redirect(url_for('auth.login', next=request.url))

    credentials = Credentials(**session['credentials'])

    master_folder_data = fetch_master_folder_data()
    if not master_folder_data:
        flash('Please select a master folder before proceeding.', 'warning')
        return redirect(url_for('routes.home'))

    master_folder_id = master_folder_data.get('masterFolderId')

    if not check_folder_access(credentials, master_folder_id):
        flash('You do not have access to the master folder.', 'danger')
        return redirect(url_for('routes.home'))

    return render_template('form_data.html')

@routes_bp.route('/fetch_form_data')
def fetch_form_data():
    if 'credentials' not in session:
        return redirect(url_for('auth.login', next=request.url))

    credentials = Credentials(**session['credentials'])
    sheets_service = build('sheets', 'v4', credentials=credentials)
    drive_service = build('drive', 'v3', credentials=credentials)
    forms_service = build('forms', "v1", credentials=credentials)

    # fetch form metadata
    form_id = request.args.get('formId')

    data = {}

    # retrieve form metadata
    meta_data = forms_service.forms().get(formId=form_id).execute()
    data["metadata"] = meta_data

    # Fetch the responses from the Google Form
    result = forms_service.forms().responses().list(formId=form_id).execute()

    # Extract the responses from the result
    responses = result.get("responses", [])

    # Initialize a dictionary to store the answers for each response
    data["responses"] = []

    # Iterate through each response
    for response in responses:
        # Get the answers for this response
        answers = response.get("answers", {})
        # Create a dictionary to store the answers for the current response
        response_data = {}
        
        # Iterate through each question and store the answer
        for question_id, answer in answers.items():
            # Assuming the answer is a simple text answer
            response_data[question_id] = answer.get("textAnswers", {}).get("answers", [])[0].get("value", "")
        
        # Add the current response's data to the list of all responses
        data["responses"].append(response_data)

    # Now `data["responses"]` contains all the responses with their respective answers

    # Retrieve master spreadsheet data for form
    master_folder_data = fetch_master_folder_data()

    master_folder_id = master_folder_data.get('masterFolderId')
    master_folder_name = master_folder_data.get('masterFolderName')

    try:
        master_spreadsheet_id = find_spreadsheet(drive_service, master_folder_id, master_folder_name)
    except Exception:
        return jsonify({'error': 'Form spreadsheet not found'}), 404

    formTitle = meta_data['info']['title']
    formId = meta_data['formId']
    sheet_name = f'{formTitle} ({formId})'
    range_name = f'{sheet_name}!A:Z'  # Adjust the range as necessary
    result = sheets_service.spreadsheets().values().get(spreadsheetId=master_spreadsheet_id, range=range_name).execute()
    master_values = result.get('values', [])

    data["masterData"] = master_values

    return jsonify({'data': data})

@routes_bp.route('/settings')
def settings():
    if 'credentials' not in session:
        return redirect(url_for('auth.login', next=request.url))

    credentials = Credentials(**session['credentials'])

    return render_template('settings.html')

@routes_bp.route('/find_root_folders')
def find_root_folders():
    if 'credentials' not in session:
        return redirect(url_for('auth.login', next=request.url))

    credentials = Credentials(**session['credentials'])
    drive_service = build('drive', 'v3', credentials=credentials)

    try:
        root_folders = []

        results = drive_service.files().list(
            q="'root' in parents and explicitlyTrashed=false and mimeType='application/vnd.google-apps.folder'",
            pageSize=100, fields="nextPageToken, files(id, name)").execute()
        items = results.get('files', [])

        for item in items:
            root_folder_data = {
                'id': item['id'],
                'name': item['name']
            }
            root_folders.append(root_folder_data)

        return jsonify({'root_folders': root_folders})

    except Exception as error:
        app.logger.error(f"Error loading images: {error}")
        return jsonify({'error': str(error)}), 500

@routes_bp.route('/save_master_folder', methods=['POST'])
def save_master_folder():
    # delete old master_folder json
    directory = os.path.dirname(__file__)

    for filename in os.listdir(directory):
        if filename.startswith('master_folder') and filename.endswith('.json'):
            old_filepath = os.path.join(directory, filename)
            os.remove(old_filepath)
            app.logger.debug(f"Deleted old master folder file: {filename}")
            break  # assuming there is only one such file, we can break after deleting

    data = request.get_json()
    masterFolderId = data.get('masterFolderId')
    masterFolderName = data.get('masterFolderName')

    if masterFolderId == "deleted":
        app.logger.info("master folder being deleted")
        return jsonify({'status': 'success', 'message': 'Master folder deleted!'}), 200

    if masterFolderId and masterFolderName:
        master_folder_data = {
            'masterFolderId': masterFolderId,
            'masterFolderName': masterFolderName
        }

        save_folder = os.path.dirname(__file__)
        filename = f'master_folder.json'
        filepath = os.path.join(save_folder, filename)

        # if os.path.exists(filepath):
        #     os.remove(filepath)

        with open(filepath, 'w') as f:
            json.dump(master_folder_data, f, indent=4)

        return jsonify({'status': 'success', 'message': 'Master folder data saved successfully'}), 200
    else:
        return jsonify({'status': 'error', 'message': 'No master folder ID or name provided'}), 400

@routes_bp.route('/get_master_folder_json')
def get_master_folder_json():
    directory = os.path.dirname(__file__)
    for filename in os.listdir(directory):
        if filename.startswith('master_folder') and filename.endswith('.json'):
            filepath = os.path.join(directory, filename)
            with open(filepath, 'r') as f:
                data = json.load(f)
            app.logger.debug(f"master folder: {data}")
            return jsonify(data)
    return jsonify({"error": "File not found"}), 404

@routes_bp.route('/check_access')
def check_access():
    if 'credentials' not in session:
        return redirect(url_for('auth.login', next=request.url))

    credentials = Credentials(**session['credentials'])
    master_folder_data = fetch_master_folder_data()

    if not master_folder_data:
        return jsonify({'error': 'Master folder data not found'}), 404

    master_folder_id = master_folder_data.get('masterFolderId')

    if check_folder_access(credentials, master_folder_id):
        return jsonify({'status': 'success', 'message': 'Access to master folder is available'}), 200
    else:
        return jsonify({'status': 'error', 'message': 'Access to master folder is denied'}), 403

@routes_bp.route('/load_items')
def load_items():
    if 'credentials' not in session:
        return redirect(url_for('auth.login', next=request.url))

    master_folder_data = fetch_master_folder_data()
    master_folder_id = master_folder_data.get('masterFolderId')
    app.logger.debug(f"master folder id: {master_folder_id}")

    credentials = Credentials(**session['credentials'])
    drive_service = build('drive', 'v3', credentials=credentials)

    try:
        all_items = retrieveFileTree(drive_service, master_folder_id)
        app.logger.debug(f'all items: {all_items}')
        return jsonify({'items': all_items})

    except Exception as error:
        app.logger.error(f"Error loading items: {error}")
        return jsonify({'error': str(error)}), 500

@routes_bp.route('/load_forms')
def load_forms():
    if 'credentials' not in session:
        return redirect(url_for('auth.login', next=request.url))

    print("check1")
    master_folder_data = fetch_master_folder_data()
    master_folder_id = master_folder_data.get('masterFolderId')
    print("check2")
    credentials = Credentials(**session['credentials'])
    drive_service = build('drive', 'v3', credentials=credentials)
    print("check3")
    try:
        all_items = []
        print("check4")

        def retrieve_folders_and_files(parent_folder_id):
            print("check5")

            # Retrieve subfolders
            folder_results = drive_service.files().list(
                q=f"'{parent_folder_id}' in parents and explicitlyTrashed=false and mimeType='application/vnd.google-apps.folder'",
                pageSize=100, fields="nextPageToken, files(id, name, parents)").execute()
            print("check6")
            folders = folder_results.get('files', [])

            app.logger.debug(f"Folders: {folders}")

            # Retrieve form files
            form_results = drive_service.files().list(
                q=f"'{parent_folder_id}' in parents and explicitlyTrashed=false and mimeType='application/vnd.google-apps.form'",
                pageSize=100, fields="nextPageToken, files(id, name, parents)").execute()
            forms = form_results.get('files', [])

            app.logger.debug(f"Forms: {forms}")

            subitems = []
            for item in folders:
                item_data = {
                    'id': item['id'],
                    'name': item['name'],
                    'type': 'folder',
                    'parent': item.get('parents', [None])[0],
                    'contents': retrieve_folders_and_files(item['id'])
                }
                subitems.append(item_data)

            for item in forms:
                item_data = {
                    'id': item['id'],
                    'name': item['name'],
                    'type': 'form',
                    'parent': item.get('parents', [None])[0]
                }
                subitems.append(item_data)

            return subitems

        # Retrieve items from the master folder
        all_items = retrieve_folders_and_files(master_folder_id)

        return jsonify({'items': all_items})

    except Exception as error:
        app.logger.error(f"Error loading items: {error}")
        return jsonify({'error': str(error)}), 500

@routes_bp.route('/rename_item', methods=['POST'])
def rename_item():
    if 'credentials' not in session:
        return redirect(url_for('auth.login', next=request.url))

    credentials = Credentials(**session['credentials'])
    drive_service = build('drive', 'v3', credentials=credentials)

    item_id = request.json.get('itemId')
    new_name = request.json.get('newName')

    try:
        file = {'name': new_name}
        updated_file = drive_service.files().update(fileId=item_id, body=file).execute()
        return jsonify({'status': 'success', 'folder': updated_file})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@routes_bp.route('/create_folder', methods=['POST'])
def create_folder():
    if 'credentials' not in session:
        return redirect(url_for('auth.login', next=request.url))

    credentials = Credentials(**session['credentials'])
    drive_service = build('drive', 'v3', credentials=credentials)

    folder_name = request.json.get('folderName')
    if folder_name == '':
        folder_name = 'Untitled folder'

    parent_id = request.json.get('parentId')

    app.logger.debug(f"Folder name (create_folder): {folder_name}")
    app.logger.debug(f"Parent id (create_folder): {parent_id}")

    try:
        file_metadata = {
            'name': folder_name,
            'mimeType': 'application/vnd.google-apps.folder',
            'parents': [parent_id]
        }
        folder = drive_service.files().create(body=file_metadata, fields='id, name, parents').execute()
        return jsonify({'status': 'success', 'folder': folder})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@routes_bp.route('/delete_item', methods=['POST'])
def delete_item():
    if 'credentials' not in session:
        return redirect(url_for('auth.login', next=request.url))

    credentials = Credentials(**session['credentials'])
    drive_service = build('drive', 'v3', credentials=credentials)

    item_id = request.json.get('itemId')

    try:
        drive_service.files().delete(fileId=item_id).execute()
        return jsonify({'status': 'success'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
