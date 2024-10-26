let accessToken = null;
const CALENDAR_API_ENDPOINT = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

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
        // First, revoke the token on Google's servers
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
                        func: extractDueDates
                    },
                    async (results) => {
                        if (chrome.runtime.lastError) {
                            updateStatus(`Error: ${chrome.runtime.lastError.message}`, 'error');
                            return;
                        }
                        const dueDates = results[0].result;
                        if (dueDates.length) {
                            updateStatus("Due dates found! Adding to calendar...", 'info');
                            await addDueDatesToCalendar(dueDates);
                        } else {
                            updateStatus("No due dates found.", 'error');
                        }
                    }
                );
            }, 6000);
        }
    );
}

async function addDueDatesToCalendar(dueDates) {
    if (!accessToken) {
        updateStatus('Please sign in first', 'error');
        return;
    }

    try {
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        let successCount = 0;

        for (const dueDate of dueDates) {
            // Parse the due date string to create a Date object
            const date = new Date(dueDate);
            if (isNaN(date.getTime())) {
                console.error('Invalid date:', dueDate);
                continue;
            }

            // Set the time to 9:00 AM on the due date
            date.setHours(9, 0, 0, 0);

            const eventData = {
                'summary': 'Assignment Due',
                'description': `Assignment due date from course schedule`,
                'start': {
                    'dateTime': date.toISOString(),
                    'timeZone': timeZone
                },
                'end': {
                    'dateTime': new Date(date.getTime() + 60 * 60 * 1000).toISOString(), // 1 hour duration
                    'timeZone': timeZone
                },
                'reminders': {
                    'useDefault': false,
                    'overrides': [
                        {'method': 'popup', 'minutes': 24 * 60}, // 1 day before
                        {'method': 'popup', 'minutes': 60} // 1 hour before
                    ]
                }
            };

            const response = await fetchWithRetry(() => createCalendarEvent(eventData));
            if (response.ok) {
                successCount++;
            }
        }

        updateStatus(`Successfully added ${successCount} out of ${dueDates.length} due dates to calendar`, 'success');
    } catch (error) {
        handleEventCreationError(error);
    }
}

async function createCalendarEvent(eventData) {
    return fetch(CALENDAR_API_ENDPOINT, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(eventData)
    });
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

function handleEventCreationError(error) {
    console.error('Event creation error:', error);
    let errorMessage = 'Error adding event. ';
    
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

function extractDueDates() {
    const dueDates = [];
    const rows = document.querySelectorAll("table.customTable tr.tableContent");
    rows.forEach((row) => {
        const dueDateElement = row.querySelector("td:nth-child(5) span");
        if (dueDateElement) {
            dueDates.push(dueDateElement.textContent.trim());
        }
    });
    return dueDates;
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