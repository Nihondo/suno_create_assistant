import { defineConfig } from 'wxt';

export default defineConfig({
  outDir: 'install',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Suno Create Assistant',
    description: 'Saved styles, mastering prompts, option presets, and auto titles for Suno Create.',
    permissions: ['storage'],
    host_permissions: ['https://suno.com/create*'],
    icons: {
      16: 'icon-16.png',
      32: 'icon-32.png',
      48: 'icon-48.png',
      128: 'icon-128.png',
    },
    web_accessible_resources: [
      {
        resources: ['icon-128.png'],
        matches: ['https://suno.com/*'],
      },
    ],
  },
});
