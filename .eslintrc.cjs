module.exports = {
  env: {
    browser: true,
    es2021: true,
    node: true,
  },
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended", "prettier"],
  overrides: [],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
  },
  plugins: ["@typescript-eslint"],
  rules: {
    // indent: ["warn", 2],
    "linebreak-style": ["warn", "unix"],
    semi: ["warn", "always"],
    "@typescript-eslint/no-unused-vars": [
      "warn",
      {
        ignoreRestSiblings: true,
        destructuredArrayIgnorePattern: "^_.*",
        argsIgnorePattern: "^_.*",
        caughtErrors: "none",
      },
    ],
  },
};
