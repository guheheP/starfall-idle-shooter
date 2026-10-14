import { startGameApplication } from './app';
import { initializePwa } from './pwa';
import './style.css';
import './ui/ui-polish.css';
import './ui/mobile-polish.css';

initializePwa();

const application = startGameApplication({
  getItem: key => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
});

if (import.meta.hot) import.meta.hot.dispose(() => { void application.dispose(); });
