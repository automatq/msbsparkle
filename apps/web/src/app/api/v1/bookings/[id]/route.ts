import { apiRoute } from "@/modules/api/http";
import { getBooking } from "@/modules/api/resources";

export const GET = apiRoute<{ id: string }>(({ auth, params }) =>
  getBooking(auth.organizationId, params.id),
);
