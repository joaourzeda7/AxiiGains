// Gera as splash screens do iOS a partir de public/splash-logo.svg
// Uso: npm run icons
import { defineConfig, createAppleSplashScreens } from "@vite-pwa/assets-generator/config";

export default defineConfig({
  headLinkOptions: { preset: "2023" },
  preset: {
    transparent: { sizes: [], favicons: [] },
    maskable: { sizes: [] },
    apple: { sizes: [] },
    appleSplashScreens: createAppleSplashScreens({
      padding: 0.55,
      resizeOptions: { background: "#0B0616", fit: "contain" },
      linkMediaOptions: { log: true, addMediaScreen: true, basePath: "/", xhtml: false },
      png: { compressionLevel: 9, quality: 70 },
      name: (landscape, size) =>
        `splash/apple-splash-${landscape ? "landscape" : "portrait"}-${size.width}x${size.height}.png`,
    }),
  },
  images: ["public/splash-logo.svg"],
});
