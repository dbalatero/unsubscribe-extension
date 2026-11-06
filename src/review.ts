import { mount } from './ui';
import './style.css';

const app = mount(document.getElementById('app')!, request => chrome.runtime.sendMessage(request));
chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === 'local') void app.refresh();
});
