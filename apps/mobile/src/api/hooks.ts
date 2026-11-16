import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Availability,
  AvailabilityRow,
  CheckOutResult,
  Earnings,
  EnRouteResult,
  JobDetail,
  JobSummary,
  Me,
  Position,
} from "@msb/shared/mobile-api";
import { api } from "./index";

export const keys = {
  me: ["me"] as const,
  jobs: ["jobs"] as const,
  job: (id: string) => ["job", id] as const,
  earnings: ["earnings"] as const,
  availability: ["availability"] as const,
};

export const useMe = () =>
  useQuery({ queryKey: keys.me, queryFn: async () => (await api.request<Me>("me")).data });

export const useJobs = () =>
  useQuery({
    queryKey: keys.jobs,
    queryFn: async () =>
      (await api.request<{ from: string; to: string; today: string; jobs: JobSummary[] }>("jobs"))
        .data,
  });

export const useJob = (id: string) =>
  useQuery({
    queryKey: keys.job(id),
    queryFn: async () => (await api.request<JobDetail>(`jobs/${id}`)).data,
  });

export const useEarnings = () =>
  useQuery({
    queryKey: keys.earnings,
    queryFn: async () => (await api.request<Earnings>("earnings")).data,
  });

export const useAvailability = () =>
  useQuery({
    queryKey: keys.availability,
    queryFn: async () => (await api.request<Availability>("availability")).data,
  });

/** Job actions. Each refreshes the job and the list; results carry the server's message/warnings. */
export function useJobActions(jobId: string) {
  const qc = useQueryClient();
  const onSettled = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: keys.job(jobId) }),
      qc.invalidateQueries({ queryKey: keys.jobs }),
    ]);
  const respond = useMutation({
    mutationFn: (accept: boolean) => api.request(`jobs/${jobId}/respond`, { body: { accept } }),
    onSettled,
  });
  const enRoute = useMutation({
    mutationFn: (position: Position) =>
      api.request<EnRouteResult>(`jobs/${jobId}/en-route`, { body: { position } }),
    onSettled,
  });
  const checkIn = useMutation({
    mutationFn: (position: Position) =>
      api.request(`jobs/${jobId}/check-in`, { body: { position } }),
    onSettled,
  });
  const checkOut = useMutation({
    mutationFn: (position: Position) =>
      api.request<CheckOutResult>(`jobs/${jobId}/check-out`, { body: { position } }),
    onSettled,
  });
  const checklist = useMutation({
    mutationFn: ({ itemId, done }: { itemId: string; done: boolean }) =>
      api.request(`jobs/${jobId}/checklist/${itemId}`, { method: "PUT", body: { done } }),
    onSettled,
  });
  return { respond, enRoute, checkIn, checkOut, checklist };
}

export function useSaveAvailability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rows: AvailabilityRow[]) =>
      api.request("availability", { method: "PUT", body: { rows } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.availability }),
  });
}

export function useRequestTimeOff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (t: { startsAt: string; endsAt: string; reason: string }) =>
      api.request("time-off", { body: t }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.availability }),
  });
}
