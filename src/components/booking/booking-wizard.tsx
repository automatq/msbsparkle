"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  areaRequestAction,
  availabilityAction,
  confirmBookingAction,
  lookupPostalAction,
  prepareCheckoutAction,
  quoteAction,
  type RegionLookupResult,
} from "@/modules/bookings/actions";
import type { QuoteRequest } from "@/modules/pricing/schemas";
import type { QuoteResult } from "@/modules/pricing/types";
import type { DayAvailability } from "@/modules/scheduling/availability";
import { CardStep } from "./card-step";
import { QuoteSummary } from "./quote-summary";

export type ServiceOption = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  pricingModel: "FLAT" | "HOURLY";
  isUpgrade: boolean;
};
export type ExtraOption = {
  id: string;
  slug: string;
  name: string;
  unit: "FIXED" | "PER_UNIT";
  maxQty: number;
};

type Region = Extract<RegionLookupResult, { ok: true }>["region"];

const STEPS = [
  "Location",
  "Service",
  "Home",
  "Extras",
  "Frequency",
  "Date",
  "Details",
  "Payment",
] as const;
type Step = (typeof STEPS)[number];

const FREQUENCIES: { value: QuoteRequest["frequency"]; label: string; hint: string }[] = [
  { value: "ONE_TIME", label: "One-time", hint: "Standard rate" },
  { value: "WEEKLY", label: "Weekly", hint: "Save 20%" },
  { value: "BIWEEKLY", label: "Every 2 weeks", hint: "Save 15%" },
  { value: "EVERY_4_WEEKS", label: "Every 4 weeks", hint: "Save 10%" },
];

export type WizardInitial = Partial<
  Pick<QuoteRequest, "postalCode" | "serviceSlug" | "bedrooms" | "bathrooms" | "frequency">
>;

export function BookingWizard({
  services,
  extras,
  initial,
}: {
  services: ServiceOption[];
  extras: ExtraOption[];
  initial?: WizardInitial;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("Location");
  const [postal, setPostal] = useState(initial?.postalCode ?? "");
  const [region, setRegion] = useState<Region | null>(null);
  const [outOfArea, setOutOfArea] = useState<{ fsa: string } | null>(null);
  const [serviceSlug, setServiceSlug] = useState(initial?.serviceSlug ?? "standard");
  const [bedrooms, setBedrooms] = useState(initial?.bedrooms ?? 2);
  const [bathrooms, setBathrooms] = useState(initial?.bathrooms ?? 1);
  const [sqft, setSqft] = useState<number | null>(null);
  const [hours, setHours] = useState(3);
  const [cleaners, setCleaners] = useState(1);
  const [selectedExtras, setSelectedExtras] = useState<Record<string, number>>({});
  const [frequency, setFrequency] = useState<QuoteRequest["frequency"]>(
    initial?.frequency ?? "ONE_TIME",
  );
  const [upgrade, setUpgrade] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState("");
  const [availability, setAvailability] = useState<DayAvailability[] | null>(null);
  const [scheduledDate, setScheduledDate] = useState<string | null>(null);
  const [windowId, setWindowId] = useState<string | null>(null);
  const [contact, setContact] = useState({ firstName: "", lastName: "", email: "", phone: "" });
  const [address, setAddress] = useState({
    line1: "",
    line2: "",
    city: "",
    postalCode: "",
    entryInstructions: "",
    parkingInstructions: "",
  });
  const [customerNotes, setCustomerNotes] = useState("");
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [quote, setQuote] = useState<{ quoteId: string; quote: QuoteResult } | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [checkout, setCheckout] = useState<{
    customerId: string;
    clientSecret: string | null;
    stripeConfigured: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const service = useMemo(
    () => services.find((s) => s.slug === serviceSlug) ?? services[0],
    [services, serviceSlug],
  );
  const upgradeOptions = useMemo(
    () => services.filter((s) => s.isUpgrade && s.slug !== serviceSlug),
    [services, serviceSlug],
  );
  const stepIndex = STEPS.indexOf(step);

  const quoteRequest: QuoteRequest | null = useMemo(() => {
    if (!region) return null;
    return {
      postalCode: postal,
      serviceSlug,
      bedrooms,
      bathrooms,
      sqft,
      extras: Object.entries(selectedExtras)
        .filter(([, q]) => q > 0)
        .map(([slug, qty]) => ({ slug, qty })),
      hourly: service?.pricingModel === "HOURLY" ? { hours, cleaners } : null,
      frequency,
      firstCleanUpgradeSlug: service?.pricingModel === "FLAT" ? upgrade : null,
      promoCode: promoCode || null,
      serviceDate: scheduledDate ?? undefined,
    };
  }, [
    region,
    postal,
    serviceSlug,
    bedrooms,
    bathrooms,
    sqft,
    selectedExtras,
    service,
    hours,
    cleaners,
    frequency,
    upgrade,
    promoCode,
    scheduledDate,
  ]);

  // Re-quote (debounced) whenever inputs change past the location step.
  const quoteKey = JSON.stringify(quoteRequest);
  const latest = useRef(0);
  useEffect(() => {
    if (!quoteRequest || stepIndex < 1) return;
    const id = ++latest.current;
    const t = setTimeout(async () => {
      setQuoteLoading(true);
      const res = await quoteAction(quoteRequest);
      if (id !== latest.current) return;
      setQuoteLoading(false);
      if (res.ok) setQuote({ quoteId: res.data.quoteId, quote: res.data.quote });
      else if (res.error.code === "INVALID_PROMO") toast.error(res.error.message);
      else toast.error(res.error.message);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteKey, stepIndex]);

  const go = useCallback((s: Step) => {
    setStep(s);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  async function submitPostal(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await lookupPostalAction(postal);
    setBusy(false);
    if (res.ok) {
      setRegion(res.region);
      setOutOfArea(null);
      setAddress((a) => ({
        ...a,
        postalCode: res.postalCode ?? a.postalCode,
        city: a.city || res.region.name,
      }));
      go("Service");
    } else if (res.code === "OUT_OF_AREA") {
      setOutOfArea({ fsa: res.fsa ?? "" });
    } else {
      toast.error("Please enter a valid Canadian postal code.");
    }
  }

  async function enterDateStep() {
    if (!region) return;
    setAvailability(null);
    go("Date");
    const res = await availabilityAction(region.id, 21);
    setAvailability(res.days);
  }

  async function submitDetails(e: React.FormEvent) {
    e.preventDefault();
    if (!region) return;
    setBusy(true);
    const res = await prepareCheckoutAction(region.id, contact);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    setCheckout(res);
    go("Payment");
  }

  async function confirm(setupIntentId: string | null) {
    if (!region || !quote || !quoteRequest || !scheduledDate || !windowId || !checkout) return;
    setBusy(true);
    const res = await confirmBookingAction({
      quoteId: quote.quoteId,
      quoteRequest,
      scheduledDate,
      windowId,
      contact,
      address,
      customerNotes,
      setupIntentId,
      customerId: checkout.customerId,
      marketingConsent,
    });
    setBusy(false);
    if (res.ok) {
      router.push(`/book/confirmation/${res.bookingNumber}`);
      return;
    }
    toast.error(res.message);
    if (res.code === "SLOT_FULL" || res.code === "SLOT_CLOSED") enterDateStep();
    if (res.code === "QUOTE_STALE" || res.code === "QUOTE_NOT_FOUND") go("Frequency");
  }

  const selectedDay = availability?.find((d) => d.date === scheduledDate);
  const selectedWindow = selectedDay?.windows.find((w) => w.windowId === windowId);

  return (
    <div className="grid gap-8 md:grid-cols-[1fr_320px]">
      <div>
        <ol className="mb-6 flex flex-wrap gap-2 text-xs">
          {STEPS.map((s, i) => (
            <li
              key={s}
              className={`rounded-full px-2.5 py-1 ${i === stepIndex ? "bg-primary text-primary-foreground" : i < stepIndex ? "bg-muted" : "text-muted-foreground"}`}
            >
              {i + 1}. {s}
            </li>
          ))}
        </ol>

        {step === "Location" && (
          <form onSubmit={submitPostal} className="space-y-4">
            <h1 className="text-2xl font-semibold">Where do you need cleaning?</h1>
            <div className="space-y-2">
              <Label htmlFor="postal">Postal code</Label>
              <Input
                id="postal"
                value={postal}
                onChange={(e) => setPostal(e.target.value)}
                placeholder="M5V 2T6"
                required
                autoFocus
                className="max-w-xs uppercase"
              />
            </div>
            {outOfArea ? <OutOfArea fsa={outOfArea.fsa} postal={postal} /> : null}
            <Button type="submit" disabled={busy}>
              {busy ? "Checking…" : "Continue"}
            </Button>
          </form>
        )}

        {step === "Service" && region && (
          <div className="space-y-4">
            <h1 className="text-2xl font-semibold">What kind of cleaning?</h1>
            <p className="text-sm text-muted-foreground">
              Serving {region.name}, {region.province}.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {services.map((s) => (
                <button
                  key={s.slug}
                  type="button"
                  onClick={() => {
                    setServiceSlug(s.slug);
                    if (s.isUpgrade) setUpgrade(null);
                  }}
                  className={`rounded-xl border p-4 text-left transition ${serviceSlug === s.slug ? "border-primary ring-2 ring-primary/30" : "hover:bg-muted/40"}`}
                  data-testid={`service-${s.slug}`}
                >
                  <p className="font-medium">{s.name}</p>
                  <p className="text-xs text-muted-foreground">{s.description}</p>
                </button>
              ))}
            </div>
            <Nav onBack={() => go("Location")} onNext={() => go("Home")} />
          </div>
        )}

        {step === "Home" && (
          <div className="space-y-6">
            <h1 className="text-2xl font-semibold">Tell us about your home</h1>
            {service?.pricingModel === "HOURLY" ? (
              <div className="grid max-w-md gap-4 sm:grid-cols-2">
                <Counter
                  label="Hours"
                  value={hours}
                  min={3}
                  max={12}
                  onChange={setHours}
                  step={0.5}
                />
                <Counter label="Cleaners" value={cleaners} min={1} max={4} onChange={setCleaners} />
              </div>
            ) : (
              <div className="grid max-w-md gap-4 sm:grid-cols-2">
                <Counter
                  label="Bedrooms"
                  value={bedrooms}
                  min={0}
                  max={8}
                  onChange={setBedrooms}
                  testId="bedrooms"
                />
                <Counter
                  label="Bathrooms"
                  value={bathrooms}
                  min={1}
                  max={8}
                  step={0.5}
                  onChange={setBathrooms}
                  testId="bathrooms"
                />
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="sqft">Approximate square footage (optional)</Label>
                  <select
                    id="sqft"
                    className="h-9 w-full rounded-lg border bg-background px-2 text-sm"
                    value={sqft ?? ""}
                    onChange={(e) => setSqft(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">Not sure</option>
                    <option value="800">Under 1,000</option>
                    <option value="1200">1,000 – 1,499</option>
                    <option value="1700">1,500 – 1,999</option>
                    <option value="2500">2,000 – 2,999</option>
                    <option value="3500">3,000 – 3,999</option>
                    <option value="4500">4,000+</option>
                  </select>
                </div>
              </div>
            )}
            <Nav onBack={() => go("Service")} onNext={() => go("Extras")} />
          </div>
        )}

        {step === "Extras" && (
          <div className="space-y-4">
            <h1 className="text-2xl font-semibold">Any extras?</h1>
            <div className="grid gap-2 sm:grid-cols-2">
              {extras.map((x) => {
                const qty = selectedExtras[x.slug] ?? 0;
                return (
                  <div
                    key={x.slug}
                    className={`flex items-center justify-between rounded-xl border p-3 ${qty > 0 ? "border-primary" : ""}`}
                  >
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={qty > 0}
                        onChange={(e) =>
                          setSelectedExtras((s) => ({ ...s, [x.slug]: e.target.checked ? 1 : 0 }))
                        }
                        data-testid={`extra-${x.slug}`}
                      />
                      {x.name}
                    </label>
                    {x.unit === "PER_UNIT" && qty > 0 ? (
                      <input
                        type="number"
                        min={1}
                        max={x.maxQty}
                        value={qty}
                        onChange={(e) =>
                          setSelectedExtras((s) => ({
                            ...s,
                            [x.slug]: Math.min(x.maxQty, Math.max(1, Number(e.target.value))),
                          }))
                        }
                        className="h-8 w-16 rounded border px-2 text-sm"
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
            <Nav onBack={() => go("Home")} onNext={() => go("Frequency")} />
          </div>
        )}

        {step === "Frequency" && (
          <div className="space-y-6">
            <h1 className="text-2xl font-semibold">How often?</h1>
            <div className="grid gap-3 sm:grid-cols-2">
              {FREQUENCIES.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setFrequency(f.value)}
                  className={`rounded-xl border p-4 text-left ${frequency === f.value ? "border-primary ring-2 ring-primary/30" : "hover:bg-muted/40"}`}
                  data-testid={`frequency-${f.value}`}
                >
                  <p className="font-medium">{f.label}</p>
                  <p className="text-xs text-muted-foreground">{f.hint}</p>
                </button>
              ))}
            </div>
            {service?.pricingModel === "FLAT" && upgradeOptions.length ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">Upgrade your first clean</p>
                <div className="flex flex-wrap gap-2">
                  <Chip active={upgrade === null} onClick={() => setUpgrade(null)}>
                    No upgrade
                  </Chip>
                  {upgradeOptions.map((u) => (
                    <Chip
                      key={u.slug}
                      active={upgrade === u.slug}
                      onClick={() => setUpgrade(u.slug)}
                    >
                      {u.name}
                    </Chip>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="max-w-xs space-y-2">
              <Label htmlFor="promo">Promo code</Label>
              <Input
                id="promo"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                placeholder="Optional"
              />
            </div>
            <Nav onBack={() => go("Extras")} onNext={enterDateStep} />
          </div>
        )}

        {step === "Date" && (
          <div className="space-y-4">
            <h1 className="text-2xl font-semibold">Pick a date and arrival window</h1>
            {!availability ? (
              <p className="text-sm text-muted-foreground">Loading availability…</p>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {availability.map((d) => {
                    const anyOpen = d.windows.some((w) => w.open);
                    return (
                      <button
                        key={d.date}
                        type="button"
                        disabled={!anyOpen}
                        onClick={() => {
                          setScheduledDate(d.date);
                          setWindowId(null);
                        }}
                        className={`rounded-lg border px-3 py-2 text-sm disabled:opacity-40 ${scheduledDate === d.date ? "border-primary ring-2 ring-primary/30" : ""}`}
                        data-testid={`date-${d.date}`}
                      >
                        {formatDay(d.date)}
                      </button>
                    );
                  })}
                </div>
                {selectedDay ? (
                  <div className="flex flex-wrap gap-2">
                    {selectedDay.windows.map((w) => (
                      <button
                        key={w.windowId}
                        type="button"
                        disabled={!w.open}
                        onClick={() => setWindowId(w.windowId)}
                        className={`rounded-lg border px-3 py-2 text-sm disabled:opacity-40 ${windowId === w.windowId ? "border-primary ring-2 ring-primary/30" : ""}`}
                        data-testid={`window-${w.startLocal}`}
                      >
                        {w.label}
                        {w.open && w.remaining <= 1 ? (
                          <span className="ml-1 text-xs text-amber-700">last spot</span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
            <Nav
              onBack={() => go("Frequency")}
              onNext={() => go("Details")}
              nextDisabled={!scheduledDate || !windowId}
            />
          </div>
        )}

        {step === "Details" && (
          <form onSubmit={submitDetails} className="space-y-6">
            <h1 className="text-2xl font-semibold">Your details</h1>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="First name"
                id="firstName"
                value={contact.firstName}
                onChange={(v) => setContact({ ...contact, firstName: v })}
                required
                autoComplete="given-name"
              />
              <Field
                label="Last name"
                id="lastName"
                value={contact.lastName}
                onChange={(v) => setContact({ ...contact, lastName: v })}
                required
                autoComplete="family-name"
              />
              <Field
                label="Email"
                id="email"
                type="email"
                value={contact.email}
                onChange={(v) => setContact({ ...contact, email: v })}
                required
                autoComplete="email"
              />
              <Field
                label="Phone"
                id="phone"
                type="tel"
                value={contact.phone}
                onChange={(v) => setContact({ ...contact, phone: v })}
                required
                autoComplete="tel"
              />
            </div>
            <h2 className="font-medium">Address</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Street address"
                id="line1"
                value={address.line1}
                onChange={(v) => setAddress({ ...address, line1: v })}
                required
                autoComplete="address-line1"
                className="sm:col-span-2"
              />
              <Field
                label="Unit / apt"
                id="line2"
                value={address.line2}
                onChange={(v) => setAddress({ ...address, line2: v })}
                autoComplete="address-line2"
              />
              <Field
                label="City"
                id="city"
                value={address.city}
                onChange={(v) => setAddress({ ...address, city: v })}
                required
                autoComplete="address-level2"
              />
              <Field
                label="Postal code"
                id="postalCode"
                value={address.postalCode}
                onChange={(v) => setAddress({ ...address, postalCode: v.toUpperCase() })}
                required
                autoComplete="postal-code"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="entry">How do we get in?</Label>
                <Textarea
                  id="entry"
                  value={address.entryInstructions}
                  onChange={(e) => setAddress({ ...address, entryInstructions: e.target.value })}
                  placeholder="Lockbox, concierge, you'll be home…"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="parking">Parking</Label>
                <Textarea
                  id="parking"
                  value={address.parkingInstructions}
                  onChange={(e) => setAddress({ ...address, parkingInstructions: e.target.value })}
                  placeholder="Visitor parking, street, none…"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Anything else?</Label>
              <Textarea
                id="notes"
                value={customerNotes}
                onChange={(e) => setCustomerNotes(e.target.value)}
                placeholder="Pets, focus areas, allergies…"
              />
            </div>
            <label className="flex items-start gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={marketingConsent}
                onChange={(e) => setMarketingConsent(e.target.checked)}
                className="mt-0.5"
              />
              Send me occasional offers by email. You can unsubscribe any time. Booking updates are
              always sent.
            </label>
            <Nav
              onBack={() => go("Date")}
              submit
              nextLabel={busy ? "Saving…" : "Continue to payment"}
              nextDisabled={busy}
            />
          </form>
        )}

        {step === "Payment" && checkout && (
          <div className="space-y-6">
            <h1 className="text-2xl font-semibold">Payment</h1>
            <div className="rounded-xl border bg-muted/30 p-4 text-sm">
              <p className="font-medium">
                {service?.name} · {scheduledDate ? formatDay(scheduledDate) : ""} ·{" "}
                {selectedWindow?.label}
              </p>
              <p className="text-muted-foreground">
                {address.line1}
                {address.line2 ? `, ${address.line2}` : ""}, {address.city} {address.postalCode}
              </p>
            </div>
            {checkout.stripeConfigured && checkout.clientSecret ? (
              <CardStep
                clientSecret={checkout.clientSecret}
                onConfirmed={(id) => confirm(id)}
                onBack={() => go("Details")}
              />
            ) : (
              <div className="space-y-4">
                <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                  Payments are not configured in this environment. Your booking will be created
                  without a card on file.
                </p>
                <Nav
                  onBack={() => go("Details")}
                  onNext={() => confirm(null)}
                  nextLabel={busy ? "Booking…" : "Confirm booking"}
                  nextDisabled={busy}
                />
              </div>
            )}
          </div>
        )}
      </div>

      <aside className="md:sticky md:top-6 md:self-start">
        <QuoteSummary
          quote={quote?.quote ?? null}
          loading={quoteLoading}
          serviceName={stepIndex >= 1 ? service?.name : undefined}
          labels={Object.fromEntries(extras.map((x) => [x.slug, x.name]))}
        />
        {region ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Prices include tax for {region.province}.{" "}
            {region.phone ? `Questions? ${region.phone}` : ""}
          </p>
        ) : null}
      </aside>
    </div>
  );
}

function OutOfArea({ fsa, postal }: { fsa: string; postal: string }) {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">
      <p className="font-medium">We&apos;re not in {fsa} yet.</p>
      {done ? (
        <p className="mt-1 text-muted-foreground">
          Thanks, we&apos;ll let you know when we launch near you.
        </p>
      ) : (
        <div className="mt-2 flex gap-2">
          <Input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="max-w-xs bg-background"
          />
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              const res = await areaRequestAction({ email, postalCode: postal });
              if (res.ok) setDone(true);
              else toast.error("Please enter a valid email.");
            }}
          >
            Notify me
          </Button>
        </div>
      )}
    </div>
  );
}

function Nav({
  onBack,
  onNext,
  nextDisabled,
  nextLabel = "Continue",
  submit,
}: {
  onBack?: () => void;
  onNext?: () => void;
  nextDisabled?: boolean;
  nextLabel?: string;
  submit?: boolean;
}) {
  return (
    <div className="flex justify-between pt-2">
      {onBack ? (
        <Button type="button" variant="outline" onClick={onBack}>
          Back
        </Button>
      ) : (
        <span />
      )}
      <Button
        type={submit ? "submit" : "button"}
        onClick={submit ? undefined : onNext}
        disabled={nextDisabled}
        data-testid="next"
      >
        {nextLabel}
      </Button>
    </div>
  );
}

function Counter({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  testId,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  testId?: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => onChange(Math.max(min, value - step))}
          aria-label={`Fewer ${label}`}
        >
          −
        </Button>
        <span className="w-10 text-center text-sm font-medium" data-testid={testId}>
          {value}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => onChange(Math.min(max, value + step))}
          aria-label={`More ${label}`}
        >
          +
        </Button>
      </div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-sm ${active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted/40"}`}
    >
      {children}
    </button>
  );
}

function Field({
  label,
  id,
  value,
  onChange,
  type = "text",
  required,
  autoComplete,
  className,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  className?: string;
}) {
  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        autoComplete={autoComplete}
      />
    </div>
  );
}

function formatDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
