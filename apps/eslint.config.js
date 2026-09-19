import js from '@eslint/js'
import ts from 'typescript-eslint'
import vue from 'eslint-plugin-vue'
import prettier from 'eslint-config-prettier'

export default ts.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: { parser: ts.parser },
    },
  },
  {
    rules: {
      // Views are single-word by design (Practice, Result, Stats…).
      'vue/multi-word-component-names': 'off',
      // U+3000 is a deliberate separator in the CJK copy and in the width-normalising regex.
      'no-irregular-whitespace': [
        'error',
        { skipStrings: true, skipTemplates: true, skipRegExps: true, skipComments: true },
      ],
      'vue/no-irregular-whitespace': [
        'error',
        {
          skipHTMLTextContents: true,
          skipHTMLAttributeValues: true,
          skipStrings: true,
          skipTemplates: true,
          skipRegExps: true,
          skipComments: true,
        },
      ],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'vue/attributes-order': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
      'vue/html-indent': 'off',
      'vue/html-closing-bracket-newline': 'off',
    },
  },
  {
    files: ['**/*.vue'],
    rules: {
      // The core rule also scans raw template text, where U+3000 is intentional
      // copy; vue/no-irregular-whitespace covers the cases that matter there.
      'no-irregular-whitespace': 'off',
    },
  },
  prettier,
)
