# Contributing to GrowthBook MCP Server

Thank you for your interest in contributing! Follow these steps to work locally and test your changes:

## Local Development Setup

1. **Clone the repository**

   ```sh
   git clone https://github.com/YOUR_USERNAME/growthbook-mcp.git
   cd growthbook-mcp
   ```

2. **Install dependencies**

   ```sh
   pnpm install
   ```

3. **Build the project**

   Use TypeScript to generate the build:

   ```sh
   npx tsc
   ```

   This will output the compiled JavaScript files to the `dist/` directory (or as configured in `tsconfig.json`).

4. **Add the server to your AI tool**

When configuring your MCP client (e.g., Cursor, VS Code, Claude Desktop), use the absolute path to your local build. Example JSON config:

   ```json
   {
     "mcpServers": {
       "growthbook": {
         "command": "node",
         "args": ["/absolute/path/to/growthbook-mcp/dist/index.js"],
         "env": {
           "GB_API_KEY": "your-api-key",
           "GB_USER": "your-name",
           "GB_API_URL": "your-api-url",
           "GB_APP_ORIGIN": "your-app-origin"
         }
       }
     }
   }
   ```

Replace `/absolute/path/to/growthbook-mcp/dist/index.js` with the actual path on your machine. If you're testing with a local version of GrowthBook, be sure to update environment variables to point to your local install.

GrowthBook MCP is now ready to use 🤖

## Testing Changes

- After making code changes, re-run `npx tsc` to rebuild.
- Restart the server to pick up your changes.

## Submitting Pull Requests

1. Fork the repository and create your branch.
2. Make your changes and commit with clear messages.
3. Ensure your code is linted and built successfully.
4. Open a pull request with a description of your changes.

---

For more details on client integration and available tools, see the [README.md](./README.md).

---

## Bonus: Use the MCP Inspector 🚀

For a better development and debugging experience, try the [MCP Inspector](https://github.com/modelcontextprotocol/inspector) to test tools and more.

```bash
npx @modelcontextprotocol/inspector -e GB_API_KEY=<value> -e GB_USER=<name> -e GB_API_URL=http://localhost:3100 -e GB_APP_ORIGIN=http://localhost:3000 node build/index.js
