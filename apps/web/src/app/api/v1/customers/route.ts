import { apiRoute } from "@/modules/api/http";
import { listCustomers } from "@/modules/api/resources";

export const GET = apiRoute(({ auth, query }) => listCustomers(auth.organizationId, query));
