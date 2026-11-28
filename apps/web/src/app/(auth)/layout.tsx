import { HomesBoard } from "@/components/marketing/homes-board";
import { Brand } from "@/components/marketing/site-header";

/** Signing in: the form on the left, a week of homes on the right. */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col px-6 py-8 sm:px-14">
        <Brand />
        <div className="flex flex-1 items-center py-12">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </div>
      <div className="hidden bg-well p-3 lg:flex lg:flex-col lg:justify-center">
        <HomesBoard />
      </div>
    </div>
  );
}
