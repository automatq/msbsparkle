import { Brand } from "@/components/marketing/site-header";

export default function BookingLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex h-20 w-full max-w-6xl items-center justify-between gap-4 px-6">
        <Brand />
        <span className="hidden text-sm text-muted-foreground sm:block">
          Secure booking · No payment until service is complete
        </span>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 pt-2 pb-16">{children}</main>
    </div>
  );
}
