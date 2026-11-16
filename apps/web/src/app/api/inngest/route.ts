import { serve } from "inngest/next";
import { inngest } from "@/modules/jobs/client";
import { functions } from "@/modules/jobs/functions";

export const { GET, POST, PUT } = serve({ client: inngest, functions });
