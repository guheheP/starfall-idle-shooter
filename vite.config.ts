import { defineConfig } from 'vite';
import { gamePwa } from './build/pwa';

export default defineConfig({
  base: './',
  plugins: [gamePwa()],
});
