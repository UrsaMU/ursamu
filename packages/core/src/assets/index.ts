const _registry = new Map<string, string>();

export function registerText(name: string, content: string): void {
  _registry.set(name, content);
}

export function getText(name: string): string | undefined {
  return _registry.get(name);
}

export function hasText(name: string): boolean {
  return _registry.has(name);
}
