# GrowthBook MCP Server

// Todo: overview

## Installation

**Environment Variables**

| Variable Name | Status | Description |
| --- | --- | --- | --- |
| GB_API_KEY | Required | A GrowthBook API key. |
| GB_USER | Required | Your name. Used when creating a feature flag. |
| GB_API_URL | Optional | Your GrowthBook API URL. Defaults to |
| GB_APP_ORIGIN | Optional | Your GrowthBook app URL Defaults to |

### Cursor
1. Open **Cursor Settings** &rarr; **MCP**
2. Click **Add new global MCP server**
2. Add an entry for the GrowthBook MCP, following the pattern below:

```json
{
  "mcpServers": {
    "growthbook": {
      "command": "node",
      "args": ["ABSOLUTE_PATH_TO_THE_BUILT_MCP_SERVER"],
      "env": {
        "GB_API_KEY": "YOUR_API_KEY",
        "GB_API_URL": "YOUR_API_URL",
        "GB_APP_ORIGIN": "YOUR_APP_ORIGIN",
        "GB_USER": "YOUR_NAME"
      }
    },
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
        "command": "node",
        "args": [
          "ABSOLUTE_PATH_TO_THE_BUILT_MCP_SERVER"
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
      "command": "node",
      "args": ["ABSOLUTE_PATH_TO_THE_BUILT_MCP_SERVER"],
      "env": {
        "GB_API_KEY": "YOUR_API_KEY",
        "GB_API_URL": "YOUR_API_URL",
        "GB_APP_ORIGIN": "YOUR_APP_ORIGIN",
        "GB_USER": "YOUR_NAME"
      }
    },
  }
}
```
5. Save the config and restart Claude

A hammer icon should appear in the chat window, indicating that your GrowthBook MCP server is connected and available!

---

Most other clients are supported. Follow their respective instructions for installation.

### Local
1. Clone the repo
2. Run `npx tsc` to generate a build

## Tools

// Todo

