import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Allow Tauri env vars in client code
  envPrefix: ['VITE_', 'TAURI_'],
  // Don't clear terminal so Tauri CLI output stays visible
  clearScreen: false,
  esbuild: {
    loader: 'jsx',
    include: /src\/.*\.jsx?$/,
    exclude: [],
  },
  optimizeDeps: {
    esbuild: {
      loader: {
        '.js': 'jsx',
      },
    },
  },
  server: {
    port: 4200,
    // Ensure the port doesn't shift when running under Tauri
    strictPort: true,
    host: true,
  },
  preview: {
    port: 4200,
  },
})
