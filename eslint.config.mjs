import globals from "globals";
import pluginJs from "@eslint/js";


export default [
  { files: ["**/*.js"], languageOptions: { sourceType: "commonjs" } },
  {
    languageOptions: {
      globals: {
        ...globals.node,
        process: "readonly",
        __dirname: "readonly"
      }
    }
  },
  {
    rules: {
      "no-unused-vars": ["warn",
        {
          "caughtErrors": "none",
          "varsIgnorePattern": "^next$", 
          "argsIgnorePattern": "^next$"
        }
      ],
      "no-undef": "off",
      "no-async-promise-executor": "off"
    }
  },
  pluginJs.configs.recommended,
];