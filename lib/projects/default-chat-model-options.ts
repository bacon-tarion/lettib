import { MODELS_CATALOG, getProviderLabel } from "@/lib/providers/models";

export type ProjectConnection = {
  provider: string;
  status: string;
  custom_base_url: string | null;
  custom_model_name: string | null;
};

export type DefaultChatModelOption = {
  value: string;
  label: string;
  provider: string;
  modelId: string;
};

/** Same shape as Chat model picker — one connected provider/model per option. */
export function buildDefaultChatModelOptions(
  connections: ProjectConnection[]
): DefaultChatModelOption[] {
  const catalog = MODELS_CATALOG as Record<
    string,
    readonly { id: string; name: string }[]
  >;

  return connections.flatMap((conn) => {
    if (conn.provider === "custom") {
      const modelId = conn.custom_model_name || "custom";
      return [
        {
          value: `custom::${modelId}`,
          label: `Custom — ${conn.custom_model_name || "Custom Model"}`,
          provider: "custom",
          modelId,
        },
      ];
    }
    const models = catalog[conn.provider] ?? [];
    return models.map((m) => ({
      value: `${conn.provider}::${m.id}`,
      label: `${getProviderLabel(conn.provider)} — ${m.name}`,
      provider: conn.provider,
      modelId: m.id,
    }));
  });
}
