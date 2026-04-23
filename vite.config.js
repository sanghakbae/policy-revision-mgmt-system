/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(function () { return ({
    base: "/",
    plugins: [react()],
    server: {
        port: 5179,
        strictPort: true,
    },
    test: {
        environment: "jsdom",
        setupFiles: "./vitest.setup.ts",
    },
}); });
