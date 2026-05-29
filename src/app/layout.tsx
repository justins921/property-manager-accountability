import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vacancy Accountability",
  description:
    "Track every vacancy from move-out to move-in. Document every promise, measure every delay, and calculate every dollar lost to vacancy.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
