import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// ESLint flat config (v9). Build-specific rules enforce the spec's negative
// contract directly in source per app-spec.json runtime_config.lint_rules:
//   1. N8 / F-14: forbid any literal containing "~/Downloads" or "Downloads/aicore" in src/.
//   2. N1: forbid the string literal "Unsupported" in src/routes/customer/** or src/components/customer/**.
//   3. N2: forbid /lower(ing)?\s+threshold/i in src/domain/generateAdminRecommendations.ts and src/components/admin/**.
export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'app/**', '.omc/**', 'modules.bak/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "Literal[value=/~\\/Downloads|Downloads\\/aicore/]",
          message:
            "N8 / F-14: source must never reference the DAEJOO PDF via ~/Downloads. Use app/assets/daejoo-invoice.pdf.",
        },
        {
          selector: "TemplateElement[value.raw=/~\\/Downloads|Downloads\\/aicore/]",
          message:
            "N8 / F-14: source must never reference the DAEJOO PDF via ~/Downloads. Use app/assets/daejoo-invoice.pdf.",
        },
      ],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // N1 — Customer Workspace MUST NEVER render the string "Unsupported".
    files: ['src/routes/customer/**/*.{ts,tsx}', 'src/components/customer/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "Literal[value=/^Unsupported$|^Unsupported\\b/]",
          message: 'N1 (RED-2/HAPPY-4): Customer Workspace must never display "Unsupported". Use ClarificationRequest or workaround classification.',
        },
        {
          selector: "TemplateElement[value.raw=/^Unsupported$|^Unsupported\\b/]",
          message: 'N1 (RED-2/HAPPY-4): Customer Workspace must never display "Unsupported". Use ClarificationRequest or workaround classification.',
        },
      ],
    },
  },
  {
    // N2 — Admin recommendations and admin UI must never include "lower the threshold".
    files: [
      'src/domain/generateAdminRecommendations.ts',
      'src/components/admin/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "Literal[value=/lower(ing)?\\s+threshold/i]",
          message: 'N2 (RED-1): never recommend lowering a confidence threshold.',
        },
        {
          selector: "TemplateElement[value.raw=/lower(ing)?\\s+threshold/i]",
          message: 'N2 (RED-1): never recommend lowering a confidence threshold.',
        },
      ],
    },
  }
);
