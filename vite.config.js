import { defineConfig } from "vite";
// vite.config.js

export default defineConfig({
	build: {
		outDir: "dist",
		assetsDir: "",
		copyPublicDir: true,
		rollupOptions: {
			input: "./src/app.ts",
			output: {
				entryFileNames: `[name].js`,
				chunkFileNames: `[name].js`,
				assetFileNames: `[name].[ext]`,
			},
		},
		watch: {},
		minify: "esbuild", // false
	},
	mode: "production",
});
