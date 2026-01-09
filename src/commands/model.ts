import { agentManager } from "../agent";
import { env } from "../env";
import { colorize } from "../interaction/colors";
import { Spinner } from "../interaction/spinner";
import type { Command, CommandResult } from "./types";

interface ModelInfo {
  id: string;
  name?: string;
  type?: "serverless" | "dedicated";
  status?: string;
}

interface DedicatedEndpointData {
  status: string;
  createdAt: string;
  updatedAt: string;
  phase?: string;
}

let cachedModels: ModelInfo[] | null = null;

const VALID_DEDICATED_STATUSES = [
  "INITIALIZING",
  "RUNNING",
  "UPDATING",
  "SLEEPING",
  "AWAKING",
  "READY",
] as const;

async function fetchServerlessModels(): Promise<ModelInfo[]> {
  const response = await fetch("https://api.friendli.ai/serverless/v1/models", {
    headers: {
      Authorization: `Bearer ${env.FRIENDLI_TOKEN}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch serverless models: ${response.status}`);
  }

  const data = (await response.json()) as { data: { id: string }[] };
  return data.data.map((m) => ({ id: m.id, type: "serverless" as const }));
}

async function fetchDedicatedEndpoints(): Promise<ModelInfo[]> {
  try {
    const allEndpoints: ModelInfo[] = [];
    let cursor: string | null = null;

    do {
      const url = new URL("https://api.friendli.ai/dedicated/beta/endpoint");
      url.searchParams.set("limit", "100");
      if (cursor) {
        url.searchParams.set("cursor", cursor);
      }

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${env.FRIENDLI_TOKEN}`,
        },
      });

      if (!response.ok) {
        return allEndpoints;
      }

      const data = (await response.json()) as {
        data: Record<string, DedicatedEndpointData>;
        nextCursor?: string | null;
      };

      const endpoints = Object.entries(data.data)
        .filter(([_, endpoint]) =>
          VALID_DEDICATED_STATUSES.includes(
            endpoint.status as (typeof VALID_DEDICATED_STATUSES)[number]
          )
        )
        .map(([id, endpoint]) => ({
          id,
          type: "dedicated" as const,
          status: endpoint.status,
        }));

      allEndpoints.push(...endpoints);
      cursor = data.nextCursor ?? null;
    } while (cursor);

    return allEndpoints;
  } catch {
    return [];
  }
}

async function fetchAvailableModels(): Promise<ModelInfo[]> {
  if (cachedModels) {
    return cachedModels;
  }

  const [serverlessModels, dedicatedEndpoints] = await Promise.all([
    fetchServerlessModels(),
    fetchDedicatedEndpoints(),
  ]);

  cachedModels = [...serverlessModels, ...dedicatedEndpoints];
  return cachedModels;
}

function formatModelList(models: ModelInfo[], currentModelId: string): string {
  const lines = models.map((model, index) => {
    const isCurrent = model.id === currentModelId;
    const marker = isCurrent ? colorize("green", " (current)") : "";
    const typeLabel =
      model.type === "dedicated" ? colorize("cyan", " [FDE]") : "";
    const statusLabel = model.status
      ? colorize("yellow", ` (${model.status})`)
      : "";
    return `  ${index + 1}. ${model.id}${typeLabel}${statusLabel}${marker}`;
  });

  return `Available models:\n${lines.join("\n")}\n\nUsage: /model <number> to select`;
}

export const createModelCommand = (): Command => ({
  name: "model",
  description: "List or change the AI model",
  execute: async ({ args }): Promise<CommandResult> => {
    const spinner = new Spinner("Fetching available models...");

    try {
      spinner.start();
      const models = await fetchAvailableModels();
      spinner.stop();

      if (models.length === 0) {
        return { success: false, message: "No models available." };
      }

      const currentModelId = agentManager.getModelId();

      if (args.length === 0) {
        return {
          success: true,
          message: formatModelList(models, currentModelId),
        };
      }

      const selection = args[0];
      const selectedIndex = Number.parseInt(selection, 10) - 1;

      let selectedModel: ModelInfo | undefined;

      if (
        !Number.isNaN(selectedIndex) &&
        selectedIndex >= 0 &&
        selectedIndex < models.length
      ) {
        selectedModel = models[selectedIndex];
      } else {
        selectedModel = models.find((m) => m.id === selection);
      }

      if (!selectedModel) {
        return {
          success: false,
          message: `Invalid selection: ${selection}`,
        };
      }

      if (selectedModel.id === currentModelId) {
        return {
          success: true,
          message: `Already using model: ${selectedModel.id}`,
        };
      }

      agentManager.setModelId(selectedModel.id);
      agentManager.setModelType(selectedModel.type || "serverless");
      return {
        success: true,
        message: colorize("green", `Model changed to: ${selectedModel.id}`),
      };
    } catch (error) {
      spinner.stop();
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, message: `Error: ${message}` };
    }
  },
});
