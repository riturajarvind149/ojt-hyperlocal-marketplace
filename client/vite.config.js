import react from "@vitejs/plugin-react";

export default {
  plugins: [react()],
  cacheDir: ".vite-cache",
  server: {
    host: "127.0.0.1",
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true
      }
    }
  }
};
