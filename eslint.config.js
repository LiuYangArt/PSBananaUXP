// ESLint Flat Config (v9+)
// 针对 Photoshop UXP 插件项目优化

export default [
    {
        // 忽略的文件/目录
        ignores: [
            'node_modules/',
            'dist/',
            'build/',
            'Profiles/',
            'update_manifest_version.js', // Node.js 构建脚本，不是 UXP 代码
        ],
    },
    {
        // 所有 JS 文件的规则
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                // UXP 全局对象
                require: 'readonly',
                module: 'readonly',
                exports: 'readonly',
                console: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
                // DOM 全局对象
                document: 'readonly',
                window: 'readonly',
                HTMLElement: 'readonly',
                Event: 'readonly',
                CustomEvent: 'readonly',
                FileReader: 'readonly',
                Blob: 'readonly',
                URL: 'readonly',
                fetch: 'readonly',
                FormData: 'readonly',
                navigator: 'readonly',
                Image: 'readonly',
                btoa: 'readonly',
                atob: 'readonly',
                // Photoshop UXP 特有
                __dirname: 'readonly',
                __filename: 'readonly',
            },
        },
        rules: {
            // 错误检测
            'no-undef': 'error',
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            'no-redeclare': 'error',
            'no-dupe-keys': 'error',
            'no-duplicate-case': 'error',
            'no-empty': 'warn',

            // 最佳实践
            'no-eval': 'error',
            'no-implied-eval': 'error',
            'no-new-func': 'error',
            eqeqeq: ['warn', 'smart'],
            'no-throw-literal': 'error',

            // 异步相关 (UXP 重要)
            'no-async-promise-executor': 'error',
            'require-await': 'warn',
            'no-await-in-loop': 'off', // UXP 中常需要顺序执行

            // 代码风格 (交给 Prettier 处理的不在此设置)
            'no-var': 'warn',
            'prefer-const': 'warn',
        },
    },
];
