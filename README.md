# GrowthBook MCP Server

With the GrowthBook MCP server, you can interact with GrowthBook right from your LLM client. See experiment details, add a feature flag, and more.

<a href="https://glama.ai/mcp/servers/@growthbook/growthbook-mcp">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@growthbook/growthbook-mcp/badge" alt="GrowthBook Server MCP server" />
</a>

## Setup

**Environment Variables**
Use the following env variables to configure the MCP server.

| Variable Name | Status   | Description                                                       |
| ------------- | -------- | ----------------------------------------------------------------- |
| GB_API_KEY    | Required | A GrowthBook API key.                                             |
| GB_USER       | Required | Your name. Used when creating a feature flag.                     |
| GB_API_URL    | Optional | Your GrowthBook API URL. Defaults to `https://api.growthbook.io`. |
| GB_APP_ORIGIN | Optional | Your GrowthBook app URL Defaults to `https://app.growthbook.io`.  |

Find instructions below to add the MCP server to a client. Any client that supports MCP is also compatible. Consult its documentation for how to add the server.

### Cursor

1. Open **Cursor Settings** &rarr; **MCP**
2. Click **Add new global MCP server**
3. Add an entry for the GrowthBook MCP, following the pattern below:

```json
{
  "mcpServers": {
    "growthbook": {
      "command": "npx",
      "args": ["-y", "@growthbook/mcp"],
      "env": {
        "GB_API_KEY": "YOUR_API_KEY",
        "GB_API_URL": "YOUR_API_URL",
        "GB_APP_ORIGIN": "YOUR_APP_ORIGIN",
        "GB_USER": "YOUR_NAME"
      }
    }
  }
}
```

3. Save the settings.

You should now see a green active status after the server successfully connects!

### VS Code

1. Open **User Settings (JSON)**
2. Add an MCP entry:

```json
 "mcp": {
    "servers": {
      "growthbook": {
        "command": "npx",
        "args": [
          "-y", "@growthbook/mcp"
        ],
        "env": {
          "GB_API_KEY": "YOUR_API_KEY",
          "GB_API_URL": "YOUR_API_URL",
          "GB_APP_ORIGIN": "YOUR_APP_ORIGIN",
          "GB_USER": "YOUR_NAME"
        }
      }
    }
  }
```

3. Save your settings.

GrowthBook MCP is now ready to use in VS Code.

### Claude Desktop

1. **Open Settings** &rarr; **Developer**
2. Click **Edit Config**
3. Open `claude_desktop_config.json`
4. Add the following configuration:

```json
{
  "mcpServers": {
    "growthbook": {
      "command": "npx",
      "args": ["-y", "@growthbook/mcp"],
      "env": {
        "GB_API_KEY": "YOUR_API_KEY",
        "GB_API_URL": "YOUR_API_URL",
        "GB_APP_ORIGIN": "YOUR_APP_ORIGIN",
        "GB_USER": "YOUR_NAME"
      }
    }
  }
}
```

5. Save the config and restart Claude

A hammer icon should appear in the chat window, indicating that your GrowthBook MCP server is connected and available!

---

## Tools

- **Feature Flags**

  - `create_feature_flag`: Create, add, or wrap an element with a feature flag. Specify key, type, default value, and metadata.
  - `get_feature_flags`: List all feature flags in your GrowthBook instance.
  - `get_single_feature_flag`: Fetch details for a specific feature flag by ID.
  - `get_stale_safe_rollouts`: List all safe rollout rules that have been rolled back or released.
  - `create_force_rule`: Create a feature flag with a targeting condition.
  - `generate_flag_types`: Generates types for feature flags

- **Experiments**

  - `get_experiments`: List all experiments in GrowthBook.
  - `get_experiment`: Fetch details for a specific experiment by ID.
  - `get_attributes`: List all user attributes tracked in GrowthBook (useful for targeting).
  - `create_experiment`: Creates a feature-flag based experiment.

- **Environments**

  - `get_environments`: List all environments (e.g., production, staging) configured in GrowthBook.

- **Projects**

  - `get_projects`: List all projects in your GrowthBook instance.

- **SDK Connections**

  - `get_sdk_connections`: List all SDK connections (how GrowthBook connects to your apps).
  - `create_sdk_connection`: Create a new SDK connection for your app, specifying language and environment.

- **Documentation Search**
  - `search_growthbook_docs`: Search the GrowthBook documentation for information on how to use a feature, by keyword or question.