export function createJsonResult<T extends object>(value: T) {
  return {
    content: createTextContent(JSON.stringify(value, null, 2)),
    structuredContent: value as Record<string, unknown>,
  };
}

function createTextContent(
  text: string,
): Array<{ type: "text"; text: string }> {
  return [{ type: "text", text }];
}
