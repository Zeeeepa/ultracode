/**
 * NgRx Entity and Relationship Builders
 *
 * Converts NgRx analysis results into graph entities and relationships.
 */

import type { ParsedEntity } from "../../types/parser.js";
import { RelationType } from "../../types/storage.js";
import type { NgRxAnalysis, NgRxRelationship } from "./types.js";

/**
 * Build NgRx relationships from analysis
 */
export function buildNgRxRelationships(analysis: NgRxAnalysis): NgRxRelationship[] {
  const relationships: NgRxRelationship[] = [];

  // Effect → Action (listens_to_action)
  for (const effect of analysis.effects) {
    for (const actionName of effect.listensTo) {
      relationships.push({
        fromName: effect.name,
        toName: actionName,
        type: RelationType.LISTENS_TO_ACTION,
        metadata: { context: "ofType" },
      });
    }

    // Effect → Action (dispatches_action)
    for (const actionName of effect.dispatches) {
      relationships.push({
        fromName: effect.name,
        toName: actionName,
        type: RelationType.DISPATCHES_ACTION,
        metadata: { context: "effect dispatch" },
      });
    }
  }

  // Reducer → Action (handles_action)
  for (const reducer of analysis.reducers) {
    for (const handler of reducer.handlers) {
      relationships.push({
        fromName: reducer.name,
        toName: handler.actionType,
        type: RelationType.HANDLES_ACTION,
        metadata: { context: "on handler" },
      });

      // Reducer → State (modifies_state)
      for (const stateProp of handler.stateChanges) {
        relationships.push({
          fromName: reducer.name,
          toName: `${reducer.stateName}.${stateProp}`,
          type: RelationType.MODIFIES_STATE,
          metadata: { actionType: handler.actionType },
        });
      }
    }
  }

  // Selector → Selector (depends_on for selector composition)
  for (const selector of analysis.selectors) {
    for (const dep of selector.dependencies) {
      relationships.push({
        fromName: selector.name,
        toName: dep,
        type: RelationType.DEPENDS_ON,
        metadata: { context: "selector composition" },
      });
    }
  }

  // Component/Effect → Action (dispatches_action)
  for (const dispatch of analysis.dispatches) {
    relationships.push({
      fromName: dispatch.callerEntity,
      toName: dispatch.actionName,
      type: RelationType.DISPATCHES_ACTION,
      metadata: { context: "store.dispatch" },
    });
  }

  // Component → Selector (selects_state)
  for (const select of analysis.selects) {
    relationships.push({
      fromName: select.callerEntity,
      toName: select.selectorName,
      type: RelationType.SELECTS_STATE,
      metadata: { context: "store.select" },
    });
  }

  return relationships;
}

/**
 * Build NgRx entities for graph storage
 */
export function buildNgRxEntities(analysis: NgRxAnalysis): ParsedEntity[] {
  const entities: ParsedEntity[] = [];

  // Actions
  for (const action of analysis.actions) {
    entities.push({
      name: action.name,
      type: "variable", // Actions are const variables
      location: {
        start: { line: action.line, column: 0, index: 0 },
        end: { line: action.line, column: 0, index: 0 },
      },
      filePath: action.filePath,
      metadata: {
        ngrxType: "action",
        actionType: action.type,
        hasProps: action.hasProps,
        propsType: action.propsType,
      },
    });
  }

  // Effects
  for (const effect of analysis.effects) {
    entities.push({
      name: effect.name,
      type: "variable", // Effects are properties/variables
      location: {
        start: { line: effect.line, column: 0, index: 0 },
        end: { line: effect.line, column: 0, index: 0 },
      },
      filePath: effect.filePath,
      metadata: {
        ngrxType: "effect",
        listensTo: effect.listensTo,
        dispatches: effect.dispatches,
        isRoot: effect.isRoot,
        functional: effect.functional,
      },
    });
  }

  // Reducers
  for (const reducer of analysis.reducers) {
    entities.push({
      name: reducer.name,
      type: "function", // Reducers are functions
      location: {
        start: { line: reducer.line, column: 0, index: 0 },
        end: { line: reducer.line, column: 0, index: 0 },
      },
      filePath: reducer.filePath,
      metadata: {
        ngrxType: "reducer",
        stateName: reducer.stateName,
        handledActions: reducer.handlers.map((h) => h.actionType),
      },
    });
  }

  // Selectors
  for (const selector of analysis.selectors) {
    entities.push({
      name: selector.name,
      type: "variable", // Selectors are const variables
      location: {
        start: { line: selector.line, column: 0, index: 0 },
        end: { line: selector.line, column: 0, index: 0 },
      },
      filePath: selector.filePath,
      metadata: {
        ngrxType: "selector",
        dependencies: selector.dependencies,
        statePath: selector.statePath,
      },
    });
  }

  return entities;
}
