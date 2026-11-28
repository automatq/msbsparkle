import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "cn";

/** The browser's own select, filled like the other fields, with a chevron of ours. */
function NativeSelect({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <div className={cn("relative w-full", className)}>
      <select
        data-slot="native-select"
        className="h-11 w-full cursor-pointer appearance-none truncate rounded-lg bg-field pr-10 pl-3.5 text-base transition-[background-color,box-shadow] hover:inset-ring hover:inset-ring-input focus-visible:bg-background focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-[-2px] focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}

export { NativeSelect };
