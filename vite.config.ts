import { existsSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * เพลงตอนเปิดระบบเป็นไฟล์ในเครื่องเท่านั้น (public/audio/ ไม่ถูกเก็บใน git เพราะยังไม่รู้ที่มาและลิขสิทธิ์)
 * ไม่มีไฟล์ = ไม่เปิดเพลงและไม่ขอไฟล์นั้นเลย จึงไม่มีข้อผิดพลาด 404 บนเว็บที่ deploy
 */
const bootMusicAvailable = existsSync("public/audio/boot-music.mp3");

export default defineConfig({
  plugins: [react()],
  define: {
    __BOOT_MUSIC__: JSON.stringify(bootMusicAvailable)
  },
  build: {
    // ฟอนต์ชุดอักษรเล็ก ๆ ห้ามฝังเป็น data: ใน CSS: ทำให้ CSS ที่บล็อกการแสดงผลบวม และ CSP font-src 'self' ไม่ยอมให้โหลด
    assetsInlineLimit: (filePath) => (/\.woff2?$/.test(filePath) ? false : undefined),
    rollupOptions: {
      output: {
        // React แทบไม่เปลี่ยนระหว่างรุ่นของแอป แยกไฟล์ไว้ให้เบราว์เซอร์ใช้แคชเดิมต่อได้หลัง deploy
        manualChunks(id) {
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return "react";
        }
      }
    }
  },
  server: {
    host: "::",
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: false,
        configure(proxy) {
          proxy.on("proxyReq", (proxyReq, req) => {
            if (req.headers.host) proxyReq.setHeader("host", req.headers.host);
          });
        }
      }
    }
  }
});
