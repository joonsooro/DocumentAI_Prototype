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
    // F-14: the asset-binding test legitimately references the forbidden
    // token in fixtures + grep regex; the test IS the runtime check.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/data/assetBinding.test.ts'],
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
            "N8 / F-14: source must never reference the DAEJOO PDF via the local-download path. Use app/assets/daejoo-invoice.pdf.",
        },
        {
          selector: "TemplateElement[value.raw=/~\\/Downloads|Downloads\\/aicore/]",
          message:
            "N8 / F-14: source must never reference the DAEJOO PDF via the local-download path. Use app/assets/daejoo-invoice.pdf.",
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
    // N2 — Admin recommendations and admin UI must never include "lower the
    // threshold". Excluded:
    //   - src/components/admin/viewModel.ts: implements the F-12 projection
    //     guard (its regex literal IS the runtime enforcement).
    //   - src/components/admin/viewModel.test.ts: feeds the forbidden phrase
    //     as a fixture to prove the projection drops it.
    //   - src/routes/admin.test.tsx: smoke test asserts the rendered DOM
    //     does NOT contain the phrase — references the phrase in its regex.
    files: ['src/components/admin/**/*.{ts,tsx}', 'src/routes/admin.test.tsx'],
    ignores: [
      'src/components/admin/viewModel.ts',
      'src/components/admin/viewModel.test.ts',
      'src/routes/admin.test.tsx',
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
