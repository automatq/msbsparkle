import { AsyncLocalStorage } from "node:async_hooks";
import type { customerForCtx } from "./queries";

type CustomerRow = Awaited<ReturnType<typeof customerForCtx>>;

/**
 * Set by the /api/v1 bearer-token wrapper so customer actions resolve the caller from the
 * verified token instead of the Auth.js cookie session. Only server code can populate it.
 */
export const apiCustomerStorage = new AsyncLocalStorage<CustomerRow>();
