const table = document.querySelector('.customTable');
if (table) {
    const dueDates = [];
    
    const rows = table.querySelectorAll('tr.fixedContent.tableContent');
    
    rows.forEach(row => {
        const dueDateCell = row.querySelector('td:nth-child(5) span');
        if (dueDateCell) {
            const dueDate = dueDateCell.textContent.trim();
            dueDates.push(dueDate);
        }
    });
    
    console.log('Extracted Due Dates:', dueDates);

    chrome.runtime.sendMessage({ dueDates: dueDates });
} else {
    console.error("Table with class 'customTable' not found.");
}
