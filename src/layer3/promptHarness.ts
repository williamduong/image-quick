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
  const resolvedHarness = resolvePromptHarness(harness, harness.variables ?? {});
  const basePrompt = resolvedHarness.promptTemplate
    ? resolvedHarness.promptTemplate
    : resolvedHarness.prompt ?? "";

  const fragments = resolvedHarness.fragments ?? {};
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

export function resolvePromptHarness(
  harness: PromptHarness,
  variables: Record<string, string | number | boolean>,
): PromptHarness {
  return {
    ...harness,
    prompt: harness.prompt ? renderTemplateString(harness.prompt, variables) : undefined,
    promptTemplate: harness.promptTemplate
      ? renderTemplateString(harness.promptTemplate, variables)
      : undefined,
    variables: {
      ...(harness.variables ?? {}),
      ...variables,
    },
    fragments: harness.fragments
      ? {
          subject: maybeInterpolate(harness.fragments.subject, variables),
          style: maybeInterpolate(harness.fragments.style, variables),
          composition: maybeInterpolate(harness.fragments.composition, variables),
          lighting: maybeInterpolate(harness.fragments.lighting, variables),
          color: maybeInterpolate(harness.fragments.color, variables),
          background: maybeInterpolate(harness.fragments.background, variables),
          text: maybeInterpolate(harness.fragments.text, variables),
          additional: interpolateStringArray(harness.fragments.additional, variables),
          constraints: interpolateStringArray(harness.fragments.constraints, variables),
          negative: interpolateStringArray(harness.fragments.negative, variables),
        }
      : undefined,
  };
}

export function mergePromptHarness(
  base: PromptHarness,
  override: PromptHarness,
): PromptHarness {
  return {
    ...base,
    ...override,
    variables: {
      ...(base.variables ?? {}),
      ...(override.variables ?? {}),
    },
    fragments: {
      ...(base.fragments ?? {}),
      ...(override.fragments ?? {}),
      additional: [
        ...((base.fragments?.additional ?? [])),
        ...((override.fragments?.additional ?? [])),
      ],
      constraints: [
        ...((base.fragments?.constraints ?? [])),
        ...((override.fragments?.constraints ?? [])),
      ],
      negative: [
        ...((base.fragments?.negative ?? [])),
        ...((override.fragments?.negative ?? [])),
      ],
    },
  };
}

export function renderTemplateString(
  template: string,
  variables: Record<string, string | number | boolean>,
): string {
  return template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key: string) => {
    const value = variables[key];
    return value === undefined ? "" : String(value);
  });
}

function maybeInterpolate(
  value: string | undefined,
  variables: Record<string, string | number | boolean>,
): string | undefined {
  return value === undefined ? undefined : renderTemplateString(value, variables);
}

function interpolateStringArray(
  values: string[] | undefined,
  variables: Record<string, string | number | boolean>,
): string[] | undefined {
  return values?.map((value) => renderTemplateString(value, variables));
}
