export const FEATURE_FLAG_DOCS = {
  react: `## React Feature Flag Implementation

### Boolean Feature Flags
Use \`useFeatureIsOn\` for simple on/off features. \`useFeatureIsOn\` should appear in the component body, not in the return statement/template:
\`\`\`tsx
import { useFeatureIsOn } from "@growthbook/growthbook-react";

function LoginPage() {
  const showNewDesign = useFeatureIsOn("new-login-design");
  
  return showNewDesign ? <NewLoginForm /> : <OldLoginForm />;
}
\`\`\`

### Feature Values with Defaults
Use \`useFeatureValue\` when you need specific values. \`useFeatureValue\` should appear in the component body, not in the return statement/template:
\`\`\`tsx
import { useFeatureValue } from "@growthbook/growthbook-react";

function Button() {
  const buttonColor = useFeatureValue("button-color", "blue");
  const buttonSize = useFeatureValue("button-size", "medium");
  
  return (
    <button 
      className={\`btn btn-\${buttonColor} btn-\${buttonSize}\`}
    >
      Click me
    </button>
  );
}
\`\`\`

### Declarative Components
Use feature components for conditional rendering:
\`\`\`tsx
import { IfFeatureEnabled, FeatureString } from "@growthbook/growthbook-react";

function HomePage() {
  return (
    <div>
      <h1>
        <FeatureString feature="site-title" default="Welcome" />
      </h1>
      
      <IfFeatureEnabled feature="promo-banner">
        <PromoBanner />
      </IfFeatureEnabled>
      
      <IfFeatureEnabled feature="new-checkout" fallback={<OldCheckout />}>
        <NewCheckout />
      </IfFeatureEnabled>
    </div>
  );
}
\`\`\``,

  javascript: `## JavaScript Feature Flag Implementation

### Simple Feature Checks
Use \`isOn()\` for boolean features:
\`\`\`javascript
function renderDashboard() {
  if (gb.isOn("new-dashboard")) {
    return renderNewDashboard();
  }
  return renderOldDashboard();
}
\`\`\`

### Feature Values with Fallbacks
Use \`getFeatureValue()\` for configuration values:
\`\`\`javascript
function configureAPI() {
  const apiTimeout = gb.getFeatureValue("api-timeout", 5000);
  const retryCount = gb.getFeatureValue("retry-count", 3);
  
  return {
    timeout: apiTimeout,
    retries: retryCount
  };
}
\`\`\`

### Detailed Feature Evaluation
Use \`evalFeature()\` when you need metadata:
\`\`\`javascript
function trackFeatureUsage(featureKey) {
  const result = gb.evalFeature(featureKey);
  
  // Track feature usage for analytics
  analytics.track('feature_evaluated', {
    feature: featureKey,
    value: result.value,
    source: result.source,
    ruleId: result.ruleId
  });
  
  return result.value;
}
\`\`\``,

  vue: `## Vue Feature Flag Implementation

### Composition API
\`\`\`typescript
import { ref, watch, inject } from 'vue'

const showBanner = ref(growthbook?.isOn('show-banner'))

// Optional real-time watching
watch(growthbook, () => {
  showBanner.value = growthbook?.isOn('show-banner')
})
\`\`\`

### Options API
\`\`\`typescript
export default {
  data() {
    return {
      showBanner: false
    }
  },
  mounted() {
    const gb = inject(gbKey)
    if (gb) {
      this.showBanner = gb.isOn('show-banner')
    }
  }
}
\`\`\`

### Template Usage
\`\`\`html
<template>
  <div>
    <h1 v-if="showBanner">Now you see me!</h1>
  </div>
</template>
\`\`\``,

  python: `## Python Feature Flag Implementation

### Boolean Feature Checks
Use \`is_on()\` and \`is_off()\` for feature toggles:
\`\`\`python
def process_payment(gb, payment_data):
    if gb.is_on("new-payment-processor"):
        return new_payment_service.process(payment_data)
    else:
        return legacy_payment_service.process(payment_data)
\`\`\`

### Feature Values with Defaults
Use \`get_feature_value()\` for configuration:
\`\`\`python
def get_api_config(gb):
    return {
        'timeout': gb.get_feature_value("api-timeout", 30),
        'max_retries': gb.get_feature_value("max-retries", 3),
        'batch_size': gb.get_feature_value("batch-size", 100)
    }
\`\`\`

### Detailed Feature Evaluation
Use \`evalFeature()\` for comprehensive feature info:
\`\`\`python
def evaluate_feature_with_tracking(gb, feature_key):
    result = gb.evalFeature(feature_key)
    
    # Log feature evaluation for debugging
    logger.info(f"Feature {feature_key}: value={result.value}, source={result.source}")
    
    return result.value
\`\`\`

### Web Framework Integration (Django Example)
\`\`\`python
def growthbook_middleware(get_response):
    def middleware(request):
        # Initialize GrowthBook for each request
        request.gb = create_growthbook_instance(
            user_id=getattr(request.user, 'id', None),
            is_authenticated=request.user.is_authenticated,
            user_type=getattr(request.user, 'user_type', 'anonymous')
        )
        
        response = get_response(request)
        return response
    return middleware
\`\`\``,

  go: `## Go Feature Flag Implementation

### Basic Feature Evaluation
\`\`\`go
// Evaluate a text feature
buttonColor := client.EvalFeature(context.Background(), "buy-button-color")
if buttonColor.Value == "blue" {
    // Perform actions for blue button
}

// Evaluate a boolean feature
darkMode := client.EvalFeature(context.Background(), "dark-mode")
if darkMode.On {
    // Enable dark mode
}
\`\`\`

### Detailed Feature Inspection
\`\`\`go
result, err := client.EvalFeature(context.TODO(), "my-feature")
if err != nil {
    // Handle error
}

// Check feature value and source
if result.On {
    // Feature is enabled
}

// Inspect how the feature value was determined
switch result.Source {
case gb.DefaultValueResultSource:
    // Used default value
case gb.ExperimentResultSource:
    // Value determined by an experiment
case gb.ForceResultSource:
    // Manually forced value
}
\`\`\``,

  php: `## PHP Feature Flag Implementation

### Basic Feature Checks
\`\`\`php
// Check if a feature is on
if ($growthbook->isOn("my-feature")) {
  echo "It's on!";
}

// Check if a feature is off
if ($growthbook->isOff("my-feature")) {
  echo "It's off :(";
}
\`\`\`

### Feature Values with Fallback
\`\`\`php
// Get feature value with default fallback
$color = $growthbook->getValue("button-color", "blue");
echo "<button style='color:\${color}'>Click Me!</button>";
\`\`\`

### Detailed Feature Result
\`\`\`php
$featureResult = $growthbook->getFeature("my-feature");

// Access feature result properties
$value = $featureResult->value;
$isOn = $featureResult->on;
$source = $featureResult->source; // e.g. 'defaultValue', 'experiment'
\`\`\`

### Inline Experiments
\`\`\`php
$exp = Growthbook\\InlineExperiment::create(
  "my-experiment", 
  ["red", "blue", "green"]
);

// Run experiment and get result
$result = $growthbook->runInlineExperiment($exp);
echo $result->value; // Will be "red", "blue", or "green"
\`\`\``,

  ruby: `## Ruby Feature Flag Implementation

### Basic Feature Evaluation
\`\`\`ruby
# Check if feature is enabled
if gb.feature_on?("my-feature")
  puts "Feature is on!"
end

# Get feature value with default
color = gb.get_feature_value("button-color", "blue")
\`\`\`

### Detailed Feature Results
\`\`\`ruby
result = gb.eval_feature("my-feature")
puts result.value
puts result.on?
puts result.source
\`\`\``,

  java: `## Java Feature Flag Implementation

### Feature State Checks
\`\`\`java
// Check if a feature is on/off
boolean isDarkModeEnabled = growthBook.isOn("dark_mode");
boolean isFeatureDisabled = growthBook.isOff("feature_key");
\`\`\`

### Feature Values with Defaults
\`\`\`java
// Get feature value with a default
String welcomeMessage = growthBook.getFeatureValue("welcome_message", "Default Welcome");
Float pricing = growthBook.getFeatureValue("product_price", 9.99f);
\`\`\`

### Complex Type Evaluation
\`\`\`java
// For complex objects, specify the class for deserialization
MyConfig config = growthBook.getFeatureValue(
    "app_config", 
    defaultConfig, 
    MyConfig.class
);

// Detailed feature evaluation
FeatureResult<Float> result = growthBook.evalFeature("pricing");
Float value = result.getValue();
FeatureResultSource source = result.getSource();
\`\`\``,

  csharp: `## C# Feature Flag Implementation

### Basic Feature Evaluation
\`\`\`csharp
// Check if feature is enabled
if (gb.IsOn("my-feature"))
{
    Console.WriteLine("Feature is enabled!");
}

// Get feature value with default
var buttonColor = gb.GetFeatureValue("button-color", "blue");
\`\`\`

### Typed Feature Values
\`\`\`csharp
// Get strongly typed feature values
var maxRetries = gb.GetFeatureValue<int>("max-retries", 3);
var timeout = gb.GetFeatureValue<double>("timeout-seconds", 30.0);
\`\`\`

### Feature Result Details
\`\`\`csharp
var result = gb.EvalFeature("my-feature");
Console.WriteLine($"Value: {result.Value}");
Console.WriteLine($"Source: {result.Source}");
Console.WriteLine($"On: {result.On}");
\`\`\``,

  swift: `## Swift Feature Flag Implementation

### Basic Feature Checks
\`\`\`swift
// Check if feature is enabled
if gb.isOn(feature: "dark-mode") {
    // Enable dark mode
}

// Get feature value with default
let buttonColor = gb.getFeatureValue(feature: "button-color", defaultValue: "blue")
\`\`\`

### Feature Evaluation
\`\`\`swift
let result = gb.evalFeature("my-feature")
print("Value: \\(result.value)")
print("On: \\(result.on)")
print("Source: \\(result.source)")
\`\`\``,

  elixir: `## Elixir Feature Flag Implementation

### Basic Feature Evaluation
\`\`\`elixir
# Check if feature is enabled
case GrowthBook.feature_on?(gb, "my-feature") do
  true -> IO.puts("Feature is on!")
  false -> IO.puts("Feature is off")
end

# Get feature value with default
button_color = GrowthBook.get_feature_value(gb, "button-color", "blue")
\`\`\`

### Feature Result Evaluation
\`\`\`elixir
result = GrowthBook.eval_feature(gb, "my-feature")
IO.inspect(result.value)
IO.inspect(result.on)
IO.inspect(result.source)
\`\`\``,

  kotlin: `## Kotlin Feature Flag Implementation

### Basic Feature Checks
\`\`\`kotlin
// Get feature and check if enabled
val feature = gb.feature("dark-mode")
if (feature.on) {
    // Enable dark mode
}

// Check if feature is off
if (feature.off) {
    // Feature is disabled
}
\`\`\`

### Feature Values
\`\`\`kotlin
// Get feature value
val buttonColor = gb.feature("button-color")
val colorValue = buttonColor.value

// Direct value access with fallback logic
val actualColor = if (buttonColor.on) buttonColor.value else "blue"
\`\`\`

### Feature Result Details
\`\`\`kotlin
val feature = gb.feature("my-feature")
println("Value: \${feature.value}")
println("On: \${feature.on}")
println("Off: \${feature.off}")
println("Source: \${feature.source}")
\`\`\``,

  flutter: `## Flutter Feature Flag Implementation

### Basic Feature Usage
\`\`\`dart
// Check if feature is enabled
if (gb.isOn('dark-mode')) {
  // Enable dark mode
}

// Get feature value with default
String buttonColor = gb.getFeatureValue('button-color', 'blue');
\`\`\`

### Widget Integration
\`\`\`dart
class MyWidget extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final showBanner = gb.isOn('show-banner');
    
    return Column(
      children: [
        if (showBanner) BannerWidget(),
        MainContent(),
      ],
    );
  }
}
\`\`\`

### Feature Result Evaluation
\`\`\`dart
GBFeatureResult result = gb.evalFeature('my-feature');
print('Value: \${result.value}');
print('On: \${result.on}');
print('Source: \${result.source}');
\`\`\``,
};

export function getFeatureFlagDocs(language: string) {
  switch (language.toLowerCase()) {
    case "react":
    case "tsx":
    case "jsx":
      return FEATURE_FLAG_DOCS.react;
    case "javascript":
    case "js":
    case "node":
      return FEATURE_FLAG_DOCS.javascript;
    case "vue":
      return FEATURE_FLAG_DOCS.vue;
    case "python":
    case "py":
      return FEATURE_FLAG_DOCS.python;
    case "go":
      return FEATURE_FLAG_DOCS.go;
    case "php":
      return FEATURE_FLAG_DOCS.php;
    case "ruby":
    case "rb":
      return FEATURE_FLAG_DOCS.ruby;
    case "java":
      return FEATURE_FLAG_DOCS.java;
    case "csharp":
    case "cs":
      return FEATURE_FLAG_DOCS.csharp;
    case "swift":
      return FEATURE_FLAG_DOCS.swift;
    case "elixir":
    case "ex":
    case "exs":
      return FEATURE_FLAG_DOCS.elixir;
    case "kotlin":
    case "kt":
    case "kts":
    case "ktm":
      return FEATURE_FLAG_DOCS.kotlin;
    case "flutter":
    case "dart":
      return FEATURE_FLAG_DOCS.flutter;
    default:
      return "Feature flag documentation not available for this language. Check GrowthBook docs for implementation details.";
  }
}
