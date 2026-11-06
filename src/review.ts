import { mount } from './ui';
import { STORAGE_KEY } from './service';
import './style.css';

const app = mount(document.getElementById('app')!, request => chrome.runtime.sendMessage(request));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && STORAGE_KEY in changes) void app.refresh();
});
const onVisibility = () => {
  if (document.visibilityState === 'visible') void app.resume();
};
document.addEventListener('visibilitychange', onVisibility);
window.addEventListener('focus', onVisibility);
window.addEventListener('pagehide', () => {
  app.destroy();
  document.removeEventListener('visibilitychange', onVisibility);
  window.removeEventListener('focus', onVisibility);
}, { once: true });
