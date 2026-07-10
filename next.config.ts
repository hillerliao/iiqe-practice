import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    // /studynotes/<slug> 已不再用,改為靜態 serve /handbook/<slug>.html。
    // 308 (Permanent) 保證 bookmark / 外鏈不失效。
    return [
      {
        source: "/studynotes/:slug",
        destination: "/handbook/:slug.html",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
