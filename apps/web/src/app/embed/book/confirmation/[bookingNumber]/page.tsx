import { BookingConfirmation } from "@/components/booking/booking-confirmation";
import { EmbedComplete } from "@/components/booking/embed-bridge";

export default async function EmbedConfirmationPage({
  params,
}: PageProps<"/embed/book/confirmation/[bookingNumber]">) {
  const { bookingNumber } = await params;
  return (
    <>
      <BookingConfirmation bookingNumber={bookingNumber} embedded />
      <EmbedComplete bookingNumber={bookingNumber} />
    </>
  );
}
