// Universal Link entry point: https://parkquest.me/p/<id> opens here when
// the app is installed. Implementation lives under the feed tab so in-app
// navigation to a post keeps the tab bar and feed chrome.
export { default } from '../(tabs)/feed/post/[id]';
