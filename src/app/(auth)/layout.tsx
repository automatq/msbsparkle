export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-sm rounded-xl border bg-background p-6 shadow-sm">
        {children}
      </div>
    </div>
  );
}
