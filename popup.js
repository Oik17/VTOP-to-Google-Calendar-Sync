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
    document.getElementById('add-event').addEventListener('click', addCalendarEvent);
    
    // Add input validation
    ['event-title', 'event-date', 'event-time'].forEach(id => {
        document.getElementById(id).addEventListener('input', validateForm);
    });
}

function validateForm() {
    const title = document.getElementById('event-title').value.trim();
    const date = document.getElementById('event-date').value;
    const time = document.getElementById('event-time').value;
    
    const addEventButton = document.getElementById('add-event');
    addEventButton.disabled = !(title && date && time);
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
    const eventForm = document.getElementById('event-form');
    
    switch (state) {
        case 'authorized':
            authorize.style.display = 'none';
            signout.style.display = 'block';
            eventForm.style.display = 'block';
            break;
        case 'unauthorized':
            authorize.style.display = 'block';
            signout.style.display = 'none';
            eventForm.style.display = 'none';
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

async function addCalendarEvent() {
    try {
        const eventData = getEventData();
        if (!eventData) return;

        const response = await fetchWithRetry(() => createCalendarEvent(eventData));
        
        if (response.ok) {
            updateStatus('Event added successfully', 'success');
            clearForm();
        }
    } catch (error) {
        handleEventCreationError(error);
    }
}

function getEventData() {
    const title = document.getElementById('event-title').value.trim();
    const date = document.getElementById('event-date').value;
    const time = document.getElementById('event-time').value;
    const description = document.getElementById('event-description').value.trim();

    if (!title || !date || !time) {
        updateStatus('Please fill in all required fields', 'error');
        return null;
    }

    const dateTime = new Date(date + 'T' + time);
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    return {
        'summary': title,
        'description': description,
        'start': {
            'dateTime': dateTime.toISOString(),
            'timeZone': timeZone
        },
        'end': {
            'dateTime': new Date(dateTime.getTime() + 60 * 60 * 1000).toISOString(),
            'timeZone': timeZone
        }
    };
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

function clearForm() {
    ['event-title', 'event-date', 'event-time', 'event-description'].forEach(id => {
        document.getElementById(id).value = '';
    });
    validateForm();
}

function updateStatus(message, type = 'info') {
    const statusElement = document.getElementById('status');
    statusElement.textContent = message;
    
    // Update status color based on type
    const colors = {
        success: '#28a745',
        error: '#dc3545',
        info: '#17a2b8'
    };
    
    statusElement.style.color = colors[type] || colors.info;
}