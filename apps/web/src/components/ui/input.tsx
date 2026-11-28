import * as React from "react";
import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "cn";

// Fields are filled, not outlined (globals.css: --field depends on the surface).
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded-lg bg-field px-3.5 text-base transition-[background-color,box-shadow] placeholder:text-muted-foreground/80 hover:not-focus-visible:not-disabled:inset-ring hover:not-focus-visible:not-disabled:inset-ring-input focus-visible:bg-background focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-[-2px] focus-visible:outline-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:inset-ring-2 aria-invalid:inset-ring-destructive md:text-sm file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
