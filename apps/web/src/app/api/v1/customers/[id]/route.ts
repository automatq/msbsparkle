import { apiRoute } from "@/modules/api/http";
import { getCustomer } from "@/modules/api/resources";

export const GET = apiRoute<{ id: string }>(({ auth, params }) =>
  getCustomer(auth.organizationId, params.id),
);
