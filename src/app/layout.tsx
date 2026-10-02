import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { AppSidebar } from "@/components/shell/app-sidebar";
import { MobileNav } from "@/components/shell/mobile-nav";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { ACCENT_BOOT_SCRIPT } from "@/config/themes";
import { TooltipProvider } from "@/components/ui/tooltip";
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
  title: {
    default: "Rakesh QA Hub",
    template: "%s · Rakesh QA Hub",
  },
  description:
    "QA toolkit: CI reports, bug tracking, time tracking, PR QA session prompts, AI PR review flags, test plan library and bug formatting.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      data-accent="aurora"
      suppressHydrationWarning
    >
      <head>
        {/* Applies the saved colour theme before first paint (static script, no user input). */}
        <script dangerouslySetInnerHTML={{ __html: ACCENT_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <ThemeProvider>
          <TooltipProvider delayDuration={200}>
            <div className="flex min-h-screen">
              <AppSidebar />
              <div className="flex min-w-0 flex-1 flex-col">
                <MobileNav />
                <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
                  {children}
                </main>
              </div>
            </div>
            <Toaster richColors closeButton />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
