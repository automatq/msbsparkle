import { apiRoute } from "@/modules/api/http";
import { describeKey } from "@/modules/api/resources";

/** GET /api/v1/me: which company and key this is. Handy to test a key. */
export const GET = apiRoute(({ auth }) => describeKey(auth.organizationId, auth.keyId));
