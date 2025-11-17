import { createContext, useContext } from "react";

interface Settings {
  showDebugInfo: boolean;
}

const defaultSettings: Settings = {
  showDebugInfo: false,
};

const SettingsContenxt = createContext<Settings>(defaultSettings);

const useSettings = () => useContext(SettingsContenxt);

export { useSettings, type Settings, defaultSettings, SettingsContenxt };
