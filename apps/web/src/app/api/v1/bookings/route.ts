import { apiRoute } from "@/modules/api/http";
import { listBookings } from "@/modules/api/resources";

export const GET = apiRoute(({ auth, query }) => listBookings(auth.organizationId, query));
