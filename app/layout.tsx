import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Local Citation Finder | Find and Manage Local Citations Easily",
  description:
    "Discover, manage, and optimize your local business citations for better local SEO. Upload, geocode, and write citations with ease.",
  keywords: [
    "local citation",
    "local SEO",
    "business directory",
    "citation management",
    "geocode",
    "upload citations",
    "SEO tools",
  ],
  openGraph: {
    title: "Local Citation Finder | Find and Manage Local Citations Easily",
    description:
      "Discover, manage, and optimize your local business citations for better local SEO. Upload, geocode, and write citations with ease.",
    url: "https://yourdomain.com/",
    siteName: "Local Citation Finder",
    images: [
      {
        url: "/globe.svg",
        width: 1200,
        height: 630,
        alt: "Local Citation Finder Logo",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Local Citation Finder | Find and Manage Local Citations Easily",
    description:
      "Discover, manage, and optimize your local business citations for better local SEO.",
    images: ["/globe.svg"],
  },
  metadataBase: new URL("https://yourdomain.com"),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" dir="ltr">
      <head>
        <link rel="canonical" href="https://yourdomain.com/" />
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
