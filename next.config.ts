import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 明确的 Turbopack 根目录，避免 Next.js 推断到 D:\Downloads
  turbopack: {
    root: process.cwd(),
  },

  // 不使用重定向，动态路由 /studynotes/:slug 直接渲染 React 页面（支持 TOC 联动）
  redirects() {
    return [];
  },
};

export default nextConfig;
