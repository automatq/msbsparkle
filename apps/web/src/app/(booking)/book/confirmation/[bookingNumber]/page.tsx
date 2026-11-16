import { BookingConfirmation } from "@/components/booking/booking-confirmation";

export default async function ConfirmationPage({
  params,
}: PageProps<"/book/confirmation/[bookingNumber]">) {
  const { bookingNumber } = await params;
  return <BookingConfirmation bookingNumber={bookingNumber} />;
}
