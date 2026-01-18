# Framework

*Last updated: 2026-01-18*

Модуль для анализа паттернов фреймворков Kotlin (Android, Coroutines, Ktor).

## Exports

| Name | Type | Location |
|------|------|----------|
| `ANDROID_STATE_HOLDERS` | const | [→ android-extractor.ts:47-91] |
| `detectAndroidFramework` | function | [→ android-extractor.ts:79-91] |
| `detectCoroutinesFramework` | function | [→ coroutines-extractor.ts:115] |
| `detectKtorFramework` | function | [→ ktor-extractor.ts:79] |
| `enrichEntityWithAndroid` | function | [→ android-extractor.ts:205-211] |
| `enrichEntityWithCoroutines` | function | [→ coroutines-extractor.ts:292-298] |
| `enrichEntityWithKtor` | function | [→ ktor-extractor.ts:339-345] |
| `extractAndroidInfo` | function | [→ android-extractor.ts:115-120] |
| `extractAuthenticationConfig` | function | [→ ktor-extractor.ts:296-300] |
| `extractChannelInfo` | function | [→ coroutines-extractor.ts:352-356] |
| `extractComposeStateUsages` | function | [→ android-extractor.ts:285-288] |
| `extractCoroutineExceptionHandling` | function | [→ coroutines-extractor.ts:391-395] |
| `extractCoroutineScopeInfo` | function | [→ coroutines-extractor.ts:250-257] |
| `extractFlowInfo` | function | [→ coroutines-extractor.ts:198-204] |
| `extractFlowOperatorChain` | function | [→ coroutines-extractor.ts:228] |
| `extractHttpClientConfig` | function | [→ ktor-extractor.ts:391-395] |
| `extractInstalledPlugins` | function | [→ ktor-extractor.ts:234-237] |
| `extractKtorRoutes` | function | [→ ktor-extractor.ts:112] |
| `extractNavigationDestinations` | function | [→ android-extractor.ts:353-356] |
| `extractResourceReferences` | function | [→ android-extractor.ts:319-322] |
| `extractRouteHandlers` | function | [→ ktor-extractor.ts:181-186] |
| `extractSerializationConfig` | function | [→ ktor-extractor.ts:265-268] |
| `extractSuspendFunctionInfo` | function | [→ coroutines-extractor.ts:155] |
| `extractViewModelInfo` | function | [→ android-extractor.ts:162-196] |
| `extractWebSocketRoutes` | function | [→ ktor-extractor.ts:440-444] |
| `FLOW_OPERATORS` | const | [→ coroutines-extractor.ts:38] |
| `getAllEndpoints` | function | [→ ktor-extractor.ts:483-487] |
| `getAndroidConfidence` | function | [→ android-extractor.ts:96-106] |
| `getCoroutineComplexityScore` | function | [→ coroutines-extractor.ts:410] |
| `getCoroutinesConfidence` | function | [→ coroutines-extractor.ts:130] |
| `getKtorConfidence` | function | [→ ktor-extractor.ts:94] |
| `isComposableFunction` | function | [→ android-extractor.ts:275-280] |
| `isKtorApplication` | function | [→ ktor-extractor.ts:476-478] |
| `isSuspendFunction` | function | [→ coroutines-extractor.ts:148-150] |
| `usesStructuredConcurrency` | function | [→ coroutines-extractor.ts:437] |

## Files

- `android-extractor.ts`
- `coroutines-extractor.ts`
- `ktor-extractor.ts`
