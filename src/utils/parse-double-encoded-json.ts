/*
 * Open Bank Project -  API Explorer II
 * Copyright (C) 2023-2026, TESOBE GmbH
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * Email: contact@tesobe.com
 * TESOBE GmbH
 * Osloerstrasse 16/17
 * Berlin 13359, Germany
 *
 *   This product includes software developed at
 *   TESOBE (http://www.tesobe.com/)
 *
 */

// Recursively parse double-encoded JSON strings: some OBP responses embed
// JSON documents as string values (occasionally more than one level deep),
// which would otherwise render as escaped one-line blobs in the response
// preview. Extracted from Preview.vue so it's independently testable.
export function parseDoubleEncodedJson(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj
  }

  // If it's a string, try to parse it as JSON
  if (typeof obj === 'string') {
    // Skip strings that can't be JSON (must start with { [ or ")
    const trimmed = obj.trimStart()
    if (trimmed.length === 0 || (trimmed[0] !== '{' && trimmed[0] !== '[' && trimmed[0] !== '"')) {
      return obj
    }
    try {
      const parsed = JSON.parse(obj)
      // Recursively parse the result in case it's triple-encoded or more
      return parseDoubleEncodedJson(parsed)
    } catch (e) {
      // If parsing fails, return the original string
      return obj
    }
  }

  // If it's an array, recursively parse each element
  if (Array.isArray(obj)) {
    return obj.map((item) => parseDoubleEncodedJson(item))
  }

  // If it's an object, recursively parse each property
  if (typeof obj === 'object') {
    const result: Record<string, any> = {}
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        result[key] = parseDoubleEncodedJson(obj[key])
      }
    }
    return result
  }

  // For other types (numbers, booleans, etc.), return as-is
  return obj
}
