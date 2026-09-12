import { defineConfig } from 'wxt';

export default defineConfig({
  outDir: 'output',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Suno Create Assistant',
    description: 'Saved styles, mastering prompts, option presets, and auto titles for Suno Create.',
    permissions: ['storage'],
    host_permissions: ['https://suno.com/create*'],
  },
});
