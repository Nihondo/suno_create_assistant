import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Suno Create Assistant',
    description: 'Saved styles, mastering prompts, option presets, and auto titles for Suno Create.',
    permissions: ['storage'],
    host_permissions: ['https://suno.com/create*'],
    options_ui: {
      page: 'options.html',
      open_in_tab: true,
    },
    commands: {
      'trigger-suno-create': {
        description: 'Sunoの「作成」を実行',
      },
    },
  },
});
