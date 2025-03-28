var selectedImages = [];
var selectedFolderId = null;
var selectedFolderName = null;
var masterFolderId = null;
var masterFolderName = null;
var imageData = {};

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
        document.getElementById('selectedFolder').innerText = 'Selected Folder: ' + savedFolderName;
        $('#loadImagesButton').css('display', 'block');
    } else { // if no saved folder in session, set it to the master server
        console.log("No folder in session, setting master to selected folder...");
        selectedFolderId = masterFolderId;
        selectedFolderName = masterFolderName;
        document.getElementById('selectedFolder').innerText = 'Selected Folder: ' + selectedFolderName;
        console.log("Selected Folder ID: " + selectedFolderId + ", Selected Folder Name: " + selectedFolderName);
    }
}

// Call the function to fetch and log data
getMasterFolderData().then(data => {
    // Load master folder data
    masterFolderId = data.masterFolderId;
    masterFolderName = data.masterFolderName;

    // Load session data
    loadFromSession();
});

document.addEventListener('DOMContentLoaded', (event) => {
    let currentTree = [];
    let selectedFolder = null;

    function fetchItems() {
        return fetch(loadItemsUrl)
            .then(response => response.json())
            .then(data => {
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
        }).catch(error => {
            console.error('Error fetching items:', error);
            $('#itemPickerLoadingWheel').css('display', 'none'); // Ensure loading wheel is hidden on error
        });
    };

    window.selectItem = function () {
        if (selectedFolder) {
            $('#itemPickerModal').modal('hide');
            $('#selectedFolderIcon').css('display', 'block');
            document.getElementById('selectedFolder').innerText = 'Selected Folder: ' + selectedFolder.name;
            sessionStorage.setItem('selectedFolderId', selectedFolder.id);
            sessionStorage.setItem('selectedFolderName', selectedFolder.name);
            $('#loadImagesButton').css('display', 'block');
            selectedFolderId = selectedFolder.id;
        }
    };

    // Deselect the item when clicking outside of the item, or button
    $('#itemPickerModal').on('click', function(e) {
        if (!$(e.target).closest('.item, button').length) {
            // Remove previous selection
            $('#tree_container li').removeClass('selected-item');
            // Disable the select button
            selectedFolder = null;
            $('#selectItemButton').prop('disabled', true);
        }
    });
});

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

function loadImages() {
    var openBoxIcon = document.getElementById("openBoxIcon");
    openBoxIcon.style.display = "none";

    var loadingWheel = document.getElementById("createLoadingWheel");
    loadingWheel.style.display = "block";

    var loadImagesBtn = document.getElementById('loadImagesButton');
    loadImagesBtn.disabled = true; // makes it so the user cannot repeatedly load the same images over and over

    var url = `${loadImagesFromDriveUrl}?folderId=${selectedFolderId}&folderName=${encodeURIComponent(selectedFolderName)}`;

    fetch(url)
        .then(response => response.json())
        .then(data => {
            loadingWheel.style.display = "none";
            var imageGallery = document.getElementById('image-gallery');
            imageGallery.innerHTML = '';
            imageData = data.images;
            data.images.forEach(image => {
                createGalleryThumbnail(image);
            });

            if (Object.keys(imageData).length === 0) {
                notyf.open({
                    type: 'warning',
                    message: 'This folder has no images to load'
                });
                loadImagesBtn.disabled = false;
            }
        })
        .catch(error => {
            console.error('Error loading images:', error);
            loadImagesBtn.disabled = false;  // re-enable the button if an error occurs
        });
}

function createGalleryThumbnail(image) {
    console.log(image);

    var div = document.createElement('div');
    div.classList.add('thumbnail-container');
    
    var img = document.createElement('img');
    img.src = image.thumbnailLink;
    img.classList.add('thumbnail');
    
    // Initialize the title string
    var titleText = '';
    titleText += `Image: ${image.name}\n`;
    // Ensure entryData is part of the image object
    if (image.entryData) {
        // Loop through the entryData part of the image object
        for (const [key, value] of Object.entries(image.entryData)) {
            titleText += `${key}: ${value}\n`;
        }
    }
    // Set the title text to the image element
    img.title = titleText.trim();

    img.onclick = () => selectImage(image, img);

    div.appendChild(img);
    document.getElementById('image-gallery').appendChild(div);
}

function selectImage(image, imgElement) {
    if (!selectedImages.some(img => img.id === image.id)) {
        selectedImages.push(image);
        updateSelectedImages(image);
        imgElement.parentElement.remove();  // remove the image from the gallery
    }
}

function selectAll() {
    const thumbnails = document.querySelectorAll('#image-gallery .thumbnail-container img');
    const images = Array.from(imageData);
    if (thumbnails.length == 0) {
        notyf.open({
            type: 'warning',
            message: 'No images to select'
        });
    } else {
        thumbnails.forEach((img, index) => {
            const image = images[index];
            selectImage(image, img);
        });
        notyf.success("Selected all images")
    }
}

function updateSelectedImages(image) {
    $('#selected-images').css('display', 'block');
    var selectedImageList = document.getElementById('selected-image-list');
    selectedImageList.innerHTML = '';
    selectedImages.forEach(image => {
        var div = document.createElement('div');
        div.classList.add('selected-thumbnail-container');

        var img = document.createElement('img');
        img.src = image.thumbnailLink;
        img.classList.add('thumbnail', 'removable-thumbnail');

        // Initialize the title string
        var titleText = '';
        titleText += `Image: ${image.name}\n`;
        // Ensure entryData is part of the image object
        if (image.entryData) {
            // Loop through the entryData part of the image object
            for (const [key, value] of Object.entries(image.entryData)) {
                titleText += `${key}: ${value}\n`;
            }
        }
        // Set the title text to the image element
        img.title = titleText.trim();

        img.onclick = () => removeImage(image, div);

        div.appendChild(img);
        selectedImageList.appendChild(div);
    });
}

function removeImage(image, divElement) {
    selectedImages = selectedImages.filter(img => img.id !== image.id);
    if (selectedImages.length == 0) {
        $('#selected-images').css('display', 'none');
    }
    createGalleryThumbnail(image); // add the image back to the gallery
    divElement.remove();  // remove the image from the selected list
}

function scrollToBottom() {
    var container = document.getElementById('survey-question');
    container.scrollTop = container.scrollHeight;
}

function addOption() {
    var optionsContainer = document.querySelector('.options-container');
    var optionDiv = document.createElement('div');
    optionDiv.classList.add('option-input-container');
    optionDiv.innerHTML = `
            <input type="text" placeholder="Option" class="form-control mb-1">
            <button type="button" class="btn btn-danger btn-sm" onclick="removeOption(this)">Remove</button>
        `;
    optionsContainer.appendChild(optionDiv);

    scrollToBottom();
}

function removeOption(button) {
    button.parentElement.remove();
}

function validateForm() {
    var surveyTitle = document.getElementById('survey-title').value.trim();
    var questionText = document.getElementById('question-text').value.trim();
    var options = Array.from(document.querySelectorAll('.option-input-container input')).map(input => input.value.trim());
    if (surveyTitle === '') {
        notyf.open({
            type: 'warning',
            message: 'Please enter a survey title'
        });
        return false;
    }
    if (!selectedFolder) {
        notyf.open({
            type: 'warning',
            message: 'Please select a folder'
        });
    }
    if (selectedImages.length === 0) {
        notyf.open({
            type: 'warning',
            message: 'Please select at least one image'
        });
        return false;
    }
    if (questionText === '') {
        notyf.open({
            type: 'warning',
            message: 'Please enter a question'
        });
        return false;
    }
    if (options.length === 0 || options.some(option => option === '')) {
        notyf.open({
            type: 'warning',
            message: 'Please enter at least one question option'
        });
        return false;
    }
    return true;
}

function setLoadingForm(isLoading) {
    const createFormButton = document.getElementById('createFormButton');
    if (isLoading) {
        createFormButton.innerHTML = 'Loading';
    } else {
        createFormButton.innerHTML = '<i class="fa fa-plus"></i> Create';
    }
}

function submitSurveyForm() {
    if (!validateForm()) {
        return;
    }

    var submitSurveyBtn = document.getElementById('createFormButton');
    var loadingWheel = document.getElementById('createLoadingWheel');
    submitSurveyBtn.disabled = true;
    loadingWheel.style.display = 'block';

    setLoadingForm(true);

    var surveyTitle = document.getElementById('survey-title').value;
    var surveyDescription = document.getElementById('survey-description').value;
    var randomizeQuestions = document.getElementById('randomize-questions').checked;
    var questionText = document.getElementById('question-text').value;
    var options = Array.from(document.querySelectorAll('.option-input-container input')).map(input => input.value);

    var surveyData = {
        title: surveyTitle,
        description: surveyDescription,
        randomizeQuestions: randomizeQuestions,
        images: selectedImages,
        question: {
            question: questionText,
            options: options
        }
    };

    var formData = new FormData();
    formData.append('surveyData', JSON.stringify(surveyData));
    formData.append('imageData', JSON.stringify(imageData));

    formData.append('selectedImages', JSON.stringify(selectedImages));

    console.log("form data: " + formData)

    fetch(createSurveyUrl, {
        method: 'POST',
        body: formData
    }).then(response => response.json())
    .then(() => {
        loadingWheel.style.display = 'none';
        setLoadingForm(false);
        submitSurveyBtn.disabled = false;

        // Set a flag in localStorage
        localStorage.setItem('formCreated', 'true');
        // Reload the page
        location.reload();
    })
    .then(data => {
        console.log('Google Form created:', data);
    })
    .catch(error => {
        console.error('Error creating Google Form:', error);
        notyf.error('Error creating Google Form:', error);
        submitSurveyBtn.disabled = false;
        loadingWheel.style.display = 'none';
        return;
    });
}

// Check the flag on page load and show the notification if needed
window.addEventListener('load', function () {
    if (localStorage.getItem('formCreated') === 'true') {
        // Show the success notification
        notyf.success('Google Form created successfully');

        // Clear the flag
        localStorage.removeItem('formCreated');
    }
});