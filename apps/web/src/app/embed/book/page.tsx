import { BookingWizard } from "@/components/booking/booking-wizard";
import { loadWizard } from "@/modules/bookings/wizard-data";

export const dynamic = "force-dynamic";

export default async function EmbedBookPage({ searchParams }: PageProps<"/embed/book">) {
  const { services, extras, initial } = await loadWizard(await searchParams);
  return (
    <BookingWizard
      services={services}
      extras={extras}
      initial={initial}
      confirmationBase="/embed/book/confirmation"
    />
  );
}
