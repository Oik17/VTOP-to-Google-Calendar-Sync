chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.dueDates) {
        console.log('Received due dates from content script:', message.dueDates);
    }
});
