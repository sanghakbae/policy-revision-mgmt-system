/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(function () { return ({
    base: "/",
    plugins: [react()],
    test: {
        environment: "jsdom",
        setupFiles: "./vitest.setup.ts",
    },
}); });
