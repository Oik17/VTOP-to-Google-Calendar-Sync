const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest"];
const SCOPES = "https://www.googleapis.com/auth/calendar.events";

let authorizeButton = document.getElementById('authorize_button');
let signoutButton = document.getElementById('signout_button');

function handleClientLoad() {
    gapi.load('client:auth2', initClient);
}

function initClient() {
    gapi.client.init({
        apiKey: API_KEY,
        clientId: CLIENT_ID,
        discoveryDocs: DISCOVERY_DOCS,
        scope: SCOPES
    }).then(() => {
        gapi.auth2.getAuthInstance().isSignedIn.listen(updateSigninStatus);
        updateSigninStatus(gapi.auth2.getAuthInstance().isSignedIn.get());
        authorizeButton.onclick = handleAuthClick;
        signoutButton.onclick = handleSignoutClick;
    }, (error) => {
        console.error(JSON.stringify(error, null, 2));
    });
}

function updateSigninStatus(isSignedIn) {
    if (isSignedIn) {
        authorizeButton.style.display = 'none';
        signoutButton.style.display = 'block';
    } else {
        authorizeButton.style.display = 'block';
        signoutButton.style.display = 'none';
    }
}

function handleAuthClick(event) {
    gapi.auth2.getAuthInstance().signIn();
}

function handleSignoutClick(event) {
    gapi.auth2.getAuthInstance().signOut();
}

function createEvent(eventDetails) {
    const event = {
        'summary': eventDetails.summary,
        'description': eventDetails.description,
        'start': {
            'dateTime': eventDetails.startTime,
            'timeZone': eventDetails.timeZone
        },
        'end': {
            'dateTime': eventDetails.endTime,
            'timeZone': eventDetails.timeZone
        }
    };

    const request = gapi.client.calendar.events.insert({
        'calendarId': 'primary',
        'resource': event
    });

    request.execute((event) => {
        console.log('Event created: ' + event.htmlLink);
    });
}

// Example usage:
// createEvent({
//     summary: 'Sample Event',
//     description: 'This is a sample event',
//     startTime: '2023-10-01T10:00:00-07:00',
//     endTime: '2023-10-01T11:00:00-07:00',
//     timeZone: 'America/Los_Angeles'
// })