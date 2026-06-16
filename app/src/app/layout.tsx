import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Veil Protocol — Private Payments on Stellar",
  description:
    "Shielded stablecoin transfers using ZK proofs on Soroban. Deposit, withdraw privately, and maintain compliance with timelocked viewing keys.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        {children}
      </body>
    </html>
  );
}
