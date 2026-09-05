// vitest.config.ts
import { defineConfig } from "file:///sessions/rcw-01r4n4yroykgqivc4mrsu4bu/mnt/Minimal%20Viable%20Product/den-of-wolves-new-eden-console/node_modules/vitest/dist/config.js";
import react from "file:///sessions/rcw-01r4n4yroykgqivc4mrsu4bu/mnt/Minimal%20Viable%20Product/den-of-wolves-new-eden-console/node_modules/@vitejs/plugin-react/dist/index.js";
import { fileURLToPath, URL } from "node:url";
var __vite_injected_original_import_meta_url = "file:///sessions/rcw-01r4n4yroykgqivc4mrsu4bu/mnt/Minimal%20Viable%20Product/den-of-wolves-new-eden-console/vitest.config.ts";
var vitest_config_default = defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", __vite_injected_original_import_meta_url)) }
  },
  test: {
    globals: true,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "jsdom",
          include: ["src/**/*.test.{ts,tsx}"],
          setupFiles: ["./src/test/setup.ts"]
        }
      },
      {
        extends: true,
        test: {
          name: "rules",
          environment: "node",
          include: ["tests/rules/**/*.test.ts"],
          testTimeout: 2e4
        }
      }
    ]
  }
});
export {
  vitest_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZXN0LmNvbmZpZy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiY29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2Rpcm5hbWUgPSBcIi9zZXNzaW9ucy9yY3ctMDFyNG40eXJveWtncWl2YzRtcnN1NGJ1L21udC9NaW5pbWFsIFZpYWJsZSBQcm9kdWN0L2Rlbi1vZi13b2x2ZXMtbmV3LWVkZW4tY29uc29sZVwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL3Nlc3Npb25zL3Jjdy0wMXI0bjR5cm95a2dxaXZjNG1yc3U0YnUvbW50L01pbmltYWwgVmlhYmxlIFByb2R1Y3QvZGVuLW9mLXdvbHZlcy1uZXctZWRlbi1jb25zb2xlL3ZpdGVzdC5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL3Nlc3Npb25zL3Jjdy0wMXI0bjR5cm95a2dxaXZjNG1yc3U0YnUvbW50L01pbmltYWwlMjBWaWFibGUlMjBQcm9kdWN0L2Rlbi1vZi13b2x2ZXMtbmV3LWVkZW4tY29uc29sZS92aXRlc3QuY29uZmlnLnRzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZXN0L2NvbmZpZyc7XG5pbXBvcnQgcmVhY3QgZnJvbSAnQHZpdGVqcy9wbHVnaW4tcmVhY3QnO1xuaW1wb3J0IHsgZmlsZVVSTFRvUGF0aCwgVVJMIH0gZnJvbSAnbm9kZTp1cmwnO1xuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xuICBwbHVnaW5zOiBbcmVhY3QoKV0sXG4gIHJlc29sdmU6IHtcbiAgICBhbGlhczogeyAnQCc6IGZpbGVVUkxUb1BhdGgobmV3IFVSTCgnLi9zcmMnLCBpbXBvcnQubWV0YS51cmwpKSB9LFxuICB9LFxuICB0ZXN0OiB7XG4gICAgZ2xvYmFsczogdHJ1ZSxcbiAgICBwcm9qZWN0czogW1xuICAgICAge1xuICAgICAgICBleHRlbmRzOiB0cnVlLFxuICAgICAgICB0ZXN0OiB7XG4gICAgICAgICAgbmFtZTogJ3VuaXQnLFxuICAgICAgICAgIGVudmlyb25tZW50OiAnanNkb20nLFxuICAgICAgICAgIGluY2x1ZGU6IFsnc3JjLyoqLyoudGVzdC57dHMsdHN4fSddLFxuICAgICAgICAgIHNldHVwRmlsZXM6IFsnLi9zcmMvdGVzdC9zZXR1cC50cyddLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIHtcbiAgICAgICAgZXh0ZW5kczogdHJ1ZSxcbiAgICAgICAgdGVzdDoge1xuICAgICAgICAgIG5hbWU6ICdydWxlcycsXG4gICAgICAgICAgZW52aXJvbm1lbnQ6ICdub2RlJyxcbiAgICAgICAgICBpbmNsdWRlOiBbJ3Rlc3RzL3J1bGVzLyoqLyoudGVzdC50cyddLFxuICAgICAgICAgIHRlc3RUaW1lb3V0OiAyMF8wMDAsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIF0sXG4gIH0sXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBMGQsU0FBUyxvQkFBb0I7QUFDdmYsT0FBTyxXQUFXO0FBQ2xCLFNBQVMsZUFBZSxXQUFXO0FBRnVRLElBQU0sMkNBQTJDO0FBSTNWLElBQU8sd0JBQVEsYUFBYTtBQUFBLEVBQzFCLFNBQVMsQ0FBQyxNQUFNLENBQUM7QUFBQSxFQUNqQixTQUFTO0FBQUEsSUFDUCxPQUFPLEVBQUUsS0FBSyxjQUFjLElBQUksSUFBSSxTQUFTLHdDQUFlLENBQUMsRUFBRTtBQUFBLEVBQ2pFO0FBQUEsRUFDQSxNQUFNO0FBQUEsSUFDSixTQUFTO0FBQUEsSUFDVCxVQUFVO0FBQUEsTUFDUjtBQUFBLFFBQ0UsU0FBUztBQUFBLFFBQ1QsTUFBTTtBQUFBLFVBQ0osTUFBTTtBQUFBLFVBQ04sYUFBYTtBQUFBLFVBQ2IsU0FBUyxDQUFDLHdCQUF3QjtBQUFBLFVBQ2xDLFlBQVksQ0FBQyxxQkFBcUI7QUFBQSxRQUNwQztBQUFBLE1BQ0Y7QUFBQSxNQUNBO0FBQUEsUUFDRSxTQUFTO0FBQUEsUUFDVCxNQUFNO0FBQUEsVUFDSixNQUFNO0FBQUEsVUFDTixhQUFhO0FBQUEsVUFDYixTQUFTLENBQUMsMEJBQTBCO0FBQUEsVUFDcEMsYUFBYTtBQUFBLFFBQ2Y7QUFBQSxNQUNGO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
