"use client";

import { ArrowLeft, ArrowRight, Check, Minus, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { RoomStrip, homeBlocks } from "@/components/marketing/room-strip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
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
import type { QuoteRequest } from "@msb/shared/pricing";
import type { QuoteResult } from "@/modules/pricing/types";
import type { DayAvailability } from "@/modules/scheduling/availability";
import { checkGiftCardAction } from "@/modules/gift-cards/actions";
import { serviceHue } from "@/modules/marketing/hues";
import { formatCents } from "@/modules/shared/money";
import { CardStep } from "./card-step";
import { QuoteSummary } from "./quote-summary";
import { country, locale, subdivisionName } from "@/modules/shared/country";

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
  adminMode = false,
  confirmationBase = "/book/confirmation",
}: {
  services: ServiceOption[];
  extras: ExtraOption[];
  initial?: WizardInitial;
  /** Staff phone orders: no card step, source ADMIN, lands on the admin bookings list. */
  adminMode?: boolean;
  /** Where to go after booking; the embeddable widget stays inside its iframe. */
  confirmationBase?: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("Location");
  const [postal, setPostal] = useState(initial?.postalCode ?? "");
  const [region, setRegion] = useState<Region | null>(null);
  const [outOfArea, setOutOfArea] = useState<{ area: string } | null>(null);
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
  const [giftCardCode, setGiftCardCode] = useState("");
  const [giftBalance, setGiftBalance] = useState<number | null>(null);
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

  // Re-quote (debounced) whenever pricing inputs change. Depends on the inputs only, so
  // navigating between steps never cancels an in-flight quote.
  const quoteKey = JSON.stringify(quoteRequest);
  const latest = useRef(0);
  const fetchQuote = useCallback(async (req: QuoteRequest) => {
    const id = ++latest.current;
    setQuoteLoading(true);
    const res = await quoteAction(req);
    if (id !== latest.current) return null;
    setQuoteLoading(false);
    if (res.ok) {
      const next = { quoteId: res.data.quoteId, quote: res.data.quote };
      setQuote(next);
      return next;
    }
    setQuote(null);
    toast.error(res.error.message);
    return null;
  }, []);
  useEffect(() => {
    if (!quoteRequest) return;
    const req = quoteRequest;
    const t = setTimeout(() => void fetchQuote(req), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteKey, fetchQuote]);

  const go = useCallback((s: Step) => {
    setStep(s);
    window.scrollTo({ top: 0, behavior: "smooth" });
    // Embedded on another site: let the host page bring the widget's top into view.
    if (window.parent !== window) window.parent.postMessage({ type: "booking-widget:step" }, "*");
  }, []);

  async function submitPostal() {
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
      setOutOfArea({ area: res.area ?? "" });
    } else {
      toast.error(`Please enter a valid ${country.postalLabel.toLowerCase()}.`);
    }
  }

  async function enterDateStep() {
    if (!region) return;
    setAvailability(null);
    go("Date");
    const res = await availabilityAction(region.id, 21);
    setAvailability(res.days);
  }

  async function submitDetails() {
    if (!region) return;
    setBusy(true);
    const res = await prepareCheckoutAction(region.id, contact, adminMode);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    setCheckout(res);
    go("Payment");
  }

  async function confirm(setupIntentId: string | null) {
    if (!region || !quoteRequest || !scheduledDate || !windowId || !checkout) return;
    setBusy(true);
    const current = quote && !quoteLoading ? quote : await fetchQuote(quoteRequest);
    if (!current) {
      setBusy(false);
      return;
    }
    const res = await confirmBookingAction({
      quoteId: current.quoteId,
      quoteRequest,
      scheduledDate,
      windowId,
      contact,
      address,
      customerNotes,
      setupIntentId,
      customerId: checkout.customerId,
      marketingConsent,
      source: adminMode ? "ADMIN" : "WEB",
      giftCardCode: giftBalance !== null ? giftCardCode : "",
    });
    setBusy(false);
    if (res.ok) {
      router.push(
        adminMode
          ? `/admin/bookings?q=${res.bookingNumber}`
          : `${confirmationBase}/${res.bookingNumber}`,
      );
      return;
    }
    toast.error(res.message);
    if (res.code === "SLOT_FULL" || res.code === "SLOT_CLOSED") enterDateStep();
    if (res.code === "QUOTE_STALE" || res.code === "QUOTE_NOT_FOUND") go("Frequency");
  }

  /** The key: the one next step, whatever the step is. */
  function onKey(e: React.FormEvent) {
    e.preventDefault();
    if (step === "Location") void submitPostal();
    else if (step === "Service") go("Home");
    else if (step === "Home") go("Extras");
    else if (step === "Extras") go("Frequency");
    else if (step === "Frequency") void enterDateStep();
    else if (step === "Date" && scheduledDate && windowId) go("Details");
    else if (step === "Details") void submitDetails();
  }

  const selectedDay = availability?.find((d) => d.date === scheduledDate);
  const selectedWindow = selectedDay?.windows.find((w) => w.windowId === windowId);
  const hue = serviceHue(service?.slug ?? serviceSlug);
  const extrasCount = Object.values(selectedExtras).filter((q) => q > 0).length;
  const picture =
    service?.pricingModel === "HOURLY" ? (
      <RoomStrip
        hue={hue}
        blocks={[
          { kind: "on", n: Math.ceil(hours), label: "Hours", count: String(hours) },
          {
            kind: "on",
            n: cleaners,
            label: cleaners === 1 ? "Cleaner" : "Cleaners",
            count: String(cleaners),
          },
        ]}
      />
    ) : (
      <RoomStrip hue={hue} blocks={homeBlocks({ bedrooms, bathrooms, extras: extrasCount })} />
    );
  const stripeCard = step === "Payment" && !!checkout?.stripeConfigured && !!checkout.clientSecret;
  const key =
    step === "Payment"
      ? {
          label: busy ? "Booking…" : "Confirm booking",
          context: quote ? formatCents(quote.quote.totalCents) : "",
          disabled: busy || quoteLoading || !quote,
        }
      : step === "Details"
        ? { label: busy ? "Saving…" : "Continue to payment", context: "", disabled: busy }
        : {
            label: step === "Location" && busy ? "Checking…" : "Continue",
            context: STEPS[stepIndex + 1],
            disabled:
              (step === "Location" && busy) || (step === "Date" && (!scheduledDate || !windowId)),
          };

  return (
    <div
      data-hue={hue}
      className="grid gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start"
    >
      <div className="min-w-0">
        <div className="flex h-6 items-center">
          {stepIndex > 0 ? (
            <button
              type="button"
              onClick={() => go(STEPS[stepIndex - 1])}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-4" aria-hidden />
              {STEPS[stepIndex - 1]}
            </button>
          ) : null}
        </div>
        <div className="mt-4 flex gap-1" aria-hidden>
          {STEPS.map((s, i) => (
            <span
              key={s}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors",
                i > stepIndex ? "bg-well-strong" : stepIndex > 0 ? "bg-hue" : "bg-foreground",
              )}
            />
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Step {stepIndex + 1} of {STEPS.length} · {step}
        </p>

        <form id="wizard-step" onSubmit={onKey} className="mt-8">
          {step === "Location" && (
            <div className="space-y-6">
              <h1 className={H1}>Where do you need cleaning?</h1>
              <div className="max-w-sm space-y-2">
                <Label htmlFor="postal">{country.postalLabel}</Label>
                <Input
                  id="postal"
                  value={postal}
                  onChange={(e) => setPostal(e.target.value)}
                  placeholder={country.postalPlaceholder}
                  required
                  autoFocus
                  className="h-14 text-xl uppercase md:text-xl"
                />
              </div>
              {outOfArea ? <OutOfArea area={outOfArea.area} postal={postal} /> : null}
            </div>
          )}

          {step === "Service" && region && (
            <div className="space-y-6">
              <div>
                <h1 className={H1}>What kind of cleaning?</h1>
                <p className="mt-3 text-muted-foreground">
                  Serving {region.name}, {region.province}.
                </p>
              </div>
              <ul className="border-t border-foreground">
                {services.map((s) => {
                  const on = serviceSlug === s.slug;
                  return (
                    <li key={s.slug} className="border-b py-1.5">
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() => {
                          setServiceSlug(s.slug);
                          if (s.isUpgrade) setUpgrade(null);
                        }}
                        data-hue={serviceHue(s.slug)}
                        className={cn(
                          "flex w-full items-center gap-4 rounded-2xl px-3 py-3 text-left transition-colors",
                          on ? "bg-hue-tint" : "hover:bg-well",
                        )}
                        data-testid={`service-${s.slug}`}
                      >
                        <Mark on={on} />
                        <span className="h-8 w-2 shrink-0 rounded-full bg-hue" aria-hidden />
                        <span className="min-w-0">
                          <span className="wide block text-lg font-semibold">{s.name}</span>
                          <span className="block text-sm text-muted-foreground">
                            {s.description}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {step === "Home" && (
            <div className="space-y-6">
              <h1 className={H1}>Tell us about your home</h1>
              {service?.pricingModel === "HOURLY" ? (
                <div className="max-w-lg border-t border-foreground">
                  <Counter
                    label="Hours"
                    value={hours}
                    min={3}
                    max={12}
                    onChange={setHours}
                    step={0.5}
                  />
                  <Counter
                    label="Cleaners"
                    value={cleaners}
                    min={1}
                    max={4}
                    onChange={setCleaners}
                  />
                </div>
              ) : (
                <div className="max-w-lg">
                  <div className="border-t border-foreground">
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
                  </div>
                  <div className="mt-6 space-y-2">
                    <Label htmlFor="sqft">Approximate square footage (optional)</Label>
                    <NativeSelect
                      id="sqft"
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
                    </NativeSelect>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === "Extras" && (
            <div className="space-y-6">
              <h1 className={H1}>Any extras?</h1>
              <ul className="border-t border-foreground sm:grid sm:grid-cols-2 sm:gap-x-8">
                {extras.map((x) => {
                  const qty = selectedExtras[x.slug] ?? 0;
                  return (
                    <li key={x.slug} className="flex items-center justify-between gap-3 border-b">
                      <label className="flex min-h-14 flex-1 cursor-pointer items-center gap-3 py-3">
                        <span className="relative flex shrink-0">
                          <input
                            type="checkbox"
                            checked={qty > 0}
                            onChange={(e) =>
                              setSelectedExtras((s) => ({
                                ...s,
                                [x.slug]: e.target.checked ? 1 : 0,
                              }))
                            }
                            className="peer size-6 cursor-pointer appearance-none rounded-full bg-background inset-ring-[1.5px] inset-ring-input transition-colors checked:bg-hue checked:inset-ring-hue hover:inset-ring-foreground checked:hover:inset-ring-hue"
                            data-testid={`extra-${x.slug}`}
                          />
                          <Check
                            aria-hidden
                            className="pointer-events-none absolute inset-0 m-auto size-3.5 text-hue-ink opacity-0 peer-checked:opacity-100"
                          />
                        </span>
                        {x.name}
                      </label>
                      {x.unit === "PER_UNIT" && qty > 0 ? (
                        <Input
                          type="number"
                          min={1}
                          max={x.maxQty}
                          value={qty}
                          aria-label={`How many: ${x.name}`}
                          onChange={(e) =>
                            setSelectedExtras((s) => ({
                              ...s,
                              [x.slug]: Math.min(x.maxQty, Math.max(1, Number(e.target.value))),
                            }))
                          }
                          className="narrow h-9 w-20"
                        />
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {step === "Frequency" && (
            <div className="space-y-10">
              <div className="space-y-6">
                <h1 className={H1}>How often?</h1>
                <ul className="border-t border-foreground">
                  {FREQUENCIES.map((f) => {
                    const on = frequency === f.value;
                    return (
                      <li key={f.value} className="border-b py-1.5">
                        <button
                          type="button"
                          aria-pressed={on}
                          onClick={() => setFrequency(f.value)}
                          className={cn(
                            "flex w-full items-center gap-4 rounded-2xl px-3 py-3 text-left transition-colors",
                            on ? "bg-hue-tint" : "hover:bg-well",
                          )}
                          data-testid={`frequency-${f.value}`}
                        >
                          <Mark on={on} />
                          <span className="wide flex-1 text-lg font-semibold">{f.label}</span>
                          <span
                            className={cn(
                              "text-sm",
                              f.value === "ONE_TIME"
                                ? "text-muted-foreground"
                                : "font-medium text-success",
                            )}
                          >
                            {f.hint}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
              {service?.pricingModel === "FLAT" && upgradeOptions.length ? (
                <div className="space-y-3">
                  <h2 className="text-xl font-semibold">Upgrade your first clean</h2>
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
              <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="promo">Promo code</Label>
                  <Input
                    id="promo"
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                    placeholder="Optional"
                    className="narrow"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gift">Gift card</Label>
                  <div className="flex gap-2">
                    <Input
                      id="gift"
                      value={giftCardCode}
                      onChange={(e) => {
                        setGiftCardCode(e.target.value.toUpperCase());
                        setGiftBalance(null);
                      }}
                      placeholder="GC-XXXX-XXXX-XXXX"
                      className="narrow"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-11 px-4"
                      disabled={!giftCardCode}
                      onClick={async () => {
                        const r = await checkGiftCardAction(giftCardCode);
                        if (r.ok) {
                          setGiftBalance(r.balanceCents);
                          setGiftCardCode(r.code);
                        } else {
                          setGiftBalance(null);
                          toast.error(r.message);
                        }
                      }}
                      data-testid="gift-apply"
                    >
                      Apply
                    </Button>
                  </div>
                  {giftBalance !== null ? (
                    <p className="text-sm text-success" data-testid="gift-balance">
                      {formatCents(giftBalance)} on this card will be applied when your clean is
                      charged.
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          )}

          {step === "Date" && (
            <div className="space-y-8">
              <h1 className={H1}>Pick a date and arrival window</h1>
              {!availability ? (
                <p className="text-muted-foreground">Loading availability…</p>
              ) : (
                <>
                  <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
                    {availability.map((d) => {
                      const anyOpen = d.windows.some((w) => w.open);
                      const on = scheduledDate === d.date;
                      const p = dayParts(d.date);
                      return (
                        <button
                          key={d.date}
                          type="button"
                          disabled={!anyOpen}
                          aria-pressed={on}
                          aria-label={formatDay(d.date)}
                          onClick={() => {
                            setScheduledDate(d.date);
                            setWindowId(null);
                          }}
                          className={cn(
                            "flex flex-col items-start rounded-2xl px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-35",
                            on
                              ? "bg-foreground text-background"
                              : "bg-well enabled:hover:bg-well-strong",
                          )}
                          data-testid={`date-${d.date}`}
                        >
                          <span className="text-xs opacity-70">{p.weekday}</span>
                          <span className="wide text-2xl leading-tight font-semibold">{p.day}</span>
                          <span className="text-xs opacity-70">{p.month}</span>
                        </button>
                      );
                    })}
                  </div>
                  {selectedDay ? (
                    <div className="space-y-3">
                      <h2 className="text-xl font-semibold">Arrival window</h2>
                      <div className="flex flex-wrap gap-2">
                        {selectedDay.windows.map((w) => {
                          const on = windowId === w.windowId;
                          return (
                            <button
                              key={w.windowId}
                              type="button"
                              disabled={!w.open}
                              aria-pressed={on}
                              onClick={() => setWindowId(w.windowId)}
                              className={cn(
                                "inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-35",
                                on
                                  ? "bg-foreground text-background"
                                  : "bg-well enabled:hover:bg-well-strong",
                              )}
                              data-testid={`window-${w.startLocal}`}
                            >
                              {w.label}
                              {w.open && w.remaining <= 1 ? (
                                <span className={cn("text-xs", on ? "opacity-80" : "text-warning")}>
                                  last spot
                                </span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          )}

          {step === "Details" && (
            <div className="space-y-10">
              <h1 className={H1}>Your details</h1>
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
              <section className="space-y-4">
                <h2 className="border-t border-foreground pt-5 text-xl font-semibold">Address</h2>
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
                    label={country.postalLabel}
                    id="postalCode"
                    value={address.postalCode}
                    onChange={(v) => setAddress({ ...address, postalCode: v.toUpperCase() })}
                    required
                    autoComplete="postal-code"
                  />
                </div>
              </section>
              <section className="space-y-4">
                <h2 className="border-t border-foreground pt-5 text-xl font-semibold">
                  Getting in
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="entry">How do we get in?</Label>
                    <Textarea
                      id="entry"
                      value={address.entryInstructions}
                      onChange={(e) =>
                        setAddress({ ...address, entryInstructions: e.target.value })
                      }
                      placeholder="Lockbox, concierge, you'll be home…"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="parking">Parking</Label>
                    <Textarea
                      id="parking"
                      value={address.parkingInstructions}
                      onChange={(e) =>
                        setAddress({ ...address, parkingInstructions: e.target.value })
                      }
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
              </section>
              <label className="flex items-start gap-3 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={marketingConsent}
                  onChange={(e) => setMarketingConsent(e.target.checked)}
                  className="mt-0.5 size-4 accent-foreground"
                />
                Send me occasional offers by email. You can unsubscribe any time. Booking updates
                are always sent.
              </label>
            </div>
          )}
        </form>

        {step === "Payment" && checkout && (
          <div className="mt-8 space-y-8">
            <h1 className={H1}>Payment</h1>
            <dl className="border-t border-foreground">
              {[
                ["Service", service?.name],
                [
                  "When",
                  `${scheduledDate ? formatDay(scheduledDate) : ""} · ${selectedWindow?.label ?? ""}`,
                ],
                [
                  "Where",
                  `${address.line1}${address.line2 ? `, ${address.line2}` : ""}, ${address.city} ${address.postalCode}`,
                ],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-6 border-b py-3.5">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="text-right font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            {stripeCard && checkout.clientSecret ? (
              <CardStep
                clientSecret={checkout.clientSecret}
                onConfirmed={(id) => confirm(id)}
                onBack={() => go("Details")}
              />
            ) : (
              <p className="max-w-xl font-medium text-warning">
                {adminMode
                  ? "Phone order: no card is collected here. The customer can add a card from their account, or payment is handled offline."
                  : "Payments are not configured in this environment. Your booking will be created without a card on file."}
              </p>
            )}
          </div>
        )}
      </div>

      {/* The inspector and, under it, the key. On a narrow screen both follow the work and the
          key stays at the bottom of the window. */}
      <aside className="contents lg:sticky lg:top-6 lg:block lg:space-y-3">
        <QuoteSummary
          quote={quote?.quote ?? null}
          loading={quoteLoading}
          serviceName={stepIndex >= 1 ? service?.name : undefined}
          hue={hue}
          picture={picture}
          place={region ? `${region.name}, ${region.province}` : undefined}
          note={
            region
              ? `Prices include tax for ${subdivisionName(region.province)}.${region.phone ? ` Questions? ${region.phone}` : ""}`
              : undefined
          }
          labels={Object.fromEntries(extras.map((x) => [x.slug, x.name]))}
        />
        {stripeCard ? null : (
          <button
            type={step === "Payment" ? "button" : "submit"}
            form={step === "Payment" ? undefined : "wizard-step"}
            onClick={step === "Payment" ? () => confirm(null) : undefined}
            disabled={key.disabled}
            data-testid="next"
            className="sticky bottom-3 z-10 flex h-16 w-full items-center justify-between gap-4 rounded-3xl bg-primary px-6 text-primary-foreground shadow-lift transition-[opacity,transform] duration-150 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-40 motion-reduce:active:scale-100 lg:static lg:shadow-none"
          >
            <span className="wide text-lg font-semibold">{key.label}</span>
            <span className="flex items-center gap-3 text-sm opacity-70" aria-hidden>
              {key.context}
              <ArrowRight className="size-5" />
            </span>
          </button>
        )}
      </aside>
    </div>
  );
}

const H1 = "text-4xl font-semibold sm:text-5xl";

/** The round mark on a choice: empty, or filled in the service's colour with a tick. */
function Mark({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-full transition-colors",
        on ? "bg-hue text-hue-ink" : "inset-ring-[1.5px] inset-ring-input",
      )}
    >
      {on ? <Check className="size-3.5" /> : null}
    </span>
  );
}

function OutOfArea({ area, postal }: { area: string; postal: string }) {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  return (
    <div className="max-w-lg border-t border-foreground pt-5">
      <p className="wide text-xl font-semibold">We&apos;re not in {area} yet.</p>
      {done ? (
        <p className="mt-2 text-muted-foreground">
          Thanks, we&apos;ll let you know when we launch near you.
        </p>
      ) : (
        <>
          <p className="mt-2 text-muted-foreground">
            Leave your email and we&apos;ll tell you when we are.
          </p>
          <div className="mt-4 flex gap-2">
            <Input
              type="email"
              placeholder="you@example.com"
              aria-label="Email for launch news"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button
              type="button"
              variant="secondary"
              className="h-11 px-5"
              onClick={async () => {
                const res = await areaRequestAction({ email, postalCode: postal });
                if (res.ok) setDone(true);
                else toast.error("Please enter a valid email.");
              }}
            >
              Notify me
            </Button>
          </div>
        </>
      )}
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
    <div className="flex items-center justify-between gap-4 border-b py-4">
      <span className="wide text-xl font-semibold">{label}</span>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="icon-lg"
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - step))}
          aria-label={`Fewer ${label}`}
        >
          <Minus />
        </Button>
        <span
          className="wide w-14 text-center text-3xl font-semibold tabular-nums"
          data-testid={testId}
          aria-live="polite"
        >
          {value}
        </span>
        <Button
          type="button"
          variant="secondary"
          size="icon-lg"
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + step))}
          aria-label={`More ${label}`}
        >
          <Plus />
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
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "h-10 rounded-full px-4 text-sm font-medium transition-colors",
        active ? "bg-foreground text-background" : "bg-well hover:bg-well-strong",
      )}
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
    <div className={cn("space-y-2", className)}>
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
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function dayParts(date: string): { weekday: string; day: string; month: string } {
  const [y, m, d] = date.split("-").map(Number);
  const at = new Date(Date.UTC(y, m - 1, d));
  const part = (o: Intl.DateTimeFormatOptions) =>
    at.toLocaleDateString(locale, { ...o, timeZone: "UTC" });
  return { weekday: part({ weekday: "short" }), day: String(d), month: part({ month: "short" }) };
}
