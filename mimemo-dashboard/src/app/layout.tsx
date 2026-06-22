import type { Metadata } from "next";
import { Provider } from "../components/provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mimemo",
  description: "AI meeting minutes workspace"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
