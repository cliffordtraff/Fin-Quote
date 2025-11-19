/**
 * Rollback Mechanism for Metaprompt Versions
 *
 * Allows reverting to previous prompt versions when quality degrades
 */
export interface PromptVersion {
    version: string;
    rulesVersion: string;
    deployedAt: number;
    deployedBy?: string;
    notes?: string;
}
/**
 * Get the active prompt version
 */
export declare function getActivePromptVersion(): string;
/**
 * Set the active prompt version (triggers cache clear)
 */
export declare function setActivePromptVersion(version: string): void;
/**
 * Roll back to the previous version
 */
export declare function rollbackToPreviousVersion(): void;
/**
 * Deploy a new prompt version
 */
export declare function deployNewVersion(version: string, rulesVersion: string, notes?: string, deployedBy?: string): void;
/**
 * Get version history
 */
export declare function getVersionHistory(): PromptVersion[];
/**
 * Get current version info
 */
export declare function getCurrentVersionInfo(): PromptVersion | undefined;
/**
 * Generate a safe rollback report
 */
export declare function generateRollbackReport(): string;
