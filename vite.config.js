import { defineConfig } from 'vite';

// GitHub Pages のサブパス（https://takpanda.github.io/tabiyori/）向け。
// カスタムドメインやルートデプロイに変える場合はここを '/' にする。
export default defineConfig({
  base: '/tabiyori/',
});
