/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack(config, { isServer }) {
    if (isServer) {
      // ONNX Runtime's browser-only entry points are loaded by scan actions.
      config.resolve.alias["onnxruntime-web/webgpu$"] = false;
      config.resolve.alias["onnxruntime-web/wasm$"] = false;
    }
    return config;
  },
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
        port: "8000",
        pathname: "/uploads/**",
      },
    ],
  },
};

module.exports = nextConfig;