module.exports = {
    extends: ["gemini-testing", "plugin:@typescript-eslint/recommended", "prettier"],
    parser: "@typescript-eslint/parser",
    plugins: ["@typescript-eslint"],
    root: true,
    parserOptions: {
        ecmaVersion: 2022,
    },
    overrides: [
        {
            files: ["*.ts"],
            rules: {
                "@typescript-eslint/explicit-function-return-type": "error",
                "@typescript-eslint/no-unsafe-declaration-merging": "off",
            },
        },
        {
            files: ["*.js"],
            rules: {
                "@typescript-eslint/no-var-requires": "off",
            },
        },
        {
            files: ["test/**"],
            rules: {
                "@typescript-eslint/no-empty-function": "off",
                // For convenient casting of test objects
                "@typescript-eslint/no-explicit-any": "off",
            },
        },
    ],
};
