export function getDocs(docs: string) {
  switch (docs) {
    case "nextjs":
    case "react":
      return react;
    case "javascript":
    case "typescript":
      return ts;
    default:
      return "For implementation details, visit https://docs.growthbook.io";
  }
}

export const ts = `
For GrowthBook usage in TypeScript or JavaScript, make sure it's installed and in the project:

import { GrowthBook } from "@growthbook/growthbook";

// Create a GrowthBook instance
const gb = new GrowthBook({
  apiHost: "https://cdn.growthbook.io",
  clientKey: "sdk-abc123",
  // Targeting attributes
  attributes: {
    id: "123",
    country: "US"
  },
  // Only required for A/B testing
  // Called every time a user is put into an experiment
  trackingCallback: (experiment, result) => {
    console.log("Experiment Viewed", {
      experimentId: experiment.key,
      variationId: result.key,
    });
  },
});

// Download features and experiments from the CDN
// Also, start running any Visual Editor or URL Redirect experiments
await gb.init();

Then, here are some examples of how to use growthbook instance:
// Simple boolean (on/off) feature flag
if (gb.isOn("my-feature")) {
  console.log("Feature enabled!");
}

// Get the value of a string/JSON/number feature with a fallback
const color = gb.getFeatureValue("button-color", "blue");
`;

export const react = `
For React usage, make sure it's installed and in the project:

import { useEffect } from "react";
import { GrowthBook, GrowthBookProvider } from "@growthbook/growthbook-react";

// Create a GrowthBook instance
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
gb.init({
  // Optional, enable streaming updates
  streaming: true
})

export default function App() {
  useEffect(() => {
    // Set user attributes for targeting (from cookie, auth system, etc.)
    gb.setAttributes({
      id: user.id,
      company: user.company,
    });
  }, [user])

  return (
    <GrowthBookProvider growthbook={gb}>
      <OtherComponent />
    </GrowthBookProvider>
  );
}
  

Then, here are some examples of how to use growthbook instance:

import { useFeatureValue, useFeatureIsOn } from "@growthbook/growthbook-react";

export default function OtherComponent() {
  // Boolean on/off features
  const newLogin = useFeatureIsOn("new-login-form");

  // String/Number/JSON features with a fallback value
  const buttonColor = useFeatureValue("login-button-color", "blue");

  if (newLogin) {
    return <NewLogin color={buttonColor} />;
  } else {
    return <Login color={buttonColor} />;
  }
}
  
import { IfFeatureEnabled, FeatureString } from "@growthbook/growthbook-react";

export default function OtherComponent() {
  return (
    <div>
      <h1>
        <FeatureString feature="site-h1" default="My Site"/>
      </h1>
      <IfFeatureEnabled feature="welcome-message">
        <p>Welcome to our site!</p>
      </IfFeatureEnabled>
    </div>
  );
}
  
Note that it's preferred to use hooks like useFeatureValue at the top of the component and then use the value in the TSX/JSX`;
