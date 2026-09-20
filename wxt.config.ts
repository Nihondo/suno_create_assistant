import { defineConfig } from 'wxt';

export default defineConfig({
  outDir: 'install',
  outDirTemplate: 'suno-create-assistant',
  zip: {
    artifactTemplate: 'suno-create-assistant.zip',
  },
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Suno Create Assistant',
    description: 'Saved styles, mastering prompts, option presets, and auto titles for Suno Create.',
    homepage_url: 'https://products.desireforwealth.com/products/suno-create-assistant',
    permissions: ['storage'],
    host_permissions: ['https://suno.com/*'],
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
