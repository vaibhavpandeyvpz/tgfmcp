import process from "node:process";

export function register(
  onShutdown: (signal: NodeJS.Signals) => Promise<void> | void,
): () => void {
  let existing = false;

  const handler = (signal: NodeJS.Signals) => {
    if (existing) {
      return;
    }

    existing = true;

    void Promise.resolve(onShutdown(signal))
      .catch(() => {
        // Ignore shutdown errors and still terminate the process.
      })
      .finally(() => {
        process.exitCode = signal === "SIGINT" ? 130 : 143;
        process.exit();
      });
  };

  process.once("SIGINT", handler);
  process.once("SIGTERM", handler);

  return () => {
    process.off("SIGINT", handler);
    process.off("SIGTERM", handler);
  };
}
