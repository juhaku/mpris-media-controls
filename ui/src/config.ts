const config = {
  server: `${import.meta.env.VITE_SERVER_ADDRESS as string}/api`,
} as const;

export { config };
