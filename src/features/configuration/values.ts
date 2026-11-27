import type { Mapping } from '@shared/document/index.ts'

/** A scalar field reads as an empty string when it is not a string. */
export const asText = (value: unknown): string => (typeof value === 'string' ? value : '')

/** A list field reads as an empty list when it is not an array. */
export const asList = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : [])

/** A list field rendered in a comma-separated control. */
export const asJoinedList = (value: unknown): string => asList(value).join(', ')

/** A comma-separated control writes a string list, or removes the field when empty. */
export const parseTextList = (text: string): string[] | undefined => {
  const parts = text
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '')
  return parts.length === 0 ? undefined : parts
}

/** A comma-separated control writes a number list, or removes the field when empty. */
export const parseNumberList = (text: string): number[] | undefined => {
  const parts = text
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '')
  if (parts.length === 0) return undefined
  return parts.map((part) => Number(part)).filter((value) => Number.isFinite(value))
}

/** A key carries a value; an empty YAML key reads as unset. */
export const isSet = (mapping: Mapping, key: string): boolean => mapping[key] !== undefined && mapping[key] !== null

export const isEmpty = (mapping: Mapping): boolean => Object.keys(mapping).length === 0
