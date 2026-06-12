export interface PromptHarness {
  prompt?: string;
  promptTemplate?: string;
  variables?: Record<string, string | number | boolean>;
  fragments?: {
    subject?: string;
    style?: string;
    composition?: string;
    lighting?: string;
    color?: string;
    background?: string;
    text?: string;
    additional?: string[];
    constraints?: string[];
    negative?: string[];
  };
}

export function buildPrompt(harness: PromptHarness): string {
  const basePrompt = harness.promptTemplate
    ? interpolateTemplate(harness.promptTemplate, harness.variables ?? {})
    : harness.prompt
      ? interpolateTemplate(harness.prompt, harness.variables ?? {})
      : "";

  const fragments = harness.fragments ?? {};
  const sections: string[] = [];

  if (basePrompt.trim()) {
    sections.push(basePrompt.trim());
  }

  if (fragments.subject) {
    sections.push(`Subject: ${fragments.subject}`);
  }

  if (fragments.style) {
    sections.push(`Style: ${fragments.style}`);
  }

  if (fragments.composition) {
    sections.push(`Composition: ${fragments.composition}`);
  }

  if (fragments.lighting) {
    sections.push(`Lighting: ${fragments.lighting}`);
  }

  if (fragments.color) {
    sections.push(`Color direction: ${fragments.color}`);
  }

  if (fragments.background) {
    sections.push(`Background: ${fragments.background}`);
  }

  if (fragments.text) {
    sections.push(`Visible text in image: ${fragments.text}`);
  }

  if (fragments.additional?.length) {
    sections.push(`Extra details: ${fragments.additional.join("; ")}`);
  }

  if (fragments.constraints?.length) {
    sections.push(`Constraints: ${fragments.constraints.join("; ")}`);
  }

  if (fragments.negative?.length) {
    sections.push(`Avoid: ${fragments.negative.join("; ")}`);
  }

  return sections.join("\n");
}

function interpolateTemplate(
  template: string,
  variables: Record<string, string | number | boolean>,
): string {
  return template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key: string) => {
    const value = variables[key];
    return value === undefined ? "" : String(value);
  });
}
