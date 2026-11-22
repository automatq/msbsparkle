import { apiRoute } from "@/modules/api/http";
import { listJobs } from "@/modules/api/resources";

export const GET = apiRoute(({ auth, query }) => listJobs(auth.organizationId, query));
