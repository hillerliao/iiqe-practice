import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "錯題本",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
