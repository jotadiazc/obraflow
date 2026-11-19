import vinext from "vinext";
import { defineConfig } from "vite";

const cloudflareConfig = {
  main: "./worker/index.ts",
  compatibility_date: "2026-11-18",
  compatibility_flags: ["nodejs_compat"],
  r2_buckets: [{ binding: "BUCKET", bucket_name: "obraflow-photos" }],
};

export default defineConfig(async () => {
  const { cloudflare } = await import("@cloudflare/vite-plugin");
  return {
    plugins: [
      vinext(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
        config: cloudflareConfig,
      }),
    ],
  };
});
