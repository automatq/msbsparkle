import { apiRoute } from "@/modules/api/http";
import { getPayment } from "@/modules/api/resources";

export const GET = apiRoute<{ id: string }>(({ auth, params }) =>
  getPayment(auth.organizationId, params.id),
);
