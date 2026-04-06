/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(function () { return ({
    base: process.env.GITHUB_ACTIONS ? "/policy-revision-mgmt-system/" : "/",
    plugins: [react()],
    test: {
        environment: "jsdom",
        setupFiles: "./vitest.setup.ts",
    },
}); });
