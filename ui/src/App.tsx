import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./queryClient";
import { defaultSettings, SettingsContenxt } from "./settings";
import MainContent from "./components/MainContent";
import { Suspense } from "react";
import { PlayersContextProvider } from "./playersContext";
import { SseContextProvider } from "./sse";

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={<div>Loading...</div>}>
        <SettingsContenxt value={defaultSettings}>
          <PlayersContextProvider>
            <SseContextProvider>
              <MainContent />
            </SseContextProvider>
          </PlayersContextProvider>
        </SettingsContenxt>
      </Suspense>
    </QueryClientProvider>
  );
}

export default App;
