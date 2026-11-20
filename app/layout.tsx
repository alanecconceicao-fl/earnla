import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Earnla — earnings tracker",
  description: "Track your work, projected earnings, actual payments and taxes locally.",
};

export const viewport: Viewport = { themeColor: "#f8f7fc" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
