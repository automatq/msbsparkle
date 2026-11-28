import type { ReactNode } from "react";
import { cn } from "cn";

/** The top of a public page: a big wide title and, under it, one line that says what's here. */
export function PageIntro({
  title,
  children,
  className,
}: {
  title: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("pt-6", className)}>
      <h1 className="text-5xl font-semibold sm:text-6xl">{title}</h1>
      {children ? <p className="mt-4 max-w-xl text-lg text-muted-foreground">{children}</p> : null}
    </div>
  );
}
