// Defines the background location task at startup: the OS may launch the app just to run it.
import "@/tracking/location";

import {
  focusManager,
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { ApiRequestError } from "@/api";
import { keys } from "@/api/hooks";
import { AuthProvider, useAuth } from "@/auth/auth";
import { useColors } from "@/components/ui";
import { photoQueue } from "@/photos/queue";
import { registerForPush, useNotificationTaps } from "@/push/push";

void SplashScreen.preventAutoHideAsync();

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // Don't hammer the server with requests it already refused.
        retry: (count, error) =>
          count < 2 && !(error instanceof ApiRequestError && error.status < 500),
      },
    },
  });
}

function RootStack() {
  const { status } = useAuth();
  const qc = useQueryClient();
  const c = useColors();
  const signedIn = status === "signedIn";
  useNotificationTaps(signedIn);

  useEffect(() => {
    if (status !== "loading") void SplashScreen.hideAsync();
    if (!signedIn) return;
    void registerForPush();
    void photoQueue.flush();
    // Back in the foreground: refresh the schedule and retry any waiting photo uploads.
    const sub = AppState.addEventListener("change", (s) => {
      focusManager.setFocused(s === "active");
      if (s === "active") {
        void photoQueue.flush();
        void qc.invalidateQueries({ queryKey: keys.jobs });
      }
    });
    return () => sub.remove();
  }, [status, signedIn, qc]);

  if (status === "loading") return null;
  return (
    <>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerBackTitle: "Back",
          headerTintColor: c.text,
          headerStyle: { backgroundColor: c.bg },
          contentStyle: { backgroundColor: c.bg },
        }}
      >
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="jobs/[id]" options={{ title: "Job" }} />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [queryClient] = useState(makeQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RootStack />
      </AuthProvider>
    </QueryClientProvider>
  );
}
