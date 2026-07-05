import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "收藏",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
