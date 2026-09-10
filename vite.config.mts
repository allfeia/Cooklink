/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ command }) => ({
    plugins: [
        // The React and Tailwind plugins are both required for Make, even if
        // Tailwind is not being actively used – do not remove them
        react(),
        tailwindcss(),
    ],
    resolve: {
        alias: {
            // Alias @ to the src directory
            '@': path.resolve(__dirname, './src'),
            'yt-dlp-exec': path.resolve(__dirname, 'backend/node_modules/yt-dlp-exec'),
            'axios': path.resolve(__dirname, 'backend/node_modules/axios'),
            'openai': path.resolve(__dirname, 'backend/node_modules/openai'),
            'drizzle-orm/node-postgres': path.resolve(__dirname, 'backend/node_modules/drizzle-orm/node-postgres'),
            'drizzle-orm/pglite': path.resolve(__dirname, 'backend/node_modules/drizzle-orm/pglite'),
            'drizzle-orm/pg-core': path.resolve(__dirname, 'backend/node_modules/drizzle-orm/pg-core'),
            'drizzle-orm': path.resolve(__dirname, 'backend/node_modules/drizzle-orm'),
            '@electric-sql/pglite': path.resolve(__dirname, 'backend/node_modules/@electric-sql/pglite'),
            'pg': path.resolve(__dirname, 'backend/node_modules/pg'),

        },
    },

    assetsInclude: ['**/*.svg', '**/*.csv'],

    esbuild: {
        drop: command === 'build' ? ['console', 'debugger'] : [],
    },

    test: {
        server: {
            deps: {
                inline: ['yt-dlp-exec'],
            },
        },
    },
}))