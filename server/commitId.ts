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

import { execSync } from 'child_process'

// Split out of app.ts so that modules which only need the commit id (e.g.
// routes/status.ts) don't have to import app.ts itself, which boots the real
// Express server, connects to Redis, and initializes OAuth2 providers as a
// side effect of module load - fine at runtime, but it meant importing
// status.ts for a unit test silently started a live server and could crash
// the test process with EADDRINUSE if port 8085 was already in use.
export let commitId = ''

try {
  commitId = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim()
  console.log('Current Commit ID:', commitId)
} catch (error: any) {
  console.error('Warning: Failed to retrieve the commit ID. Proceeding without it.')
  console.error('Error details:', error.message)
  commitId = 'unknown'
}
