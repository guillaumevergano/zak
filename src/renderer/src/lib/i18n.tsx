import { Fragment, type ReactNode } from 'react'

/**
 * For a sentence with elements inside (`<b>{host}</b> veut…`): takes the sentence translated by
 * t() without params (its placeholders left as they are) and puts each node in place of its `{name}`.
 */
export function fillNodes(text: string, nodes: Record<string, ReactNode>): ReactNode {
  return text
    .split(/\{(\w+)\}/)
    .map((part, i) => <Fragment key={i}>{i % 2 === 1 ? (part in nodes ? nodes[part] : `{${part}}`) : part}</Fragment>)
}
