import { cn } from "cn";

/** Questions and their answers, a hairline between each: the question on the left. */
export function QuestionList({
  items,
  className,
}: {
  items: { q: string; a: string }[];
  className?: string;
}) {
  return (
    <dl className={cn("border-t border-foreground", className)}>
      {items.map((f) => (
        <div key={f.q} className="grid gap-2 border-b py-6 md:grid-cols-[1fr_1.3fr] md:gap-10">
          <dt className="wide text-lg font-semibold">{f.q}</dt>
          <dd className="text-muted-foreground md:text-lg">{f.a}</dd>
        </div>
      ))}
    </dl>
  );
}
