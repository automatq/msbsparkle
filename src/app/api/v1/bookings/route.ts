import { confirmBookingAction } from "@/modules/bookings/actions";
import { withOrg } from "@/modules/shared/api/handlers";
import { fail, ok } from "@/modules/shared/api/response";

export function POST(req: Request) {
  return withOrg(req, async () => {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return fail("INVALID", 400);
    // The public API never places staff/phone orders.
    const result = await confirmBookingAction({ ...body, source: "WEB" });
    return result.ok
      ? ok({ bookingNumber: result.bookingNumber })
      : fail(result.code, 422, { message: result.message });
  });
}
