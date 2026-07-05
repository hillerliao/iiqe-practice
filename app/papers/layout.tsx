import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "試卷",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
