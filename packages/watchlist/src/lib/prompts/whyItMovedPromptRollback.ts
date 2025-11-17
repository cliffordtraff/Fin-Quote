/**
 * Rollback Mechanism for Metaprompt Versions
 *
 * Allows reverting to previous prompt versions when quality degrades
 */

import { generateMetaprompt } from './whyItMovedMetaprompt'
import { MetapromptData } from '@watchlist/types/ai-summary'
import { clearPromptCache } from './whyItMovedPromptCache'
import { resetMetrics } from '../monitoring/whyItMovedMonitor'

export interface PromptVersion {
  version: string
  rulesVersion: string
  deployedAt: number
  deployedBy?: string
  notes?: string
}

// Version history (in production, store in Firestore)
const versionHistory: PromptVersion[] = [
  {
    version: '1.0.0',
    rulesVersion: '1.0.0',
    deployedAt: Date.now(),
    notes: 'Initial metaprompt implementation with structured output and validation'
  }
]

let activeVersion: string = '1.0.0'

/**
 * Get the active prompt version
 */
export function getActivePromptVersion(): string {
  return activeVersion
}

/**
 * Set the active prompt version (triggers cache clear)
 */
export function setActivePromptVersion(version: string): void {
  // Validate version exists
  const versionEntry = versionHistory.find(v => v.version === version)
  if (!versionEntry) {
    throw new Error(`Version ${version} not found in history`)
  }

  console.log('[Rollback] Switching prompt version', {
    from: activeVersion,
    to: version,
    timestamp: new Date().toISOString()
  })

  activeVersion = version
  clearPromptCache()
  resetMetrics()  // Reset metrics after rollback to measure new performance

  console.log('[Rollback] Prompt version switched successfully', {
    activeVersion: version,
    rulesVersion: versionEntry.rulesVersion
  })
}

/**
 * Roll back to the previous version
 */
export function rollbackToPreviousVersion(): void {
  const currentIndex = versionHistory.findIndex(v => v.version === activeVersion)

  if (currentIndex <= 0) {
    throw new Error('No previous version available for rollback')
  }

  const previousVersion = versionHistory[currentIndex - 1]

  console.warn('[Rollback] Rolling back prompt version', {
    from: activeVersion,
    to: previousVersion.version,
    reason: 'Manual rollback or automatic trigger',
    timestamp: new Date().toISOString()
  })

  setActivePromptVersion(previousVersion.version)
}

/**
 * Deploy a new prompt version
 */
export function deployNewVersion(
  version: string,
  rulesVersion: string,
  notes?: string,
  deployedBy?: string
): void {
  // Validate version format (semantic versioning)
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error('Version must follow semantic versioning (e.g., 1.0.0)')
  }

  // Check if version already exists
  if (versionHistory.find(v => v.version === version)) {
    throw new Error(`Version ${version} already exists`)
  }

  // Add to history
  const newVersion: PromptVersion = {
    version,
    rulesVersion,
    deployedAt: Date.now(),
    deployedBy,
    notes
  }

  versionHistory.push(newVersion)

  console.log('[Deploy] New prompt version deployed', {
    version,
    rulesVersion,
    notes,
    deployedBy
  })

  // Switch to new version
  setActivePromptVersion(version)
}

/**
 * Get version history
 */
export function getVersionHistory(): PromptVersion[] {
  return [...versionHistory]
}

/**
 * Get current version info
 */
export function getCurrentVersionInfo(): PromptVersion | undefined {
  return versionHistory.find(v => v.version === activeVersion)
}

/**
 * Generate a safe rollback report
 */
export function generateRollbackReport(): string {
  const current = getCurrentVersionInfo()
  const history = getVersionHistory()

  let report = '# Prompt Version Status\n\n'
  report += `**Active Version:** ${activeVersion}\n`
  report += `**Rules Version:** ${current?.rulesVersion || 'N/A'}\n`
  report += `**Deployed:** ${current ? new Date(current.deployedAt).toISOString() : 'N/A'}\n\n`

  report += '## Version History\n\n'
  history.reverse().forEach(v => {
    const active = v.version === activeVersion ? ' ← ACTIVE' : ''
    report += `- **${v.version}**${active}\n`
    report += `  - Rules: ${v.rulesVersion}\n`
    report += `  - Deployed: ${new Date(v.deployedAt).toISOString()}\n`
    if (v.deployedBy) report += `  - By: ${v.deployedBy}\n`
    if (v.notes) report += `  - Notes: ${v.notes}\n`
    report += '\n'
  })

  return report
}
