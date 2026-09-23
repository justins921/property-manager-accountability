import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Property Management · Accountability built in",
  description:
    "Property management software with a two-way scorecard: tenants, leases, rent, vacancies and inspections, plus a clear record of whether managers and owners are each doing their part.",
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
