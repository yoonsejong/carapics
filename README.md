# Carapics

A Google Apps-based biological specimen annotation management database.

## Features
* Manage your specimen image data your way using your existing Google Drive storage
* Easy access to entire numeric dataset using Google Sheet
* Easily create Google Forms-based annotation surveys both intuitively and automatically using web-based interface
* User management using Google account via [OAuth2](https://en.wikipedia.org/wiki/OAuth)

## Requirements
* A web server
* Python
* [Flask](https://flask.palletsprojects.com/)
* [Flask.SocketIO](https://flask-socketio.readthedocs.io)
* [Gunicorn](https://gunicorn.org/)

Following JavaScript libraries were used:
* [Notyf](https://carlosroso.com/notyf/)
* [Tabulator](https://tabulator.info/)

Of course, you need access to Google API from [Google Cloud Platform](https://cloud.google.com)

## How to Install
Setting up a server requires some technical fluency in web application development. 
* For Carapics to operate fully, you need a domain and HTTPS-enabled web server. To create your own, we recommend a tutorial [here](https://www.digitalocean.com/community/tutorials/how-to-serve-flask-applications-with-gunicorn-and-nginx-on-ubuntu-22-04).
* After setting up your server with Flask/Gunicorn and HTTPS, put Carapics into your project directory.
* Go to your Google Cloud Platform's Dashboard and create [API key](https://cloud.google.com/docs/authentication/api-keys).
* Obtain your client_secret.json file from your Google API Dashboard, and put it in your project directory.
* You also want to set the master Google Drive folder information inside flask_app/master_folder.json.

## Related Publications
* Gary H. Dickinson, Sejong Yoon, Nate Sorvino, Sameer Kamal, Corin J. Hoppe, Isra Ahmad. "Carapics: A Web-based Platform for Semi-quantitative Analysis of Structural Change in Biological Samples." Benthic Ecology Meeting, April 1, 2025.

## History
* v0.9.1: README update
* v0.9.0: Public repository created
* v0.1.0: Developed by [Nate Sorvino](https://github.com/nsorvino) during Summer 2024 under the guidance of [Sejong Yoon](https://github.com/yoonsejong) and feedback from [Gary H. Dickinson](https://github.com/ghdickinson)'s team.
