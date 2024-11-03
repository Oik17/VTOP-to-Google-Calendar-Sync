let accessToken = null;
const TASKS_API_ENDPOINT = 'https://tasks.googleapis.com/tasks/v1/lists/@default/tasks';

document.addEventListener('DOMContentLoaded', initializePopup);

function initializePopup() {
    setupEventListeners();
    checkInitialAuthStatus();
}

function setupEventListeners() {
    document.getElementById('authorize').addEventListener('click', handleAuthClick);
    document.getElementById('signout').addEventListener('click', handleSignoutClick);
    document.getElementById('get-due-dates').addEventListener('click', handleGetDueDates);
}

function checkInitialAuthStatus() {
    chrome.identity.getAuthToken({ interactive: false }, handleAuthResponse);
}

function handleAuthResponse(token) {
    if (chrome.runtime.lastError) {
        console.error('Auth Error:', chrome.runtime.lastError.message);
        updateStatus('Please sign in to continue', 'info');
        return;
    }
    
    if (token) {
        accessToken = token;
        updateUIState('authorized');
        updateStatus('Already signed in', 'success');
    }
}

function updateUIState(state) {
    const authorize = document.getElementById('authorize');
    const signout = document.getElementById('signout');
    const getDueDatesBtn = document.getElementById('get-due-dates');
    
    switch (state) {
        case 'authorized':
            authorize.style.display = 'none';
            signout.style.display = 'block';
            getDueDatesBtn.disabled = false;
            break;
        case 'unauthorized':
            authorize.style.display = 'block';
            signout.style.display = 'none';
            getDueDatesBtn.disabled = true;
            break;
    }
}

function handleAuthClick() {
    chrome.identity.getAuthToken({ interactive: true }, function(token) {
        if (chrome.runtime.lastError) {
            updateStatus('Authentication failed: ' + chrome.runtime.lastError.message, 'error');
            return;
        }
        accessToken = token;
        updateUIState('authorized');
        updateStatus('Signed in successfully', 'success');
    });
}

async function handleSignoutClick() {
    if (!accessToken) return;

    try {
        const revokeResponse = await fetch(
            `https://accounts.google.com/o/oauth2/revoke?token=${accessToken}`,
            { method: 'GET' }
        );

        // Then remove it from Chrome's cache
        await new Promise((resolve) => {
            chrome.identity.removeCachedAuthToken({ token: accessToken }, resolve);
        });

        accessToken = null;
        updateUIState('unauthorized');
        updateStatus('Signed out successfully', 'success');
    } catch (error) {
        console.error('Signout error:', error);
        updateStatus('Error signing out. Please try again.', 'error');
    }
}

async function handleGetDueDates() {
    updateStatus('Extracting due dates...', 'info');
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    chrome.scripting.executeScript(
        {
            target: { tabId: tab.id },
            func: simulateButtonClick,
            args: ['VL2024250101616']  
        },
        async () => {
            setTimeout(() => {
                chrome.scripting.executeScript(
                    {
                        target: { tabId: tab.id },
                        func: extractAssignmentInfo
                    },
                    async (results) => {
                        if (chrome.runtime.lastError) {
                            updateStatus(`Error: ${chrome.runtime.lastError.message}`, 'error');
                            return;
                        }
                        const assignments = results[0].result;
                        if (assignments.length) {
                            updateStatus("Assignments found! Adding to tasks...", 'info');
                            await addAssignmentsToTasks(assignments);
                        } else {
                            updateStatus("No assignments found.", 'error');
                        }
                    }
                );
            }, 6000);
        }
    );
}

function extractAssignmentInfo() {
    const assignments = [];
    const rows = document.querySelectorAll("table.customTable tr.tableContent");
    console.log('Found rows:', rows.length); 
    
    rows.forEach((row, index) => {
        const titleElement = row.querySelector("td:nth-child(2)");
        const dueDateElement = row.querySelector("td:nth-child(5) span");
        
        console.log(`Row ${index + 1}:`); 
        console.log('Title element:', titleElement?.textContent); 
        console.log('Due date element:', dueDateElement?.textContent); 
        
        if (titleElement && dueDateElement) {
            assignments.push({
                title: titleElement.textContent.trim(),
                dueDate: dueDateElement.textContent.trim()
            });
        }
    });
    
    console.log('Extracted assignments:', assignments); 
    return assignments;
}

async function addAssignmentsToTasks(assignments) {
    if (!accessToken) {
        updateStatus('Please sign in first', 'error');
        return;
    }

    try {
        let successCount = 0;

        console.log('Processing assignments:', assignments); 

        for (const assignment of assignments) {
            console.log('Processing assignment:', assignment); 
            
            const dueDate = new Date(assignment.dueDate);
            console.log('Parsed due date:', dueDate); 
            
            if (isNaN(dueDate.getTime())) {
                console.error('Invalid date:', assignment.dueDate);
                continue;
            }

            const dueDateString = dueDate.toISOString();
            console.log('Due date string:', dueDateString); 

            const taskData = {
                'title': assignment.title,
                'notes': 'Assignment from course schedule',
                'due': dueDateString
            };

            console.log('Sending task data:', taskData); 

            const response = await fetchWithRetry(() => createTask(taskData));
            console.log('API Response:', response); 
            
            if (response.ok) {
                successCount++;
            } else {
                const responseText = await response.text();
                console.error('Error response:', responseText);
            }
        }

        updateStatus(`Successfully added ${successCount} out of ${assignments.length} assignments to tasks`, 'success');
    } catch (error) {
        console.error('Full error:', error); 
        handleTaskCreationError(error);
    }
}

async function createTask(taskData) {
    console.log('Creating task with data:', taskData); 
    const response = await fetch(TASKS_API_ENDPOINT, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(taskData)
    });
    
    console.log('Task creation response:', response.status); 
    return response;
}
async function fetchWithRetry(fetchFn, retries = 1) {
    try {
        const response = await fetchFn();
        
        if (response.status === 401 && retries > 0) {
            // Token expired, refresh and retry
            await refreshToken();
            return fetchWithRetry(fetchFn, retries - 1);
        }
        
        return response;
    } catch (error) {
        if (retries > 0) {
            return fetchWithRetry(fetchFn, retries - 1);
        }
        throw error;
    }
}

async function refreshToken() {
    await new Promise((resolve) => {
        chrome.identity.removeCachedAuthToken({ token: accessToken }, async () => {
            await handleAuthClick();
            resolve();
        });
    });
}

function handleTaskCreationError(error) {
    console.error('Task creation error:', error);
    let errorMessage = 'Error adding task. ';
    
    if (error.message.includes('401')) {
        errorMessage += 'Please try signing in again.';
    } else if (error.message.includes('network')) {
        errorMessage += 'Please check your internet connection.';
    } else {
        errorMessage += error.message;
    }
    
    updateStatus(errorMessage, 'error');
}

function simulateButtonClick(itemId) {
    myFunction(itemId);
}

function updateStatus(message, type = 'info') {
    const statusElement = document.getElementById('status');
    statusElement.textContent = message;
    
    const colors = {
        success: '#28a745',
        error: '#dc3545',
        info: '#17a2b8'
    };
    
    statusElement.style.color = colors[type] || colors.info;
}