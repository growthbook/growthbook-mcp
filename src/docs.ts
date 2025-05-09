export function getDocs(docs: string, usage?: "implementation" | "setup") {
  if (usage === "setup") {
    switch (docs) {
      case "nextjs":
        return boilerPlateSetup + " + " + nextjsSetup;
      case "react":
        return boilerPlateSetup + " + " + reactSetup;
      case "javascript":
      case "typescript":
        return boilerPlateSetup;
      default:
        return "For setup details, visit https://docs.growthbook.io";
    }
  }

  switch (docs) {
    case ".tsx":
    case ".jsx":
      return react;
    case ".js":
    case ".ts":
      return ts;
    default:
      return "For implementation details, visit https://docs.growthbook.io";
  }
}

export const ts = `
Here are some examples of how to use GrowthBook instance. In some cases, the instance variable may have a different name:
// Simple boolean (on/off) feature flag
if (gb.isOn("my-feature")) {
  // Feature is on
}

// Get the value of a string/JSON/number feature with a fallback
const color = gb.getFeatureValue("button-color", "blue");
`;

export const react = `
Here are some helper hooks for using GrowthBook in React.  
**Best practice:** Call these hooks at the top of your component, then use the returned values in your JSX. This keeps logic predictable and follows React’s rules of hooks.

\`\`\`tsx
import { useFeatureValue, useFeatureIsOn } from "@growthbook/growthbook-react";

export default function OtherComponent() {
  // Boolean on/off features
  const newLogin = useFeatureIsOn("new-login-form");

  // String/Number/JSON features with a fallback value
  const buttonColor = useFeatureValue("login-button-color", "blue");

  return newLogin ? (
    <NewLogin color={buttonColor} />
  ) : (
    <Login color={buttonColor} />
  );
}
\`\`\`

If you prefer declarative components, you can also use our helper components:

\`\`\`tsx
import { IfFeatureEnabled, FeatureString } from "@growthbook/growthbook-react";

export default function OtherComponent() {
  return (
    <div>
      <h1>
        <FeatureString feature="site-h1" default="My Site" />
      </h1>
      <IfFeatureEnabled feature="welcome-message">
        <p>Welcome to our site!</p>
      </IfFeatureEnabled>
    </div>
  );
}
\`\`\`
`;

const boilerPlateSetup = `
1. Check that GrowthBook is installed and in the project. This will be a package like @growthbook/growthbook in package.json.

2. Ensure there is a GrowthBook instance in the project. Generally, this takes the shape of:

import { GrowthBook } from "@growthbook/growthbook-react";

const gb = new GrowthBook({
  apiHost: "https://cdn.growthbook.io",
  clientKey: "sdk-abc123",
  enableDevMode: true,
  // Only required for A/B testing
  // Called every time a user is put into an experiment
  trackingCallback: (experiment, result) => {
    console.log("Experiment Viewed", {
      experimentId: experiment.key,
      variationId: result.key,
    });
  },
});

The tracking callback should reference whatever analytics or logging system you're using.

Use the get_sdk_connections tool to verify that the clientKey is correct.

3. The gb instance should initiated like gb.init()
`;
const nextjsSetup = ``;

const reactSetup = ``;
