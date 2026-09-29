import { AddressNotesForm, ProfileForm } from "@/components/customer/panels";
import { requireRole } from "@/modules/auth/session";
import { customerForCtx } from "@/modules/customer/queries";
import { prisma } from "@/modules/db/client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const ctx = await requireRole("/login");
  const customer = await customerForCtx(ctx);
  const addresses = await prisma.address.findMany({
    where: { customerId: customer.id, archivedAt: null },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Signed in as {customer.email}. Booking confirmations and reminders are always sent.
        </p>
        <ProfileForm
          initial={{
            firstName: customer.firstName,
            lastName: customer.lastName,
            phone: customer.phone ?? "",
            marketingOptIn: customer.marketingOptIn,
            smsOptOut: customer.smsOptOut,
          }}
        />
      </section>
      {addresses.map((a) => (
        <section key={a.id} className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            {a.line1}, {a.city} {a.postalCode}
          </h2>
          <AddressNotesForm
            addressId={a.id}
            initial={{
              entryInstructions: a.entryInstructions ?? "",
              parkingInstructions: a.parkingInstructions ?? "",
              pets: a.pets ?? "",
            }}
          />
        </section>
      ))}
    </div>
  );
}
