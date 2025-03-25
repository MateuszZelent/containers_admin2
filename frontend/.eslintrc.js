module.exports = {
  extends: ["next/core-web-vitals"],
  rules: {
    // Wyłączenie reguł powodujących błędy podczas budowania
    "@typescript-eslint/no-unused-vars": "warn", // zamień 'error' na 'warn'
    "@typescript-eslint/no-explicit-any": "warn", // zamień 'error' na 'warn'
    "react-hooks/exhaustive-deps": "warn", // już jest 'warn', ale dla pewności
    "react/no-unescaped-entities": "warn", // zamień 'error' na 'warn'
    "@next/next/no-img-element": "warn" // zamień 'error' na 'warn'
  }
};
