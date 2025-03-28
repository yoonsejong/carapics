/* global data structures */
var files = [];
var sharedDataPointsNames = [];
var sharedDataPointsValues = {};
var currentDisplayedImage = null;
var selectedFolderId = null;
var selectedFolderName = null;
var selectedSpreadsheet = null;
var masterFolderId = null;
var masterFolderName = null;
var table;

// Initialize socket.io
const socket = io();

let socketid = undefined;

var isUploadCanceled = false;

socket.on('connect', function() {
    console.log("Socket IO Connected!")
    socketid = socket.id;
    console.log("ID: " + socketid);
})

// Listen for progress updates from the server
socket.on('progress_update', function(data) {
    if (isUploadCanceled) return;

    const progressBarFill = document.getElementById('progress-bar-fill');
    progressBarFill.style.width = (data.uploaded / data.total * 100) + '%';
    progressBarFill.textContent = `${data.uploaded} / ${data.total}`;

    // Show "OK" button when upload is complete
    if (data.uploaded === data.total) {
        document.getElementById('uploadCancelBtn').style.display = 'none';
        document.getElementById('uploadOkBtn').style.display = 'block';
        document.getElementById('progressModalLabel').textContent = "Upload complete!";
    }
});

socket.on('cancel_upload', function(data) {
    if (data.status === 'success') {
        isUploadCanceled = true;
        console.log("Upload canceled")
    } else {
        console.error('Failed to cancel upload:', data.message);
    }
});

function showProgressModal(files) {
    // Reset progress bar
    const progressBarFill = document.getElementById('progress-bar-fill');
    progressBarFill.style.width = '0%';
    progressBarFill.textContent = `0/${files.length}`;

    // Show modal
    $('#progressModal').modal('show');
}

function cancelProgressModal() {
    $('#progressModal').modal('hide');
}

function successfulUpload() {
    $('#progressModal').modal('hide');

    // clear global variables
    clearVars();
    
    location.reload()
}

// Add event listeners to modal buttons
document.getElementById('uploadCancelBtn').addEventListener('click', function() {
    $('#cancelConfirmationModal').modal('show');
});

// Event listener for the cancel confirmation button
document.getElementById('confirmCancelBtn').addEventListener('click', function() {
    console.log("Cancelling upload...")
    socket.emit('cancel_upload', { socketId: socketid }); // sends socket id to cancel_upload function in python file
    $('#cancelConfirmationModal').modal('hide');
    cancelProgressModal();
});

// listen for "Ok" button after successful upload
document.getElementById('uploadOkBtn').addEventListener('click', successfulUpload);

// Define a function to fetch the JSON file and return its contents as a dictionary
async function fetchMasterFolderData() {
    const response = await fetch(getMasterFolderJsonUrl);
    
    if (!response.ok) {
    throw new Error(response.statusText);
    }
    
    const data = await response.json();
    return data;
}

// Example usage of the fetchMasterFolderData function
async function getMasterFolderData() {
    try {
    const data = await fetchMasterFolderData();
    console.log(data); // Output the data for debugging purposes
    return data; // Return the data as a dictionary
    } catch (error) {
    console.error('There has been a problem with your fetch operation:', error);
    }
}

function loadFromSession() {
    const savedFolderId = sessionStorage.getItem('selectedFolderId');
    const savedFolderName = sessionStorage.getItem('selectedFolderName');

    if (savedFolderId && savedFolderName) {
        selectedFolderId = savedFolderId;
        selectedFolderName = savedFolderName;

        // set folder name
        document.getElementById('selectedFolder').innerText = selectedFolderName;
    } else { // if no saved folder in session, set it to the master server
        console.log("No folder in session, setting master to selected folder...");
        selectedFolderId = masterFolderId;
        selectedFolderName = masterFolderName;
        sessionStorage.setItem('selectedFolderId', masterFolderId);
        sessionStorage.setItem('selectedFolderName', masterFolderName);
        console.log("Selected Folder ID: " + selectedFolderId + ", Selected Folder Name: " + selectedFolderName);

        // set folder name
        document.getElementById('selectedFolder').innerText = selectedFolderName;
    }
}

// Show folder options popup when clicking hamburger
document.querySelector('.burger').addEventListener('click', function() {
    var popup = document.getElementById('optionsPopup');
    if (popup.style.display === 'block') {
        popup.style.display = 'none';
    } else {
        popup.style.display = 'block';
    }
});

// View folder
document.getElementById('seeFolder').addEventListener('click', function() {
    $('#optionsPopup').css('display', 'none');

    var folder_link = "https://docs.google.com/drive/folders/" + selectedFolderId;
    window.open(folder_link, '_blank');
});

// Remove folder
document.getElementById('removeFolder').addEventListener('click', function() {
    $('#optionsPopup').css('display', 'none');
    
    console.log("Deleting current folder, setting master to selected folder...");
        selectedFolderId = masterFolderId;
        selectedFolderName = masterFolderName;
        sessionStorage.setItem('selectedFolderId', masterFolderId);
        sessionStorage.setItem('selectedFolderName', masterFolderName);
        console.log("Selected Folder ID: " + selectedFolderId + ", Selected Folder Name: " + selectedFolderName);

        // set folder name
        document.getElementById('selectedFolder').innerText = selectedFolderName;
});

// Hide the popup when clicking outside
document.addEventListener('click', function(event) {
    var popup = document.getElementById('optionsPopup');
    var burger = document.querySelector('.burger');
    if (!popup.contains(event.target) && !burger.contains(event.target)) {
        popup.style.display = 'none';
    }
});

// Call the function to fetch and log data
getMasterFolderData().then(data => {
    // Load master folder data
    masterFolderId = data.masterFolderId;
    masterFolderName = data.masterFolderName;

    // Load session data
    loadFromSession();
});

function addFiles() {
    uploadLoadingWheel  = document.getElementById('upload_loadingWheel');
    uploadLoadingWheel.style.display = "block";
    var inputFiles = document.getElementById('image_files').files;
    var uploadButton = document.getElementById('uploadButton');
    uploadButton.disabled = inputFiles.length === 0;

    for (var i = 0; i < inputFiles.length; i++) {
        if (validateFile(inputFiles[i])) {
            var imageId = generateUniqueId();
            files.push({ id: imageId, file: inputFiles[i] });
            displayThumbnail(inputFiles[i], imageId);
        } else {
            notyf.error(inputFiles[i].name + " is not a valid image file");
        }
    }

    document.getElementById('image_files').value = "";
    updateDropZoneMessage();

    uploadLoadingWheel.style.display = "none";
}

function parseFileNames() {
    const template = document.getElementById('file-name-template').value;
    console.log("template: ", template);
    const keys = template.split('-');
    for(var i = 0; i < keys.length; i++) {
        console.log("key: ", keys[i]);
    }

    const parsedFiles = [];

    files.forEach((fileObj) => {
        var fileName = fileObj.file.name;
        const lastPeriodIndex = fileName.lastIndexOf('.');
        let baseName;
        if (lastPeriodIndex !== -1) {
            baseName = fileName.slice(0, lastPeriodIndex);
        } else {
            baseName = fileName; // No period found, use the whole filename
        }
        fileName = baseName;
        const values = fileName.split('-');
        for(var i = 0; i < values.length; i++) {
            console.log("value: ", values[i]);
        }

        let fileDict = {};
        if (values.length === keys.length) {
            keys.forEach((key, index) => {
                fileDict[key] = values[index];
            });
            for (let key in fileDict) {
                console.log("fileDict key: ", fileDict[key])
            }
        } else {
            keys.forEach((key) => {
                fileDict[key] = "invalid";
            });
            for (let key in fileDict) {
                console.log("fileDict key: ", fileDict[key])
            }
        }

        parsedFiles.push(fileDict);
    });

    var tableData = parsedFiles;
    var columns = keys.map(key => ({ title: key.trim(), field: key.trim(), editor: "input" }));

    // Clear previous table content (if any)
    const tableElement = document.getElementById('parsedTable');
    tableElement.innerHTML = '';

    // Initialize Tabulator on the parsedTable div
    table = new Tabulator("#parsedTable", {
        data: tableData,
        columns: columns,
        layout: "fitColumns", // Fit columns to width of table
        rowFormatter: function(row) {
            var data = row.getData();
            var containsInvalid = false;
    
            // Check each value in the row for "invalid"
            for (var key in data) {
                if (data[key] === "invalid") {
                    containsInvalid = true;
                    break;
                }
            }
    
            // If "invalid" is found, add a class to 
            if (containsInvalid) {
                row.getElement().style.color = "white";
                row.getElement().style.backgroundColor = "#FA8072";
            }
        }
    });
}

function addPresetDataPoints() {
    // if (files.length > 0) {
    //     files.forEach(file => {
    //         saveCurrentDataPoints(file.id);
    //     });
    // }

    const columns = table.getColumnDefinitions().map(column => column.title);
    const data = table.getData();

    // Clear existing data point fields
    const container = document.getElementById('dataPointsContainer');
    container.innerHTML = '';

    // Create a data point field for each column header
    columns.forEach((column) => {
        addDataPointField(column);
    });

    data.forEach(row => {
        console.log("row: ", row);
    });

    // Populate each image's data points with the corresponding table data
    data.forEach((row, rowIndex) => {
        var currentImageDataPoints = [];
        var dataPointPairs = document.querySelectorAll('.data-point-pair');
        dataPointPairs.forEach((pair, pairIndex) => {
            let name = pair.children[0].value;
            console.log("name: ", name);
            let value = row[columns[pairIndex]];
            console.log("value: ", value);
            console.log("for pair index: ", pairIndex);
            currentImageDataPoints.push({ name, value });
        });

        sharedDataPointsNames = currentImageDataPoints.map(dp => dp.name);
        sharedDataPointsValues[files[rowIndex].id] = currentImageDataPoints.map(dp => dp.value);
    });

    // refresh the data points display for the currently shown image
    if (currentDisplayedImage !== null) {
        generateDataPointInputs(currentDisplayedImage);
    }

    clearFullImageDisplay();
}

function saveCurrentDataPoints(currentImageId) {
    var currentImageDataPoints = [];
    var dataPointPairs = document.querySelectorAll('.data-point-pair');
    dataPointPairs.forEach(pair => {
        let name = pair.children[0].value;
        let value = pair.children[1].value;
        currentImageDataPoints.push({ name, value });
    });

    sharedDataPointsNames = currentImageDataPoints.map(dp => dp.name);
    sharedDataPointsValues[currentImageId] = currentImageDataPoints.map(dp => dp.value);
}

async function uploadFiles() {
    // Save data points for the currently displayed image
    saveCurrentDataPoints(currentDisplayedImage);

    $('#progressWheel').css('display', 'block');

    // Create formData object to be sent to app
    var formData = new FormData();

    // Append chosen folder ID to formData
    if (selectedFolderId == null) {
        console.log("Error: selectedFolderId = null")
    }
    formData.append('folderId', selectedFolderId);

    // Append image files to formData
    if (files.length == 0) { // checks if there is at least one image file to upload
        notyf.open({
            type: 'warning',
            message: 'You must choose at least one image to upload'
        });
        return false;
    } else {
        files.forEach((fileObj) => {
            formData.append(`image_files[${fileObj.id}]`, fileObj.file); // need ` not ' for the variable to be detected
        });
    }

    var checkName = document.querySelectorAll('.data-point-pair');
    if (checkName.length > 0 && checkName.length == 0) {
        notyf.open({
            type: 'warning',
            message: 'You must enter a name for your data point(s)'
        });
        return false;
    } else {
        // Append data point names to formData
        sharedDataPointsNames.forEach((name, index) => {
            formData.append(`sharedDataPointsNames[${index}]`, name);
        });
    }
    
    // Append data point values to formData
    files.forEach((fileObj) => {
        sharedDataPointsNames.forEach((name, index) => {
            if (sharedDataPointsValues[fileObj.id] && sharedDataPointsValues[fileObj.id][index] !== undefined) {
                formData.append(`sharedDataPointsValues[${fileObj.id}][${index}]`, sharedDataPointsValues[fileObj.id][index]);
            } else {
                formData.append(`sharedDataPointsValues[${fileObj.id}][${index}]`, '');
            }
        });
    });

    // Append socket id to formData to send to server-side
    formData.append('socketId', socketid)

    // Print formData to console
    for (let pair of formData.entries()) {
        console.log(pair[0] + ': ' + pair[1]);
    }

    // Reset cancel upload var
    isUploadCanceled = false;

    // Show progress modal
    showProgressModal(files);

    // Send data to python
    try {
        const response = await fetch(uploadImagesUrl, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        console.log(data);
        if (data['status'] == 'error') {
            location.reload();
        }
    } catch (error) {
        $('#uploadLoadingWheel').css('display', 'none');
        console.error('Error:', error);
    }

    // clear progress wheel
    $('#progressWheel').css('display', 'none');
}

function clearVars() {
    files = [];
    sharedDataPointsNames = [];
    sharedDataPointsValues = {};
    currentDisplayedImage = null;
}

function displayThumbnail(file, imageId) {
    var reader = new FileReader();
    reader.onload = function(e) {
        var thumbnailContainer = document.getElementById("thumbnail_container");

        var div = document.createElement("div");
        div.classList.add("thumbnail");
        div.setAttribute("data-id", imageId);

        var imgName = document.createElement("p");
        imgName.textContent = file.name;

        var img = document.createElement("img");
        img.src = e.target.result;
        img.width = 100;
        img.height = 100;
        img.onclick = function() {
            displayFullImage(e.target.result, imageId, file.name); 
        };

        var removeButton = document.createElement("button");
        removeButton.textContent = "Remove";
        removeButton.classList.add("btn", "btn-danger", "btn-sm", "remove-button");
        removeButton.onclick = function() {
            var index = files.findIndex(f => f.id === imageId);
            if (index > -1) {
                files.splice(index, 1);
            }
            thumbnailContainer.removeChild(div);
            if (currentDisplayedImage === imageId) {
                clearFullImageDisplay();
            }
            updateDropZoneMessage();
            uploadButton.disabled = files.length === 0;
        };

        div.appendChild(imgName);
        div.appendChild(img);
        div.appendChild(removeButton);

        thumbnailContainer.appendChild(div);
    };
    reader.readAsDataURL(file);
    updateDropZoneMessage();
}

function scrollToBottom() {
    var container = document.getElementById('dataPointsContainer');
    container.scrollTop = container.scrollHeight;
}

// Function to check the PointerEvent properties
function checkPointerEvent(event) {
    return event instanceof PointerEvent &&
           event.isTrusted === true &&
           event.pointerId === 1 &&
           event.width === 1 &&
           event.height === 1 &&
           event.pressure === 0;
}

function addDataPointField(name) {
    var container = document.getElementById('dataPointsContainer');

    var addButton = document.getElementById('additionalAddDataPointButton');
    if (addButton) {
        container.removeChild(addButton);
    }

    var pairContainer = document.createElement('div');
    pairContainer.classList.add('data-point-pair');

    var inputName = document.createElement('input');
    inputName.placeholder = "Data Point Name";
    inputName.classList.add('data-point-name');
    if (!checkPointerEvent(name)) {
        inputName.value = name;
    }
    pairContainer.appendChild(inputName);

    var inputValue = document.createElement('input');
    inputValue.placeholder = "Value";
    inputValue.classList.add('data-point-input');
    if (!checkPointerEvent(name)) {
        inputValue.setAttribute('data-column', name); // Add data attribute to link the input with the column
    }
    pairContainer.appendChild(inputValue);

    var removeButton = document.createElement("button");
    removeButton.innerHTML = "<i class='fa fa-trash'></i>";
    removeButton.classList.add("btn", "btn-danger", "btn-sm", "remove-data-point-button");
    removeButton.onclick = function() {
        pairContainer.remove();
        saveCurrentDataPoints();
    };
    pairContainer.appendChild(removeButton);

    container.appendChild(pairContainer);
    
    var addButton = document.createElement('button');
    addButton.textContent = 'Add Data Point';
    addButton.id = 'additionalAddDataPointButton';
    addButton.onclick = addDataPointField; // reference function so that it only calls during event
    addButton.classList.add('btn', 'btn-primary', 'mt-2');
    container.appendChild(addButton);

    scrollToBottom();
}

function generateDataPointInputs(imageId) {
    var container = document.getElementById('dataPointsContainer');
    container.innerHTML = ''; 

    var savedDataPoints = sharedDataPointsNames.map((name, index) => ({ name: name, value: (sharedDataPointsValues[imageId] || [])[index] || '' }));

    for (let i = 0; i < savedDataPoints.length; i++) {
        var pairContainer = document.createElement('div');
        pairContainer.classList.add('data-point-pair');

        var inputName = document.createElement('input');
        inputName.placeholder = "Data Point Name";
        inputName.classList.add('data-point-name');
        inputName.value = savedDataPoints[i].name;
        pairContainer.appendChild(inputName);

        var inputValue = document.createElement('input');
        inputValue.placeholder = "Value";
        inputValue.classList.add('data-point-input');
        inputValue.value = savedDataPoints[i].value;
        pairContainer.appendChild(inputValue);

        var removeButton = document.createElement("button");
        removeButton.innerHTML = "<i class='fa fa-trash'></i>";
        removeButton.classList.add("btn", "btn-danger", "btn-sm", "remove-data-point-button");
        removeButton.onclick = function() {
            pairContainer.remove();
            saveCurrentDataPoints();
        };
        pairContainer.appendChild(removeButton);

        container.appendChild(pairContainer);
    }

    var addButton = document.createElement('button');
    addButton.textContent = 'Add Data Point';
    addButton.id = 'additionalAddDataPointButton';
    addButton.onclick = addDataPointField; // reference function so that it only calls during event
    addButton.classList.add('btn', 'btn-primary', 'mt-2');
    container.appendChild(addButton);
}

function displayFullImage(fileSrc, imageId, fileName) {
    var dataPointPairs = document.querySelectorAll('.data-point-pair');
    // Check if there are any data point pairs (text boxes) present
    if (currentDisplayedImage !== null && dataPointPairs.length > 0) {
        saveCurrentDataPoints(currentDisplayedImage);
    }

    var thumbnail = document.

    currentDisplayedImage = imageId;

    var fullImageDisplay = document.querySelector('.bottom-card');
    fullImageDisplay.style.display = "block";
    fullImageDisplay.scrollIntoView({
        behavior: 'smooth',
        block: 'end'
    });

    var imageName = document.getElementById('imageName');
    imageName.textContent = fileName;

    var imageElement = document.getElementById('imageElement');
    imageElement.src = fileSrc;

    generateDataPointInputs(imageId);
}

function clearFullImageDisplay() {
    var imgDisplay = document.getElementById('fullImageDisplay');
    imgDisplay.style.display = 'none';

    var imageName = document.getElementById('imageName');
    imageName.textContent = '';

    var imageElement = document.getElementById('imageElement');
    imageElement.src = '';

    var container = document.getElementById('dataPointsContainer');
    container.innerHTML = '';

    currentDisplayedImage = null;
}

function dropHandler(ev) {
    ev.preventDefault();
    uploadLoadingWheel  = document.getElementById('upload_loadingWheel');
    uploadLoadingWheel.style.display = "block";
    var dropZone = document.getElementById('thumbnail_container');
    dropZone.classList.remove('dragover');

    var dt = ev.dataTransfer;
    var droppedFiles = dt.files;

    var uploadButton = document.getElementById('uploadButton');
    uploadButton.disabled = droppedFiles.length === 0;

    for (var i = 0; i < droppedFiles.length; i++) {
        if (validateFile(droppedFiles[i])) {
            var imageId = generateUniqueId();
            files.push({ id: imageId, file: droppedFiles[i] });
            displayThumbnail(droppedFiles[i], imageId);
        } else {
            notyf.error(droppedFiles[i].name + " is not a valid image file");
        }
    }
    updateDropZoneMessage();

    uploadLoadingWheel.style.display = "none";
}

function dragOverHandler(ev) {
    ev.preventDefault();
    var dropZone = document.getElementById('thumbnail_container');
    dropZone.classList.add('dragover');
}

function dragLeaveHandler(ev) {
    var dropZone = document.getElementById('thumbnail_container');
    dropZone.classList.remove('dragover');
}

function updateDropZoneMessage() {
    if (files.length == 0) {
        $('#drop_zone_message_icon').css('display', 'block');
        $('#drop_zone_message_text').css('display', 'block');
        
        let dropZoneMsg = document.querySelector('.dropzone-message');
        dropZoneMsg.style.display = 'flex';
        dropZoneMsg.style.gridRow = '2';
        dropZoneMsg.style.gridColumn = '2';
        dropZoneMsg.style.alignItems = 'center';
        dropZoneMsg.style.justifyContent = 'center';
    } else {

        let dropZoneMsg = document.querySelector('.dropzone-message');
        dropZoneMsg.style.gridRow = '';
        dropZoneMsg.style.gridColumn = '';
        dropZoneMsg.style.display = 'none';
    }
}

function generateUniqueId() {
    return 'img-' + Math.random().toString(36).substr(2, 9);
}

function triggerFileInput() {
    document.getElementById('image_files').click();
}

function validateFile(file) {
    const acceptedImageTypes = ['image/jpeg', 'image/png', 'image/bmp', 'image/webp'];
    return acceptedImageTypes.includes(file.type);
}

// function toggleFolder() {
//     createSubDirectory = document.getElementById('toggleDataPoints').checked;
// }

// // function toggleSpreadsheet() {
//     appendToSpreadsheet = document.getElementById('toggleSpreadsheet').checked;
//     var spreadsheetNameInput = document.getElementById('spreadsheetNameInput');
//     if (appendToSpreadsheet) {
//         spreadsheetNameInput.placeholder = "Enter Existing Spreadsheet Name";
//     } else {
//         spreadsheetNameInput.placeholder = "Enter New Spreadsheet Name";
//     }
// }

// OLD ITEM PICKER
// document.addEventListener('DOMContentLoaded', (event) => {
//     let selectedItem = null;
//     let currentTree = [];
//     let selectedFolder = null;
//     let selectedSpreadsheet = null;

//     function fetchItems() {
//         return fetch(loadItemsUrl)
//             .then(response => response.json())
//             .then(data => {
//                 return data.items.map(f => processItem(f));
//             })
//             .catch(error => {
//                 console.error('Error loading items:', error);
//                 return []; // return empty array in case of an error
//             });
//     }

//     function processItem(item) {
//         return {
//             id: item.id,
//             name: item.name,
//             parentId: item.parentId,
//             type: item.type, // type can be 'folder' or 'spreadsheet'
//             contents: item.contents ? item.contents.map(subitem => processItem(subitem)) : []
//         };
//     }

//     function listContentsOf(tree, containerId = 'tree_container') {
//         const ul = $('<ul></ul>');
//         $('#' + containerId).append(ul);
//         for (let i = 0; i < tree.length; i++) {
//             const item = tree[i];
//             const listItem = $('<li></li>').addClass(item.type);
            
//             // Add icon based on item type
//             if (item.type === 'folder') {
//                 listItem.html('<i class="fas fa-folder mr-2"></i>' + item.name);
//             } else if (item.type === 'spreadsheet') {
//                 listItem.html('<i class="fas fa-file-excel mr-2"></i>' + item.name);
//             } else {
//                 listItem.text(item.name);
//             }
            
//             ul.append(listItem);

//             listItem.on('click', function (e) {
//                 e.stopPropagation();
//                 // Remove previous selection
//                 $('#tree_container li').removeClass('selected-item');
//                 // Mark current item as selected
//                 $(this).addClass('selected-item');
//                 // Enable the select button
//                 selectedItem = item;
//                 if (item.type === 'folder') {
//                     selectedFolder = item;
//                     selectedSpreadsheet = null;
//                 } else {
//                     selectedFolder = null;
//                     selectedSpreadsheet = item;
//                 }
//                 $('#selectItemButton').prop('disabled', false);
//                 // Enable the rename button
//                 $('#renameItemButton').prop('disabled', false);
//                 // Enable the delete button
//                 $('#deleteItemButton').prop('disabled', false);
//             });

//             if (item.type === 'folder' && item.contents.length > 0) {
//                 const subContainerId = containerId + '-' + item.id;
//                 const subContainer = $('<div id="' + subContainerId + '"></div>');
//                 ul.append(subContainer);

//                 listItem.on('click', function (e) {
//                     e.stopPropagation();
//                     // Check if the contents are already loaded
//                     if (subContainer.children().length === 0) {
//                         listContentsOf(item.contents, subContainerId);
//                     }
//                     subContainer.toggle();
//                 });
//             }
//         }
//     }

//     function compareTrees(newTree, currentTree) {
//         if (newTree.length !== currentTree.length) return false;

//         for (let i = 0; i < newTree.length; i++) {
//             if (newTree[i].id !== currentTree[i].id || newTree[i].name !== currentTree[i].name) {
//                 return false;
//             }
//             if (!compareTrees(newTree[i].contents, currentTree[i].contents)) {
//                 return false;
//             }
//         }
//         return true;
//     }

//     function updateTree(newTree) {
//         if (!compareTrees(newTree, currentTree)) {
//             $('#tree_container').empty();
//             listContentsOf(newTree);
//             currentTree = newTree;
//         }
//     }

//     window.loadItems = function () {
//         $('#itemPickerLoadingWheel').css('display', 'block');
//         fetchItems().then(newTree => {
//             updateTree(newTree);
//             $('#itemPickerLoadingWheel').css('display', 'none');
//         }).catch(error => {
//             console.error('Error fetching items:', error);
//             $('#itemPickerLoadingWheel').css('display', 'none'); // Ensure loading wheel is hidden on error
//         });
//     };

//     window.selectItem = function () {
//         if (selectedItem) {
//             $('#itemPickerModal').modal('hide');

//             if (selectedItem.type === 'folder') {
//                 document.getElementById('selectedFolder').innerText = 'Selected Folder: ' + selectedItem.name;
//                 selectedFolderId = selectedItem.id;
//             } else {
//                 document.getElementById('selectedSpreadsheet').innerText = 'Selected Spreadsheet: ' + selectedItem.name;
//                 selectedSpreadsheet = selectedItem.name;
//             }
//         }
//     };

//     window.renameItem = async function () {
//         if (selectedItem) {
//             $('#itemPickerLoadingWheel').css('display', 'block');
//             var newItemName = document.getElementById('itemInput').value;
//             try {
//                 const response = await fetch(renameItemUrl, {
//                     method: 'POST',
//                     headers: {
//                         'Content-Type': 'application/json'
//                     },
//                     body: JSON.stringify({
//                         itemId: selectedItem.id,
//                         newName: newItemName
//                     })
//                 });

//                 const data = await response.json();
//                 if (data.status === 'success') {
//                     selectedItem.name = newItemName;
//                     document.getElementById('selectedItem').innerText = newItemName;
//                     loadItems();
//                 } else {
//                     console.error('Error:', data.message);
//                 }

//                 $('#itemPickerLoadingWheel').css('display', 'none');
//             } catch (error) {
//                 $('#itemPickerLoadingWheel').css('display', 'none');
//                 console.error('Error:', error);
//             }
//         }
//     };

//     window.createFolder = async function () {
//         $('#itemPickerLoadingWheel').css('display', 'block');
//         var newItemName = document.getElementById('itemInput').value;
//         if (selectedFolder && newItemName) {
//             try {
//                 const response = await fetch(createFolderUrl, {
//                     method: 'POST',
//                     headers: {
//                         'Content-Type': 'application/json'
//                     },
//                     body: JSON.stringify({
//                         parentId: selectedFolder.id,
//                         folderName: newItemName
//                     })
//                 });

//                 const data = await response.json();
//                 if (data.status === 'success') {
//                     loadItems();
//                 } else {
//                     console.error('Error:', data.message);
//                 }

//                 $('#itemPickerLoadingWheel').css('display', 'none');
//             } catch (error) {
//                 $('#itemPickerLoadingWheel').css('display', 'none');
//                 console.error('Error:', error);
//             }
//         } else if (newItemName) {
//             try {
//                 const response = await fetch(createFolderUrl, {
//                     method: 'POST',
//                     headers: {
//                         'Content-Type': 'application/json'
//                     },
//                     body: JSON.stringify({
//                         parentId: null,
//                         folderName: newItemName
//                     })
//                 });

//                 const data = await response.json();
//                 if (data.status === 'success') {
//                     loadItems();
//                 } else {
//                     console.error('Error:', data.message);
//                 }

//                 $('#itemPickerLoadingWheel').css('display', 'none');
//             } catch (error) {
//                 $('#itemPickerLoadingWheel').css('display', 'none');
//                 console.error('Error:', error);
//             }
//         } else {
//             try {
//                 const response = await fetch(createFolderUrl, {
//                     method: 'POST',
//                     headers: {
//                         'Content-Type': 'application/json'
//                     },
//                     body: JSON.stringify({
//                         parentId: null,
//                         folderName: null
//                     })
//                 });

//                 const data = await response.json();
//                 if (data.status === 'success') {
//                     loadItems();
//                 } else {
//                     console.error('Error:', data.message);
//                 }

//                 $('#itemPickerLoadingWheel').css('display', 'none');
//             } catch (error) {
//                 $('#itemPickerLoadingWheel').css('display', 'none');
//                 console.error('Error:', error);
//             }
//         }
//     };

//     window.createSpreadsheet = async function () {
//         $('#itemPickerLoadingWheel').css('display', 'block');
//         var newItemName = document.getElementById('itemInput').value;
//         if (selectedFolder && newItemName) {
//             try {
//                 const response = await fetch(createSpreadsheetUrl, {
//                     method: 'POST',
//                     headers: {
//                         'Content-Type': 'application/json'
//                     },
//                     body: JSON.stringify({
//                         parentId: selectedFolder.id,
//                         spreadsheetName: newItemName
//                     })
//                 });

//                 const data = await response.json();
//                 if (data.status === 'success') {
//                     loadItems();
//                 } else {
//                     console.error('Error:', data.message);
//                 }

//                 $('#itemPickerLoadingWheel').css('display', 'none');
//             } catch (error) {
//                 $('#itemPickerLoadingWheel').css('display', 'none');
//                 console.error('Error:', error);
//             }
//         } else if (newItemName) {
//             try {
//                 const response = await fetch(createSpreadsheetUrl, {
//                     method: 'POST',
//                     headers: {
//                         'Content-Type': 'application/json'
//                     },
//                     body: JSON.stringify({
//                         parentId: null,
//                         folderName: newItemName
//                     })
//                 });

//                 const data = await response.json();
//                 if (data.status === 'success') {
//                     loadItems();
//                 } else {
//                     console.error('Error:', data.message);
//                 }

//                 $('#itemPickerLoadingWheel').css('display', 'none');
//             } catch (error) {
//                 $('#itemPickerLoadingWheel').css('display', 'none');
//                 console.error('Error:', error);
//             }
//         } else {
//             try {
//                 const response = await fetch(createSpreadsheetUrl, {
//                     method: 'POST',
//                     headers: {
//                         'Content-Type': 'application/json'
//                     },
//                     body: JSON.stringify({
//                         parentId: null,
//                         folderName: null
//                     })
//                 });

//                 const data = await response.json();
//                 if (data.status === 'success') {
//                     loadItems();
//                 } else {
//                     console.error('Error:', data.message);
//                 }

//                 $('#itemPickerLoadingWheel').css('display', 'none');
//             } catch (error) {
//                 $('#itemPickerLoadingWheel').css('display', 'none');
//                 console.error('Error:', error);
//             }
//         }
//     };

//     window.deleteItem = async function () {
//         if (selectedItem) {
//             $('#itemPickerLoadingWheel').css('display', 'block');
//             try {
//                 const response = await fetch(deleteItemUrl, {
//                     method: 'POST',
//                     headers: {
//                         'Content-Type': 'application/json'
//                     },
//                     body: JSON.stringify({ itemId: selectedItem.id })
//                 });

//                 const data = await response.json();
//                 if (data.status === 'success') {
//                     loadItems();
//                 } else {
//                     console.error('Error:', data.message);
//                 }

//                 $('#itemPickerLoadingWheel').css('display', 'none');
//             } catch (error) {
//                 $('#itemPickerLoadingWheel').css('display', 'none');
//                 console.error('Error:', error);
//             }
//         }
//     };

//     // Deselect the item when clicking outside of the item, button, or text box
//     $('#itemPickerModal').on('click', function(e) {
//         if (!$(e.target).closest('.item, button, input[type="text"]').length) {
//             // Remove previous selection
//             $('#tree_container li').removeClass('selected-item');
//             // Disable the select button
//             selectedItem = null;
//             selectedFolder = null;
//             selectedSpreadsheet = null;
//             $('#selectItemButton').prop('disabled', true);
//             // Disable the rename button
//             $('#renameItemButton').prop('disabled', true);
//             // Disable the delete button
//             $('#deleteItemButton').prop('disabled', true);
//         }
//     });
// });


document.addEventListener('DOMContentLoaded', (event) => {
    let currentTree = [];
    let selectedFolder = null;

    function checkEnableRenameButton() {
        var textInput = document.getElementById('itemInput').value;
        if (selectedFolder && textInput == '') {
            $('#renameItemButton').prop('disabled', true);
        }
        if (selectedFolder && !textInput == '') {
            $('#renameItemButton').prop('disabled', false);
        }
        // need two separate if statements for both to work. whatever code is in the else will not execute
    }

    document.getElementById('itemInput').addEventListener('input', checkEnableRenameButton);
    document.getElementById('itemInput').addEventListener('change', checkEnableRenameButton);

    function fetchItems() {
        return fetch(loadItemsUrl)
            .then(response => response.json())
            .then(data => {
                console.log("Data items: " + data.items);
                return data.items.map(f => processItem(f));
            })
            .catch(error => {
                console.error('Error loading items:', error);
                return []; // return empty array in case of an error
            });
    }

    function processItem(item) {
        return {
            id: item.id,
            name: item.name,
            parentId: item.parent,
            contents: item.contents ? item.contents.map(subitem => processItem(subitem)) : []
        };
    }

    function listContentsOf(tree, containerId = 'tree_container') {
        const ul = $('<ul></ul>');
        $('#' + containerId).append(ul);
        for (let i = 0; i < tree.length; i++) {
            const item = tree[i];
            const listItem = $('<li></li>');
            listItem.html('<i class="fas fa-folder mr-2"></i>' + item.name);

            ul.append(listItem);

            listItem.on('click', function (e) {
                e.stopPropagation();
                // Remove previous selection
                $('#tree_container li').removeClass('selected-item');
                // Mark current item as selected
                $(this).addClass('selected-item');
                // Enable the select button
                selectedFolder = item;
                $('#selectItemButton').prop('disabled', false);
                // Enable the delete button
                $('#deleteItemButton').prop('disabled', false);
                // Enable the rename button if theres already text in text box
                if (!document.getElementById('itemInput').value == '') {
                    $('#renameItemButton').prop('disabled', false);
                }
            });

            if (item.contents.length > 0) {
                const subContainerId = containerId + '-' + item.id;
                const subContainer = $('<div id="' + subContainerId + '"></div>');
                ul.append(subContainer);

                listItem.on('click', function (e) {
                    e.stopPropagation();
                    // Check if the contents are already loaded
                    if (subContainer.children().length === 0) {
                        listContentsOf(item.contents, subContainerId);
                    }
                    subContainer.toggle();
                });
            }
        }
    }

    function compareTrees(newTree, currentTree) {
        if (newTree.length !== currentTree.length) return false;

        for (let i = 0; i < newTree.length; i++) {
            if (newTree[i].id !== currentTree[i].id || newTree[i].name !== currentTree[i].name) {
                return false;
            }
            if (!compareTrees(newTree[i].contents, currentTree[i].contents)) {
                return false;
            }
        }
        return true;
    }

    function updateTree(newTree) {
        if (!compareTrees(newTree, currentTree)) {
            $('#tree_container').empty();
            listContentsOf(newTree);
            currentTree = newTree;
        }
    }

    window.loadItems = function () {
        $('#itemPickerLoadingWheel').css('display', 'block');
        fetchItems().then(newTree => {
            updateTree(newTree);
            $('#itemPickerLoadingWheel').css('display', 'none');
            document.getElementById('itemInput').value = ''; // reset text box
        }).catch(error => {
            console.error('Error fetching items:', error);
            $('#itemPickerLoadingWheel').css('display', 'none'); // Ensure loading wheel is hidden on error
        });
    };

    window.selectItem = function () {
        if (selectedFolder) {
            $('#itemPickerModal').modal('hide');
            sessionStorage.setItem('selectedFolderId', selectedFolder.id);
            sessionStorage.setItem('selectedFolderName', selectedFolder.name);
            selectedFolderId = selectedFolder.id;
            selectedFolderName = selectedFolder.name;

            // show new folder name
            document.getElementById('selectedFolder').innerText = selectedFolder.name;
        }
    };

    window.renameItem = async function () {
        var newItemName = document.getElementById('itemInput').value;
        if (selectedFolder && newItemName != '') {
            $('#itemPickerLoadingWheel').css('display', 'block');
            try {
                const response = await fetch(renameItemUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        itemId: selectedFolder.id,
                        newName: newItemName
                    })
                });

                const data = await response.json();
                if (data.status === 'success') {
                    loadItems();
                } else {
                    console.error('Error:', data.message);
                }

                $('#itemPickerLoadingWheel').css('display', 'none');
            } catch (error) {
                $('#itemPickerLoadingWheel').css('display', 'none');
                console.error('Error:', error);
            }
        }
    };

    window.createFolder = async function () {
        var newItemName = document.getElementById('itemInput').value;
        if (selectedFolder && newItemName) {
            try {
                const response = await fetch(createFolderUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        parentId: selectedFolder.id,
                        folderName: newItemName
                    })
                });

                const data = await response.json();
                if (data.status === 'success') {
                    loadItems();
                } else {
                    console.error('Error:', data.message);
                }
            } catch (error) {
                console.error('Error:', error);
            }
        } else if (selectedFolder) {
            try {
                const response = await fetch(createFolderUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        parentId: selectedFolder.id,
                        folderName: ''
                    })
                });

                const data = await response.json();
                if (data.status === 'success') {
                    loadItems();
                } else {
                    console.error('Error:', data.message);
                }
            } catch (error) {
                console.error('Error:', error);
            }
        } else if (newItemName) {
            try {
                const response = await fetch(createFolderUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        parentId: masterFolderId,
                        folderName: newItemName
                    })
                });

                const data = await response.json();
                if (data.status === 'success') {
                    loadItems();
                } else {
                    console.error('Error:', data.message);
                }
            } catch (error) {
                console.error('Error:', error);
            }
        } else {
            try {
                const response = await fetch(createFolderUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        parentId: masterFolderId,
                        folderName: ''
                    })
                });

                const data = await response.json();
                if (data.status === 'success') {
                    loadItems();
                } else {
                    console.error('Error:', data.message);
                }
            } catch (error) {
                console.error('Error:', error);
            }
        }
    };

    window.deleteItem = async function () {
        if (selectedFolder) {
            try {
                const response = await fetch(deleteItemUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ itemId: selectedFolder.id })
                });

                const data = await response.json();
                if (data.status === 'success') {
                    loadItems();
                } else {
                    console.error('Error:', data.message);
                }
            } catch (error) {
                console.error('Error:', error);
            }
        }
    };

    // Deselect the item when clicking outside of the item, button, or text box
    $('#itemPickerModal').on('click', function(e) {
        if (!$(e.target).closest('.item, button, input[type="text"]').length) {
            // Remove previous selection
            $('#tree_container li').removeClass('selected-item');
            // Disable the select button
            selectedFolder = null;
            $('#selectItemButton').prop('disabled', true);
            // Disable the rename button
            $('#renameItemButton').prop('disabled', true);
            // Disable the delete button
            $('#deleteItemButton').prop('disabled', true);
        }
    });
});