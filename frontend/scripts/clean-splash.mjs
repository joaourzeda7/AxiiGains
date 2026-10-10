// O app é só na vertical: apaga as splash screens em paisagem geradas pelo pwa-assets-generator
import { readdirSync, rmSync } from "node:fs";

for (const file of readdirSync("public/splash")) {
  if (file.includes("landscape")) rmSync(`public/splash/${file}`);
}
