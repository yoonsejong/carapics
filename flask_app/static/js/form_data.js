var masterFolderId = null;
var masterFolderName = null;
var selectedFormId = null;
var selectedFormParentId = null;
var selectedFormName = null;
var abortController = new AbortController();
var table;

// Define pastel colors
const pastelColors = [
    '#FFB3BA', '#FFDFBA', '#FFFFBA', '#BAFFC9', '#BAE1FF', '#D1C4E9',
    '#F8BBD0', '#C5CAE9', '#BBDEFB', '#B3E5FC', '#B2EBF2', '#B2DFDB',
    '#C8E6C9', '#DCEDC8', '#F0F4C3', '#FFECB3', '#FFE0B2', '#FFCCBC'
];

// Define a function to fetch the JSON file and return its contents as a dictionary
async function fetchMasterFolderData() {
    const response = await fetch(getMasterFolderJsonUrl);
    
    if (!response.ok) {
        throw new Error(response.statusText);
    }
    
    const data = await response.json();
    return data;
}

async function loadFromSession() {
    const savedFormId = sessionStorage.getItem('selectedFormId');
    const savedFormParentId = sessionStorage.getItem('selectedFormParentId');
    const savedFormName = sessionStorage.getItem('selectedFormName');

    let selectedFormParent = document.querySelector('.selected-form-container');
    let backgroundDiv = document.querySelector('.background-div');
    let responseCounter = document.querySelector('.response-counter');

    if (savedFormId && savedFormParentId && savedFormName) {
        // assign form data
        selectedFormId = savedFormId;
        selectedFormParentId = savedFormParentId;
        selectedFormName = savedFormName;

        try {
            var data = await processSpreadsheetData("fetch");
            console.log("data recieved @ window.selectItem: ", data);
        } catch (error) {
            console.error('Error:', error);
            notyf.error("Unable to fetch form data! Refresh the page and try again in a few moments...");
        }
        
        // show form container and form name
        selectedFormParent.style.opacity = 1;
        document.getElementById('selectedForm').innerText = selectedFormName;
        
        // show response counter
        displayResponseCounterMessage(1, data);
        responseCounter.style.opacity = 1;

        // make background div visible
        backgroundDiv.style.opacity = 1;

        // process data and build table
        processSpreadsheetData(data);
    } else {
        // hide form container
        selectedFormParent.style.opacity = 0;

        // hide response container
        responseCounter.style.opacity = 0;

        // make background div visible
        backgroundDiv.style.opacity = 1;

        $('#loadingWheel').css('display', 'none');

        // show no table
        buildTable(0);
    }
}

// Call the function to fetch and log data
fetchMasterFolderData().then(data => {
    // Load master folder data
    masterFolderId = data.masterFolderId;
    masterFolderName = data.masterFolderName;

    // Load session data
    $('#loadingWheel').css('display', 'block');
    loadFromSession();
});

async function fetchSpreadsheetData(signal) {
    var url = `${fetchFormData}?formId=${selectedFormId}&formParentId=${selectedFormParentId}&formName=${encodeURIComponent(selectedFormName)}`;

    try {
        const response = await fetch(url, { signal });
        if (!response.ok) {
            throw new Error(`HTTP error! error: ${response.error}, status: ${response.status}`);
        }

        const data = await response.json();

        console.log("Spreadsheet data received:", data);
        
        return data.data; // Return the data for further processing
    } catch (error) {
        if (error.name === 'AbortError') {
            console.log("Fetch aborted");
        } else {
            console.error("Error in fetchSpreadsheetData:", error.message);
        }
        throw error; // Re-throw to let the caller handle it if needed
    }
}

async function processSpreadsheetData(data) {
    if (data) {
        if (data == "fetch") {
            const spreadsheetData = await fetchSpreadsheetData(abortController.signal);
            console.log("Data ready for window.selectItem:", spreadsheetData);
            return spreadsheetData;
        } else {
            buildTable(data);
        }
    } else {
        try {
            const spreadsheetData = await fetchSpreadsheetData(abortController.signal);
            console.log("Data ready for table:", spreadsheetData);
            buildTable(spreadsheetData);
            $('#loadingWheel').css('display', 'none');
        } catch (error) {
            if (error.name === 'AbortError') {
                $('#loadingWheel').css('display', 'none');
                notyf.open({
                    type: 'warning',
                    message: 'Spreadsheet fetch aborted'
                });
                buildTable(0);
            } else {
                $('#loadingWheel').css('display', 'none');
                notyf.error("Error fetching spreadsheet")
                buildTable(-1);
            }
        }
    }
}

function reorderResponses(questionIds, responses) {
    // Deep copy the responses array
    const savedResponses = JSON.parse(JSON.stringify(responses));

    for (var i = 0; i < savedResponses.length; i++) {
        const responseAnswers = savedResponses[i];
        const orderedAnswers = {};

        for (var j = 0; j < questionIds.length; j++) {
            if (Object.keys(responseAnswers).includes(questionIds[j])) {
                orderedAnswers[questionIds[j]] = savedResponses[i][questionIds[j]];
            }
        }

        responses[i] = orderedAnswers;
    }
  
    return responses;
}

function gatherOptionCounts(questionIds, responses, options) {
    const counts = {};

    // Initialize counts structure based on extracted question IDs
    questionIds.forEach(questionId => {
        counts[questionId] = {};
        options.forEach(option => {
            counts[questionId][option] = 0;
        });
    });

    console.log(counts);

    // Reorder responses based on masterData question IDs
    console.log('original responses:', responses);
    const reorderedResponses = reorderResponses(questionIds, responses);
    console.log('reordered responses:', reorderedResponses);

    // Process reordered responses and count occurrences
    reorderedResponses.forEach(response => {
        Object.keys(response).forEach(questionId => {
            if (counts[questionId]) {
                const answerValue = response[questionId];
                if (counts[questionId][answerValue] !== undefined) {
                    counts[questionId][answerValue]++;
                }
            }
        });
    });

    console.log("Counts:", counts);

    return counts;
}

function displayResponseCounterMessage(responseId, spreadsheetData) {
    const responseTitle = document.getElementById('response-title');
    const responseCount = document.getElementById('response-count');

    if (responseId == -1) {
        responseTitle.textContent = "Form does not exist!";
        console.log("Form does not exist.");
    } else if (responseId == -2) {
        responseTitle.textContent = "No form responses available!";
        console.log("No form responses available.");
    } else if (responseId == -3) {
        responseTitle.textContent = "No form sheet detected!";
        console.log("Form sheet does not exist.");
    } else if (responseId == 0) {
        console.log("No form selected.");
    } else if (responseId == 1) {
        responseTitle.textContent = "Responses";
        if (spreadsheetData) {
            responseCount.textContent = spreadsheetData.responses.length;
            console.log("Response length: ", spreadsheetData.responses.length);
        }
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

// View form
document.getElementById('seeForm').addEventListener('click', function() {
    event.stopPropagation(); // Prevent the click event from bubbling up

    $('#optionsPopup').css('display', 'none');

    var form_link = "https://docs.google.com/forms/d/" + selectedFormId + "/edit";
    window.open(form_link, '_blank');
});

document.getElementById('removeForm').addEventListener('click', function() {
    // Hide popup
    $('#optionsPopup').css('display', 'none');
    
    // Abort the ongoing fetch operation
    abortController.abort();
    abortController = new AbortController(); // Reinitialize AbortController for future use

    selectedFormId = null;
    selectedFormParentId = null;
    selectedFormName = null;
    sessionStorage.removeItem('selectedFormId');
    sessionStorage.removeItem('selectedFormParentId');
    sessionStorage.removeItem('selectedFormName');

    let selectedFormParent = document.querySelector('.selected-form-container');
    let responseCounter = document.querySelector('.response-counter');
    let missingFormMsg = document.getElementById('missing_form_msg');

    // hide form container
    selectedFormParent.style.opacity = 0;

    // hide response container
    responseCounter.style.opacity = 0;

    // show no table
    buildTable(0);

    // hide loading wheel
    $('#loadingWheel').css('display', 'none');

    if (missingFormMsg) {
        missingFormMsg.classList.add('tiny-grow');

        // Add the event listener
        missingFormMsg.addEventListener('animationend', function () {
            // Show message
            missingFormMsg.style.opacity = 1;

            // Remove animation classes
            missingFormMsg.classList.remove('tiny-grow');
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

function saveColumnsToSession(columns) {
    const simpleColumns = columns.map(column => {
        return {
            title: column.title,
            field: column.field,
            sorter: column.sorter,
            cssClass: column.cssClass,
            widthGrow: column.widthGrow
        };
    });

    sessionStorage.setItem('tableColumns', JSON.stringify(simpleColumns));
}

function clearFormData() {
    const responseTitle = document.getElementById('response-title');
    const responseCount = document.getElementById('response-count');

    // clear response counter
    responseTitle.textContent = '';
    responseCount.textContent = '';
    
    // clear table data
    if (table) {
        table.clearData();
    }

    var tableContainer = document.getElementById('data-table');
    if (tableContainer) {
        tableContainer.style.display = 'none';
    }

    // hide table options
    var tableOptions = document.getElementById('tableOptions');
    if (tableOptions) {
        tableOptions.style.display = 'none';
    }
}

function buildTable(spreadsheetData) {

    // Clear table data
    clearFormData();

    // Check for necessary data
    if (spreadsheetData == 0) {
        displayResponseCounterMessage(0);
        return;
    } else if (!spreadsheetData.metadata) {
        displayResponseCounterMessage(-1);
        return;
    } else if (!spreadsheetData.responses) {
        displayResponseCounterMessage(-2);
        return;
    } else if (!spreadsheetData.masterData) {
        displayResponseCounterMessage(-3);
        return;
    } else {
        displayResponseCounterMessage(1, spreadsheetData);
    }

    // show table options
    var tableContainer = document.getElementById('data-table');
    tableContainer.style.display = 'block';

    // show table options
    var tableOptions = document.getElementById('tableOptions');
    tableOptions.style.display = 'block';

    // Extract options
    var options = spreadsheetData.metadata.items[0].questionItem.question.choiceQuestion.options.map(option => option.value);

    // Gather option counts
    const questionIds = spreadsheetData.masterData.slice(1).map(row => row[0]);
    const responses = spreadsheetData.responses;
    var counts = gatherOptionCounts(questionIds, responses, options);

    // for (var k = 0; k < 3; k++) {
    //     console.log(counts[questionIds[k]][option]);
    // }

    var k = 0;
    options.forEach(option => {
        console.log(counts[questionIds[k]][option]);
        k++;
    });

    // Define data point headers
    var masterHeaders = spreadsheetData.masterData[0];

    // Prepare data for Tabulator
    var tableData = spreadsheetData.masterData.slice(1).map((row, index) => {
        var rowData = {
            question: index + 1,
            imagePath: row[1], // Second column of masterData
            imageLink: row[2], // Third column of masterData
            imageId: row[3], // Fourth column of masterData
        };

        // Add counts to rowData in normal order
        options.forEach(option => {
            rowData[option] = counts[questionIds[index]][option] || 0;
        });

        // Add data point columns to rowData
        masterHeaders.slice(4).forEach((header, i) => {
            rowData[header] = row[i + 4];
        });

        return rowData;
    });

    // Define columns with colorFormatter
    var columns = [
        { title: "Question #", field: "question", cssClass: "default-column", sorter: "number" },
        { title: "Image Path", field: "imagePath", cssClass: "default-column", widthGrow: 2, formatter: "textarea" },
        {
            title: "Image Link", field: "imageLink", cssClass: "default-column", formatter: function(cell) {
                var link = cell.getValue();
                return `<a href="${link}" target="_blank"><i class="fas fa-link" style="color: black;"></i></a>`;
            }
        },
        {
            title: "Image Id", field: "imageId", cssClass: "default-column", formatter: function(cell) {
                var copyText = cell.getValue();
                return `<a href="#" onclick="navigator.clipboard.writeText('${copyText}')
                .then(function() { notyf.success('Image ID copied to clipboard'); })
                .catch(function() { notyf.error('Failed to copy Image ID to clipboard'); }); return false;">
                <i class="fas fa-clipboard" style="color: black;"></i></a>`;
            }
        }
    ];

    // Add option columns dynamically
    options.forEach(option => {
        columns.push({ title: option, field: option, cssClass: "default-column", sorter: "number" });
    });

    // Add data point columns dynamically
    masterHeaders.slice(4).forEach((header, i) => {
        columns.push({ title: header, field: header, cssClass: "default-column" });
    })

    // Save columns to session
    saveColumnsToSession(columns);
    console.log("Tabulator columns saved to session: ", sessionStorage.getItem('tableColumns'));

    if (questionIds.length < 10) {
        var height = (49*questionIds.length) + 75;
    } else {
        var height = 561;
    }
    console.log("Table height set to: ", height);

    // Initialize Tabulator
    table = new Tabulator("#data-table", {
        data: tableData,
        height: height,
        maxWidth:"80%",
        rowHeight: 49,
        columns: columns,
        movableColumns: true,
        layout: "fitColumns",
        responsiveLayout: "collapse", // Collapse columns that don't fit on the table
        resizableColumns: true, // Allow columns to be resized
        sortOrderReverse:true,
        pagination: "local",
        paginationSize: 10,
        paginationSizeSelector: [5, 10, 20, 50],
        selectableRows: true,
        initialSort: [
            { column: "question", dir: "asc" },
        ]
    });

    table.on("tableBuilt", function(){
        console.log("Table has been built successfully!");

        // check if columns have colors stored in session
        for (var i = 0; i < columns.length; i++) {
            let columnTitle = columns[i].title;
            let columnTitleWithoutSpaces = columnTitle.split(' ').join('');
            let columnTitleWithoutHashtag = columnTitleWithoutSpaces.split('#').join('');
            columnColorSaved = sessionStorage.getItem(columnTitleWithoutHashtag + '_color');
            console.log(`color saved for ${columnTitle} is ${columnColorSaved}`);
            
            if (columnColorSaved) {
                console.log("New column color being applied");
                let columnField = columns[i].field;
                console.log("columnField: ", columnField);
                let cssClassName = generateUniqueClass(columnTitleWithoutHashtag);
                console.log("cssClassName: ", cssClassName);
                table.updateColumnDefinition(columnField, {cssClass:cssClassName});
                console.log(`cssClass definition for ${columnTitle} has been updated to "${cssClassName}".`);
            }
        }
    });
            
    $('#loadingWheel').css('display', 'none');
}

function buildColorTable() {
    const columnsJson = sessionStorage.getItem('tableColumns');
    const columns = JSON.parse(columnsJson); // Convert JSON string back to array
    console.log("Tabulator columns loaded from session: ", columns);
    console.log("Length of columns: ", columns.length);

    const tableContainer = document.getElementById('colorTableContainer');
    tableContainer.innerHTML = ''; // Clear previous contents

    const tableElement = document.createElement('table');
    tableElement.className = 'table'; // Assuming Bootstrap styling

    let hasChanges = false; // Track if any changes have been made
    const saveButton = document.getElementById('saveCustomTableButton'); // Assuming you have a save button

    for (var i = 0; i < columns.length; i++) {
        const row = document.createElement('tr');

        // Column name cell
        const nameCell = document.createElement('td');
        nameCell.textContent = columns[i].title || 'Unnamed Column';
        row.appendChild(nameCell);

        // Color swatch cell
        const colorCell = document.createElement('td');
        const colorSwatch = document.createElement('div');
        colorSwatch.className = 'color-swatch';
        let columnTitle = columns[i].title;
        let columnTitleWithoutSpaces = columnTitle.split(' ').join('');
        let columnTitleWithoutHashtag = columnTitleWithoutSpaces.split('#').join('');
        const savedColor = sessionStorage.getItem(columnTitleWithoutHashtag + '_color') || '#fff'; // Load saved color or default to white

        let cssClassName = generateUniqueClass(columnTitleWithoutHashtag);
        let form_data_CSSStyleSheet = document.styleSheets[document.styleSheets.length-1];
        if (cssRuleExists(form_data_CSSStyleSheet, `.tabulator-row-even .tabulator-cell.${cssClassName}`)) {
            console.log("css rules saved in session, enabling save button");
            saveButton.disabled = false; // Enable save button
        }

        colorSwatch.style.backgroundColor = savedColor;
        console.log(`Loaded color ${savedColor} for column ${columns[i].title}`);
        
         // Set the saved color
        colorCell.appendChild(colorSwatch);

        // Color palette setup
        const colors = pastelColors;
        const colorPalette = document.createElement('div');
        colorPalette.className = 'color-palette';
        colorPalette.style.display = 'none';

        colors.forEach(color => {
            const colorOption = document.createElement('span');
            colorOption.className = 'color-option';
            colorOption.style.backgroundColor = color;
            colorOption.onclick = () => {
                colorSwatch.style.backgroundColor = color;
                colorPalette.style.display = 'none'; // Hide palette after selection
                hasChanges = true; // Set changes to true
                saveButton.disabled = false; // Enable save button
            };
            colorPalette.appendChild(colorOption);
        });

        colorSwatch.onclick = () => colorPalette.style.display = 'block'; // Show palette on click
        colorCell.appendChild(colorPalette);
        row.appendChild(colorCell);

        // Reset icon in its own column
        const resetCell = document.createElement('td');
        const resetIcon = document.createElement('i');
        resetIcon.className = 'fa fa-trash'; // Font Awesome trash icon
        resetIcon.style.color = '#D3D3D3';
        resetIcon.style.cursor = 'pointer'; // Make the icon clickable
        resetIcon.disabled = true;
        resetIcon.onclick = () => {
            if (colorSwatch.backgroundColor !== '#fff') {
                colorSwatch.style.backgroundColor = '#fff'; // Reset color to white
                console.log("new saved color): ", colorSwatch.style.backgroundColor);
                hasChanges = true; // Set changes to true
                saveButton.disabled = false; // Enable save button
                console.log("Reset performed, hasChanges:", hasChanges); // For debugging purposes
            }
        };

        resetCell.appendChild(resetIcon);
        row.appendChild(resetCell); // Append the reset icon cell to the row

        tableElement.appendChild(row);
    };

    tableContainer.appendChild(tableElement);

    //Save button event listener
    saveButton.onclick = () => {
        if (hasChanges) {
            $('loadingWheel_customTable').css('display', 'block');

            // Iterate over all columns and save their colors to sessionStorage and to apply to table
            const rows = tableElement.getElementsByTagName('tr'); // Get all rows of the table
            for (var i = 0; i < rows.length; i++) {
                const colorSwatch = rows[i].querySelector('.color-swatch'); // Find the color swatch div
                const color = colorSwatch.style.backgroundColor; // Get the color from the swatch

                let oddRgb = rgbStringToRgbArray(color);
                let oddBrightness = calculateBrightness(oddRgb);
        
                // Determine the target brightness for evenColor using the opposite ratio
                let targetBrightness = oddBrightness * (239.0 / 255.0); // Using the specific ratio from your example
        
                // Adjust evenColor to match the target brightness
                let evenRgb = adjustBrightness(oddRgb, targetBrightness, oddBrightness);
                console.log("evenRgb: ", evenRgb);
                let evenColor = rgbArrayToRgbString(evenRgb.map(Math.round));
        
                // Calculate the target brightness with the ratio of 0.659
                targetBrightness = oddBrightness * 0.659;
        
                // Adjust the RGB values to match the target brightness
                let selectedRgb = adjustBrightness(oddRgb, targetBrightness, oddBrightness);
                console.log("selectedRgb: ", selectedRgb);
                var selectedColor = rgbArrayToRgbString(selectedRgb.map(Math.round));

                console.log(`selected color for ${columns[i].title}: ${selectedColor}`); // not correct color
                console.log(`odd color for ${columns[i].title}: ${color}`);
                console.log(`even color for ${columns[i].title}: ${evenColor}`); // not correct color

                // Set vars for color changes
                let columnTitle = columns[i].title;
                let columnTitleWithoutSpaces = columnTitle.split(' ').join('');
                let columnTitleWithoutHashtag = columnTitleWithoutSpaces.split('#').join('');
                let cssClassName = generateUniqueClass(columnTitleWithoutHashtag);
                let columnField = columns[i].field;

                let form_data_CSSStyleSheet = document.styleSheets[document.styleSheets.length-1];

                // Delete the custom CSS rules for the column before making changes
                deleteCSSRule(form_data_CSSStyleSheet, `.tabulator-row-even .tabulator-cell.${cssClassName}`);
                deleteCSSRule(form_data_CSSStyleSheet, `.tabulator-row-odd .tabulator-cell.${cssClassName}`);
                deleteCSSRule(form_data_CSSStyleSheet, `.tabulator-selected .tabulator-cell.${cssClassName}`);

                // Save color to session for loading, and save changes to table
                if (color === 'rgb(255, 255, 255)') {
                    sessionStorage.removeItem(columnTitleWithoutHashtag + '_color'); // Remove the saved color from session storage

                    // reset css class to default for columns
                    table.updateColumnDefinition(columnField, {cssClass:"default-column"});
                    console.log(`cssClass definition for ${columnTitle} has been updated to "default-column".`);
                } else {
                    sessionStorage.setItem(columnTitleWithoutHashtag + '_color', color); // Save the selected color

                    // Insert the custom CSS rules for the adjusted colors for the column
                    form_data_CSSStyleSheet.insertRule(`.tabulator-row:hover .tabulator-cell.${cssClassName} { background-color: ${selectedColor} !important; }`, form_data_CSSStyleSheet.cssRules.length);
                    form_data_CSSStyleSheet.insertRule(`.tabulator-selected .tabulator-cell.${cssClassName} { background-color: ${selectedColor} !important; }`, form_data_CSSStyleSheet.cssRules.length);
                    form_data_CSSStyleSheet.insertRule(`.tabulator-row-odd .tabulator-cell.${cssClassName} { background-color: ${color}; }`, form_data_CSSStyleSheet.cssRules.length);
                    form_data_CSSStyleSheet.insertRule(`.tabulator-row-even .tabulator-cell.${cssClassName} { background-color: ${evenColor}; }`, form_data_CSSStyleSheet.cssRules.length);
                    console.log("New rules applied to sheet: ", form_data_CSSStyleSheet);

                    table.updateColumnDefinition(columnField, {cssClass:cssClassName});
                    console.log(`cssClass definition for ${columnTitle} has been updated to "${cssClassName}".`);
                }
            }

            saveButton.disabled = true; // Disable the save button after saving
            hasChanges = false; // Reset changes flag

            $('loadingWheel_customTable').css('display', 'none');
            notyf.success("Customizations saved successfully");
        }
    };
}

document.addEventListener('DOMContentLoaded', (event) => {
    $('#customizeTableButton').on('click', function(e) {
        const columnsJson = sessionStorage.getItem('tableColumns');
        const columns = JSON.parse(columnsJson); // Convert JSON string back to array
        const saveButton = document.getElementById('saveCustomTableButton'); // Assuming you have a save button
        for (var i = 0; i < columns.length; i++) {
            let columnTitle = columns[i].title;
            let columnTitleWithoutSpaces = columnTitle.split(' ').join('');
            let columnTitleWithoutHashtag = columnTitleWithoutSpaces.split('#').join('');
            const savedColor = sessionStorage.getItem(columnTitleWithoutHashtag + '_color') || '#fff'; // Load saved color or default to white
            if (savedColor !== '#fff') {
                console.log('enabling save button');
                saveButton.disabled = false; // Enable save button
            }
        }
        buildColorTable();
    });

    $('#customTableModal').on('click', function(e) {
        const openPalettes = document.querySelectorAll('.color-palette');
        if (!$(e.target).closest('.color-palette, .color-swatch').length) {
            openPalettes.forEach(palette => {
                palette.style.display = 'none';
            });
        }
    });
});

function deleteCSSRule(sheet, selectorText) {
    const rules = sheet.cssRules || sheet.rules; // Get the rules from the stylesheet
    for (let i = rules.length - 1; i >= 0; i--) { // Iterate in reverse to avoid index issues while deleting
        if (rules[i].selectorText === selectorText) {
            sheet.deleteRule(i); // Delete the rule if the selector matches
            console.log(`Deleted rule: ${selectorText}`);
        }
    }
}

function cssRuleExists(sheet, selectorText) {
    const rules = sheet.cssRules || sheet.rules; // Get the rules from the stylesheet
    for (let i = rules.length - 1; i >= 0; i--) {
        if (rules[i].selectorText === selectorText) {
            console.log(`Deleted rule: ${selectorText}`);
            return true;
        }
    }
}

function generateUniqueClass(columnName) {
    return 'custom-column-' + columnName;
}

function rgbStringToRgbArray(rgbString) {
    // Extract the RGB values from the string
    return rgbString.match(/\d+/g).map(Number);
}

function rgbArrayToRgbString(rgbArray) {
    // Convert RGB array back to RGB string format
    return `rgb(${rgbArray[0]}, ${rgbArray[1]}, ${rgbArray[2]})`;
}

function calculateBrightness([r, g, b]) {
    // Calculate brightness using the luminance formula
    return 0.299 * r + 0.587 * g + 0.114 * b;
}

function adjustBrightness([r, g, b], targetBrightness, currentBrightness) {
    const brightnessRatio = targetBrightness / currentBrightness;
    return [
        Math.min(255, Math.max(0, r * brightnessRatio)),
        Math.min(255, Math.max(0, g * brightnessRatio)),
        Math.min(255, Math.max(0, b * brightnessRatio))
    ];
}

function exportToCSV() {
    // const table = document.getElementById('data-table');
    // const rows = table.querySelectorAll('tr');
    // let csvContent = '';

    // rows.forEach(row => {
    //     const cells = row.querySelectorAll('th, td');
    //     let rowContent = [];
    //     cells.forEach(cell => {
    //         rowContent.push(cell.textContent);
    //     });
    //     csvContent += rowContent.join(',') + '\n';
    // });

    // const csvBlob = new Blob([csvContent], { type: 'text/csv' });
    // const csvUrl = URL.createObjectURL(csvBlob);

    // const tempLink = document.createElement('a');
    // tempLink.href = csvUrl;
    // tempLink.download = 'table_data.csv';
    // document.body.appendChild(tempLink);
    // tempLink.click();
    // document.body.removeChild(tempLink);
    table.download("csv", "data.csv");
}

function exportToExcel() {
    // const table = document.getElementById('data-table');
    // const rows = table.querySelectorAll('tr');
    // const worksheetData = [];

    // rows.forEach(row => {
    //     const cells = row.querySelectorAll('th, td');
    //     let rowData = [];
    //     cells.forEach(cell => {
    //         rowData.push(cell.textContent);
    //     });
    //     worksheetData.push(rowData);
    // });

    // const workbook = XLSX.utils.book_new();
    // const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    // XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');

    // // create a binary string from the workbook
    // const binaryString = XLSX.write(workbook, { bookType: 'xlsx', type: 'binary' });

    // // convert the binary string to an ArrayBuffer
    // const buffer = new ArrayBuffer(binaryString.length);
    // const view = new Uint8Array(buffer);
    // for (let i = 0; i < binaryString.length; ++i) {
    //     view[i] = binaryString.charCodeAt(i) & 0xFF;
    // }

    // // create a Blob from the ArrayBuffer
    // const excelBlob = new Blob([buffer], { type: 'application/octet-stream' });
    // const tempLink = document.createElement('a');
    // tempLink.href = URL.createObjectURL(excelBlob);
    // tempLink.download = 'table_data.xlsx';
    // document.body.appendChild(tempLink);
    // tempLink.click();
    // document.body.removeChild(tempLink);
    table.download("xlsx", "data.xlsx");
}

document.addEventListener('DOMContentLoaded', (event) => {
    let selectedItem = null;
    let currentTree = [];
    let currentForm = null;

    function fetchItems() {
        return fetch(loadFormsUrl)
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
        console.log(`id: ${item.id}`)
        console.log(`parent id: ${item.parent}`)
        return {
            id: item.id,
            name: item.name,
            parentId: item.parent,
            type: item.type, // type can be 'folder' or 'form'
            contents: item.contents ? item.contents.map(subitem => processItem(subitem)) : []
        };
    }

    function listContentsOf(tree, containerId = 'tree_container') {
        const ul = $('<ul></ul>');
        $('#' + containerId).append(ul);
        for (let i = 0; i < tree.length; i++) {
            const item = tree[i];
            const listItem = $('<li></li>').addClass(item.type);
            
            // Add icon based on item type
            if (item.type === 'folder') {
                listItem.html('<i class="fas fa-folder mr-2"></i>' + item.name);
            } else if (item.type === 'form') {
                listItem.html('<i class="fas fa-file-alt mr-2"></i>' + item.name);
            } else {
                listItem.text(item.name);
            }
            
            ul.append(listItem);

            listItem.on('click', function (e) {
                e.stopPropagation();
                // Remove previous selection
                $('#tree_container li').removeClass('selected-item');
                // Mark current item as selected
                $(this).addClass('selected-item');
                if (item.type === 'form') {
                    selectedItem = item;
                    currentForm = item;
                    $('#selectItemButton').prop('disabled', false);
                } else {
                    currentForm = null;
                    $('#selectItemButton').prop('disabled', true);
                }
            });

            if (item.type === 'folder' && item.contents.length > 0) {
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

    function updateTree(newTree) {
        $('#tree_container').empty();
        listContentsOf(newTree);
        currentTree = newTree;
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

    window.selectItem = async function () {
        if (selectedItem) {
            $('#itemPickerModal').modal('hide');
            $('#loadingWheel').css('display', 'block');
 
            selectedFormId = selectedItem.id;
            selectedFormParentId = selectedItem.parentId;
            selectedFormName = selectedItem.name;
            sessionStorage.setItem('selectedFormId', selectedItem.id);
            sessionStorage.setItem('selectedFormParentId', selectedItem.parentId);
            sessionStorage.setItem('selectedFormName', selectedItem.name);

            try {
                var data = await processSpreadsheetData("fetch");
                console.log("data recieved @ window.selectItem: ", data);
            } catch (error) {
                console.error('Error:', error);
                notyf.error("Unable to fetch form data! Refresh the page and try again in a few moments...");
            }
            
            let selectedFormParent = document.querySelector('.selected-form-container');
            let responseCounter = document.querySelector('.response-counter');

            // Show form container and form name
            selectedFormParent.style.opacity = 1;
            document.getElementById('selectedForm').innerText = selectedFormName;

            // Show response container and show message
            responseCounter.style.opacity = 1;
            displayResponseCounterMessage(1, data);

            processSpreadsheetData(data);

            $('#loadingWheel').css('display', 'none');
        }
    }

    // Deselect the item when clicking outside of the item, button, or text box
    $('#itemPickerModal').on('click', function(e) {
        if (!$(e.target).closest('.item, button, input[type="text"]').length) {
            // Remove previous selection
            $('#tree_container li').removeClass('selected-item');
            // Disable the select button
            selectedItem = null;
            $('#selectItemButton').prop('disabled', true);
        }
    });
});