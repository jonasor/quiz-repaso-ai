import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules/', 'dist/', 'coverage/', '*.min.js'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Scripts de desarrollo: corren en Node, no en el navegador.
    files: ['scripts/**/*.{mjs,ts}', '*.config.{ts,js}'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly', URL: 'readonly', __dirname: 'readonly' },
    },
  },
  {
    // Principio III: el dominio no conoce Firebase. El chequeo mecánico vive en
    // scripts/check-domain-purity.mjs; esta regla lo dice también en el editor.
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: ['firebase', 'firebase/*', '@firebase/*'] }],
    },
  },
);
