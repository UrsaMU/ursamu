export interface IParserContext {
  data: Record<string, unknown>;
  registers: Record<string, string>;
  args: string[];
}
