import { handleResNotOk, type BaseToolsInterface } from "../utils.js";
import envPaths from "env-paths";
import { writeFile, readFile, mkdir, unlink } from "fs/promises";
import { join } from "path";
import { z } from "zod";

const paths = envPaths("growthbook-mcp"); // Use your app name
const experimentDefaultsDir = paths.config; // This is the recommended config directory

const experimentDefaultsFile = join(
  experimentDefaultsDir,
  "experiment-defaults.json"
);

const userDefaultsFile = join(experimentDefaultsDir, "user-defaults.json");

interface Experiment {
  name: string;
  hypothesis: string;
  description: string;
  settings: {
    datasourceId: string;
    assignmentQueryId: string;
  };
}

interface DataSourceCount {
  ds: string;
  aq: string;
  count: number;
}

interface ExperimentStatsAccumulator {
  name: string[];
  hypothesis: string[];
  description: string[];
  datasource: Record<string, DataSourceCount>;
}

export interface ExperimentDefaultsResult {
  name: string[];
  hypothesis: string[];
  description: string[];
  datasource: string;
  assignmentQuery: string;
  environments: string[];
  filePaths: {
    experimentDefaultsFile: string;
    userDefaultsFile: string;
  };
  timestamp: string;
}

interface UserDefaults {
  datasourceId: string;
  assignmentQueryId: string;
  environments: string[];
  timestamp: string;
}

export async function createDefaults(
  apiKey: string,
  baseApiUrl: string
): Promise<ExperimentDefaultsResult> {
  try {
    const experimentsResponse = await fetch(
      `${baseApiUrl}/api/v1/experiments`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );
    await handleResNotOk(experimentsResponse);
    const experimentData = await experimentsResponse.json();

    if (experimentData.experiments.length === 0) {
      // No experiments: return assignment query and environments if possible
      const assignmentQueryResponse = await fetch(
        `${baseApiUrl}/api/v1/data-sources`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        }
      );
      await handleResNotOk(assignmentQueryResponse);
      const dataSourceData = await assignmentQueryResponse.json();

      if (dataSourceData.dataSources.length === 0) {
        throw new Error(
          "No data source or assignment query found. Experiments require a data source/assignment query. Set these up in the GrowthBook and try again."
        );
      }

      const assignmentQuery: string =
        dataSourceData.dataSources[0].assignmentQueries[0].id;

      const environmentsResponse = await fetch(
        `${baseApiUrl}/api/v1/environments`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        }
      );
      await handleResNotOk(environmentsResponse);
      const environmentsData = await environmentsResponse.json();
      const environments: string[] = environmentsData.environments.map(
        ({ id }: { id: string }) => id
      );

      return {
        name: [],
        hypothesis: [],
        description: [],
        datasource: "",
        assignmentQuery,
        environments,
        filePaths: {
          experimentDefaultsFile,
          userDefaultsFile,
        },
        timestamp: new Date().toISOString(),
      };
    }

    let experiments: Experiment[] = [];
    if (experimentData.hasMore) {
      const mostRecentExperiments = await fetch(
        `${baseApiUrl}/api/v1/experiments?offset=${
          experimentData.total -
          Math.min(50, experimentData.count + experimentData.offset)
        }&limit=${Math.min(50, experimentData.count + experimentData.offset)}`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
        }
      );
      await handleResNotOk(mostRecentExperiments);
      const mostRecentExperimentData = await mostRecentExperiments.json();
      experiments = mostRecentExperimentData.experiments as Experiment[];
    } else {
      experiments = experimentData.experiments as Experiment[];
    }

    // Aggregate experiment stats
    const experimentStats: ExperimentStatsAccumulator =
      experiments.reduce<ExperimentStatsAccumulator>(
        (acc, experiment) => {
          acc.name.push(experiment.name);
          acc.hypothesis.push(experiment.hypothesis);
          acc.description.push(experiment.description);

          const dsKey = `${experiment.settings.datasourceId}-${experiment.settings.assignmentQueryId}`;
          if (acc.datasource[dsKey]) {
            acc.datasource[dsKey] = {
              ds: experiment.settings.datasourceId,
              aq: experiment.settings.assignmentQueryId,
              count: acc.datasource[dsKey].count + 1,
            };
          } else {
            acc.datasource[dsKey] = {
              ds: experiment.settings.datasourceId,
              aq: experiment.settings.assignmentQueryId,
              count: 1,
            };
          }
          return acc;
        },
        {
          name: [],
          hypothesis: [],
          description: [],
          datasource: {},
        }
      );

    // Find the most frequent datasource/assignmentQuery pair
    let mostFrequentDS: DataSourceCount = {
      count: 0,
      ds: "",
      aq: "",
    };
    for (const value of Object.values(experimentStats.datasource)) {
      if (
        typeof value === "object" &&
        value !== null &&
        typeof value.count === "number" &&
        typeof value.ds === "string" &&
        typeof value.aq === "string"
      ) {
        if (value.count > mostFrequentDS.count) {
          mostFrequentDS = value;
        }
      }
    }

    // Fetch environments
    const environmentsResponse = await fetch(
      `${baseApiUrl}/api/v1/environments`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );
    await handleResNotOk(environmentsResponse);
    const environmentsData = await environmentsResponse.json();
    const environments: string[] = environmentsData.environments.map(
      ({ id }: { id: string }) => id
    );

    return {
      name: experimentStats.name,
      hypothesis: experimentStats.hypothesis,
      description: experimentStats.description,
      datasource: mostFrequentDS.ds,
      assignmentQuery: mostFrequentDS.aq,
      environments,
      filePaths: {
        experimentDefaultsFile,
        userDefaultsFile,
      },
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    throw error;
  }
}

async function getUserDefaults(): Promise<UserDefaults | null> {
  try {
    const userDefaultsData = await readFile(userDefaultsFile, "utf8");
    return JSON.parse(userDefaultsData);
  } catch (error: any) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function getDefaults(
  apiKey: string,
  baseApiUrl: string
): Promise<ExperimentDefaultsResult> {
  // First check for user-defined defaults
  const userDefaults = await getUserDefaults();

  if (userDefaults) {
    // User has set defaults, use them for datasource/assignment/environments
    // But still get the automatic defaults for names/hypotheses/descriptions
    let autoDefaults: Partial<ExperimentDefaultsResult> = {
      name: [],
      hypothesis: [],
      description: [],
    };

    try {
      // Try to get existing auto-generated defaults for name/hypothesis/description
      const experimentDefaultsData = await readFile(
        experimentDefaultsFile,
        "utf8"
      );
      const parsedExperimentDefaults = JSON.parse(experimentDefaultsData);

      if (
        parsedExperimentDefaults &&
        new Date(parsedExperimentDefaults.timestamp).getTime() >
          new Date().getTime() - 1000 * 60 * 60 * 24 * 30 // 30 days
      ) {
        autoDefaults = {
          name: parsedExperimentDefaults.name || [],
          hypothesis: parsedExperimentDefaults.hypothesis || [],
          description: parsedExperimentDefaults.description || [],
        };
      } else {
        // Re-generate auto defaults if expired
        const generatedDefaults = await createDefaults(apiKey, baseApiUrl);
        await mkdir(experimentDefaultsDir, { recursive: true });
        await writeFile(
          experimentDefaultsFile,
          JSON.stringify(generatedDefaults, null, 2)
        );
        autoDefaults = {
          name: generatedDefaults.name,
          hypothesis: generatedDefaults.hypothesis,
          description: generatedDefaults.description,
        };
      }
    } catch (error: any) {
      if (error.code === "ENOENT") {
        // Generate new auto defaults
        const generatedDefaults = await createDefaults(apiKey, baseApiUrl);
        await mkdir(experimentDefaultsDir, { recursive: true });
        await writeFile(
          experimentDefaultsFile,
          JSON.stringify(generatedDefaults, null, 2)
        );
        autoDefaults = {
          name: generatedDefaults.name,
          hypothesis: generatedDefaults.hypothesis,
          description: generatedDefaults.description,
        };
      }
    }

    // Combine user defaults with auto defaults
    return {
      name: autoDefaults.name || [],
      hypothesis: autoDefaults.hypothesis || [],
      description: autoDefaults.description || [],
      datasource: userDefaults.datasourceId,
      assignmentQuery: userDefaults.assignmentQueryId,
      environments: userDefaults.environments,
      filePaths: {
        experimentDefaultsFile,
        userDefaultsFile,
      },
      timestamp: new Date().toISOString(),
    };
  }

  // No user defaults, use fully automatic defaults
  let experimentDefaults;
  try {
    const experimentDefaultsData = await readFile(
      experimentDefaultsFile,
      "utf8"
    );
    let parsedExperimentDefaults = JSON.parse(experimentDefaultsData);
    if (
      !parsedExperimentDefaults ||
      new Date(parsedExperimentDefaults.timestamp).getTime() <
        new Date().getTime() - 1000 * 60 * 60 * 24 * 30 // 30 days
    ) {
      const generatedExperimentDefaults = await createDefaults(
        apiKey,
        baseApiUrl
      );

      await mkdir(experimentDefaultsDir, { recursive: true });
      await writeFile(
        experimentDefaultsFile,
        JSON.stringify(generatedExperimentDefaults, null, 2)
      );
      parsedExperimentDefaults = generatedExperimentDefaults;
    }
    experimentDefaults = parsedExperimentDefaults;
  } catch (error: any) {
    if (error.code === "ENOENT") {
      // experimentDefaultsFile does not exist, generate new defaults
      const generatedExperimentDefaults = await createDefaults(
        apiKey,
        baseApiUrl
      );

      await mkdir(experimentDefaultsDir, { recursive: true });
      await writeFile(
        experimentDefaultsFile,
        JSON.stringify(generatedExperimentDefaults, null, 2)
      );
      experimentDefaults = generatedExperimentDefaults;
    } else {
      throw error;
    }
  }

  return experimentDefaults;
}

/**
 * Tool: get_defaults
 */
export async function registerDefaultsTools({
  server,
  baseApiUrl,
  apiKey,
}: BaseToolsInterface) {
  server.tool(
    "get_defaults",
    "Get the default values for experiments, including hypothesis, description, datasource, assignment query, and environments.",
    {},
    async () => {
      const defaults = await getDefaults(apiKey, baseApiUrl);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(defaults, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "set_user_defaults",
    "Set user-defined defaults for datasource, assignment query, and environments. These will override the automatic defaults for these fields.",
    {
      datasourceId: z.string().describe("The data source ID to use as default"),
      assignmentQueryId: z
        .string()
        .describe("The assignment query ID to use as default"),
      environments: z
        .array(z.string())
        .describe("List of environment IDs to use as defaults"),
    },
    async ({ datasourceId, assignmentQueryId, environments }) => {
      try {
        const userDefaults: UserDefaults = {
          datasourceId,
          assignmentQueryId,
          environments,
          timestamp: new Date().toISOString(),
        };

        await mkdir(experimentDefaultsDir, { recursive: true });

        await writeFile(
          userDefaultsFile,
          JSON.stringify(userDefaults, null, 2)
        );

        return {
          content: [
            {
              type: "text",
              text: `User defaults have been saved:\n\n${JSON.stringify(
                userDefaults,
                null,
                2
              )} to ${userDefaultsFile}\n\nThese will be used when creating new experiments.`,
            },
          ],
        };
      } catch (error) {
        throw new Error(`Error setting user defaults: ${error}`);
      }
    }
  );

  server.tool(
    "clear_user_defaults",
    "Clear user-defined defaults and revert to automatic defaults.",
    {},
    async () => {
      try {
        await readFile(userDefaultsFile, "utf8");

        await unlink(userDefaultsFile);

        return {
          content: [
            {
              type: "text",
              text: "User defaults have been cleared. The system will now use automatic defaults.",
            },
          ],
        };
      } catch (error: any) {
        if (error.code === "ENOENT") {
          return {
            content: [
              {
                type: "text",
                text: "No user defaults were set.",
              },
            ],
          };
        }
        throw new Error(`Error clearing user defaults: ${error}`);
      }
    }
  );
}
