/**
 * Addons module — manages external process addons (Roslyn, etc.)
 */

export {
  type CSharpEntityMetadata,
  CSharpNativeParser,
  type CSharpParsedEntity,
  type CSharpParseResult,
} from "./csharp-native-parser.js";
export { RoslynAddonClient, type RoslynClientOptions } from "./roslyn-client.js";
export {
  ensureRoslynStarted,
  findSolutionFile,
  getCSharpParser,
  getRoslynClient,
  isRoslynAvailable,
  shutdownRoslynClient,
} from "./roslyn-lifecycle.js";
