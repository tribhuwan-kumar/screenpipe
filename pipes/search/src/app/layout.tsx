import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { HistorySidebar } from "@/components/history-sidebar"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});


export const metadata: Metadata = {
  title: "Search • Screenpipe",
  description: "Search your screenpipe recordings",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased relative`}
      >
        <SidebarProvider className="absolute" defaultOpen={true}>
          <HistorySidebar className={"relative"} />
          <SidebarTrigger className="ml-[15px] mt-[-30px] sticky top-5"/>
        </SidebarProvider>
        {children}

        <Toaster />
      </body>
    </html>
  );
}
