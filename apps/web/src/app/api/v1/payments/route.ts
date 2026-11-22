import { apiRoute } from "@/modules/api/http";
import { listPayments } from "@/modules/api/resources";

export const GET = apiRoute(({ auth, query }) => listPayments(auth.organizationId, query));
