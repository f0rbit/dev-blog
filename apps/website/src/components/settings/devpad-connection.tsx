import { createSignal, createResource, Show } from "solid-js";
import { api } from "@/lib/api";

type ConnectionStatus = {
  connected: boolean;
};

const fetchStatus = async (): Promise<ConnectionStatus> => {
  const response = await fetch(api.blog("/projects/status"), {
    credentials: "include",
  });
  if (!response.ok) return { connected: false };
  return response.json();
};

export const DevpadConnection = () => {
  const [status, { refetch }] = createResource(fetchStatus);
  const [token, setToken] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const connected = () => status()?.connected ?? false;

  const handleConnect = async (e: Event) => {
    e.preventDefault();
    if (!token().trim()) return;

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(api.blog("/projects/token"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token() }),
        credentials: "include",
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.error ?? "Failed to connect");
        return;
      }

      setToken("");
      await refetch();
    } catch (err) {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    setSaving(true);
    setError(null);

    try {
      await fetch(api.blog("/projects/token"), {
        method: "DELETE",
        credentials: "include",
      });
      await refetch();
    } catch (err) {
      setError("Failed to disconnect");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div class="devpad-connection">
      <Show when={error()}>
        <p class="devpad-connection__error">{error()}</p>
      </Show>

      <Show
        when={connected()}
        fallback={
          <form class="devpad-connection__form" onSubmit={handleConnect}>
            <p class="devpad-connection__info">
              Connect your DevPad account to link posts to projects.
              Get your API token from DevPad settings.
            </p>
            <div class="devpad-connection__input-row">
              <input
                type="password"
                class="input"
                placeholder="DevPad API Token"
                value={token()}
                onInput={(e) => setToken(e.currentTarget.value)}
                disabled={saving()}
              />
              <button
                type="submit"
                class="btn btn-primary"
                disabled={saving() || !token().trim()}
              >
                {saving() ? "Connecting..." : "Connect"}
              </button>
            </div>
          </form>
        }
      >
        <div class="devpad-connection__connected">
          <span class="devpad-connection__status">
            <span class="status-dot status-dot--success" />
            Connected to DevPad
          </span>
          <button
            type="button"
            class="btn btn-secondary"
            onClick={handleDisconnect}
            disabled={saving()}
          >
            {saving() ? "..." : "Disconnect"}
          </button>
        </div>
      </Show>
    </div>
  );
};
