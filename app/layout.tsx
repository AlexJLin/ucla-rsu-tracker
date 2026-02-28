import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "UCLA RSU Availability Tracker",
  description:
    "Track bed space availability during UCLA Housing Room Sign Up (RSU). Filter by building, room type, and gender. View fill-rate trends.",
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
