// content.js

// Select the table with the class "customTable"
const table = document.querySelector('.customTable');
if (table) {
    // Array to store extracted due dates
    const dueDates = [];
    
    // Select all rows that contain due dates
    const rows = table.querySelectorAll('tr.fixedContent.tableContent');
    
    // Iterate over each row and get the due date cell
    rows.forEach(row => {
        const dueDateCell = row.querySelector('td:nth-child(5) span');
        if (dueDateCell) {
            const dueDate = dueDateCell.textContent.trim();
            dueDates.push(dueDate);
        }
    });
    
    // Log the due dates or send them to the background script
    console.log('Extracted Due Dates:', dueDates);

    chrome.runtime.sendMessage({ dueDates: dueDates });
} else {
    console.error("Table with class 'customTable' not found.");
}
