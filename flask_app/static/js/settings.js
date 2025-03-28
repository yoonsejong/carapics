var selectedFolder = null;

document.addEventListener('DOMContentLoaded', (event) => {
    // Define a function to fetch the JSON file and return its contents as a dictionary
    async function fetchMasterFolderData() {
        const response = await fetch(getMasterFolderJsonUrl);

        console.log(response);
        
        if (!response.ok) {
            let masterFolderContainer = document.querySelector('.selected-folder-container');
            let backgroundDiv = document.querySelector('.background-div');

            // Hide master folder display
            masterFolderContainer.style.opacity = 0;

            // let background div be visible
            backgroundDiv.style.opacity = 1;

            selectedFolder = null;

            throw new Error(response.statusText);
        }
        
        const data = await response.json();
        return data;
    }
    
    // Call the function to fetch and log the data
    fetchMasterFolderData().then(data => {
        let masterFolderContainer = document.querySelector('.selected-folder-container');
        let backgroundDiv = document.querySelector('.background-div');
        
        if (data) {
            console.log('Fetched master folder data.');

            // Set selectedFolder to master folder data
            selectedFolder = {
                id: data.masterFolderId,
                name: data.masterFolderName
            };

            console.log("Master folder name: ", selectedFolder.id);
            console.log("Master folder id: ", selectedFolder.name)

            // Display master folder parent container
            masterFolderContainer.style.opacity = 1;

            // Display master folder name
            $('#selectedFolder').text(selectedFolder.name);

            // let background div be visible
            backgroundDiv.style.opacity = 1;

        } else {
            // Hide master folder display
            masterFolderContainer.style.opacity = 0;

            // let background div be visible
            backgroundDiv.style.opacity = 1;

            selectedFolder = null;
        }
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
        event.stopPropagation(); // Prevent the click event from bubbling up
    
        $('#optionsPopup').css('display', 'none');

        var folder_link = "https://docs.google.com/drive/folders/" + selectedFolder.id;
        window.open(folder_link, '_blank');
    });

    // Remove folder
    document.getElementById('removeFolder').addEventListener('click', function() {
        event.stopPropagation(); // Prevent the click event from bubbling up

        $('#optionsPopup').css('display', 'none');

        selectedFolder.id = "deleted";
        
        let selectedMasterFolder = document.querySelector('.selected-folder-container');
        let missingFolderMsg = document.getElementById('missing_master_folder_msg');

        // hide form container
        selectedMasterFolder.style.opacity = 0;

        if (missingFolderMsg) {
            missingFolderMsg.classList.add('tiny-grow');

            // Add the event listener
            missingFolderMsg.addEventListener('animationend', function () {
                // Show message
                missingFolderMsg.style.opacity = 1;

                // Remove animation classes
                missingFolderMsg.classList.remove('tiny-grow');
            });
        }
    });

    // Hide the popup when clicking outside
    document.addEventListener('click', function(event) {
        var popup = document.getElementById('optionsPopup');
        var burger = document.querySelector('.burger');
        if (!popup.contains(event.target) && !burger.contains(event.target)) {
            popup.style.display = 'none';
        }
    });

    function fetchItems() {
        return fetch(findRootFoldersUrl)
            .then(response => response.json())
            .then(data => data.root_folders)
            .catch(error => {
                console.error('Error loading items:', error);
                return []; // return empty array in case of an error
            });
    }

    function listItems(items, containerId = 'item_container') {
        const ul = $('<ul></ul>');
        $('#' + containerId).empty().append(ul);
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const listItem = $('<li></li>').text(item.name).addClass('item');
            ul.append(listItem);

            listItem.on('click', function (e) {
                e.stopPropagation();
                // Remove previous selection
                $('#' + containerId + ' li').removeClass('selected-item');
                // Mark current item as selected
                $(this).addClass('selected-item');
                // Enable the select button
                selectedFolder = item;
                $('#selectItemButton').prop('disabled', false);
            });
        }
    }

    window.loadItems = function () {
        $('#itemPickerLoadingWheel').css('display', 'block');
        fetchItems().then(items => {
            listItems(items);
            $('#itemPickerLoadingWheel').css('display', 'none');
        }).catch(error => {
            console.error('Error fetching items:', error);
            $('#itemPickerLoadingWheel').css('display', 'none'); // Ensure loading wheel is hidden on error
        });
    }

    window.selectItem = function () {
        if (selectedFolder) {
            $('#itemPickerModal').modal('hide');

            let masterFolderContainer = document.querySelector('.selected-folder-container');
            masterFolderContainer.style.opacity = 1;
            $('#selectedFolder').text(selectedFolder.name);
        }
    };

    window.saveSettings = function () {
        if (selectedFolder) {
            console.log("Selected folder ID: ", selectedFolder.id);
            sessionStorage.clear();
            // Send selected master folder back to python
            fetch('/save_master_folder', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ masterFolderId: selectedFolder.id, masterFolderName: selectedFolder.name })
            }).then(response => {
                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }
                return response.json();
            }).then(data => {
                console.log('Status:', data.status);
                console.log('Message:', data.message);
                notyf.success('Changes successfuly saved');
            })
            .catch(error => {
                notyf.error('Save failed.');
                console.error('Error saving master folder ID:', error);
            });
        } else {
            notyf.info('Nothing to save...');
        }
    };

    // Modal element
    const modal = document.getElementById('itemPickerModal');
    const closeModalButton = document.getElementsByClassName('close')[0];

    // Close the modal when the close button is clicked
    closeModalButton.addEventListener('click', function() {
        modal.style.display = 'none';
    });

    // Close the modal when clicking outside of the modal content
    window.addEventListener('click', function(event) {
        if (event.target == modal) {
            modal.style.display = 'none';
        }
    });

    // Deselect the item when clicking outside of the item, button, or text box
    $('#itemPickerModal').on('click', function(e) {
        if (!$(e.target).closest('li, button, input[type="text"]').length) {
            // Remove previous selection
            $('#item_container li').removeClass('selected-item');
            // Disable the select button
            selectedFolder = null;
            $('#selectItemButton').prop('disabled', true);
        }
    });

    // Event listener for selecting an item
    document.getElementById('selectItemButton').addEventListener('click', selectItem);
});