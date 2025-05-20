import { FlatCompat } from '@eslint/eslintrc';
import eslint from '@eslint/js';
import prettier from 'eslint-plugin-prettier';
import globals from 'globals';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: eslint.configs.recommended,
  allConfig: eslint.configs.all,
});

// export default tseslint.config(
//   eslint.configs.recommended,
//   tseslint.configs.recommended,
// );

export default tseslint.config([
  {
    // extends: compat.extends(
    //   'plugin:@typescript-eslint/eslint-recommended',
    //   'plugin:@typescript-eslint/recommended',
    //   'prettier',
    // ),
    extends: [eslint.configs.recommended, tseslint.configs.recommended],
    plugins: {
      // "@typescript-eslint": typescriptEslintEslintPlugin,
      prettier,
    },

    languageOptions: {
      globals: {
        ...globals.node,
        ...Object.fromEntries(
          Object.entries(globals.jest).map(([key]) => [key, 'off']),
        ),
      },

      // parser: tsParser,
      ecmaVersion: 5,
      sourceType: 'module',

      parserOptions: {
        project: 'tsconfig.json',
      },
    },

    rules: {
      'prettier/prettier': ['error'],
      '@typescript-eslint/interface-name-prefix': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      'max-len': 'off',

      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'import',
          format: ['camelCase', 'PascalCase'],
        },
        {
          selector: 'default',
          format: ['camelCase'],
          leadingUnderscore: 'allow',
          trailingUnderscore: 'allow',
        },
        {
          selector: 'variable',
          format: ['camelCase', 'UPPER_CASE', 'StrictPascalCase'],
          leadingUnderscore: 'allow',
          trailingUnderscore: 'allow',
        },
        {
          selector: 'typeLike',
          format: ['PascalCase'],
        },
        {
          selector: 'enumMember',
          format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
        },
        {
          selector: 'parameter',
          format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
        },
      ],
      'no-unexpected-multiline': 'off',
    },
  },
]);

