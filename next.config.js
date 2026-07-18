/** @type {import('next').NextConfig} */
module.exports = {
  experimental: {
    serverActions: { bodySizeLimit: "20mb" },
  },
  async headers() {
    return [
      {
        // Editor plugins are served by the portal but fetched by the Document Server's
        // page, which is a different origin — without these headers the editor drops the
        // plugin silently, with nothing in the console to explain why.
        source: "/plugins/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "*" },
        ],
      },
    ];
  },
};
