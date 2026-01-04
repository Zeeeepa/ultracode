/**
 * NgRx Parser Types
 *
 * Type definitions for NgRx state management constructs.
 */

import type { RelationType } from "../../types/storage.js";

/**
 * NgRx Action definition
 */
export interface NgRxAction {
  name: string;
  type: string; // e.g., '[Task] Load Tasks'
  hasProps: boolean;
  propsType?: string | undefined;
  filePath: string;
  line: number;
}

/**
 * NgRx Effect definition
 */
export interface NgRxEffect {
  name: string;
  listensTo: string[]; // Action types this effect responds to (ofType)
  dispatches: string[]; // Action types this effect dispatches
  isRoot: boolean;
  functional: boolean; // createEffect vs @Effect decorator
  filePath: string;
  line: number;
}

/**
 * NgRx Reducer handler
 */
export interface NgRxReducerHandler {
  actionType: string;
  stateChanges: string[]; // Properties modified
}

/**
 * NgRx Reducer definition
 */
export interface NgRxReducer {
  name: string;
  stateName: string;
  handlers: NgRxReducerHandler[];
  filePath: string;
  line: number;
}

/**
 * NgRx Selector definition
 */
export interface NgRxSelector {
  name: string;
  dependencies: string[]; // Other selectors this depends on
  statePath?: string | undefined; // e.g., 'state.tasks.items'
  filePath: string;
  line: number;
}

/**
 * Store dispatch call
 */
export interface NgRxDispatch {
  actionName: string;
  actionType?: string | undefined;
  callerEntity: string;
  filePath: string;
  line: number;
}

/**
 * Store select call
 */
export interface NgRxSelect {
  selectorName: string;
  callerEntity: string;
  filePath: string;
  line: number;
}

/**
 * Complete NgRx analysis result
 */
export interface NgRxAnalysis {
  actions: NgRxAction[];
  effects: NgRxEffect[];
  reducers: NgRxReducer[];
  selectors: NgRxSelector[];
  dispatches: NgRxDispatch[];
  selects: NgRxSelect[];
}

/**
 * NgRx relationship for graph storage
 */
export interface NgRxRelationship {
  fromName: string;
  toName: string;
  type: RelationType;
  metadata: {
    actionType?: string | undefined;
    context?: string;
  };
}
