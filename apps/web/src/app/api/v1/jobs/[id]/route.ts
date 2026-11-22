import { apiRoute } from "@/modules/api/http";
import { getJob } from "@/modules/api/resources";

export const GET = apiRoute<{ id: string }>(({ auth, params }) =>
  getJob(auth.organizationId, params.id),
);
