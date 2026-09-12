import { defineConfig } from 'vite';

// GitHub Pages のサブパス（https://takpanda.github.io/Tabiyori/）に合わせる。
// base はリポジトリ名と一致させる（大文字小文字がズレるとアセットが404になる）。
export default defineConfig({
  base: '/Tabiyori/',
});
